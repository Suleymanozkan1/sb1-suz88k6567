/**
 * Sunucu tarafı güvenlik yardımcıları.
 *
 * Alt çizgi ile başladığı için yönlendiricide uç nokta olarak
 * yayınlamaz; yalnızca diğer fonksiyonlar tarafından içe aktarılır.
 */

import { callRpc, isDbConfigured } from './_db.js';

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

/**
 * İsteği yapan kullanıcı kim?
 *
 * NEDEN GEREKLİ. Satır güvenliği (RLS) `/veri` yolundan gelen sorguları
 * koruyor, ama `api/` altındaki uç noktalar veritabanına `service_role`
 * ile gidiyor -- RLS orada devrede DEĞİL. Yetki kontrolü yapmayan bir uç
 * nokta, RLS ne kadar sıkı olursa olsun onu baypas eder.
 *
 * Denetimde çıkan somut örnek: `/api/sms` hiçbir kimlik doğrulaması
 * yapmıyordu. Sağlayıcı kurulu olmadığı için zararsız görünüyordu, ama
 * NETGSM tanımlandığı gün internetteki herkesin işletmenin hesabından,
 * işletmenin başlığıyla SMS attırabileceği açık bir kapı oluyordu.
 *
 * `kapsam`, veritabanındaki `owner_scope()` ile AYNI kuralı uygular:
 * yönetici ise kendi kimliği, personel ise bağlı olduğu yöneticinin
 * kimliği. Belirli bir kaydın üzerinde işlem yapan uç noktalar, kaydın
 * bu kapsama ait olduğunu ayrıca doğrulamak zorunda -- yetki ile
 * kiracı ayrımı iki AYRI sorudur. `mesaj.duzenle` yetkisi olan bir
 * personel, o yetkiyle BAŞKA işletmenin müşterisine yazamamalı.
 */
export interface Cagiran {
  id: string;
  /** Yönetici mi? Yöneticinin `owner_id` alanı boştur ve her yetkiye sahiptir. */
  sahipMi: boolean;
  /** Verinin sahibi olan yönetici kimliği (`owner_scope()` karşılığı). */
  kapsam: string;
  yetkiler: string[];
}

/** Bearer jetonundan çağıranı çözer. Jeton yoksa ya da geçersizse null. */
export async function cagiran(request: Request): Promise<Cagiran | null> {
  const { jetonuCoz } = await import('./_kimlik.js');
  const { selectRows } = await import('./_db.js');

  const baslik = request.headers.get('authorization') ?? '';
  const jeton = baslik.startsWith('Bearer ') ? baslik.slice(7).trim() : '';
  if (!jeton) return null;
  const kimlik = jetonuCoz(jeton)?.sub;
  if (!kimlik) return null;

  try {
    const satirlar = await selectRows<{ owner_id: string | null; permissions: string[] }>(
      `profiles?id=eq.${encodeURIComponent(kimlik)}&select=owner_id,permissions`,
    );
    const profil = satirlar[0];
    if (!profil) return null;
    return {
      id: kimlik,
      sahipMi: profil.owner_id === null,
      kapsam: profil.owner_id ?? kimlik,
      yetkiler: profil.permissions ?? [],
    };
  } catch {
    // Veritabanına ulaşılamıyorsa kimlik DOĞRULANMAZ; kapalı tarafta kal.
    return null;
  }
}

/**
 * İsteği yapan kullanıcının belirtilen YETKİSİ var mı?
 *
 * Sahip (owner) her yetkiye sahip; personel yalnızca listesindekine --
 * veritabanındaki `has_permission()` ile aynı kural.
 *
 * DİKKAT: bu yalnızca "bu işlemi yapabilir mi" sorusunu yanıtlar.
 * Belirli bir kayda dokunan uç noktalarda "bu kayıt onun mu" sorusu
 * AYRICA sorulmalı; onun için `cagiran()` kullanılır.
 */
export async function yetkisiVarMi(request: Request, yetki: string): Promise<boolean> {
  const kisi = await cagiran(request);
  if (!kisi) return false;
  if (kisi.sahipMi) return true;
  return kisi.yetkiler.includes(yetki);
}
