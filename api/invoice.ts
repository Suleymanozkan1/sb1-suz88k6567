/**
 * e-Arşiv / e-Fatura gönderim döngüsü.
 *
 * Bu dosya yalnızca akışı yönetir: bekleyen taslakları alır, iki kez
 * gönderilmelerini engeller, sonucu veritabanına yazar. Entegratöre özgü
 * her şey `_parasut.ts` içindedir; başka bir entegratöre geçilirse yalnızca
 * o modülün yerine aynı `sendInvoice` sözleşmesini karşılayan bir modül
 * konur.
 */
import { isAuthorizedCron, isDbConfigured, patchRows, selectRows } from './_db';
import { clientIp, enforceRateLimit, json, tooManyRequests } from './_guard';
import {
  isConfigured as isEInvoiceConfigured, sendInvoice,
  type InvoiceRow, type LineRow,
} from './_parasut';

export { isEInvoiceConfigured };

/** Bir turda işlenecek azami fatura; cron 15 dakikada bir çalışır. */
const BATCH = 25;

async function sendPending(): Promise<{ sent: number; failed: number }> {
  const pending = await selectRows<InvoiceRow>(
    `invoices?status=eq.taslak&select=*&limit=${BATCH}`,
  );

  let sent = 0;
  let failed = 0;

  for (const invoice of pending) {
    try {
      // Durumu koşullu güncelleriz: eşzamanlı ikinci bir tur aynı faturayı almaz.
      await patchRows(`invoices?id=eq.${invoice.id}&status=eq.taslak`, { status: 'gonderiliyor' });

      const lines = await selectRows<LineRow>(`invoice_lines?invoice_id=eq.${invoice.id}&select=*`);
      if (lines.length === 0) {
        await patchRows(`invoices?id=eq.${invoice.id}`, {
          status: 'taslak', provider_error: 'Faturada satır bulunmuyor.',
        });
        failed += 1;
        continue;
      }

      const reference = await sendInvoice(invoice, lines);

      await patchRows(`invoices?id=eq.${invoice.id}`, {
        status: 'gonderildi',
        sent_at: new Date().toISOString(),
        provider_ref: reference,
        provider_error: null,
      });
      sent += 1;
    } catch (error) {
      // Başarısızlıkta taslağa geri alınır; kullanıcı düzeltip tekrar gönderir.
      // Fatura numarası veritabanında zaten ayrılmıştır ve değişmez.
      await patchRows(`invoices?id=eq.${invoice.id}`, {
        status: 'taslak',
        provider_error: (error instanceof Error ? error.message : String(error)).slice(0, 300),
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
