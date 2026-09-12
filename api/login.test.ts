import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Giriş uç noktası. Testlerin amacı, girişi sunucudan geçirmenin tek
 * gerekçesini korumaktır: hız sınırı, hesap kilidi ve başarısız denemenin
 * kaydı. Sızdırılmaması gereken şey de burada: kilitli hesapta ya da hatalı
 * şifrede oturum belirteci dönmemeli.
 */
const ESKI_ENV = { ...process.env };

async function handlerYukle(env: Record<string, string | undefined> = {}) {
  process.env = {
    ...ESKI_ENV,
    PGRST_URL: 'http://veri.yerel',
    JWT_SECRET: 'test-icin-en-az-otuz-iki-karakterlik-sir',
    ...env,
  };
  vi.resetModules();
  return (await import('./login')).default;
}

const KULLANICI = '11111111-1111-1111-1111-111111111111';
const DOGRU_SIFRE = 'dogru-sifre-1234';
/** DOGRU_SIFRE'nin scrypt karması; beforeAll içinde üretiliyor. */
let DOGRU_KARMA = '';

interface Senaryo {
  /** login_lock_status RPC yanıtı; null ise boş dizi döner */
  kilit?: { locked: boolean; failed_count: number; retry_after_seconds: number } | null;
  /** Kilit sorgusu ikinci kez çağrıldığında dönecek satır (başarısız giriş sonrası) */
  kilitSonra?: { locked: boolean; failed_count: number; retry_after_seconds: number } | null;
  /** check_rate_limit yanıtı */
  sinirAsildi?: boolean;
  /**
   * kimlik_bul yanıtı: kullanıcı satırı, kullanıcı yoksa null,
   * veritabanına ulaşılamıyorsa 'aglaHata'.
   */
  kimlik?: { id: string; encrypted_password: string } | null | 'aglaHata';
  /** oturum_ac çağrısı düşsün mü */
  oturumHatasi?: boolean;
}

function fetchTakli(senaryo: Senaryo) {
  const cagrilar: { adres: string; govde: unknown }[] = [];
  let kilitSorgusu = 0;

  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const adres = String(url);
    cagrilar.push({ adres, govde: init?.body ? JSON.parse(String(init.body)) : undefined });

    if (adres.endsWith('/rpc/check_rate_limit')) {
      return new Response(String(!senaryo.sinirAsildi));
    }
    if (adres.endsWith('/rpc/login_lock_status')) {
      kilitSorgusu += 1;
      const satir = kilitSorgusu === 1 ? senaryo.kilit : (senaryo.kilitSonra ?? senaryo.kilit);
      return new Response(JSON.stringify(satir ? [satir] : []));
    }
    if (adres.endsWith('/rpc/record_login_attempt')) {
      return new Response('null');
    }
    if (adres.endsWith('/rpc/kimlik_bul')) {
      if (senaryo.kimlik === 'aglaHata') throw new Error('bağlantı koptu');
      const satir = senaryo.kimlik === undefined
        ? { id: KULLANICI, encrypted_password: DOGRU_KARMA }
        : senaryo.kimlik;
      return new Response(JSON.stringify(satir ? [satir] : []));
    }
    if (adres.endsWith('/rpc/oturum_ac')) {
      if (senaryo.oturumHatasi) return new Response('hata', { status: 500 });
      return new Response(JSON.stringify(KULLANICI));
    }
    return new Response('{}');
  }));

  return cagrilar;
}

function istek(govde: unknown, basliklar: Record<string, string> = {}, method = 'POST'): Request {
  return new Request('https://ornek.test/api/login', {
    method,
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7', ...basliklar },
    body: method === 'POST' ? JSON.stringify(govde) : undefined,
  });
}

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-icin-en-az-otuz-iki-karakterlik-sir';
  const { sifreyiKarmala } = await import('./_kimlik');
  DOGRU_KARMA = await sifreyiKarmala(DOGRU_SIFRE);
});

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { process.env = { ...ESKI_ENV }; vi.unstubAllGlobals(); });

