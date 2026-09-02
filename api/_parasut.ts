/**
 * Paraşüt (api.parasut.com) e-Arşiv / e-Fatura adaptörü.
 *
 * Paraşüt, tek bir "fatura gönder" ucu sunmaz; süreç üç adımlıdır:
 *   1. Alıcı bir `contacts` kaydı olarak bulunur ya da oluşturulur
 *   2. `sales_invoices` ile satış faturası yazılır
 *   3. `e_archives` (veya `e_invoices`) ile GİB'e gönderilir — bu adım bir
 *      `trackable_jobs` kaydı döndürür ve sonuç için yoklanması gerekir
 *
 * Kimlik doğrulama OAuth2 "password" akışıdır; jeton 2 saat geçerlidir ve
 * modül düzeyinde önbelleğe alınır (sunucusuz örnek sıcak kaldığı sürece
 * yeniden kullanılır).
 *
 * Gerekli ortam değişkenleri:
 *   PARASUT_CLIENT_ID      Paraşüt → Ayarlar → API'den alınır
 *   PARASUT_CLIENT_SECRET
 *   PARASUT_USERNAME       Paraşüt hesabınızın e-postası
 *   PARASUT_PASSWORD
 *   PARASUT_COMPANY_ID     Panel adresindeki firma numarası
 */

const OAUTH_BASE = process.env.PARASUT_OAUTH_URL ?? 'https://api.parasut.com';
const API_BASE = process.env.PARASUT_API_URL ?? 'https://api.parasut.com/v4';

const CLIENT_ID = process.env.PARASUT_CLIENT_ID;
const CLIENT_SECRET = process.env.PARASUT_CLIENT_SECRET;
const USERNAME = process.env.PARASUT_USERNAME;
const PASSWORD = process.env.PARASUT_PASSWORD;
const COMPANY_ID = process.env.PARASUT_COMPANY_ID;

/** Paraşüt, Türk lirasını ISO kodu TRY yerine TRL olarak adlandırır. */
const TRY_CODE = 'TRL';

const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';
const TIMEOUT_MS = 30_000;

export function isConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET && USERNAME && PASSWORD && COMPANY_ID);
}

/* ------------------------------------------------------------------ tipler */

