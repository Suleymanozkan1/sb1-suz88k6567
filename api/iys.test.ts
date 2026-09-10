import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * İYS izin senkronizasyonu.
 *
 * İki yönlü çalışır: yerelde alınan onaylar İYS'ye aktarılır, İYS'de
 * yapılan değişiklikler (özellikle RET) yerele işlenir. Ret kaydının
 * geç işlenmesi, ticari iletinin izinsiz gitmesi demektir; bu yüzden
 * çekilen değişikliklerin gerçekten yazıldığı doğrulanıyor. Bir iznin
 * hatası kalan izinleri de durdurmamalı.
 */
const SIR = 'cron-sirri';
const ESKI_ENV = { ...process.env };

async function moduluYukle(env: Record<string, string | undefined> = {}) {
  process.env = {
    ...ESKI_ENV,
    CRON_SECRET: SIR,
    SUPABASE_URL: 'https://ornek.supabase.co',
    VITE_SUPABASE_URL: undefined,
    SUPABASE_SERVICE_ROLE_KEY: 'service-anahtari',
    IYS_BASE_URL: 'https://iys.test',
    IYS_USERNAME: 'iys-kullanici',
    IYS_PASSWORD: 'gizli-iys-sifresi',
    IYS_CODE: '123456',
    IYS_BRAND_CODE: '654321',
    ...env,
  };
  vi.resetModules();
  return import('./iys');
}

interface Izin {
  id: string; business_id: string; phone: string;
  status: 'ONAY' | 'RET'; source: string; consent_date: string;
}

function izin(over: Partial<Izin> = {}): Izin {
  return {
    id: 'izin-1', business_id: 'biz-1', phone: '5321234567',
    status: 'ONAY', source: 'HS_WEB', consent_date: '2026-09-01T10:30:00+03:00', ...over,
  };
}

interface Senaryo {
  jetonHatasi?: boolean;
  bekleyen?: Izin[];
  /** Bu izin kimlikleri için İYS reddetsin */
  reddedilen?: string[];
  /** Bu izin kimlikleri için ağ hatası olsun */
  aglaHata?: string[];
  degisiklikler?: { recipient: string; status: 'ONAY' | 'RET'; consentDate: string; source: string }[];
  degisiklikHatasi?: boolean;
  /** Telefona göre yerel kayıtlar */
  yerelKayitlar?: Record<string, { id: string; business_id: string }[]>;
}

function fetchTakli(senaryo: Senaryo = {}) {
  const cagrilar: { adres: string; yontem: string; govde: unknown }[] = [];

  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const adres = String(url);
    const yontem = init?.method ?? 'GET';
    let govde: unknown;
    try { govde = init?.body ? JSON.parse(String(init.body)) : undefined; } catch { govde = init?.body; }
    cagrilar.push({ adres, yontem, govde });

    if (adres.endsWith('/oauth2/token')) {
      if (senaryo.jetonHatasi) return new Response('', { status: 401 });
      return new Response(JSON.stringify({ access_token: 'iys-jetonu' }));
    }
    if (adres.includes('/consents/changes')) {
      if (senaryo.degisiklikHatasi) return new Response('', { status: 500 });
      return new Response(JSON.stringify({ list: senaryo.degisiklikler ?? [] }));
    }
    if (adres.includes('/consents') && yontem === 'POST') {
      const alici = (govde as { recipient: string }).recipient;
      if (senaryo.aglaHata?.some((t) => alici.endsWith(t))) throw new Error('bağlantı koptu');
      if (senaryo.reddedilen?.some((t) => alici.endsWith(t))) {
        return new Response('kaynak geçersiz', { status: 422 });
      }
      return new Response('{}', { status: 200 });
    }
    if (adres.includes('/rest/v1/sms_consents?iys_synced_at=is.null')) {
      return new Response(JSON.stringify(senaryo.bekleyen ?? []));
    }
    if (adres.includes('/rest/v1/sms_consents?phone=eq.')) {
      const telefon = /phone=eq\.(\d+)/.exec(adres)![1];
      return new Response(JSON.stringify(senaryo.yerelKayitlar?.[telefon] ?? []));
    }
    if (adres.includes('/rest/v1/sms_consents')) return new Response(null, { status: 204 });
    return new Response('{}');
  }));

  return cagrilar;
}

function istek(yetkili = true): Request {
  return new Request('https://ornek.test/api/iys', {
    method: 'POST',
    headers: yetkili ? { authorization: `Bearer ${SIR}` } : {},
  });
}

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { process.env = { ...ESKI_ENV }; vi.unstubAllGlobals(); });