describe('giriş uç noktası, istek doğrulaması', () => {
  it('POST dışındaki yöntemleri reddeder', async () => {
    const handler = await handlerYukle();
    fetchTakli({});
    const yanit = await handler(istek(null, {}, 'GET'));
    expect(yanit.status).toBe(405);
  });

  it('sunucu yapılandırması eksikse 500 döner', async () => {
    const handler = await handlerYukle({ JWT_SECRET: undefined });
    fetchTakli({});
    const yanit = await handler(istek({ email: 'a@b.com', password: 'x' }));
    expect(yanit.status).toBe(500);
    await expect(yanit.json()).resolves.toEqual({ error: 'Sunucu yapılandırması eksik.' });
  });

  it('bozuk JSON gövdesini reddeder', async () => {
    const handler = await handlerYukle();
    fetchTakli({});
    const bozuk = new Request('https://ornek.test/api/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{',
    });
    const yanit = await handler(bozuk);
    expect(yanit.status).toBe(400);
    await expect(yanit.json()).resolves.toEqual({ error: 'Geçersiz istek gövdesi.' });
  });

  it('e-posta boşsa 400 döner', async () => {
    const handler = await handlerYukle();
    fetchTakli({});
    const yanit = await handler(istek({ email: '   ', password: 'sifre' }));
    expect(yanit.status).toBe(400);
  });

  it('şifre boşsa 400 döner', async () => {
    const handler = await handlerYukle();
    fetchTakli({});
    expect((await handler(istek({ email: 'a@b.com' }))).status).toBe(400);
  });
});

describe('giriş uç noktası, hız sınırı ve kilit', () => {
  it('IP hız sınırı aşıldığında 429 ve retry-after döner', async () => {
    const handler = await handlerYukle();
    const cagrilar = fetchTakli({ sinirAsildi: true });

    const yanit = await handler(istek({ email: 'a@b.com', password: 'sifre' }));

    expect(yanit.status).toBe(429);
    expect(yanit.headers.get('retry-after')).toBe('300');
    // Sınır aşıldıysa kimlik doğrulamaya hiç gidilmemeli.
    expect(cagrilar.some((c) => c.adres.endsWith('/rpc/kimlik_bul'))).toBe(false);
  });

  it('hız sınırı IP başına ve 5 dakikalık pencerede uygulanır', async () => {
    const handler = await handlerYukle();
    const cagrilar = fetchTakli({});
    await handler(istek({ email: 'a@b.com', password: 'sifre' }));
    const sinir = cagrilar.find((c) => c.adres.endsWith('/rpc/check_rate_limit'));
    expect(sinir?.govde).toEqual({
      p_bucket: 'login-ip', p_identifier: '203.0.113.7', p_limit: 20, p_window_seconds: 300,
    });
  });

  it('hesap kilitliyken 423 döner ve şifre denenmez', async () => {
    const handler = await handlerYukle();
    const cagrilar = fetchTakli({
      kilit: { locked: true, failed_count: 6, retry_after_seconds: 300 },
    });

    const yanit = await handler(istek({ email: 'a@b.com', password: 'dogru-sifre' }));

    expect(yanit.status).toBe(423);
    await expect(yanit.json()).resolves.toMatchObject({ locked: true, retryAfterSeconds: 300 });
    expect(cagrilar.some((c) => c.adres.endsWith('/rpc/kimlik_bul'))).toBe(false);
  });

  it('kilit süresini yukarı yuvarlayarak dakikaya çevirir', async () => {
    const handler = await handlerYukle();
    fetchTakli({ kilit: { locked: true, failed_count: 6, retry_after_seconds: 61 } });
    const govde = await (await handler(istek({ email: 'a@b.com', password: 'x' }))).json();
    expect((govde as { error: string }).error).toContain('2 dakika');
  });

  it('kilit süresi bir dakikanın altındaysa en az 1 dakika gösterir', async () => {
    const handler = await handlerYukle();
    fetchTakli({ kilit: { locked: true, failed_count: 6, retry_after_seconds: 5 } });
    const govde = await (await handler(istek({ email: 'a@b.com', password: 'x' }))).json();
    expect((govde as { error: string }).error).toContain('1 dakika');
  });
});