export interface InvoiceRow {
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

export interface LineRow {
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

export class ParasutError extends Error {}

/* --------------------------------------------------------- saf dönüşümler */

/** Kuruşu Paraşüt'ün beklediği ondalıklı sayıya çevirir. */
export function money(kurus: number): number {
  return Number((kurus / 100).toFixed(2));
}

/**
 * Kendi ürettiğimiz 16 haneli fatura numarasını Paraşüt'ün beklediği
 * seri + sıra ikilisine ayırır: DGT2026000000042 -> { series: 'DGT', id: 42 }
 *
 * Numarayı Paraşüt'e biz veririz; aksi hâlde Paraşüt kendi sayacını
 * kullanır ve iki sistemdeki fatura numaraları birbirinden ayrışır.
 */
export function splitInvoiceNumber(invoiceNumber: string): { series: string; id: number } {
  const match = /^([A-Z0-9]{3})(\d{4})(\d{9})$/.exec(invoiceNumber);
  if (!match) throw new ParasutError(`Fatura numarası biçimi tanınmadı: ${invoiceNumber}`);
  return { series: match[1], id: Number(match[3]) };
}

/** Alıcının Paraşüt `contacts` kaydı için nitelikleri. */
export function buildContactAttributes(invoice: InvoiceRow) {
  return {
    name: invoice.buyer_name,
    // Paraşüt kişi/kurum ayrımını contact_type ile yapar
    contact_type: invoice.buyer_kind === 'kurumsal' ? 'company' : 'person',
    account_type: 'customer',
    tax_number: invoice.buyer_tax_id ?? undefined,
    tax_office: invoice.buyer_tax_office ?? undefined,
    email: invoice.buyer_email ?? undefined,
    city: invoice.buyer_city ?? undefined,
    district: invoice.buyer_district ?? undefined,
    address: invoice.buyer_address ?? undefined,
  };
}

/**
 * `sales_invoices` gövdesi (JSON:API).
 *
 * Kalem indirimi `discount_type: 'percentage'` ile oranla verilir; tutarları
 * Paraşüt kendisi hesaplar. Bizim hesabımızla Paraşüt'ünki kuruş düzeyinde
 * ayrışırsa fatura toplamı değil, bizim kaydımız doğrudur — bu yüzden
 * `sendPending` gönderim sonrası toplamı karşılaştırır.
 */
export function buildSalesInvoicePayload(
  invoice: InvoiceRow,
  lines: LineRow[],
  contactId: string,
) {
  const { series, id } = splitInvoiceNumber(invoice.invoice_number);

  return {
    data: {
      type: 'sales_invoices',
      attributes: {
        item_type: 'invoice',
        description: invoice.note ?? `${invoice.invoice_number} numaralı fatura`,
        issue_date: invoice.issue_date,
        due_date: invoice.issue_date,
        invoice_series: series,
        invoice_id: id,
        currency: TRY_CODE,
        exchange_rate: 1,
      },
      relationships: {
        contact: { data: { id: contactId, type: 'contacts' } },
        details: {
          data: [...lines]
            .sort((a, b) => a.line_no - b.line_no)
            .map((line) => ({
              type: 'sales_invoice_details',
              attributes: {
                description: line.description,
                quantity: Number(line.quantity),
                unit_price: money(line.unit_price_kurus),
                vat_rate: line.vat_rate,
                discount_type: 'percentage',
                discount_value: Number(line.discount_rate),
              },
            })),
        },
      },
    },
  };
}

/** `e_archives` gövdesi — alıcısı e-Fatura mükellefi olmayan faturalar için. */
export function buildEArchivePayload(salesInvoiceId: string, invoice: InvoiceRow) {
  return {
    data: {
      type: 'e_archives',
      attributes: {
        // Salon kiralaması peşin/havale tahsil edilir; internet satışı değildir.
        internet_sale: null,
        note: invoice.note ?? undefined,
        exclusion_reason: undefined,
      },
      relationships: {
        sales_invoice: { data: { id: salesInvoiceId, type: 'sales_invoices' } },
      },
    },
  };
}

/** `e_invoices` gövdesi — alıcı e-Fatura mükellefiyse, GİB posta kutusu ile. */
export function buildEInvoicePayload(salesInvoiceId: string, inboxAddress: string) {
  return {
    data: {
      type: 'e_invoices',
      attributes: {
        to: inboxAddress,
        scenario: 'basic',
      },
      relationships: {
        sales_invoice: { data: { id: salesInvoiceId, type: 'sales_invoices' } },
      },
    },
  };
}

/**
 * JSON:API hata gövdesinden okunabilir tek satır çıkarır.
 * Paraşüt hataları `errors: [{ title, detail }]` biçiminde döndürür.
 */
export function describeError(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      errors?: { title?: string; detail?: string }[];
      error?: string;
      error_description?: string;
    };
    if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
      const parts = parsed.errors
        .map((e) => e.detail ?? e.title)
        .filter((x): x is string => Boolean(x));
      if (parts.length > 0) return `Paraşüt (${status}): ${parts.join('; ')}`.slice(0, 300);
    }
    if (parsed.error_description ?? parsed.error) {
      return `Paraşüt (${status}): ${parsed.error_description ?? parsed.error}`.slice(0, 300);
    }
  } catch { /* JSON değilse ham gövdeyi göster */ }
  return `Paraşüt (${status}): ${body.slice(0, 250)}`;
}

/* ------------------------------------------------------------ jeton yönetimi */

