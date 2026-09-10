import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Sistem sağlık kontrolü.
 *
 * İzleme servisi bu adresi dakikada bir çağırır; sağlıksız durumda 503
 * dönmezse arıza kimseye bildirilmez. Diğer taraftan yetkisiz çağrıya
 * ayrıntı verilmesi, hangi alt sistemin bozuk olduğunu dışarıya söyler.
 * Testler iki dengeyi birlikte koruyor.
 */
const SIR = 'cron-sirri';
const ESKI_ENV = { ...process.env };

async function handlerYukle(env: Record<string, string | undefined> = {}) {
  process.env = {
    ...ESKI_ENV,
    CRON_SECRET: SIR,
    SUPABASE_URL: 'https://ornek.supabase.co',
    VITE_SUPABASE_URL: undefined,
    SUPABASE_SERVICE_ROLE_KEY: 'service-anahtari',
    NETGSM_USER: 'abone',
    NETGSM_PASS: 'gizli-sifre',
    NETGSM_HEADER: 'SAHRATAKIP',
    ...env,
  };
  vi.resetModules();
  return (await import('./health')).default;
}

interface Ozet {
  kuyruk_bekleyen?: number;
  kuyruk_basarisiz?: number;
  kuyruk_en_eski_dakika?: number;
  iys_aktarilmamis?: number;
  son_yedek?: { yas_saat: number; durum: string } | null;
}

const SAGLIKLI: Ozet = {
  kuyruk_bekleyen: 0, kuyruk_basarisiz: 0, kuyruk_en_eski_dakika: 0,
  iys_aktarilmamis: 0, son_yedek: { yas_saat: 6, durum: 'basarili' },
};

function fetchTakli(ozetler: Ozet[] | 'hata' = [SAGLIKLI]) {
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
    const adres = String(url);
    if (adres.includes('/rest/v1/profiles')) {
      if (ozetler === 'hata') return new Response('izin yok', { status: 403 });
      return new Response(JSON.stringify(ozetler.map((_, i) => ({ id: `sahip-${i}` }))));
    }
    if (adres.endsWith('/rpc/system_health')) {
      const siradaki = (ozetler as Ozet[]).shift() ?? SAGLIKLI;
      return new Response(JSON.stringify(siradaki));
    }
    return new Response('{}');
  }));
}

function istek(yetkili = false): Request {
  return new Request('https://ornek.test/api/health', {
    headers: yetkili ? { authorization: `Bearer ${SIR}` } : {},
  });
}

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { process.env = { ...ESKI_ENV }; vi.unstubAllGlobals(); });

describe('sağlık kontrolü, temel durumlar', () => {
  it('veritabanı yapılandırılmamışsa arıza değil demo bildirir', async () => {
    const handler = await handlerYukle({
      SUPABASE_URL: undefined, VITE_SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined,
    });
    fetchTakli();
    const yanit = await handler(istek());
    expect(yanit.status).toBe(200);
    await expect(yanit.json()).resolves.toMatchObject({ status: 'demo' });
  });

  it('her şey yolundayken 200 ve saglikli döner', async () => {
    const handler = await handlerYukle();
    fetchTakli([{ ...SAGLIKLI }]);
    const yanit = await handler(istek());
    expect(yanit.status).toBe(200);
    await expect(yanit.json()).resolves.toMatchObject({ status: 'saglikli' });
  });

  it('veritabanına ulaşılamazsa 503 döner', async () => {
    const handler = await handlerYukle();
    fetchTakli('hata');
    const yanit = await handler(istek());
    expect(yanit.status).toBe(503);
    await expect(yanit.json()).resolves.toMatchObject({ status: 'arizali' });
  });
});

