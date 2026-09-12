/**
 * Sunucu tarafı güvenlik yardımcıları.
 *
 * Alt çizgi ile başladığı için yönlendiricide uç nokta olarak
 * yayınlamaz; yalnızca diğer fonksiyonlar tarafından içe aktarılır.
 */

import { callRpc, isDbConfigured } from './_db';

export const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

export function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

/**
 * Güvenlik fonksiyonları yalnızca service_role ile çağrılabilir.
 *
 * Yapılandırma artık `_db` ile ORTAK. Önce iki ayrı yerde okunuyordu;
 * biri güncellenip diğeri unutulduğunda hız sınırı ve giriş kilidi
 * sessizce devre dışı kalır, sistem çalışmaya devam ettiği için de
 * fark edilmezdi.
 */
export function isGuardConfigured(): boolean {
  return isDbConfigured();
}

/** Postgres fonksiyonunu service_role yetkisiyle çağırır. */
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T | null> {
  if (!isGuardConfigured()) return null;
  try {
    return await callRpc<T>(fn, args);
  } catch {
    return null;
  }
}

/**
 * İstemci IP adresi.
 *
 * Ters vekil (nginx) `x-forwarded-for` başlığını kendisi yazar. Başlık
 * istemci tarafından da uydurulabildiği için vekilin bu başlığı EZMESİ
 * gerekir; ezmezse saldırgan her istekte farklı bir değer göndererek hız
 * sınırını ve giriş kilidini atlatabilir. Kurulum belgesindeki nginx
 * yapılandırması bunu `proxy_set_header` ile sağlıyor.
 *
 * `cf-connecting-ip` hâlâ okunuyor: önüne Cloudflare gibi bir ağ
 * konursa çalışmaya devam etsin.
 */
export function clientIp(request: Request): string {
  const cloudflare = request.headers.get('cf-connecting-ip');
  if (cloudflare) return cloudflare.trim();

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
 * Güvenlik altyapısı yapılandırılmamışsa `allowed: true` döner, sınır
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