describe('giriş uç noktası, kimlik doğrulama', () => {
  it('doğru bilgilerde oturum belirteçlerini döndürür', async () => {
    const handler = await handlerYukle();
    const cagrilar = fetchTakli({});

    const yanit = await handler(istek({ email: 'demo@sahratakip.com', password: DOGRU_SIFRE }));

    expect(yanit.status).toBe(200);
    const oturum = await yanit.json() as { accessToken: string; refreshToken: string };
    // Erişim jetonu kullanıcının kimliğini taşımalı: RLS buna dayanıyor.
    const talepler = JSON.parse(
      Buffer.from(oturum.accessToken.split('.')[1], 'base64url').toString(),
    ) as { sub: string; role: string };
    expect(talepler.sub).toBe(KULLANICI);
    expect(talepler.role).toBe('authenticated');
    expect(oturum.refreshToken.length).toBeGreaterThan(20);

    // Başarılı deneme de kaydedilmeli; kilit sayacı ancak böyle sıfırlanır.
    const kayit = cagrilar.find((c) => c.adres.endsWith('/rpc/record_login_attempt'));
    expect(kayit?.govde).toEqual({
      p_email: 'demo@sahratakip.com', p_ip: '203.0.113.7', p_succeeded: true,
    });
  });

  it('e-postanın başındaki ve sonundaki boşluğu kırpar', async () => {
    const handler = await handlerYukle();
    const cagrilar = fetchTakli({});
    await handler(istek({ email: '  demo@sahratakip.com  ', password: DOGRU_SIFRE }));
    const arama = cagrilar.find((c) => c.adres.endsWith('/rpc/kimlik_bul'));
    expect((arama?.govde as { p_email: string }).p_email).toBe('demo@sahratakip.com');
  });

  it('hatalı şifrede 401 döner, denemeyi kaydeder ve belirteç sızdırmaz', async () => {
    const handler = await handlerYukle();
    const cagrilar = fetchTakli({
      kilit: null,
      kilitSonra: { locked: false, failed_count: 2, retry_after_seconds: 0 },
    });

    const yanit = await handler(istek({ email: 'a@b.com', password: 'kesinlikle-yanlis' }));

    expect(yanit.status).toBe(401);
    const govde = await yanit.json() as Record<string, unknown>;
    expect(govde).toEqual({ error: 'E-posta veya şifreniz hatalı.', remainingAttempts: 3 });
    expect(JSON.stringify(govde)).not.toContain('token');

    const kayit = cagrilar.find((c) => c.adres.endsWith('/rpc/record_login_attempt'));
    expect((kayit?.govde as { p_succeeded: boolean }).p_succeeded).toBe(false);
  });

  it('kalan hak negatife düşmez', async () => {
    const handler = await handlerYukle();
    fetchTakli({
      kilitSonra: { locked: false, failed_count: 9, retry_after_seconds: 0 },
    });
    const govde = await (await handler(istek({ email: 'a@b.com', password: 'x' }))).json();
    expect((govde as { remainingAttempts: number }).remainingAttempts).toBe(0);
  });

  it('kilit durumu okunamazsa kalan hak null döner', async () => {
    const handler = await handlerYukle();
    fetchTakli({ kilitSonra: null });
    const govde = await (await handler(istek({ email: 'a@b.com', password: 'x' }))).json();
    expect((govde as { remainingAttempts: number | null }).remainingAttempts).toBeNull();
  });

  it('kimlik servisine ulaşılamazsa 502 döner', async () => {
    const handler = await handlerYukle();
    fetchTakli({ kimlik: 'aglaHata' });
    const yanit = await handler(istek({ email: 'a@b.com', password: 'x' }));
    expect(yanit.status).toBe(502);
    await expect(yanit.json()).resolves.toEqual({ error: 'Kimlik doğrulama servisine ulaşılamadı.' });
  });

  it('oturum açılamazsa 502 döner', async () => {
    const handler = await handlerYukle();
    fetchTakli({ oturumHatasi: true });
    const yanit = await handler(istek({ email: 'a@b.com', password: DOGRU_SIFRE }));
    expect(yanit.status).toBe(502);
    await expect(yanit.json()).resolves.toEqual({ error: 'Oturum başlatılamadı.' });
  });

  it('kayıtlı olmayan e-postada da şifre karşılaştırması yapar', async () => {
    // Yanıt süresi farkı "bu e-posta kayıtlı mı" sorusunu cevaplasaydı,
    // saldırgan hesap listesi çıkarabilirdi.
    const handler = await handlerYukle();
    fetchTakli({ kimlik: null });
    const yanit = await handler(istek({ email: 'yok@ornek.com', password: 'x' }));
    expect(yanit.status).toBe(401);
    await expect(yanit.json()).resolves.toMatchObject({ error: 'E-posta veya şifreniz hatalı.' });
  });

  it('service_role anahtarını hiçbir yanıtta sızdırmaz', async () => {
    const handler = await handlerYukle();
    fetchTakli({});
    const metin = await (await handler(istek({ email: 'a@b.com', password: 'x' }))).text();
    expect(metin).not.toContain('service-anahtari');
    expect(metin).not.toContain('anon-anahtari');
  });
});
