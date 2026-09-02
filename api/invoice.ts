/**
 * e-Arşiv / e-Fatura entegratör bağlantısı.
 *
 * GİB'e doğrudan bağlanmak UBL-TR XML üretimi ve mali mühür gerektirir;
 * pratikte özel entegratör (NES, Paraşüt, Uyumsoft, Logo, EDM…) üzerinden
 * REST API kullanılır. Entegratörler farklı alan adları kullandığı için
 * gönderim gövdesi tek bir yerde — `buildPayload` — üretilir; entegratör
 * değiştiğinde yalnızca burası düzenlenir.
 *
 * Gerekli ortam değişkenleri:
 *   EINVOICE_BASE_URL   Entegratörün API adresi
 *   EINVOICE_API_KEY    API anahtarı / jeton
 *   EINVOICE_SENDER_VKN Gönderen firmanın vergi kimlik numarası
 *
 * Tanımlı değilse fatura yalnızca sistemde oluşturulur, gönderilmez ve
 * durumu "taslak" kalır — "gönderildi" denmez.
 */
import { isAuthorizedCron, isDbConfigured, patchRows, selectRows } from './_db';
import { clientIp, enforceRateLimit, json, tooManyRequests } from './_guard';

const BASE = process.env.EINVOICE_BASE_URL;
const API_KEY = process.env.EINVOICE_API_KEY;
const SENDER_VKN = process.env.EINVOICE_SENDER_VKN;

export function isEInvoiceConfigured(): boolean {
  return Boolean(BASE && API_KEY && SENDER_VKN);
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  uuid_ettn: string;
  kind: string;
  issue_date: string;
  buyer_kind: string;
  buyer_name: string;
  buyer_tax_id: string | null;
  buyer_tax_office: string | null;
  buyer_address: string | null;
  buyer_city: string | null;
  buyer_district: string | null;
  buyer_email: string | null;
  base_kurus: number;
  vat_kurus: number;
  total_kurus: number;
  note: string | null;
}

interface LineRow {
  line_no: number;
  description: string;
  quantity: number;
  unit: string;
  unit_price_kurus: number;
  discount_rate: number;
  vat_rate: number;
  base_kurus: number;
  vat_kurus: number;
  total_kurus: number;
}

/** Kuruşu entegratörün beklediği ondalıklı metne çevirir */
function money(kurus: number): string {
  return (kurus / 100).toFixed(2);
}

/**
 * Entegratöre gönderilecek gövde.
 * Alan adları entegratörünüzün dokümanına göre uyarlanmalıdır.
 */
function buildPayload(invoice: InvoiceRow, lines: LineRow[]) {
  return {
    senderTaxNumber: SENDER_VKN,
    documentType: invoice.kind === 'e-Fatura' ? 'EFATURA' : 'EARSIV',
    invoiceNumber: invoice.invoice_number,
    uuid: invoice.uuid_ettn,
    issueDate: invoice.issue_date,
    currency: 'TRY',
    // Alıcı e-Fatura mükellefi değilse e-Arşiv düzenlenir
    buyer: {
      type: invoice.buyer_kind === 'kurumsal' ? 'TUZELKISI' : 'GERCEKKISI',
      name: invoice.buyer_name,
      taxNumber: invoice.buyer_tax_id ?? undefined,
      taxOffice: invoice.buyer_tax_office ?? undefined,
      address: invoice.buyer_address ?? undefined,
      city: invoice.buyer_city ?? undefined,
      district: invoice.buyer_district ?? undefined,
      email: invoice.buyer_email ?? undefined,
    },
    lines: lines
      .sort((a, b) => a.line_no - b.line_no)
      .map((line) => ({
        lineNumber: line.line_no,
        name: line.description,
        quantity: Number(line.quantity),
        unitCode: line.unit,
        unitPrice: money(line.unit_price_kurus),
        discountRate: Number(line.discount_rate),
        vatRate: line.vat_rate,
        vatAmount: money(line.vat_kurus),
        lineTotal: money(line.base_kurus),
      })),
    totals: {
      taxableAmount: money(invoice.base_kurus),
      vatAmount: money(invoice.vat_kurus),
      payableAmount: money(invoice.total_kurus),
    },
    note: invoice.note ?? undefined,
  };
}

async function callProvider(path: string, body: unknown): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
}

/** Taslak faturaları entegratöre gönderir. */
async function sendPending(): Promise<{ sent: number; failed: number }> {
  const pending = await selectRows<InvoiceRow>(
    'invoices?status=eq.taslak&select=*&limit=25',
  );

  let sent = 0;
  let failed = 0;

  for (const invoice of pending) {
    try {
      // Aynı faturanın iki kez gönderilmesini engelle
      await patchRows(`invoices?id=eq.${invoice.id}&status=eq.taslak`, { status: 'gonderiliyor' });

      const lines = await selectRows<LineRow>(
        `invoice_lines?invoice_id=eq.${invoice.id}&select=*`,
      );
      if (lines.length === 0) {
        await patchRows(`invoices?id=eq.${invoice.id}`, {
          status: 'taslak', provider_error: 'Faturada satır bulunmuyor.',
        });
        failed += 1;
        continue;
      }

      const response = await callProvider('/invoices', buildPayload(invoice, lines));
      const text = await response.text();

      if (response.ok) {
        let reference: string | undefined;
        try {
          reference = (JSON.parse(text) as { id?: string; uuid?: string }).id
            ?? (JSON.parse(text) as { uuid?: string }).uuid;
        } catch { /* referans okunamadıysa sorun değil */ }

        await patchRows(`invoices?id=eq.${invoice.id}`, {
          status: 'gonderildi',
          sent_at: new Date().toISOString(),
          provider_ref: reference ?? null,
          provider_error: null,
        });
        sent += 1;
      } else {
        // Başarısızlıkta taslağa geri alınır; kullanıcı düzeltip tekrar gönderebilir
        await patchRows(`invoices?id=eq.${invoice.id}`, {
          status: 'taslak',
          provider_error: `Entegratör reddetti (${response.status}): ${text.slice(0, 300)}`,
        });
        failed += 1;
      }
    } catch (error) {
      await patchRows(`invoices?id=eq.${invoice.id}`, {
        status: 'taslak', provider_error: String(error).slice(0, 300),
      }).catch(() => undefined);
      failed += 1;
    }
  }

  return { sent, failed };
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Yalnızca POST desteklenir.' }, 405);
  if (!isDbConfigured()) return json({ error: 'Veritabanı yapılandırması eksik.' }, 500);

  // Zamanlanmış görev ya da panelden elle tetikleme
  if (!isAuthorizedCron(request)) {
    const limit = await enforceRateLimit(clientIp(request), {
      bucket: 'invoice-send', limit: 30, windowSeconds: 3600,
    });
    if (!limit.allowed) return tooManyRequests(3600);
  }

  if (!isEInvoiceConfigured()) {
    return json({ sent: 0, failed: 0, reason: 'einvoice_not_configured' });
  }

  try {
    const result = await sendPending();
    return json(result, result.failed > 0 ? 207 : 200);
  } catch (error) {
    return json({ error: 'Faturalar gönderilemedi.', detail: String(error).slice(0, 300) }, 502);
  }
}