describe('isIysConfigured', () => {
  it('dört değişken de tanımlıysa doğru döner', async () => {
    const iys = await moduluYukle();
    expect(iys.isIysConfigured()).toBe(true);
  });

  for (const anahtar of ['IYS_USERNAME', 'IYS_PASSWORD', 'IYS_CODE', 'IYS_BRAND_CODE']) {
    it(`${anahtar} eksikse yanlış döner`, async () => {
      const iys = await moduluYukle({ [anahtar]: undefined });
      expect(iys.isIysConfigured()).toBe(false);
    });
  }
});

describe('iys görevi, giriş kontrolleri', () => {
  it('cron sırrı olmadan çağrılamaz', async () => {
    const iys = await moduluYukle();
    const cagrilar = fetchTakli();
    expect((await iys.default(istek(false))).status).toBe(401);
    expect(cagrilar).toHaveLength(0);
  });

  it('veritabanı yapılandırması eksikse 500 döner', async () => {
    const iys = await moduluYukle({
      SUPABASE_URL: undefined, VITE_SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined,
    });
    fetchTakli();
    expect((await iys.default(istek())).status).toBe(500);
  });

  it('İYS yapılandırılmamışsa ağa çıkmadan bildirir', async () => {
    // İYS isteğe bağlıdır: yalnızca ticari ileti gönderilecekse kurulur.
    const iys = await moduluYukle({ IYS_PASSWORD: undefined });
    const cagrilar = fetchTakli();
    const yanit = await iys.default(istek());
    expect(yanit.status).toBe(200);
    await expect(yanit.json()).resolves.toEqual({ synced: false, reason: 'iys_not_configured' });
    expect(cagrilar).toHaveLength(0);
  });

  it('kimlik doğrulama başarısızsa 502 döner', async () => {
    const iys = await moduluYukle();
    fetchTakli({ jetonHatasi: true });
    const yanit = await iys.default(istek());
    expect(yanit.status).toBe(502);
    await expect(yanit.json()).resolves.toMatchObject({ synced: false });
  });
});

describe('iys görevi, onay aktarımı', () => {
  it('bekleyen izni İYS biçiminde gönderir ve işaretler', async () => {
    const iys = await moduluYukle();
    const cagrilar = fetchTakli({ bekleyen: [izin()] });

    const yanit = await iys.default(istek());

    await expect(yanit.json()).resolves.toMatchObject({ synced: true, pushed: 1, failed: 0 });

    const gonderim = cagrilar.find((c) => c.adres.includes('/consents') && c.yontem === 'POST')!;
    expect(gonderim.adres).toBe('https://iys.test/sps/123456/brands/654321/consents');
    expect(gonderim.govde).toEqual({
      consentDate: '2026-09-01 10:30:00',
      source: 'HS_WEB',
      recipient: '+905321234567',
      recipientType: 'BIREYSEL',
      status: 'ONAY',
      type: 'MESAJ',
    });

    const isaret = cagrilar.find((c) => c.adres.includes('sms_consents?id=eq.izin-1'));
    expect(isaret?.govde).toMatchObject({ iys_error: null });
    expect((isaret?.govde as { iys_synced_at: string }).iys_synced_at).toBeTypeOf('string');
  });

  it('İYS reddederse gerekçeyi kaydeder ama aktarılmış saymaz', async () => {
    const iys = await moduluYukle();
    const cagrilar = fetchTakli({ bekleyen: [izin({ phone: '5329998877' })], reddedilen: ['9998877'] });

    await expect((await iys.default(istek())).json())
      .resolves.toMatchObject({ pushed: 0, failed: 1 });

    const isaret = cagrilar.find((c) => c.adres.includes('sms_consents?id=eq.izin-1'));
    const govde = isaret?.govde as { iys_error: string; iys_synced_at?: string };
    expect(govde.iys_error).toContain('İYS reddetti (422)');
    expect(govde.iys_synced_at).toBeUndefined();
  });

  it('ağ hatasında da gerekçeyi kaydeder', async () => {
    const iys = await moduluYukle();
    const cagrilar = fetchTakli({ bekleyen: [izin({ phone: '5327776655' })], aglaHata: ['7776655'] });

    await expect((await iys.default(istek())).json())
      .resolves.toMatchObject({ pushed: 0, failed: 1 });

    const isaret = cagrilar.find((c) => c.adres.includes('sms_consents?id=eq.izin-1'));
    expect((isaret?.govde as { iys_error: string }).iys_error).toContain('bağlantı koptu');
  });

  it('bir iznin hatası kalan izinleri durdurmaz', async () => {
    const iys = await moduluYukle();
    fetchTakli({
      bekleyen: [
        izin({ id: 'i1', phone: '5321111111' }),
        izin({ id: 'i2', phone: '5322222222' }),
        izin({ id: 'i3', phone: '5323333333' }),
      ],
      reddedilen: ['2222222'],
    });

    await expect((await iys.default(istek())).json())
      .resolves.toMatchObject({ pushed: 2, failed: 1 });
  });

  it('RET kaydını da aktarır', async () => {
    const iys = await moduluYukle();
    const cagrilar = fetchTakli({ bekleyen: [izin({ status: 'RET' })] });
    await iys.default(istek());
    const gonderim = cagrilar.find((c) => c.adres.includes('/consents') && c.yontem === 'POST')!;
    expect((gonderim.govde as { status: string }).status).toBe('RET');
  });
});

