/**
 * Kimlik: şifre saklama ve jeton üretimi.
 *
 * Supabase Auth'un (GoTrue) yerini alıyor. Alt çizgiyle başladığı için
 * uç nokta olarak yayınlanmaz.
 *
 * Üretilen erişim jetonunu PostgREST doğruluyor; `sub` talebi RLS
 * politikalarının tamamının dayandığı `auth.uid()` değerine dönüşüyor.
 * Bu yüzden imza anahtarı PostgREST'inkiyle AYNI olmak zorunda.
 *
 * Gerekli ortam değişkenleri (SUNUCUDA KALIR):
 *   JWT_SECRET  PostgREST'in `PGRST_JWT_SECRET` değeriyle aynı, >= 32 karakter
 */
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  sifre: string, tuz: Buffer, uzunluk: number, secenek: { N: number; r: number; p: number },
) => Promise<Buffer>;

/** Erişim jetonu ömrü. Kısa: çalınan jetonun kullanılabileceği süre bu. */
export const ERISIM_OMRU_SANIYE = 60 * 60;
/** Yenileme jetonu ömrü. Bu süre boyunca kullanıcı tekrar giriş yapmaz. */
export const YENILEME_OMRU_GUN = 30;

export function jwtSirri(): string {
  const deger = process.env.JWT_SECRET;
  if (!deger || deger.length < 32) {
    throw new Error('JWT_SECRET tanımlı değil veya 32 karakterden kısa.');
  }
  return deger;
}

export function kimlikYapilandirildiMi(): boolean {
  const deger = process.env.JWT_SECRET;
  return Boolean(deger && deger.length >= 32);
}

/* --------------------------------------------------------------- şifre */

/*
  scrypt bilerek yavaş ve bellek yiyici: sızan bir hash listesini
  deneme yanılmayla çözmeyi pahalı kılıyor. Parametreler Node'un
  önerdiği alt sınırın üzerinde.
*/
const SCRYPT = { N: 16384, r: 8, p: 1 };
const ANAHTAR_UZUNLUK = 64;

/** Şifreyi saklanabilir bir dizeye çevirir: `scrypt$N$r$p$tuz$karma`. */
export async function sifreyiKarmala(sifre: string): Promise<string> {
  const tuz = randomBytes(16);
  const karma = await scrypt(sifre, tuz, ANAHTAR_UZUNLUK, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${tuz.toString('base64')}$${karma.toString('base64')}`;
}

/**
 * Şifreyi karmasıyla karşılaştırır.
 *
 * Karşılaştırma sabit zamanlı; bayt bayt erken çıkan bir karşılaştırma
 * saldırgana şifrenin ilk karakterlerini sızdırır.
 */
export async function sifreDogru(sifre: string, saklanan: string): Promise<boolean> {
  const parcalar = saklanan.split('$');
  if (parcalar.length !== 6 || parcalar[0] !== 'scrypt') return false;

  const [, n, r, p, tuzB64, karmaB64] = parcalar;
  let beklenen: Buffer;
  try {
    beklenen = Buffer.from(karmaB64, 'base64');
    const hesaplanan = await scrypt(
      sifre, Buffer.from(tuzB64, 'base64'), beklenen.length,
      { N: Number(n), r: Number(r), p: Number(p) },
    );
    return hesaplanan.length === beklenen.length && timingSafeEqual(hesaplanan, beklenen);
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------- jeton */

function b64url(girdi: Buffer | string): string {
  return Buffer.from(girdi).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlCoz(girdi: string): Buffer {
  return Buffer.from(girdi.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

export interface JetonTalepleri {
  sub: string;
  role: string;
  exp: number;
  iat: number;
}

/**
 * HS256 imzalı erişim jetonu üretir.
 *
 * `role` talebi PostgREST'in hangi veritabanı rolüne geçeceğini
 * belirliyor; `authenticated` dışında bir değer yazılırsa RLS
 * politikaları hiç uygulanmaz.
 */
export function erisimJetonuUret(kullaniciId: string, simdi = Date.now()): string {
  const iat = Math.floor(simdi / 1000);
  const baslik = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const govde = b64url(JSON.stringify({
    sub: kullaniciId,
    role: 'authenticated',
    iat,
    exp: iat + ERISIM_OMRU_SANIYE,
  } satisfies JetonTalepleri));

  const imza = b64url(createHmac('sha256', jwtSirri()).update(`${baslik}.${govde}`).digest());
  return `${baslik}.${govde}.${imza}`;
}

/** Jetonu doğrular; geçersizse null. Süre dolmuşsa da null. */
export function jetonuCoz(jeton: string, simdi = Date.now()): JetonTalepleri | null {
  const parcalar = jeton.split('.');
  if (parcalar.length !== 3) return null;

  const [baslik, govde, imza] = parcalar;
  const beklenen = createHmac('sha256', jwtSirri()).update(`${baslik}.${govde}`).digest();
  const gelen = b64urlCoz(imza);
  if (gelen.length !== beklenen.length || !timingSafeEqual(gelen, beklenen)) return null;

  let talepler: JetonTalepleri;
  try {
    talepler = JSON.parse(b64urlCoz(govde).toString('utf8')) as JetonTalepleri;
  } catch {
    return null;
  }
  if (!talepler.sub || typeof talepler.exp !== 'number') return null;
  if (talepler.exp * 1000 <= simdi) return null;
  return talepler;
}

/* ------------------------------------------------------- yenileme jetonu */

/** Tahmin edilemez yenileme jetonu. */
export function yenilemeJetonuUret(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Yenileme jetonunun veritabanında saklanacak karması.
 *
 * Jetonun kendisi saklanmıyor: veritabanı yedeği birinin eline
 * geçerse içindeki satırlarla oturum açılamasın.
 */
export function yenilemeKarmasi(jeton: string): string {
  return createHmac('sha256', jwtSirri()).update(jeton).digest('hex');
}
