/**
 * Sunucu tarafı veritabanı erişimi (service_role).
 * Alt çizgi ile başladığı için uç nokta olarak yayınlanmaz.
 *
 * Kendi sunucumuzdaki PostgREST'e konuşuyor. Yetki, `service_role`
 * talebiyle imzalanmış kısa ömürlü bir jetonla taşınıyor; o rol
 * BYPASSRLS olduğu için satır güvenliğini aşar. Bu yüzden jeton
 * tarayıcıya ASLA verilmez ve yalnızca burada üretilir.
 *
 * Gerekli ortam değişkenleri (SUNUCUDA KALIR):
 *   PGRST_URL   PostgREST adresi (varsayılan http://127.0.0.1:3000)
 *   JWT_SECRET  PostgREST'in PGRST_JWT_SECRET değeriyle aynı
 */
import { createHmac } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const PGRST_URL = process.env.PGRST_URL ?? 'http://127.0.0.1:3000';

export function isDbConfigured(): boolean {
  const sir = process.env.JWT_SECRET;
  return Boolean(sir && sir.length >= 32);
}

function b64url(girdi: Buffer | string): string {
  return Buffer.from(girdi).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Sunucu jetonu.
 *
 * Her çağrıda yeniden üretiliyor: bellekte uzun süre duran bir jeton,
 * bir yığın dökümüne düşerse veritabanının tamamına açılan anahtar olur.
 * Ömrü kısa tutuluyor, çünkü yalnızca o anki istek için gerekiyor.
 */
function sunucuJetonu(): string {
  const sir = process.env.JWT_SECRET;
  if (!sir || sir.length < 32) throw new Error('JWT_SECRET tanımlı değil veya çok kısa.');

  const simdi = Math.floor(Date.now() / 1000);
  const baslik = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const govde = b64url(JSON.stringify({ role: 'service_role', iat: simdi, exp: simdi + 120 }));
  const imza = b64url(createHmac('sha256', sir).update(`${baslik}.${govde}`).digest());
  return `${baslik}.${govde}.${imza}`;
}

function sunucuBasliklari(ek: Record<string, string> = {}): Record<string, string> {
  return { authorization: `Bearer ${sunucuJetonu()}`, ...ek };
}

/** Postgres fonksiyonunu service_role yetkisiyle çağırır. */
export async function callRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!isDbConfigured()) throw new Error('Veritabanı yapılandırması eksik.');

  const response = await fetch(`${PGRST_URL}/rpc/${fn}`, {
    method: 'POST',
    headers: sunucuBasliklari({ 'content-type': 'application/json' }),
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

  const response = await fetch(`${PGRST_URL}/${path}`, {
    headers: sunucuBasliklari(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Sorgu başarısız (${response.status})`);
  return (await response.json()) as T[];
}

/** REST üzerinden güncelleme (service_role). */
export async function patchRows(path: string, body: unknown): Promise<void> {
  if (!isDbConfigured()) throw new Error('Veritabanı yapılandırması eksik.');

  const response = await fetch(`${PGRST_URL}/${path}`, {
    method: 'PATCH',
    headers: sunucuBasliklari({ 'content-type': 'application/json', prefer: 'return=minimal' }),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Güncelleme başarısız (${response.status})`);
}

/** REST üzerinden kayıt ekler ve eklenen satırı döndürür (service_role). */
export async function insertRow<T>(table: string, body: unknown): Promise<T> {
  if (!isDbConfigured()) throw new Error('Veritabanı yapılandırması eksik.');

  const response = await fetch(`${PGRST_URL}/${table}`, {
    method: 'POST',
    headers: sunucuBasliklari({ 'content-type': 'application/json', prefer: 'return=representation' }),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Kayıt eklenemedi (${response.status})`);
  const rows = (await response.json()) as T[];
  return rows[0]!;
}

/**
 * Yedeği sunucu diskine yazar.
 *
 * Eskiden Supabase Storage'a gidiyordu. Yedek müşteri adı ve telefonu
 * içeriyor: dizin yalnızca servis kullanıcısına açık olmalı ve
 * şifrelenmemiş paylaşılan bir klasöre konmamalı.
 */
export async function uploadToStorage(
  bucket: string, path: string, content: string,
): Promise<void> {
  const kok = process.env.YEDEK_DIZINI ?? '/var/lib/sahra/yedekler';
  const hedef = join(kok, bucket, path);
  await mkdir(dirname(hedef), { recursive: true, mode: 0o700 });
  // 0600: dosyayı yalnızca sahibi okuyabilsin.
  await writeFile(hedef, content, { mode: 0o600 });
}

/**
 * Zamanlanmış görevlerin yetkilendirmesi.
 * Zamanlayıcı içinden çağrılırken bu başlık üretilir
 * (sunucu/rotalar.ts); dışarıdan gelen isteklerde de aynı kural geçerlidir.
 */
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization') ?? '';
  return header === `Bearer ${secret}`;
}
