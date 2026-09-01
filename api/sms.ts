/**
 * SMS gönderim uç noktası (Vercel Serverless Function).
 *
 * Sağlayıcı anahtarı yalnızca sunucuda bulunur; tarayıcıya hiçbir zaman
 * gönderilmez. Şu an Netgsm desteklenir; başka sağlayıcı eklemek için
 * `sendViaProvider` fonksiyonunu genişletmek yeterlidir.
 *
 * Gerekli ortam değişkenleri (Vercel → Settings → Environment Variables):
 *   NETGSM_USER    Netgsm abone numarası
 *   NETGSM_PASS    Netgsm API şifresi
 *   NETGSM_HEADER  Onaylı marka başlığı (gönderici adı)
 */

interface SendRequest {
  to: string;
  body: string;
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

/** 10 haneli, 5 ile başlayan Türkiye cep numarası */
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '').replace(/^90/, '').replace(/^0/, '');
  return /^5\d{9}$/.test(digits) ? digits : null;
}

export function isProviderConfigured(): boolean {
  return Boolean(process.env.NETGSM_USER && process.env.NETGSM_PASS && process.env.NETGSM_HEADER);
}

/** Netgsm HTTP API üzerinden tek mesaj gönderir. */
async function sendViaProvider(to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const params = new URLSearchParams({
    usercode: process.env.NETGSM_USER!,
    password: process.env.NETGSM_PASS!,
    gsmno: to,
    message: body,
    msgheader: process.env.NETGSM_HEADER!,
    dil: 'TR',
  });

  const response = await fetch(`https://api.netgsm.com.tr/sms/send/get/?${params}`, {
    method: 'GET',
    signal: AbortSignal.timeout(15_000),
  });
  const text = (await response.text()).trim();

  // Netgsm başarıda "00 <jobid>" veya "01 <jobid>" döner; diğerleri hata kodudur.
  const code = text.split(/\s+/)[0];
  if (code === '00' || code === '01' || code === '02') return { ok: true };

  const errors: Record<string, string> = {
    '20': 'Mesaj metni çok uzun veya karakter sorunu var.',
    '30': 'Geçersiz kullanıcı adı, şifre veya API erişim izni yok.',
    '40': 'Mesaj başlığı (gönderici adı) sistemde tanımlı değil.',
    '50': 'Abone hesabı IYS kontrollü gönderime uygun değil.',
    '51': 'IYS marka bilgisi bulunamadı.',
    '70': 'Gönderilen parametreler hatalı.',
    '85': 'Aynı numaraya çok sık gönderim yapıldı.',
  };
  return { ok: false, error: errors[code] ?? `Sağlayıcı hatası (kod: ${text})` };
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Yalnızca POST desteklenir.' }, 405);
  }

  let payload: SendRequest;
  try {
    payload = (await request.json()) as SendRequest;
  } catch {
    return json({ error: 'Geçersiz istek gövdesi.' }, 400);
  }

  const to = normalizePhone(payload.to ?? '');
  const body = (payload.body ?? '').trim();

  if (!to) return json({ error: 'Geçerli bir cep telefonu numarası giriniz.' }, 400);
  if (!body) return json({ error: 'Mesaj metni boş olamaz.' }, 400);
  if (body.length > 900) return json({ error: 'Mesaj metni çok uzun.' }, 400);

  if (!isProviderConfigured()) {
    // Sağlayıcı tanımlı değil: gönderim yapılmadığı açıkça bildirilir.
    return json({ sent: false, reason: 'provider_not_configured' });
  }

  try {
    const result = await sendViaProvider(to, body);
    if (!result.ok) return json({ sent: false, error: result.error }, 502);
    return json({ sent: true });
  } catch {
    return json({ sent: false, error: 'SMS sağlayıcısına ulaşılamadı.' }, 502);
  }
}
