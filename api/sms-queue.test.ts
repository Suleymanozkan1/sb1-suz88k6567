import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * SMS kuyruğu işleyicisi.
 *
 * Kuyruğun varlık sebebi, sağlayıcı kesintisinde mesajın kaybolmamasıdır.
 * Testler bu güvenceyi koruyor: yetkisiz tetikleme reddedilir, her satırın
 * sonucu tek tek yazılır, bir satırın hatası kalan satırları durdurmaz ve
 * sonucu yazılamayan satır 'gonderiliyor' bırakılıp sonraki turda
 * kurtarılmak üzere başarısız sayılır.
 */
const SIR = 'cron-sirri';
const ESKI_ENV = { ...process.env };

async function handlerYukle(env: Record<string, string | undefined> = {}) {
  process.env = {
    ...ESKI_ENV,
    CRON_SECRET: SIR,
    PGRST_URL: 'http://veri.yerel',
        JWT_SECRET: 'test-icin-en-az-otuz-iki-karakterlik-sir',
    NETGSM_USER: 'abone',
    NETGSM_PASS: 'gizli-sifre',
    NETGSM_HEADER: 'SAHRATAKIP',
    ...env,
  };
  vi.resetModules();
  return (await import('./sms-queue')).default;
}

interface Senaryo {
  kuyruk?: { id: string; phone: string; body: string }[];
  /** claim_sms_batch RPC'si hata versin */
  kuyrukHatasi?: boolean;
  /** Netgsm yanıtları, numaraya göre */
  saglayici?: Record<string, string>;
  /** complete_sms RPC'si hata versin */
  sonucYazilamasin?: boolean;
}

function fetchTakli(senaryo: Senaryo = {}) {
  const cagrilar: { adres: string; govde: Record<string, unknown> | undefined }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const adres = String(url);
    const govde = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
    cagrilar.push({ adres, govde });

    if (adres.endsWith('/rpc/requeue_stuck_sms')) return new Response('0');
    if (adres.endsWith('/rpc/claim_sms_batch')) {
      if (senaryo.kuyrukHatasi) return new Response('kuyruk kilitli', { status: 500 });
      return new Response(JSON.stringify(senaryo.kuyruk ?? []));
    }
    if (adres.endsWith('/rpc/complete_sms')) {
      if (senaryo.sonucYazilamasin) return new Response('yazilamadi', { status: 500 });
      return new Response('null');
    }
    if (adres.startsWith('https://api.netgsm.com.tr/')) {
      const numara = new URL(adres).searchParams.get('gsmno')!;
      return new Response(senaryo.saglayici?.[numara] ?? '00 999');
    }
    return new Response('{}');
  }));
  return cagrilar;
}

function istek(yetkili = true): Request {
  return new Request('https://ornek.test/api/sms-queue', {
    method: 'POST',
    headers: yetkili ? { authorization: `Bearer ${SIR}` } : {},
  });
}

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { process.env = { ...ESKI_ENV }; vi.unstubAllGlobals(); });

describe('sms kuyruğu, yetkilendirme', () => {
  it('cron sırrı olmadan çağrılamaz', async () => {
    const handler = await handlerYukle();
    const cagrilar = fetchTakli();
    const yanit = await handler(istek(false));
    expect(yanit.status).toBe(401);
    expect(cagrilar).toHaveLength(0);
  });

  it('yanlış sırla çağrılamaz', async () => {
    const handler = await handlerYukle();
    fetchTakli();
    const yanlis = new Request('https://ornek.test/api/sms-queue', {
      method: 'POST', headers: { authorization: 'Bearer baska' },
    });
    expect((await handler(yanlis)).status).toBe(401);
  });

  it('CRON_SECRET tanımlı değilse hiçbir istek geçmez', async () => {
    const handler = await handlerYukle({ CRON_SECRET: undefined });
    fetchTakli();
    expect((await handler(istek())).status).toBe(401);
  });
});

describe('sms kuyruğu, yapılandırma', () => {
  it('veritabanı yapılandırması eksikse 500 döner', async () => {
    const handler = await handlerYukle({
      JWT_SECRET: undefined,
    });
    fetchTakli();
    const yanit = await handler(istek());
    expect(yanit.status).toBe(500);
  });

  it('sağlayıcı yoksa kuyruğu hiç tüketmez', async () => {
    // Kuyruk boşaltılırsa mesajlar kaybolurdu; işleyici hiç dokunmamalı.
    const handler = await handlerYukle({ NETGSM_PASS: undefined });
    const cagrilar = fetchTakli({ kuyruk: [{ id: '1', phone: '5321234567', body: 'metin' }] });

    const yanit = await handler(istek());

    await expect(yanit.json()).resolves.toEqual({ processed: 0, reason: 'provider_not_configured' });
    expect(cagrilar.some((c) => c.adres.endsWith('/rpc/claim_sms_batch'))).toBe(false);
  });
});

