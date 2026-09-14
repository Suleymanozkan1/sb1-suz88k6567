/**
 * Sunucu tarafı veritabanı erişimi (service_role).
 * Alt çizgi ile başladığı için uç nokta olarak yayınlanmaz.
 *
 * İKİ KİP, TEK ARAYÜZ. Çağıran taraf (giriş, zamanlanmış görevler,
 * webhook) hangisinin çalıştığını bilmiyor:
 *
 *  - PostgREST kipi (kendi sunucumuz). PostgREST'e HTTP ile konuşuyor;
 *    yetki, `service_role` talebiyle imzalanmış kısa ömürlü bir jetonla
 *    taşınıyor. Jeton tarayıcıya ASLA verilmez, yalnızca burada üretilir.
 *
 *  - Doğrudan kip (Vercel). Vercel'de PostgREST çalıştırılamıyor:
 *    derlenmiş bir sunucu süreci ve sürekli açık bir port istiyor. Aynı
 *    işler `_db_dogrudan.ts` üzerinden doğrudan PostgreSQL'e gidiyor.
 *
 * KİP SEÇİMİ AÇIK: `DATABASE_URL` var ve `PGRST_URL` YOKSA doğrudan kip.
 * Bir sezgiye bırakılsaydı (örneğin "bağlanamazsan öbürünü dene") arıza
 * anında sistem sessizce kip değiştirir ve sorunun nerede olduğu
 * anlaşılmazdı.
 *
 * Ortam değişkenleri (SUNUCUDA KALIR, tarayıcıya gitmez):
 *   PGRST_URL         PostgREST adresi (PostgREST kipi)
 *   PGRST_FATURA_URL  Fatura veritabanının PostgREST adresi (isteğe bağlı)
 *   DATABASE_URL      PostgreSQL adresi (doğrudan kip)
 *   JWT_SECRET        PostgREST'in PGRST_JWT_SECRET değeriyle aynı
 */
import { createHmac } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { hedefKok } from '../sunucu/veri-yonlendirme.js';
import * as dogrudan from './_db_dogrudan.js';

/**
 * PostgREST yok, doğrudan PostgreSQL var mı?
 *
 * Her çağrıda okunuyor, modül yüklenirken bir kez değil: testler ortam
 * değişkenini çalışma sırasında değiştiriyor ve tek seferlik okuma
 * ilk testin kipini bütün pakete dayatırdı.
 */
function dogrudanMi(): boolean {
  return Boolean(process.env.DATABASE_URL) && !process.env.PGRST_URL;
}

const PGRST_URL = process.env.PGRST_URL ?? 'http://127.0.0.1:3000';
/*
  Fatura kayıtları Vergi Usul Kanunu gereği Türkiye'de duruyor. Tarayıcıdan
  gelen istekler sunucu/index.ts içinde ayrılıyor; buradaki service_role
  çağrıları da AYNI tabloya bakarak ayrılmalı, yoksa fatura uç noktası
  yurt dışındaki veritabanında olmayan bir tabloyu arar.

  İki sunucuda JWT_SECRET aynı olmalı: jeton ikisinde de geçerli olmasa
  fatura tarafına yapılan her service_role çağrısı 401 döner.
*/
const PGRST_FATURA_URL = process.env.PGRST_FATURA_URL?.trim() || undefined;

/** Verilen PostgREST yolunun hangi sunucuya gideceğini söyler. */
function taban(yol: string): string {
  return hedefKok(yol, PGRST_URL, PGRST_FATURA_URL);
}

/**
 * Fatura verisi ayrı bir sunucuda mı? (docs/IKI-SUNUCU.md)
 *
 * Doğrudan kipte bölme YOK: tek bir `DATABASE_URL` var. `PGRST_FATURA_URL`
 * yine de verilmişse bu bir yapılandırma çelişkisi -- faturaların
 * Türkiye'de durması istenmiş ama gidecek ikinci bir adres yok. Sessizce
 * ana veritabanına yazılsaydı VUK'a aykırı durum FARK EDİLMEDEN sürerdi;
 * o yüzden burada duruluyor.
 */
export function faturaBolmesiVar(): boolean {
  if (dogrudanMi()) {
    if (PGRST_FATURA_URL !== undefined) {
      throw new Error(
        'PGRST_FATURA_URL doğrudan kipte kullanılamaz: bu kip tek veritabanı tanıyor.',
      );
    }
    return false;
  }
  return PGRST_FATURA_URL !== undefined;
}

/** Fatura sunucusunun adresi; bölme yoksa ana sunucununki. */
export function faturaAdresi(): string {
  return PGRST_FATURA_URL ?? PGRST_URL;
}

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
  if (dogrudanMi()) return dogrudan.fonksiyon<T>(fn, args);
  if (!isDbConfigured()) throw new Error('Veritabanı yapılandırması eksik.');

  const response = await fetch(`${taban(`rpc/${fn}`)}/rpc/${fn}`, {
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
  if (dogrudanMi()) return dogrudan.sec<T>(path);
  if (!isDbConfigured()) throw new Error('Veritabanı yapılandırması eksik.');

  const response = await fetch(`${taban(path)}/${path}`, {
    headers: sunucuBasliklari(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Sorgu başarısız (${response.status})`);
  return (await response.json()) as T[];
}

/** REST üzerinden güncelleme (service_role). */
export async function patchRows(path: string, body: unknown): Promise<void> {
  if (dogrudanMi()) return dogrudan.yama(path, body);
  if (!isDbConfigured()) throw new Error('Veritabanı yapılandırması eksik.');

  const response = await fetch(`${taban(path)}/${path}`, {
    method: 'PATCH',
    headers: sunucuBasliklari({ 'content-type': 'application/json', prefer: 'return=minimal' }),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Güncelleme başarısız (${response.status})`);
}

/** REST üzerinden kayıt ekler ve eklenen satırı döndürür (service_role). */
export async function insertRow<T>(table: string, body: unknown): Promise<T> {
  if (dogrudanMi()) return dogrudan.ekle<T>(table, body);
  if (!isDbConfigured()) throw new Error('Veritabanı yapılandırması eksik.');

  const response = await fetch(`${taban(table)}/${table}`, {
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
 * Toplu ekleme/güncelleme (service_role).
 *
 * `resolution=merge-duplicates` ve `on_conflict` birlikte veriliyor:
 * ikisinden biri eksik olursa PostgREST çakışan satırı EKLEMEYE çalışır
 * ve 23505 döner. Zamanlanmış görevler aynı satırı her çalıştırmada
 * yeniden yazdığı için bu yol tek yol.
 */
export async function upsertRows(
  table: string, rows: unknown[], onConflict: string,
): Promise<void> {
  if (rows.length === 0) return;
  if (dogrudanMi()) return dogrudan.birlestir(table, rows, onConflict);
  if (!isDbConfigured()) throw new Error('Veritabanı yapılandırması eksik.');

  const response = await fetch(
    `${taban(table)}/${table}?on_conflict=${encodeURIComponent(onConflict)}`,
    {
      method: 'POST',
      headers: sunucuBasliklari({
        'content-type': 'application/json',
        prefer: 'resolution=merge-duplicates,return=minimal',
      }),
      body: JSON.stringify(rows),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) {
    throw new Error(`Toplu kayıt başarısız (${response.status}): ${await response.text()}`);
  }
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
