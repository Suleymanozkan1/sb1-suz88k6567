/**
 * Giriş SMS doğrulaması (Vercel Serverless Function).
 *
 * Kod sunucuda üretilir, SMS ile gönderilir ve yalnızca imzalı özeti
 * (HMAC) istemciye döner. Kodun kendisi hiçbir zaman yanıt gövdesine
 * konmaz — sağlayıcı tanımlı değilken bile.
 *
 * Gerekli ortam değişkeni:
 *   OTP_SECRET  Rastgele, en az 32 karakterlik gizli anahtar
 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { isProviderConfigured } from './sms';

const TTL_MS = 5 * 60 * 1000; // 5 dakika
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function secret(): string {
  const value = process.env.OTP_SECRET;
  if (!value || value.length < 32) {
    throw new Error('OTP_SECRET tanımlı değil veya çok kısa.');
  }
  return value;
}

/** phone|code|expiry üçlüsünü imzalar */
function sign(phone: string, code: string, expiresAt: number): string {
  return createHmac('sha256', secret())
    .update(`${phone}|${code}|${expiresAt}`)
    .digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '').replace(/^90/, '').replace(/^0/, '');
  return /^5\d{9}$/.test(digits) ? digits : null;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Yalnızca POST desteklenir.' }, 405);
  }

  let payload: { action?: string; phone?: string; code?: string; token?: string; expiresAt?: number };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json({ error: 'Geçersiz istek gövdesi.' }, 400);
  }

  const phone = normalizePhone(payload.phone ?? '');
  if (!phone) return json({ error: 'Geçerli bir cep telefonu numarası gerekli.' }, 400);

  try {
    /* ---- Kod üret ve gönder ---- */
    if (payload.action === 'issue') {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const expiresAt = Date.now() + TTL_MS;
      const token = sign(phone, code, expiresAt);

      if (!isProviderConfigured()) {
        // Sağlayıcı yok: doğrulama kurulmadan giriş engellenmemeli, ancak
        // kodun gittiği iddia edilmemeli. Durum açıkça bildirilir.
        return json({ issued: false, reason: 'provider_not_configured' });
      }

      const origin = new URL(request.url).origin;
      const smsResponse = await fetch(`${origin}/api/sms`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({
          to: phone,
          body: `duguntakip.com giris dogrulama kodunuz: ${code}`,
        }),
      });
      const smsResult = (await smsResponse.json()) as { sent?: boolean; error?: string };
      if (!smsResult.sent) {
        return json({ issued: false, error: smsResult.error ?? 'Doğrulama kodu gönderilemedi.' }, 502);
      }

      return json({ issued: true, token, expiresAt });
    }

    /* ---- Kodu doğrula ---- */
    if (payload.action === 'verify') {
      const { code = '', token = '', expiresAt = 0 } = payload;
      if (!/^\d{6}$/.test(code)) return json({ verified: false, error: 'Doğrulama kodu 6 haneli olmalıdır.' }, 400);
      if (Date.now() > expiresAt) {
        return json({ verified: false, error: 'Doğrulama kodunun süresi doldu. Yeniden kod isteyiniz.' }, 400);
      }
      const expected = sign(phone, code, expiresAt);
      if (!safeEqual(expected, token)) {
        return json({ verified: false, error: 'Doğrulama kodu hatalı.' }, 400);
      }
      return json({ verified: true });
    }

    return json({ error: 'Bilinmeyen işlem.' }, 400);
  } catch {
    return json({ error: 'Doğrulama servisi şu anda kullanılamıyor.' }, 500);
  }
}