describe('sms kuyruğu, işleme', () => {
  it('önce takılı kalmışları kurtarır, sonra partiyi alır', async () => {
    const handler = await handlerYukle();
    const cagrilar = fetchTakli();

    await handler(istek());

    const rpcler = cagrilar.map((c) => c.adres).filter((a) => a.includes('/rpc/'));
    expect(rpcler[0]).toContain('requeue_stuck_sms');
    expect(rpcler[1]).toContain('claim_sms_batch');
  });

  it('parti boyutu 20 olarak istenir', async () => {
    const handler = await handlerYukle();
    const cagrilar = fetchTakli();
    await handler(istek());
    const parti = cagrilar.find((c) => c.adres.endsWith('/rpc/claim_sms_batch'));
    expect(parti?.govde).toEqual({ p_limit: 20 });
  });

  it('boş kuyrukta sıfır sonuç döner', async () => {
    const handler = await handlerYukle();
    fetchTakli({ kuyruk: [] });
    await expect((await handler(istek())).json())
      .resolves.toEqual({ processed: 0, sent: 0, failed: 0 });
  });

  it('başarılı gönderimde sonucu ve sağlayıcı referansını yazar', async () => {
    const handler = await handlerYukle();
    const cagrilar = fetchTakli({
      kuyruk: [{ id: 'k1', phone: '5321234567', body: 'metin' }],
      saglayici: { '5321234567': '00 123456' },
    });

    const yanit = await handler(istek());

    await expect(yanit.json()).resolves.toEqual({ processed: 1, sent: 1, failed: 0 });
    const tamam = cagrilar.find((c) => c.adres.endsWith('/rpc/complete_sms'));
    expect(tamam?.govde).toEqual({
      p_id: 'k1', p_success: true, p_error: null, p_ref: '123456',
    });
  });

  it('sağlayıcı hatasında gerekçeyi kuyruğa yazar', async () => {
    const handler = await handlerYukle();
    const cagrilar = fetchTakli({
      kuyruk: [{ id: 'k1', phone: '5321234567', body: 'metin' }],
      saglayici: { '5321234567': '40' },
    });

    await expect((await handler(istek())).json())
      .resolves.toEqual({ processed: 1, sent: 0, failed: 1 });

    const tamam = cagrilar.find((c) => c.adres.endsWith('/rpc/complete_sms'));
    expect(tamam?.govde).toMatchObject({
      p_id: 'k1', p_success: false, p_ref: null,
      p_error: 'Mesaj başlığı (gönderici adı) sistemde tanımlı değil.',
    });
  });

  it('bir satırın hatası kalan satırları durdurmaz', async () => {
    const handler = await handlerYukle();
    fetchTakli({
      kuyruk: [
        { id: 'k1', phone: '5321111111', body: 'a' },
        { id: 'k2', phone: '5322222222', body: 'b' },
        { id: 'k3', phone: '5323333333', body: 'c' },
      ],
      saglayici: { '5322222222': '30' },
    });

    await expect((await handler(istek())).json())
      .resolves.toEqual({ processed: 3, sent: 2, failed: 1 });
  });

  it('sonucu yazılamayan satır başarısız sayılır ve akış sürer', async () => {
    // complete_sms başarısızsa satır 'gonderiliyor' kalır; bir sonraki
    // turda requeue_stuck_sms kurtarır. İşleyici çökmemeli.
    const handler = await handlerYukle();
    fetchTakli({
      kuyruk: [
        { id: 'k1', phone: '5321111111', body: 'a' },
        { id: 'k2', phone: '5322222222', body: 'b' },
      ],
      sonucYazilamasin: true,
    });

    await expect((await handler(istek())).json())
      .resolves.toEqual({ processed: 2, sent: 0, failed: 2 });
  });

  it('kuyruk okunamazsa 502 döner', async () => {
    const handler = await handlerYukle();
    fetchTakli({ kuyrukHatasi: true });
    const yanit = await handler(istek());
    expect(yanit.status).toBe(502);
    await expect(yanit.json()).resolves.toMatchObject({ error: 'Kuyruk okunamadı.' });
  });

  it('hiçbir yanıtta sağlayıcı ya da service_role sırrı geçmez', async () => {
    const handler = await handlerYukle();
    fetchTakli({
      kuyruk: [{ id: 'k1', phone: '5321234567', body: 'metin' }],
      saglayici: { '5321234567': '30' },
    });
    const metin = await (await handler(istek())).text();
    expect(metin).not.toContain('gizli-sifre');
    expect(metin).not.toContain('service-anahtari');
  });
});
