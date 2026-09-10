import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clientIp } from './_guard';

/**
 * `_guard.ts` yapılandırmayı modül yüklenirken okur; yapılandırmaya bağlı
 * davranışlar için her senaryo `vi.resetModules()` sonrası taze modül alır.
 * Saf olan `clientIp` doğrudan içe aktarılabilir.
 */
type Guard = typeof import('./_guard');

const ESKI_ENV = { ...process.env };

async function moduluYukle(env: Record<string, string | undefined>): Promise<Guard> {
  process.env = { ...ESKI_ENV, ...env };
  vi.resetModules();
  return import('./_guard');
}

function fetchTakli(uretici: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const cagrilar: { url: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    cagrilar.push({
      url: String(url),
      govde: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return uretici(String(url), init);
  }));
  return cagrilar;
}

const YAPILI = {
  SUPABASE_URL: 'https://ornek.supabase.co',
  VITE_SUPABASE_URL: undefined,
  SUPABASE_SERVICE_ROLE_KEY: 'service-anahtari',
};

const YAPILANDIRILMAMIS = {
  SUPABASE_URL: undefined,
  VITE_SUPABASE_URL: undefined,
  SUPABASE_SERVICE_ROLE_KEY: undefined,
};

const KURAL = { bucket: 'login', limit: 5, windowSeconds: 60 };

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { process.env = { ...ESKI_ENV }; vi.unstubAllGlobals(); });

function istek(basliklar: Record<string, string>): Request {
  return new Request('https://ornek.test/api/login', { headers: basliklar });
}

describe('clientIp, hız sınırı ve giriş kilidinin anahtarı', () => {
  it('Cloudflare başlığını önceler', () => {
    expect(clientIp(istek({ 'cf-connecting-ip': '203.0.113.7' }))).toBe('203.0.113.7');
  });

  it('istemcinin uydurduğu x-forwarded-for değerini kullanmaz', () => {
    // Saldırgan her istekte farklı bir x-forwarded-for göndererek sınırı
    // atlatabilirdi; Cloudflare başlığı varken o kazanmalı.
    const yanit = clientIp(istek({
      'cf-connecting-ip': '203.0.113.7',
      'x-forwarded-for': '1.2.3.4',
    }));
    expect(yanit).toBe('203.0.113.7');
  });

  it('Cloudflare başlığı yoksa x-forwarded-for zincirinin ilkini alır', () => {
    expect(clientIp(istek({ 'x-forwarded-for': '198.51.100.9, 10.0.0.1' }))).toBe('198.51.100.9');
  });

  it('başlık değerlerindeki boşlukları kırpar', () => {
    expect(clientIp(istek({ 'cf-connecting-ip': '  203.0.113.7  ' }))).toBe('203.0.113.7');
  });

  it('yalnızca x-real-ip varsa onu kullanır', () => {
    expect(clientIp(istek({ 'x-real-ip': '192.0.2.15' }))).toBe('192.0.2.15');
  });

  it('hiçbir başlık yoksa sabit bir değere düşer', () => {
    expect(clientIp(istek({}))).toBe('bilinmeyen');
  });
});

describe('json', () => {
  it('gövdeyi JSON olarak ve UTF-8 başlığıyla yazar', async () => {
    const guard = await moduluYukle(YAPILI);
    const yanit = guard.json({ mesaj: 'Doğrulama kodu gönderildi' });
    expect(yanit.status).toBe(200);
    expect(yanit.headers.get('content-type')).toBe('application/json; charset=utf-8');
    await expect(yanit.json()).resolves.toEqual({ mesaj: 'Doğrulama kodu gönderildi' });
  });

  it('durum kodu ve ek başlık geçirilebilir', async () => {
    const guard = await moduluYukle(YAPILI);
    const yanit = guard.json({ error: 'yok' }, 404, { 'x-deneme': '1' });
    expect(yanit.status).toBe(404);
    expect(yanit.headers.get('x-deneme')).toBe('1');
  });
});

describe('isGuardConfigured', () => {
  it('URL ve service_role anahtarı varsa doğru döner', async () => {
    const guard = await moduluYukle(YAPILI);
    expect(guard.isGuardConfigured()).toBe(true);
  });

  it('anahtar yoksa yanlış döner', async () => {
    const guard = await moduluYukle({ ...YAPILI, SUPABASE_SERVICE_ROLE_KEY: undefined });
    expect(guard.isGuardConfigured()).toBe(false);
  });
});

describe('tooManyRequests', () => {
  it('429 ve retry-after başlığı döndürür', async () => {
    const guard = await moduluYukle(YAPILI);
    const yanit = guard.tooManyRequests(90);
    expect(yanit.status).toBe(429);
    expect(yanit.headers.get('retry-after')).toBe('90');
    await expect(yanit.json()).resolves.toMatchObject({ error: expect.stringContaining('Çok fazla istek') });
  });

  it('varsayılan bekleme süresi 60 saniyedir', async () => {
    const guard = await moduluYukle(YAPILI);
    expect(guard.tooManyRequests().headers.get('retry-after')).toBe('60');
  });
});

