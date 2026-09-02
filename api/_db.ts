/**
 * Sunucu tarafı veritabanı erişimi (service_role).
 * Alt çizgi ile başladığı için uç nokta olarak yayınlanmaz.
 */
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function isDbConfigured(): boolean {
  return Boolean(SUPABASE_URL && SERVICE_KEY);
}

/** Postgres fonksiyonunu service_role yetkisiyle çağırır. */
export async function callRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!isDbConfigured()) throw new Error('Veritabanı yapılandırması eksik.');

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: SERVICE_KEY!,
      authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`RPC ${fn} başarısız (${response.status}): ${await response.text()}`);
  }
  return (await response.json()) as T;
}

/** REST üzerinden tablo sorgusu (service_role). */
export async function selectRows<T>(path: string): Promise<T[]> {
  if (!isDbConfigured()) throw new Error('Veritabanı yapılandırması eksik.');

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY!, authorization: `Bearer ${SERVICE_KEY}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Sorgu başarısız (${response.status})`);
  return (await response.json()) as T[];
}

/** REST üzerinden güncelleme (service_role). */
export async function patchRows(path: string, body: unknown): Promise<void> {
  if (!isDbConfigured()) throw new Error('Veritabanı yapılandırması eksik.');

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      apikey: SERVICE_KEY!,
      authorization: `Bearer ${SERVICE_KEY}`,
      prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Güncelleme başarısız (${response.status})`);
}

/** REST üzerinden kayıt ekler ve eklenen satırı döndürür (service_role). */
export async function insertRow<T>(table: string, body: unknown): Promise<T> {
  if (!isDbConfigured()) throw new Error('Veritabanı yapılandırması eksik.');

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: SERVICE_KEY!,
      authorization: `Bearer ${SERVICE_KEY}`,
      prefer: 'return=representation',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Kayıt eklenemedi (${response.status})`);
  const rows = (await response.json()) as T[];
  return rows[0]!;
}

/** Yedek dosyasını Supabase Storage'a yükler. */
export async function uploadToStorage(
  bucket: string, path: string, content: string,
): Promise<void> {
  if (!isDbConfigured()) throw new Error('Veritabanı yapılandırması eksik.');

  const response = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: SERVICE_KEY!,
        authorization: `Bearer ${SERVICE_KEY}`,
        'x-upsert': 'true',
      },
      body: content,
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (!response.ok) {
    throw new Error(`Depolamaya yazılamadı (${response.status}): ${await response.text()}`);
  }
}

/**
 * Zamanlanmış görevlerin yetkilendirmesi.
 * Vercel Cron isteklerinde `authorization: Bearer <CRON_SECRET>` başlığı bulunur.
 */
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization') ?? '';
  return header === `Bearer ${secret}`;
}
