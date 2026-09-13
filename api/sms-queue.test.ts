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
  kuyruk?: { id: string; phone: string; body: string; channel?: 'sms' | 'whatsapp' }[];
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

/*
  WhatsApp Web modülü taklit ediliyor. Gerçeğini çağırmak Baileys'i
  yükleyip WhatsApp sunucularına bağlanmayı denemek demekti; test ağa
  çıkmamalı.
*/
const whatsappTakli = {
  etkin: false,
  gonderilenler: [] as { telefon: string; metin: string }[],
  sonuc: { ok: true, reference: 'wa-1' } as { ok: boolean; reference?: string; error?: string },
};

vi.mock('./_whatsapp_web', () => ({
  whatsappWebEtkinMi: () => whatsappTakli.etkin,
  baglantiDurumu: () => (whatsappTakli.etkin ? 'bagli' : 'kapali'),
  baglan: async () => (whatsappTakli.etkin ? 'bagli' : 'kapali'),
  gonder: async (telefon: string, metin: string) => {
    whatsappTakli.gonderilenler.push({ telefon, metin });
    return whatsappTakli.sonuc;
  },
}));

beforeEach(() => {
  vi.unstubAllGlobals();
  whatsappTakli.etkin = false;
  whatsappTakli.gonderilenler = [];
  whatsappTakli.sonuc = { ok: true, reference: 'wa-1' };
});
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
      .resolves.toEqual({ processed: 0, sent: 0, failed: 0, whatsapp: 0 });
  });

  it('başarılı gönderimde sonucu ve sağlayıcı referansını yazar', async () => {
    const handler = await handlerYukle();
    const cagrilar = fetchTakli({
      kuyruk: [{ id: 'k1', phone: '5321234567', body: 'metin' }],
      saglayici: { '5321234567': '00 123456' },
    });

    const yanit = await handler(istek());

    await expect(yanit.json()).resolves.toEqual({ processed: 1, sent: 1, failed: 0, whatsapp: 0 });
    const tamam = cagrilar.find((c) => c.adres.endsWith('/rpc/complete_sms'));
    expect(tamam?.govde).toEqual({
      p_id: 'k1', p_success: true, p_error: null, p_ref: '123456', p_channel: 'sms',
    });
  });

  it('sağlayıcı hatasında gerekçeyi kuyruğa yazar', async () => {
    const handler = await handlerYukle();
    const cagrilar = fetchTakli({
      kuyruk: [{ id: 'k1', phone: '5321234567', body: 'metin' }],
      saglayici: { '5321234567': '40' },
    });

    await expect((await handler(istek())).json())
      .resolves.toEqual({ processed: 1, sent: 0, failed: 1, whatsapp: 0 });

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
      .resolves.toEqual({ processed: 3, sent: 2, failed: 1, whatsapp: 0 });
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
      .resolves.toEqual({ processed: 2, sent: 0, failed: 2, whatsapp: 0 });
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

/* ------------------------------------------------- WhatsApp kanalı */

describe('sms kuyruğu, WhatsApp kanalı', () => {
  const satir = (channel?: 'sms' | 'whatsapp') =>
    [{ id: 'k1', phone: '5551112233', body: 'Tahsilat eklendi', channel }];

  it('kanal whatsapp ise WhatsApp’tan gönderir, Netgsm’e hiç gitmez', async () => {
    whatsappTakli.etkin = true;
    const handler = await handlerYukle({ WHATSAPP_WEB_ETKIN: '1' });
    const cagrilar = fetchTakli({ kuyruk: satir('whatsapp') });

    const yanit = await handler(istek());
    const govde = await yanit.json() as { sent: number; whatsapp: number };

    expect(govde).toMatchObject({ sent: 1, whatsapp: 1 });
    expect(whatsappTakli.gonderilenler).toEqual([
      { telefon: '5551112233', metin: 'Tahsilat eklendi' },
    ]);
    expect(cagrilar.some((c) => c.adres.startsWith('https://api.netgsm.com.tr/'))).toBe(false);
  });

  it('WhatsApp düşerse AYNI satır SMS’e düşer', async () => {
    whatsappTakli.etkin = true;
    whatsappTakli.sonuc = { ok: false, error: 'oturum kapalı' };
    const handler = await handlerYukle({ WHATSAPP_WEB_ETKIN: '1' });
    const cagrilar = fetchTakli({ kuyruk: satir('whatsapp') });

    const govde = await (await handler(istek())).json() as { sent: number; whatsapp: number };

    // Bildirim kaybolmadı ve ikinci bir kuyruk satırı açılmadı.
    expect(govde).toMatchObject({ sent: 1, whatsapp: 0 });
    expect(cagrilar.some((c) => c.adres.startsWith('https://api.netgsm.com.tr/'))).toBe(true);

    const tamamla = cagrilar.find((c) => c.adres.endsWith('/rpc/complete_sms'));
    expect(tamamla?.govde).toMatchObject({ p_success: true, p_channel: 'sms' });
  });

  it('gönderilen kanalı kayda yazar', async () => {
    whatsappTakli.etkin = true;
    const handler = await handlerYukle({ WHATSAPP_WEB_ETKIN: '1' });
    const cagrilar = fetchTakli({ kuyruk: satir('whatsapp') });
    await handler(istek());

    const tamamla = cagrilar.find((c) => c.adres.endsWith('/rpc/complete_sms'));
    expect(tamamla?.govde).toMatchObject({ p_success: true, p_channel: 'whatsapp' });
  });

  it('kanal sms olan satır WhatsApp’a HİÇ uğramaz', async () => {
    whatsappTakli.etkin = true;
    const handler = await handlerYukle({ WHATSAPP_WEB_ETKIN: '1' });
    fetchTakli({ kuyruk: satir('sms') });
    await handler(istek());

    expect(whatsappTakli.gonderilenler).toHaveLength(0);
  });

  it('WhatsApp yolu kapalıyken whatsapp satırı da SMS’ten gider', async () => {
    // Kanal veritabanında whatsapp ama sunucuda yol açılmamış: mesaj
    // beklemeye alınmamalı, SMS'ten gitmeli.
    const handler = await handlerYukle();
    const cagrilar = fetchTakli({ kuyruk: satir('whatsapp') });
    await handler(istek());

    expect(whatsappTakli.gonderilenler).toHaveLength(0);
    expect(cagrilar.some((c) => c.adres.startsWith('https://api.netgsm.com.tr/'))).toBe(true);
  });
});