describe('sağlık kontrolü, eşikler', () => {
  it('kuyrukta 30 dakikadan uzun bekleyen mesaj varsa uyarır', async () => {
    const handler = await handlerYukle();
    fetchTakli([{ ...SAGLIKLI, kuyruk_en_eski_dakika: 45 }]);
    const yanit = await handler(istek(true));
    expect(yanit.status).toBe(503);
    const govde = await yanit.json() as { sorunlar: string[] };
    expect(govde.sorunlar.some((s) => s.includes('45 dakikadır'))).toBe(true);
  });

  it('tam 30 dakika eşiği aşmaz', async () => {
    const handler = await handlerYukle();
    fetchTakli([{ ...SAGLIKLI, kuyruk_en_eski_dakika: 30 }]);
    expect((await handler(istek())).status).toBe(200);
  });

  it('kalıcı başarısız mesaj varsa uyarır', async () => {
    const handler = await handlerYukle();
    fetchTakli([{ ...SAGLIKLI, kuyruk_basarisiz: 3 }]);
    const govde = await (await handler(istek(true))).json() as { sorunlar: string[] };
    expect(govde.sorunlar.some((s) => s.includes('3 mesaj'))).toBe(true);
  });

  it('hiç yedek alınmamışsa uyarır', async () => {
    const handler = await handlerYukle();
    fetchTakli([{ ...SAGLIKLI, son_yedek: null }]);
    const yanit = await handler(istek(true));
    expect(yanit.status).toBe(503);
    const govde = await yanit.json() as { sorunlar: string[] };
    expect(govde.sorunlar).toContain('Henüz başarılı bir yedek alınmamış.');
  });

  it('48 saatten eski yedekte uyarır', async () => {
    const handler = await handlerYukle();
    fetchTakli([{ ...SAGLIKLI, son_yedek: { yas_saat: 72, durum: 'basarili' } }]);
    const govde = await (await handler(istek(true))).json() as { sorunlar: string[] };
    expect(govde.sorunlar.some((s) => s.includes('72 saat'))).toBe(true);
  });

  it('SMS sağlayıcısı yapılandırılmamışsa uyarır', async () => {
    const handler = await handlerYukle({ NETGSM_PASS: undefined });
    fetchTakli([{ ...SAGLIKLI }]);
    const govde = await (await handler(istek(true))).json() as { sorunlar: string[] };
    expect(govde.sorunlar).toContain('SMS sağlayıcısı yapılandırılmamış.');
  });
});

describe('sağlık kontrolü, çok hesaplı toplama', () => {
  it('bekleyen ve başarısız sayıları toplanır, en eski dakika en büyüğü olur', async () => {
    const handler = await handlerYukle();
    fetchTakli([
      { kuyruk_bekleyen: 2, kuyruk_basarisiz: 1, kuyruk_en_eski_dakika: 10, iys_aktarilmamis: 3, son_yedek: { yas_saat: 2, durum: 'basarili' } },
      { kuyruk_bekleyen: 5, kuyruk_basarisiz: 0, kuyruk_en_eski_dakika: 40, iys_aktarilmamis: 1, son_yedek: { yas_saat: 5, durum: 'basarili' } },
    ]);

    const govde = await (await handler(istek(true))).json() as { ozet: Record<string, unknown> };

    expect(govde.ozet).toMatchObject({
      kuyruk_bekleyen: 7, kuyruk_basarisiz: 1, kuyruk_en_eski_dakika: 40, iys_aktarilmamis: 4,
    });
  });

  it('eksik alanları sıfır sayar', async () => {
    const handler = await handlerYukle();
    fetchTakli([{ son_yedek: { yas_saat: 1, durum: 'basarili' } }]);
    const yanit = await handler(istek(true));
    expect(yanit.status).toBe(200);
    const govde = await yanit.json() as { ozet: Record<string, number> };
    expect(govde.ozet.kuyruk_bekleyen).toBe(0);
  });
});

describe('sağlık kontrolü, bilgi sızıntısı', () => {
  it('yetkisiz çağrıya sorun listesi ve özet verilmez', async () => {
    const handler = await handlerYukle();
    fetchTakli([{ ...SAGLIKLI, kuyruk_basarisiz: 9, son_yedek: null }]);

    const yanit = await handler(istek(false));
    const govde = await yanit.json() as Record<string, unknown>;

    expect(yanit.status).toBe(503);
    expect(govde.status).toBe('uyari');
    expect(govde.sorunlar).toBeUndefined();
    expect(govde.ozet).toBeUndefined();
    expect(Object.keys(govde).sort()).toEqual(['status', 'zaman']);
  });

  it('yetkisiz çağrıya veritabanı hata ayrıntısı verilmez', async () => {
    const handler = await handlerYukle();
    fetchTakli('hata');
    const govde = await (await handler(istek(false))).json() as Record<string, unknown>;
    expect(govde.detay).toBeUndefined();
    expect(govde.sorunlar).toBeUndefined();
  });

  it('yetkili çağrıda ayrıntı verilir', async () => {
    const handler = await handlerYukle();
    fetchTakli('hata');
    const govde = await (await handler(istek(true))).json() as Record<string, unknown>;
    expect(govde.sorunlar).toEqual(['Veritabanına ulaşılamıyor.']);
    expect(govde.detay).toBeTypeOf('string');
  });

  it('hiçbir yanıtta service_role anahtarı geçmez', async () => {
    for (const yetkili of [false, true]) {
      const handler = await handlerYukle();
      fetchTakli('hata');
      const metin = await (await handler(istek(yetkili))).text();
      expect(metin).not.toContain('service-anahtari');
    }
  });
});