describe('enforceRateLimit', () => {
  it('güvenlik altyapısı yokken isteği geçirir ama uygulanmadığını bildirir', async () => {
    const guard = await moduluYukle(YAPILANDIRILMAMIS);
    const cagrilar = fetchTakli(() => new Response('true'));

    await expect(guard.enforceRateLimit('ip:1.2.3.4', KURAL))
      .resolves.toEqual({ allowed: true, enforced: false });
    expect(cagrilar).toHaveLength(0);
  });

  it('sınır aşılmadığında izin verir ve kuralı RPC parametrelerine taşır', async () => {
    const guard = await moduluYukle(YAPILI);
    const cagrilar = fetchTakli(() => new Response('true', { status: 200 }));

    await expect(guard.enforceRateLimit('ip:1.2.3.4', KURAL))
      .resolves.toEqual({ allowed: true, enforced: true });

    expect(cagrilar[0].url).toBe('https://ornek.supabase.co/rest/v1/rpc/check_rate_limit');
    expect(cagrilar[0].govde).toEqual({
      p_bucket: 'login', p_identifier: 'ip:1.2.3.4', p_limit: 5, p_window_seconds: 60,
    });
  });

  it('sınır aşıldığında reddeder', async () => {
    const guard = await moduluYukle(YAPILI);
    fetchTakli(() => new Response('false', { status: 200 }));
    await expect(guard.enforceRateLimit('ip:1.2.3.4', KURAL))
      .resolves.toEqual({ allowed: false, enforced: true });
  });

  it('RPC hata döndürürse kullanıcıyı dışarıda bırakmaz', async () => {
    // Servis kesintisi girişleri tamamen kapatmamalı; sınır uygulanamadığı
    // `enforced: false` ile bildirilir.
    const guard = await moduluYukle(YAPILI);
    fetchTakli(() => new Response('sunucu hatası', { status: 500 }));
    await expect(guard.enforceRateLimit('ip:1.2.3.4', KURAL))
      .resolves.toEqual({ allowed: true, enforced: false });
  });

  it('ağ hatası fırlatırsa da isteği geçirir', async () => {
    const guard = await moduluYukle(YAPILI);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('bağlantı koptu'); }));
    await expect(guard.enforceRateLimit('ip:1.2.3.4', KURAL))
      .resolves.toEqual({ allowed: true, enforced: false });
  });
});

describe('loginLockStatus', () => {
  it('RPC satırının ilkini döndürür', async () => {
    const guard = await moduluYukle(YAPILI);
    const cagrilar = fetchTakli(() => new Response(
      JSON.stringify([{ locked: true, failed_count: 6, retry_after_seconds: 300 }]),
    ));

    await expect(guard.loginLockStatus('demo@sahratakip.com'))
      .resolves.toEqual({ locked: true, failed_count: 6, retry_after_seconds: 300 });
    expect(cagrilar[0].url).toBe('https://ornek.supabase.co/rest/v1/rpc/login_lock_status');
    expect(cagrilar[0].govde).toEqual({ p_email: 'demo@sahratakip.com' });
  });

  it('boş satır kümesinde null döndürür', async () => {
    const guard = await moduluYukle(YAPILI);
    fetchTakli(() => new Response('[]'));
    await expect(guard.loginLockStatus('demo@sahratakip.com')).resolves.toBeNull();
  });

  it('yapılandırma yoksa null döndürür ve girişi engellemez', async () => {
    const guard = await moduluYukle(YAPILANDIRILMAMIS);
    await expect(guard.loginLockStatus('demo@sahratakip.com')).resolves.toBeNull();
  });

  it('RPC dizi yerine nesne dönerse null döndürür', async () => {
    const guard = await moduluYukle(YAPILI);
    fetchTakli(() => new Response(JSON.stringify({ locked: true })));
    await expect(guard.loginLockStatus('demo@sahratakip.com')).resolves.toBeNull();
  });
});

describe('recordLoginAttempt', () => {
  it('başarısız denemeyi e-posta ve IP ile kaydeder', async () => {
    const guard = await moduluYukle(YAPILI);
    const cagrilar = fetchTakli(() => new Response('null'));

    await guard.recordLoginAttempt('demo@sahratakip.com', '203.0.113.7', false);

    expect(cagrilar[0].url).toBe('https://ornek.supabase.co/rest/v1/rpc/record_login_attempt');
    expect(cagrilar[0].govde).toEqual({
      p_email: 'demo@sahratakip.com', p_ip: '203.0.113.7', p_succeeded: false,
    });
  });

  it('başarılı denemeyi de kaydeder', async () => {
    const guard = await moduluYukle(YAPILI);
    const cagrilar = fetchTakli(() => new Response('null'));
    await guard.recordLoginAttempt('demo@sahratakip.com', '203.0.113.7', true);
    expect((cagrilar[0].govde as { p_succeeded: boolean }).p_succeeded).toBe(true);
  });

  it('RPC başarısız olsa da hata fırlatmaz', async () => {
    const guard = await moduluYukle(YAPILI);
    fetchTakli(() => new Response('', { status: 500 }));
    await expect(guard.recordLoginAttempt('a@b.com', '1.2.3.4', false)).resolves.toBeUndefined();
  });
});
