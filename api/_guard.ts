/**
 * Sunucu tarafı güvenlik yardımcıları.
 *
 * Alt çizgi ile başladığı için Vercel bu dosyayı bir uç nokta olarak
 * yayınlamaz; yalnızca diğer fonksiyonlar tarafından içe aktarılır.
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

export function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

/** Güvenlik fonksiyonları yalnızca service_role ile çağrılabilir. */
export function isGuardConfigured(): boolean {
  return Boolean(SUPABASE_URL && SERVICE_KEY);
}

/** Postgres fonksiyonunu service_role yetkisiyle çağırır. */
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T | null> {
  if (!isGuardConfigured()) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        ...JSON_HEADERS,
        apikey: SERVICE_KEY!,
        authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/** İstemci IP adresi (Vercel proxy başlıklarından) */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return request.headers.get('x-real-ip') ?? 'bilinmeyen';
}

export interface RateLimitRule {
  bucket: string;
  limit: number;
  windowSeconds: number;
}

/**
 * Hız sınırı denetimi.
 *
 * Güvenlik altyapısı yapılandırılmamışsa `allowed: true` döner — sınır
 * uygulanamadığı için isteği engellemek yerine geçirir, ancak bu durum
 * `enforced: false` ile bildirilir.
 */
export async function enforceRateLimit(
  identifier: string,
  rule: RateLimitRule,
): Promise<{ allowed: boolean; enforced: boolean }> {
  if (!isGuardConfigured()) return { allowed: true, enforced: false };

  const allowed = await rpc<boolean>('check_rate_limit', {
    p_bucket: rule.bucket,
    p_identifier: identifier,
    p_limit: rule.limit,
    p_window_seconds: rule.windowSeconds,
  });

  // RPC ulaşılamadıysa (null) isteği engellemeyiz; servis kesintisi
  // kullanıcıyı tamamen dışarıda bırakmamalı.
  if (allowed === null) return { allowed: true, enforced: false };
  return { allowed, enforced: true };
}

export function tooManyRequests(retryAfterSeconds = 60): Response {
  return json(
    { error: 'Çok fazla istek gönderildi. Lütfen biraz bekleyip tekrar deneyiniz.' },
    429,
    { 'retry-after': String(retryAfterSeconds) },
  );
}

export interface LockStatus {
  locked: boolean;
  failed_count: number;
  retry_after_seconds: number;
}

export async function loginLockStatus(email: string): Promise<LockStatus | null> {
  const rows = await rpc<LockStatus[]>('login_lock_status', { p_email: email });
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

export async function recordLoginAttempt(
  email: string, ip: string, succeeded: boolean,
): Promise<void> {
  await rpc('record_login_attempt', { p_email: email, p_ip: ip, p_succeeded: succeeded });
}
