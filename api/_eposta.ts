/**
 * E-posta gönderimi (sunucu tarafı).
 * Alt çizgi ile başladığı için uç nokta olarak yayınlanmaz.
 *
 * Sağlayıcı ortam değişkenleriyle geliyor, koda gömülmedi:
 *   MAIL_API_URL  Sağlayıcının gönderim adresi
 *   MAIL_API_KEY  Yetki anahtarı — SUNUCUDA KALIR, VITE_ ön eki almaz
 *   MAIL_FROM     Gönderen adresi
 *
 * Tanımlı değilse gönderim yapılmadığı AÇIKÇA bildiriliyor. Sessizce
 * başarılı dönseydi "gitti" sanılan ama hiç gitmemiş postalar olurdu.
 *
 * Aylık rapor (madde 24) ve deneyim anketi (madde 31) aynı kapıyı
 * kullanıyor; iki ayrı kopya olsaydı biri düzeltilip diğeri unutulurdu.
 */

export interface GonderimSonucu {
  sent: boolean;
  detail: string;
}

export function epostaYapilandirildiMi(): boolean {
  return Boolean(process.env.MAIL_API_URL && process.env.MAIL_API_KEY && process.env.MAIL_FROM);
}

export async function epostaGonder(
  alici: string, konu: string, metin: string,
): Promise<GonderimSonucu> {
  const url = process.env.MAIL_API_URL;
  const key = process.env.MAIL_API_KEY;
  const from = process.env.MAIL_FROM;

  if (!url || !key || !from) {
    return { sent: false, detail: 'E-posta sağlayıcısı tanımlı değil (MAIL_API_URL/KEY/FROM).' };
  }
  if (!alici.trim()) {
    return { sent: false, detail: 'Alıcı adresi boş.' };
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ from, to: alici, subject: konu, text: metin }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return { sent: false, detail: `Sağlayıcı ${response.status} döndü.` };
    }
    return { sent: true, detail: '' };
  } catch (error) {
    return { sent: false, detail: String(error) };
  }
}

/**
 * Müşteriye gönderilen bağlantıların kök adresi.
 *
 * `SITE_URL` tanımlı değilse bağlantı üretilemez: tahmin edilen bir
 * alan adı, müşteriye açılmayan bir anket bağlantısı göndermek olurdu.
 */
export function siteKoku(): string | null {
  const ham = (process.env.SITE_URL ?? '').trim();
  if (!ham) return null;
  return ham.replace(/\/+$/, '');
}
