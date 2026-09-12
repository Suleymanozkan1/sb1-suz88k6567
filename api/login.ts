/**
 * Giriş uç noktası.
 *
 * Girişi sunucudan geçirmenin amacı, art arda başarısız denemelerde hesabı
 * geçici olarak kilitlemektir. İstemci veritabanına doğrudan gitseydi bu
 * kilit uygulanamazdı; kilit mantığı yalnızca service_role ile çağrılabilen
 * veritabanı fonksiyonlarında yaşar.
 *
 * Şifre doğrulaması BURADA yapılıyor, veritabanında değil: şifreyi sorgu
 * olarak göndermek onu sorgu günlüklerine düşme riskine atardı. Veritabanı
 * yalnızca karmayı veriyor, karşılaştırmayı scrypt ile bu süreç yapıyor.
 */
import {
  clientIp, enforceRateLimit, json, loginLockStatus, recordLoginAttempt, tooManyRequests,
} from './_guard';
import { callRpc, isDbConfigured } from './_db';
import {
  ERISIM_OMRU_SANIYE, YENILEME_OMRU_GUN, erisimJetonuUret, kimlikYapilandirildiMi,
  sifreDogru, yenilemeJetonuUret, yenilemeKarmasi,
} from './_kimlik';

interface KimlikSatiri { id: string; encrypted_password: string | null }

/** Kilit süresini dakikaya yuvarlar (kullanıcıya göstermek için) */
function minutes(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60));
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Yalnızca POST desteklenir.' }, 405);
  }
  if (!kimlikYapilandirildiMi() || !isDbConfigured()) {
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

  // 1) IP bazlı hız sınırı, dağıtık deneme saldırılarını yavaşlatır
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

  // 3) Kimlik doğrulama
  let kimlik: KimlikSatiri | undefined;
  try {
    const satirlar = await callRpc<KimlikSatiri[]>('kimlik_bul', { p_email: email });
    kimlik = Array.isArray(satirlar) ? satirlar[0] : undefined;
  } catch {
    return json({ error: 'Kimlik doğrulama servisine ulaşılamadı.' }, 502);
  }

  /*
    Kullanıcı yoksa da şifre karşılaştırması yapılıyormuş gibi davranmak
    gerekir; aksi hâlde yanıt süresi farkı "bu e-posta kayıtlı mı"
    sorusunu cevaplar ve saldırgan hesap listesi çıkarabilir.
  */
  const karma = kimlik?.encrypted_password
    ?? '$scrypt$16384$8$1$Y3VtbXk$Y3VtbXljdW1teWN1bW15Y3VtbXljdW1teQ==';
  const dogru = await sifreDogru(password, karma);

  if (!kimlik || !dogru) {
    await recordLoginAttempt(email, ip, false);
    const after = await loginLockStatus(email);

    // Kalan deneme hakkını bildirmek, meşru kullanıcıya yardımcı olur.
    const remaining = after ? Math.max(0, 5 - after.failed_count) : null;
    return json({
      error: 'E-posta veya şifreniz hatalı.',
      remainingAttempts: remaining,
    }, 401);
  }

  // 4) Oturum aç
  const yenileme = yenilemeJetonuUret();
  const biter = new Date(Date.now() + YENILEME_OMRU_GUN * 24 * 60 * 60 * 1000);
  try {
    await callRpc('oturum_ac', {
      p_user_id: kimlik.id,
      p_token_hash: yenilemeKarmasi(yenileme),
      p_expires: biter.toISOString(),
      p_agent: (request.headers.get('user-agent') ?? '').slice(0, 200),
    });
  } catch {
    return json({ error: 'Oturum başlatılamadı.' }, 502);
  }

  await recordLoginAttempt(email, ip, true);
  return json({
    accessToken: erisimJetonuUret(kimlik.id),
    refreshToken: yenileme,
    expiresIn: ERISIM_OMRU_SANIYE,
  });
}