describe('iys görevi, değişiklik çekme', () => {
  it('İYS tarafındaki reddi yerel kayda işler', async () => {
    const iys = await moduluYukle();
    const cagrilar = fetchTakli({
      degisiklikler: [{
        recipient: '+905321234567', status: 'RET',
        consentDate: '2026-09-05 12:00:00', source: 'IYS',
      }],
      yerelKayitlar: { '5321234567': [{ id: 'izin-9', business_id: 'biz-1' }] },
    });

    await expect((await iys.default(istek())).json())
      .resolves.toMatchObject({ synced: true, applied: 1 });

    const yazma = cagrilar.find((c) => c.adres.includes('sms_consents?id=eq.izin-9'));
    expect(yazma?.govde).toMatchObject({ status: 'RET', source: 'IYS' });
  });

  it('aynı numaranın birden çok işletmedeki kaydını günceller', async () => {
    const iys = await moduluYukle();
    fetchTakli({
      degisiklikler: [{
        recipient: '+905321234567', status: 'RET',
        consentDate: '2026-09-05 12:00:00', source: 'IYS',
      }],
      yerelKayitlar: {
        '5321234567': [{ id: 'a', business_id: 'biz-1' }, { id: 'b', business_id: 'biz-2' }],
      },
    });
    await expect((await iys.default(istek())).json()).resolves.toMatchObject({ applied: 2 });
  });

  it('geçersiz biçimli alıcıyı atlar', async () => {
    const iys = await moduluYukle();
    const cagrilar = fetchTakli({
      degisiklikler: [
        { recipient: '+902121234567', status: 'RET', consentDate: '', source: 'IYS' },
        { recipient: 'e-posta@ornek.com', status: 'RET', consentDate: '', source: 'IYS' },
      ],
    });
    await expect((await iys.default(istek())).json()).resolves.toMatchObject({ applied: 0 });
    expect(cagrilar.some((c) => c.adres.includes('phone=eq.'))).toBe(false);
  });

  it('yerelde karşılığı olmayan değişiklik sayılmaz', async () => {
    const iys = await moduluYukle();
    fetchTakli({
      degisiklikler: [{ recipient: '+905329998877', status: 'RET', consentDate: '', source: 'IYS' }],
      yerelKayitlar: {},
    });
    await expect((await iys.default(istek())).json()).resolves.toMatchObject({ applied: 0 });
  });

  it('değişiklikler alınamazsa 502 döner', async () => {
    const iys = await moduluYukle();
    fetchTakli({ degisiklikHatasi: true });
    const yanit = await iys.default(istek());
    expect(yanit.status).toBe(502);
  });

  it('son yedi günün değişiklikleri istenir', async () => {
    const iys = await moduluYukle();
    const cagrilar = fetchTakli();
    await iys.default(istek());
    const sorgu = cagrilar.find((c) => c.adres.includes('/consents/changes'))!;
    const beklenen = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    expect(sorgu.adres).toContain(`after=${beklenen}`);
    expect(sorgu.adres).toContain('source=IYS');
  });
});

describe('iys görevi, sır sızıntısı', () => {
  it('hiçbir yanıtta İYS ya da veritabanı şifresi geçmez', async () => {
    for (const senaryo of [{}, { jetonHatasi: true }, { degisiklikHatasi: true }]) {
      const iys = await moduluYukle();
      fetchTakli(senaryo);
      const metin = await (await iys.default(istek())).text();
      expect(metin).not.toContain('gizli-iys-sifresi');
      expect(metin).not.toContain('service-anahtari');
    }
  });
});
