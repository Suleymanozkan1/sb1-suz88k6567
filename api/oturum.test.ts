import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Oturum yenileme ve çıkış.
 *
 * Testlerin ağırlığı reddedilmesi ve iptal edilmesi gereken durumlarda:
 * çıkışın gerçekten çıkış olması ve tükenmiş bir jetonun ikinci kez
 * kabul edilmemesi, bu uç noktanın tek varlık sebebi.
 */
const ESKI_ENV = { ...process.env };
const KULLANICI = '11111111-1111-1111-1111-111111111111';

async function handlerYukle(env: Record<string, string | undefined> = {}) {
  process.env = {
    ...ESKI_ENV,
    PGRST_URL: 'http://veri.yerel',
    JWT_SECRET: 'test-icin-en-az-otuz-iki-karakterlik-sir',
    ...env,
  };
  vi.resetModules();
  return (await import('./oturum')).default;
}

interface Senaryo {
  /** oturum_yenile yanıtı: kullanıcı kimliği ya da null (geçersiz jeton) */
  yenile?: string | null;
  /** çağrı düşsün mü */
  hata?: boolean;
}

function fetchTakli(senaryo: Senaryo = {}) {
  const cagrilar: { adres: string; govde: Record<string, unknown> }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const adres = String(url);
    cagrilar.push({
      adres,
      govde: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {},
    });
    if (senaryo.hata) return new Response('hata', { status: 500 });
    if (adres.endsWith('/rpc/oturum_yenile')) {
      const deger = senaryo.yenile === undefined ? KULLANICI : senaryo.yenile;
      return new Response(JSON.stringify(deger));
    }
    if (adres.endsWith('/rpc/oturum_kapat')) return new Response('1');
    return new Response('{}');
  }));
  return cagrilar;
}

const istek = (yontem: string, govde?: unknown) => new Request('https://x/api/oturum', {
  method: yontem,
  headers: { 'content-type': 'application/json' },
  body: govde === undefined ? undefined : JSON.stringify(govde),
});

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { process.env = { ...ESKI_ENV }; vi.unstubAllGlobals(); });

describe('yapılandırma', () => {
  it('imza sırrı yoksa 500 döner ve ağa çıkmaz', async () => {
    const handler = await handlerYukle({ JWT_SECRET: undefined });
    const cagrilar = fetchTakli();
    const yanit = await handler(istek('POST', { refreshToken: 'x' }));
    expect(yanit.status).toBe(500);
    expect(cagrilar).toHaveLength(0);
  });
});

describe('yenileme', () => {
  it('geçerli jetonda yeni erişim ve yenileme jetonu verir', async () => {
    const handler = await handlerYukle();
    fetchTakli();
    const yanit = await handler(istek('POST', { refreshToken: 'eski-jeton' }));

    expect(yanit.status).toBe(200);
    const govde = await yanit.json() as { accessToken: string; refreshToken: string };
    const talepler = JSON.parse(
      Buffer.from(govde.accessToken.split('.')[1], 'base64url').toString(),
    ) as { sub: string; role: string };
    expect(talepler.sub).toBe(KULLANICI);
    expect(talepler.role).toBe('authenticated');
    // Dönüşümlü yenileme: dönen jeton eskisinden farklı olmalı.
    expect(govde.refreshToken).not.toBe('eski-jeton');
  });

  it('jetonun kendisini değil karmasını veritabanına gönderir', async () => {
    // Jeton düz metin saklansaydı, veritabanı yedeği sızınca oturum açılırdı.
    const handler = await handlerYukle();
    const cagrilar = fetchTakli();
    await handler(istek('POST', { refreshToken: 'gizli-jeton' }));

    const cagri = cagrilar.find((c) => c.adres.endsWith('/rpc/oturum_yenile'))!;
    expect(JSON.stringify(cagri.govde)).not.toContain('gizli-jeton');
    expect(String(cagri.govde.p_token_hash)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('tükenmiş ya da süresi dolmuş jetonu 401 ile reddeder', async () => {
    const handler = await handlerYukle();
    fetchTakli({ yenile: null });
    const yanit = await handler(istek('POST', { refreshToken: 'tukenmis' }));
    expect(yanit.status).toBe(401);
    await expect(yanit.json()).resolves.toEqual({ error: 'Oturumunuzun süresi doldu.' });
  });

  it('jeton gönderilmezse 400 döner', async () => {
    const handler = await handlerYukle();
    fetchTakli();
    expect((await handler(istek('POST', {}))).status).toBe(400);
  });

  it('bozuk gövdeyi 400 ile reddeder', async () => {
    const handler = await handlerYukle();
    fetchTakli();
    const bozuk = new Request('https://x/api/oturum', { method: 'POST', body: 'bu json degil' });
    expect((await handler(bozuk)).status).toBe(400);
  });

  it('veritabanı düşerse 502 döner ve jeton sızdırmaz', async () => {
    const handler = await handlerYukle();
    fetchTakli({ hata: true });
    const yanit = await handler(istek('POST', { refreshToken: 'jeton' }));
    expect(yanit.status).toBe(502);
    expect(JSON.stringify(await yanit.json())).not.toContain('jeton');
  });
});

describe('çıkış', () => {
  it('oturumu veritabanından siler', async () => {
    // Çıkış gerçekten çıkış olmalı; jetonun kendiliğinden ölmesini
    // beklemek, çalınan bir jetonu 30 gün geçerli bırakırdı.
    const handler = await handlerYukle();
    const cagrilar = fetchTakli();
    const yanit = await handler(istek('DELETE', { refreshToken: 'jeton' }));

    expect(yanit.status).toBe(200);
    expect(cagrilar.some((c) => c.adres.endsWith('/rpc/oturum_kapat'))).toBe(true);
  });

  it('jeton olmadan da başarı döner', async () => {
    // Çıkmak isteyen kullanıcı "çıkamadınız" hatasıyla karşılaşmamalı.
    const handler = await handlerYukle();
    const cagrilar = fetchTakli();
    expect((await handler(istek('DELETE', {}))).status).toBe(200);
    expect(cagrilar).toHaveLength(0);
  });
});

describe('yöntem', () => {
  it('GET desteklenmez', async () => {
    const handler = await handlerYukle();
    fetchTakli();
    expect((await handler(istek('GET'))).status).toBe(405);
  });
});
