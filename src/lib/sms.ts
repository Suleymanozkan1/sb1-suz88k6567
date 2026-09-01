/**
 * SMS istemcisi.
 *
 * Gönderim her zaman sunucu tarafındaki /api/sms üzerinden yapılır; sağlayıcı
 * anahtarı tarayıcıya hiçbir zaman inmez. Sağlayıcı tanımlı değilse gönderim
 * yapılmaz ve bu durum çağırana bildirilir — "gönderildi" denmez.
 */

export interface SendResult {
  sent: boolean;
  /** Sağlayıcı tanımlı olmadığı için gönderilmediyse true */
  notConfigured?: boolean;
  error?: string;
}

/** Sunucu tarafı uç nokta bu dağıtımda hiç yok (ör. saf statik barındırma). */
class ApiUnavailable extends Error {}

async function post<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiUnavailable();
  }

  // Uç nokta tanımlı değilse sunucu SPA kabuğunu (HTML) döndürür.
  // Bunu "servis hatası" değil, "bu dağıtımda yok" olarak ayırt ediyoruz.
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) throw new ApiUnavailable();

  return (await response.json()) as T;
}

/** Müşteriye SMS gönderir. Hata fırlatmaz; sonucu döndürür. */
export async function sendSms(to: string, body: string): Promise<SendResult> {
  try {
    const result = await post<{ sent?: boolean; reason?: string; error?: string }>(
      '/api/sms', { to, body },
    );
    if (result.reason === 'provider_not_configured') return { sent: false, notConfigured: true };
    if (!result.sent) return { sent: false, error: result.error ?? 'SMS gönderilemedi.' };
    return { sent: true };
  } catch (error) {
    if (error instanceof ApiUnavailable) return { sent: false, notConfigured: true };
    return { sent: false, error: 'SMS servisine ulaşılamadı.' };
  }
}

export interface OtpChallenge {
  token: string;
  expiresAt: number;
}

/** Giriş için doğrulama kodu ister. Sağlayıcı yoksa null döner. */
export async function issueLoginOtp(phone: string): Promise<
  { challenge: OtpChallenge } | { notConfigured: true } | { error: string }
> {
  try {
    const result = await post<{
      issued?: boolean; reason?: string; error?: string; token?: string; expiresAt?: number;
    }>('/api/otp', { action: 'issue', phone });

    if (result.reason === 'provider_not_configured') return { notConfigured: true };
    if (!result.issued || !result.token || !result.expiresAt) {
      return { error: result.error ?? 'Doğrulama kodu gönderilemedi.' };
    }
    return { challenge: { token: result.token, expiresAt: result.expiresAt } };
  } catch (error) {
    // Uç nokta bu dağıtımda yoksa iki adımlı doğrulama devre dışıdır;
    // kullanıcıyı girişten tamamen kilitlemek doğru olmaz.
    if (error instanceof ApiUnavailable) return { notConfigured: true };
    return { error: 'Doğrulama servisine ulaşılamadı.' };
  }
}

/** Girilen kodu sunucuda doğrular. */
export async function verifyLoginOtp(
  phone: string, code: string, challenge: OtpChallenge,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const result = await post<{ verified?: boolean; error?: string }>('/api/otp', {
      action: 'verify', phone, code, token: challenge.token, expiresAt: challenge.expiresAt,
    });
    if (!result.verified) return { ok: false, error: result.error ?? 'Doğrulama kodu hatalı.' };
    return { ok: true };
  } catch {
    // Doğrulama adımı başladıysa burada asla açık geçilmez (fail-closed).
    return { ok: false, error: 'Doğrulama servisine ulaşılamadı. Lütfen tekrar deneyiniz.' };
  }
}

/** İki adımlı doğrulamanın bu dağıtımda etkin olup olmadığını bildirir. */
export async function isTwoFactorAvailable(): Promise<boolean> {
  try {
    const response = await fetch('/api/otp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    return (response.headers.get('content-type') ?? '').includes('application/json');
  } catch {
    return false;
  }
}