interface Token {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

let cached: Token | null = null;

/** Jetonu 60 sn erken bayatlamış sayarız; istek uçuşta iken sürenin dolmaması için. */
export function isExpired(token: Token, now = Date.now()): boolean {
  return now >= token.expiresAt - 60_000;
}

async function requestToken(body: Record<string, string>): Promise<Token> {
  const response = await fetch(`${OAUTH_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text();
  if (!response.ok) throw new ParasutError(describeError(response.status, text));

  const parsed = JSON.parse(text) as {
    access_token: string; refresh_token: string; expires_in: number;
  };
  return {
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token,
    expiresAt: Date.now() + parsed.expires_in * 1000,
  };
}

async function getToken(): Promise<string> {
  if (cached && !isExpired(cached)) return cached.accessToken;

  // Yenileme jetonu varsa şifreyi tekrar göndermeden tazeleriz.
  if (cached) {
    try {
      cached = await requestToken({
        grant_type: 'refresh_token',
        client_id: CLIENT_ID!,
        client_secret: CLIENT_SECRET!,
        refresh_token: cached.refreshToken,
      });
      return cached.accessToken;
    } catch {
      cached = null; // yenileme reddedildi: baştan oturum aç
    }
  }

  cached = await requestToken({
    grant_type: 'password',
    client_id: CLIENT_ID!,
    client_secret: CLIENT_SECRET!,
    username: USERNAME!,
    password: PASSWORD!,
    redirect_uri: REDIRECT_URI,
  });
  return cached.accessToken;
}

/** Testlerde ve jeton reddedildiğinde önbelleği boşaltır. */
export function resetToken(): void {
  cached = null;
}

/* ---------------------------------------------------------------- istekler */

interface JsonApiResource {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
}

async function call<T = JsonApiResource>(
  path: string,
  init: { method: string; body?: unknown } = { method: 'GET' },
): Promise<{ data: T }> {
  const token = await getToken();
  const response = await fetch(`${API_BASE}/${COMPANY_ID}${path}`, {
    method: init.method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const text = await response.text();

  // Jeton sunucu tarafında geçersiz kılınmış olabilir; bir kez yeniden dene.
  if (response.status === 401) {
    resetToken();
    throw new ParasutError('Paraşüt oturumu reddedildi; bir sonraki denemede yenilenecek.');
  }
  if (!response.ok) throw new ParasutError(describeError(response.status, text));

  return text ? (JSON.parse(text) as { data: T }) : ({ data: undefined as T });
}

/** Alıcıyı vergi no ya da e-postasıyla arar; bulamazsa oluşturur. */
async function findOrCreateContact(invoice: InvoiceRow): Promise<string> {
  const filter = invoice.buyer_tax_id
    ? `filter[tax_number]=${encodeURIComponent(invoice.buyer_tax_id)}`
    : invoice.buyer_email
      ? `filter[email]=${encodeURIComponent(invoice.buyer_email)}`
      : null;

  if (filter) {
    const found = await call<JsonApiResource[]>(`/contacts?${filter}&page[size]=1`);
    if (Array.isArray(found.data) && found.data.length > 0) return found.data[0].id;
  }

  const created = await call(`/contacts`, {
    method: 'POST',
    body: { data: { type: 'contacts', attributes: buildContactAttributes(invoice) } },
  });
  return created.data.id;
}

/**
 * Gönderim işi tamamlanana kadar yoklar.
 * Paraşüt e-belge gönderimini eşzamansız yürütür ve `trackable_jobs` döndürür.
 */
async function waitForJob(jobId: string): Promise<void> {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const job = await call(`/trackable_jobs/${jobId}`);
    const status = String(job.data.attributes?.status ?? '');
    if (status === 'done') return;
    if (status === 'error' || status === 'failed') {
      const errors = job.data.attributes?.errors;
      throw new ParasutError(`Paraşüt gönderimi reddetti: ${JSON.stringify(errors).slice(0, 250)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new ParasutError('Paraşüt gönderim işi zaman aşımına uğradı.');
}

/** Alıcının GİB e-Fatura posta kutusunu arar; yoksa e-Arşiv düzenlenmelidir. */
async function findEInvoiceInbox(taxId: string): Promise<string | null> {
  const found = await call<JsonApiResource[]>(
    `/e_invoice_inboxes?filter[vkn]=${encodeURIComponent(taxId)}`,
  );
  if (!Array.isArray(found.data) || found.data.length === 0) return null;
  return String(found.data[0].attributes?.e_invoice_address ?? found.data[0].id);
}

/**
 * Faturayı Paraşüt'e yazar ve GİB'e gönderir.
 * Döndürülen değer, kaydın Paraşüt'teki kimliğidir (provider_ref).
 */
export async function sendInvoice(invoice: InvoiceRow, lines: LineRow[]): Promise<string> {
  if (!isConfigured()) throw new ParasutError('Paraşüt yapılandırması eksik.');

  const contactId = await findOrCreateContact(invoice);
  const sales = await call('/sales_invoices', {
    method: 'POST',
    body: buildSalesInvoicePayload(invoice, lines, contactId),
  });
  const salesInvoiceId = sales.data.id;

  // Alıcı e-Fatura mükellefiyse e-Fatura, değilse e-Arşiv düzenlenir.
  const inbox = invoice.buyer_tax_id ? await findEInvoiceInbox(invoice.buyer_tax_id) : null;
  const job = inbox
    ? await call('/e_invoices', { method: 'POST', body: buildEInvoicePayload(salesInvoiceId, inbox) })
    : await call('/e_archives', { method: 'POST', body: buildEArchivePayload(salesInvoiceId, invoice) });

  await waitForJob(job.data.id);
  return salesInvoiceId;
}
