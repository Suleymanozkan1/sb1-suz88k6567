/**
 * Giriş uç noktası (Vercel Serverless Function).
 *
 * Girişi sunucudan geçirmenin amacı, art arda başarısız denemelerde hesabı
 * geçici olarak kilitlemektir. İstemci doğrudan Supabase'e gitseydi bu kilit
 * uygulanamazdı; kilit mantığı yalnızca service_role ile çağrılabilen
 * veritabanı fonksiyonlarında yaşar.
 */
import {
  clientIp, enforceRateLimit, json, loginLockStatus, recordLoginAttempt, tooManyRequests,
} from './_guard';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

/** Kilit süresini dakikaya yuvarlar (kullanıcıya göstermek için) */
function minutes(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60));
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Yalnızca POST desteklenir.' }, 405);
  }
  if (!SUPABASE_URL || !ANON_KEY) {
    return json({ error: 'Sunucu yapılandırması eksik.' }, 500);
  }

  let payload: { email?: string; password?: string };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json({ error: 'Geçersiz istek gövdesi.' }, 400);
  }

  const email = (payload.email ?? '').trim();
  const password = payload.password ?? '';
  if (!email || !password) {
    return json({ error: 'E-posta ve şifrenizi giriniz.' }, 400);
  }

  const ip = clientIp(request);

  // 1) IP bazlı hız sınırı — dağıtık deneme saldırılarını yavaşlatır
  const ipLimit = await enforceRateLimit(ip, { bucket: 'login-ip', limit: 20, windowSeconds: 300 });
  if (!ipLimit.allowed) return tooManyRequests(300);

  // 2) Hesap kilidi
  const lock = await loginLockStatus(email);
  if (lock?.locked) {
    return json({
      error: `Çok fazla hatalı giriş denemesi yapıldı. Hesabınız ${minutes(lock.retry_after_seconds)} dakika süreyle kilitlendi.`,
      locked: true,
      retryAfterSeconds: lock.retry_after_seconds,
    }, 423);
  }

  // 3) Supabase'e kimlik doğrulama
  let authResponse: Response;
  try {
    authResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: ANON_KEY },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return json({ error: 'Kimlik doğrulama servisine ulaşılamadı.' }, 502);
  }

  if (!authResponse.ok) {
    await recordLoginAttempt(email, ip, false);
    const after = await loginLockStatus(email);

    // Kalan deneme hakkını bildirmek, meşru kullanıcıya yardımcı olur.
    const remaining = after ? Math.max(0, 5 - after.failed_count) : null;
    return json({
      error: 'E-posta veya şifreniz hatalı.',
      remainingAttempts: remaining,
    }, 401);
  }

  const session = (await authResponse.json()) as {
    access_token?: string; refresh_token?: string;
  };
  if (!session.access_token || !session.refresh_token) {
    return json({ error: 'Oturum bilgisi alınamadı.' }, 502);
  }

  await recordLoginAttempt(email, ip, true);
  return json({
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
  });
}
