/**
 * Güvenlik ve önbellek başlıkları.
 *
 * Bu kurallar önce `public/_headers` dosyasındaydı; onu yalnızca
 * Cloudflare okuyordu. Kendi sunucumuzda o dosya sessizce etkisiz
 * kalırdı: site çalışmaya devam eder, ama CSP'siz. Fark edilmesi zor
 * bir kayıptı, bu yüzden kurallar koda alındı ve testle bağlandı.
 */

/**
 * İçerik güvenlik politikası.
 *
 * `connect-src` artık Supabase'i saymıyor: veri kendi sunucumuzdan,
 * kendi kökenimizden geliyor. Liste dar tutuluyor -- gereksiz bir
 * köken, XSS bulan birine veriyi dışarı taşıyacak kapıyı açar.
 */
export const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "script-src 'self'",
  // Tailwind üretimde satır içi stil üretiyor; kaldırılırsa arayüz bozulur.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://*.ingest.sentry.io https://*.ingest.de.sentry.io",
  'upgrade-insecure-requests',
].join('; ');

export const GUVENLIK_BASLIKLARI: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Content-Security-Policy': CSP,
};

/**
 * HSTS yalnızca HTTPS üzerinden anlamlı.
 *
 * Düz HTTP ile geliştirme yaparken gönderilirse tarayıcı alan adını bir
 * yıl boyunca HTTPS'e kilitler; `localhost` üzerinde çalışan geliştirici
 * bunu geri alamaz.
 */
export const HSTS = 'max-age=31536000; includeSubDomains';

/** Yol kalıbına göre önbellek süresi. */
export function onbellekBasligi(yol: string): string {
  // Dosya adında karma var: içerik değişince ad değişir, sonsuza dek tutulabilir.
  if (yol.startsWith('/assets/')) return 'public, max-age=31536000, immutable';
  // Yazı tipi adları sabit; bir yıl ama doğrulanabilir.
  if (yol.startsWith('/fonts/')) return 'public, max-age=31536000';
  if (yol === '/og-gorsel.png') return 'public, max-age=86400';
  if (yol === '/favicon.svg' || yol === '/robots.txt' || yol === '/sitemap.xml') {
    return 'public, max-age=3600';
  }
  /*
    index.html ÖNBELLEKLENMEZ. Yeni sürüm yayınlandığında tarayıcıdaki
    eski index.html, artık var olmayan karma adlı paketleri isterdi ve
    kullanıcı bembeyaz bir sayfa görürdü.
  */
  return 'no-cache';
}

/** Yanıta başlıkları ekler. `https` düz HTTP'de HSTS'i dışarıda bırakır. */
export function basliklariUygula(
  hedef: Headers, yol: string, https: boolean,
): void {
  for (const [ad, deger] of Object.entries(GUVENLIK_BASLIKLARI)) hedef.set(ad, deger);
  if (https) hedef.set('Strict-Transport-Security', HSTS);
  hedef.set('Cache-Control', onbellekBasligi(yol));
}
