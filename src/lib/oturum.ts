/**
 * Tarayıcıdaki oturum.
 *
 * Supabase Auth'un (GoTrue) istemci tarafının yerini alıyor: jetonları
 * saklar, süresi dolmadan yeniler, çıkışta siler.
 *
 * Jetonlar `localStorage`'da duruyor. Daha güvenlisi HttpOnly çerez
 * olurdu -- XSS'e karşı okunamaz. Ama jetonu PostgREST'e `Authorization`
 * başlığıyla göndermek gerekiyor ve JavaScript'in okuyamadığı bir çerezi
 * başlığa koyamayız. Alternatif, her veri isteğini kendi sunucumuzdan
 * geçirip çerezi orada başlığa çevirmekti; bu da 67 veri erişim yolunun
 * tamamına sunucu kodu yazmak demekti. XSS riski içerik güvenlik
 * politikasıyla (script-src 'self') karşılanıyor.
 */

const ERISIM = 'sahra-erisim-jetonu';
const YENILEME = 'sahra-yenileme-jetonu';
const BITIS = 'sahra-jeton-bitis';

/**
 * Jeton bu kadar kalanla yenilenir.
 *
 * Son saniyeye kadar beklenirse, yenileme isteği yola çıkarken jeton
 * ölür ve kullanıcı ortada bir hata görür.
 */
const ERKEN_YENILE_SANIYE = 120;

export interface Oturum {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

function oku(anahtar: string): string | null {
  try {
    return localStorage.getItem(anahtar);
  } catch {
    // Gizli sekmede ya da depolama kapalıyken erişim hata verebilir.
    return null;
  }
}

function yaz(anahtar: string, deger: string): void {
  try { localStorage.setItem(anahtar, deger); } catch { /* yok sayılır */ }
}

function sil(anahtar: string): void {
  try { localStorage.removeItem(anahtar); } catch { /* yok sayılır */ }
}

export function oturumuKaydet(oturum: Oturum): void {
  yaz(ERISIM, oturum.accessToken);
  yaz(YENILEME, oturum.refreshToken);
  yaz(BITIS, String(Date.now() + oturum.expiresIn * 1000));
}

export function oturumuTemizle(): void {
  sil(ERISIM); sil(YENILEME); sil(BITIS);
}

export function erisimJetonu(): string | null {
  return oku(ERISIM);
}

export function yenilemeJetonu(): string | null {
  return oku(YENILEME);
}

export function oturumVarMi(): boolean {
  return Boolean(oku(YENILEME));
}

/** Erişim jetonunun ömrü dolmak üzere mi. */
export function yenilemeGerekli(simdi = Date.now()): boolean {
  const bitis = Number(oku(BITIS));
  if (!Number.isFinite(bitis) || bitis === 0) return true;
  return simdi >= bitis - ERKEN_YENILE_SANIYE * 1000;
}

/*
  Aynı anda birden çok istek yenilemeyi tetiklerse tek bir çağrı
  yapılmalı. Yoksa dönüşümlü yenileme yüzünden ilk çağrı jetonu
  tüketir, ikincisi reddedilir ve kullanıcı sebepsiz yere dışarı atılır.
*/
let bekleyen: Promise<string | null> | null = null;

/**
 * Gerekiyorsa jetonu yeniler ve geçerli erişim jetonunu döndürür.
 * Oturum düşmüşse null döner ve yerel kayıtlar temizlenir.
 */
export async function gecerliJeton(): Promise<string | null> {
  if (!oturumVarMi()) return null;
  if (!yenilemeGerekli()) return erisimJetonu();
  if (bekleyen) return bekleyen;

  bekleyen = (async () => {
    const jeton = yenilemeJetonu();
    if (!jeton) return null;
    try {
      const yanit = await fetch('/api/oturum', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: jeton }),
      });
      if (!yanit.ok) {
        // Süresi dolmuş ya da tükenmiş jeton: yeniden giriş gerekiyor.
        oturumuTemizle();
        return null;
      }
      const oturum = (await yanit.json()) as Oturum;
      oturumuKaydet(oturum);
      return oturum.accessToken;
    } catch {
      /*
        Ağ hatası oturumu SİLMEZ: geçici bir kopukluk yüzünden
        kullanıcıyı dışarı atmak, elindeki işi kaybettirir. Eldeki
        jetonla devam edilir; gerçekten geçersizse sunucu reddeder.
      */
      return erisimJetonu();
    } finally {
      bekleyen = null;
    }
  })();

  return bekleyen;
}

/** Sunucudaki oturumu da kapatır. */
export async function cikisYap(): Promise<void> {
  const jeton = yenilemeJetonu();
  oturumuTemizle();
  if (!jeton) return;
  try {
    await fetch('/api/oturum', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: jeton }),
    });
  } catch {
    // Yerel kayıt zaten silindi; sunucudaki satır süresi dolunca düşer.
  }
}
