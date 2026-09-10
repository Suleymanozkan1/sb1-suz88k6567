import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Fatura gönderim döngüsü.
 *
 * Mali belgede en pahalı hata mükerrer gönderimdir: aynı fatura iki kez
 * GİB'e giderse geri alınması zahmetlidir. Bu yüzden durum koşullu
 * güncellenir (`status=eq.taslak`) ve testler bu koşulun kaybolmadığını
 * doğruluyor. Başarısızlıkta fatura taslağa geri döner, numarası değişmez.
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
    PARASUT_OAUTH_URL: 'https://parasut.test',
    PARASUT_API_URL: 'https://parasut.test/v4',
    PARASUT_CLIENT_ID: 'istemci',
    PARASUT_CLIENT_SECRET: 'istemci-sirri',
    PARASUT_USERNAME: 'muhasebe@ornek.com',
    PARASUT_PASSWORD: 'gizli-parasut-sifresi',
    PARASUT_COMPANY_ID: '12345',
    ...env,
  };
  vi.resetModules();
  return (await import('./invoice')).default;
}

function taslak(over: Record<string, unknown> = {}) {
  return {
    id: 'inv-1', invoice_number: 'SHT2026000000042',
    uuid_ettn: '11111111-2222-3333-4444-555555555555', kind: 'e-Arsiv',
    issue_date: '2026-09-02', buyer_kind: 'bireysel', buyer_name: 'Ayşe Yılmaz',
    buyer_tax_id: null, buyer_tax_office: null, buyer_address: 'Bahçelievler 12/3',
    buyer_city: 'Ankara', buyer_district: 'Çankaya', buyer_email: 'ayse@ornek.com',
    base_kurus: 25_000_00, vat_kurus: 5_000_00, total_kurus: 30_000_00, note: null,
    ...over,
  };
}

const SATIR = {
  line_no: 1, description: 'Salon kiralama', quantity: 1, unit: 'ADET',
  unit_price_kurus: 25_000_00, discount_rate: 0, vat_rate: 20,
  base_kurus: 25_000_00, vat_kurus: 5_000_00, total_kurus: 30_000_00,
};

interface Senaryo {
  taslaklar?: Record<string, unknown>[] | 'hata';
  /** Bu fatura kimlikleri için hiç satır dönmesin */
  satirsiz?: string[];
  /** Bu fatura kimlikleri için Paraşüt reddetsin */
  reddedilen?: string[];
}

function fetchTakli(senaryo: Senaryo = {}) {
  const cagrilar: { adres: string; yontem: string; govde: unknown }[] = [];

  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const adres = String(url);
    const yontem = init?.method ?? 'GET';
    let govde: unknown;
    try { govde = init?.body ? JSON.parse(String(init.body)) : undefined; } catch { govde = init?.body; }
    cagrilar.push({ adres, yontem, govde });

    if (adres.includes('/rest/v1/invoices?status=eq.taslak')) {
      if (senaryo.taslaklar === 'hata') return new Response('izin yok', { status: 403 });
      return new Response(JSON.stringify(senaryo.taslaklar ?? [taslak()]));
    }
    if (adres.includes('/rest/v1/invoice_lines')) {
      const id = /invoice_id=eq\.([^&]+)/.exec(adres)![1];
      return new Response(JSON.stringify(senaryo.satirsiz?.includes(id) ? [] : [SATIR]));
    }
    if (adres.includes('/rest/v1/invoices')) return new Response(null, { status: 204 });

    if (adres.endsWith('/oauth/token')) {
      return new Response(JSON.stringify({
        access_token: 'jeton', refresh_token: 'yenile', expires_in: 7200,
      }));
    }
    if (adres.includes('/contacts?')) return new Response(JSON.stringify({ data: [{ id: 'kisi-1' }] }));
    if (adres.endsWith('/sales_invoices')) {
      const inv = (govde as { data: { attributes: { invoice_series: string; invoice_id: number } } }).data.attributes;
      const id = `${inv.invoice_series}${inv.invoice_id}`;
      if (senaryo.reddedilen?.some((r) => id.includes(String(r)))) {
        return new Response(JSON.stringify({ errors: [{ detail: 'Alıcı bilgisi eksik' }] }), { status: 422 });
      }
      return new Response(JSON.stringify({ data: { id: 'satis-1' } }), { status: 201 });
    }
    if (adres.endsWith('/e_archives') || adres.endsWith('/e_invoices')) {
      return new Response(JSON.stringify({ data: { id: 'is-1' } }), { status: 201 });
    }
    if (adres.includes('/trackable_jobs/')) {
      return new Response(JSON.stringify({ data: { id: 'is-1', attributes: { status: 'done' } } }));
    }
    if (adres.includes('/e_invoice_inboxes')) return new Response(JSON.stringify({ data: [] }));
    if (adres.endsWith('/rpc/check_rate_limit')) return new Response('true');
    return new Response('{}');
  }));

  return cagrilar;
}

function istek(secenek: { yetkili?: boolean; method?: string } = {}): Request {
  const { yetkili = true, method = 'POST' } = secenek;
  return new Request('https://ornek.test/api/invoice', {
    method,
    headers: {
      'cf-connecting-ip': '203.0.113.7',
      ...(yetkili ? { authorization: `Bearer ${SIR}` } : {}),
    },
  });
}

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { process.env = { ...ESKI_ENV }; vi.unstubAllGlobals(); });

describe('fatura uç noktası, giriş kontrolleri', () => {
  it('POST dışındaki yöntemleri reddeder', async () => {
    const handler = await handlerYukle();
    fetchTakli();
    expect((await handler(istek({ method: 'GET' }))).status).toBe(405);
  });

  it('veritabanı yapılandırması eksikse 500 döner', async () => {
    const handler = await handlerYukle({
      SUPABASE_URL: undefined, VITE_SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined,
    });
    fetchTakli();
    expect((await handler(istek())).status).toBe(500);
  });

  it('entegratör yapılandırılmamışsa gönderim yapmadan bildirir', async () => {
    const handler = await handlerYukle({ PARASUT_COMPANY_ID: undefined });
    const cagrilar = fetchTakli();
    const yanit = await handler(istek());
    expect(yanit.status).toBe(200);
    await expect(yanit.json()).resolves
      .toEqual({ sent: 0, failed: 0, reason: 'einvoice_not_configured' });
    expect(cagrilar.some((c) => c.adres.includes('/rest/v1/invoices'))).toBe(false);
  });

  it('elle tetiklemede hız sınırı uygulanır, cron tetiklemesinde uygulanmaz', async () => {
    const handler = await handlerYukle();
    const elle = fetchTakli();
    await handler(istek({ yetkili: false }));
    expect(elle.some((c) => c.adres.endsWith('/rpc/check_rate_limit'))).toBe(true);

    const handler2 = await handlerYukle();
    const cron = fetchTakli();
    await handler2(istek());
    expect(cron.some((c) => c.adres.endsWith('/rpc/check_rate_limit'))).toBe(false);
  });

  it('elle tetiklemede sınır aşılırsa 429 döner', async () => {
    const handler = await handlerYukle();
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/rpc/check_rate_limit')) return new Response('false');
      return new Response('{}');
    }));
    const yanit = await handler(istek({ yetkili: false }));
    expect(yanit.status).toBe(429);
    expect(yanit.headers.get('retry-after')).toBe('3600');
  });
});

describe('fatura uç noktası, gönderim', () => {
  it('bekleyen taslak yoksa sıfır döner', async () => {
    const handler = await handlerYukle();
    fetchTakli({ taslaklar: [] });
    const yanit = await handler(istek());
    expect(yanit.status).toBe(200);
    await expect(yanit.json()).resolves.toEqual({ sent: 0, failed: 0 });
  });

  it('faturayı gönderir ve sonucu yazar', async () => {
    const handler = await handlerYukle();
    const cagrilar = fetchTakli();

    const yanit = await handler(istek());

    expect(yanit.status).toBe(200);
    await expect(yanit.json()).resolves.toEqual({ sent: 1, failed: 0 });

    const yazma = cagrilar.filter((c) => c.adres.includes('/rest/v1/invoices?id=eq.inv-1'));
    expect(yazma.at(-1)?.govde).toMatchObject({
      status: 'gonderildi', provider_ref: 'satis-1', provider_error: null,
    });
  });

  it('mükerrer gönderimi durumu koşullu güncelleyerek engeller', async () => {
    // status=eq.taslak koşulu kaybolursa eşzamanlı iki tur aynı faturayı
    // iki kez GİB'e gönderebilirdi.
    const handler = await handlerYukle();
    const cagrilar = fetchTakli();

    await handler(istek());

    const kilit = cagrilar.find((c) => c.adres.includes('/rest/v1/invoices?id=eq.inv-1&status=eq.taslak'));
    expect(kilit).toBeDefined();
    expect(kilit?.govde).toEqual({ status: 'gonderiliyor' });
  });

  it('satırsız faturayı göndermez, taslağa geri alır', async () => {
    const handler = await handlerYukle();
    const cagrilar = fetchTakli({ satirsiz: ['inv-1'] });

    const yanit = await handler(istek());

    expect(yanit.status).toBe(207);
    await expect(yanit.json()).resolves.toEqual({ sent: 0, failed: 1 });
    expect(cagrilar.some((c) => c.adres.endsWith('/sales_invoices'))).toBe(false);

    const geri = cagrilar.filter((c) => c.adres.includes('/rest/v1/invoices?id=eq.inv-1')).at(-1);
    expect(geri?.govde).toEqual({ status: 'taslak', provider_error: 'Faturada satır bulunmuyor.' });
  });

  it('entegratör reddederse taslağa geri alır ve gerekçeyi yazar', async () => {
    const handler = await handlerYukle();
    const cagrilar = fetchTakli({ reddedilen: ['SHT'] });

    const yanit = await handler(istek());

    expect(yanit.status).toBe(207);
    await expect(yanit.json()).resolves.toEqual({ sent: 0, failed: 1 });

    const geri = cagrilar.filter((c) => c.adres.includes('/rest/v1/invoices?id=eq.inv-1')).at(-1);
    const govde = geri?.govde as { status: string; provider_error: string };
    expect(govde.status).toBe('taslak');
    expect(govde.provider_error).toContain('Alıcı bilgisi eksik');
    expect(govde.provider_error.length).toBeLessThanOrEqual(300);
  });

  it('bir faturanın hatası diğerlerini durdurmaz', async () => {
    const handler = await handlerYukle();
    fetchTakli({
      taslaklar: [
        taslak({ id: 'inv-1', invoice_number: 'SHT2026000000001' }),
        taslak({ id: 'inv-2', invoice_number: 'RED2026000000002' }),
        taslak({ id: 'inv-3', invoice_number: 'SHT2026000000003' }),
      ],
      reddedilen: ['RED'],
    });

    const yanit = await handler(istek());
    expect(yanit.status).toBe(207);
    await expect(yanit.json()).resolves.toEqual({ sent: 2, failed: 1 });
  });

  it('bir turda en çok 25 fatura ister', async () => {
    const handler = await handlerYukle();
    const cagrilar = fetchTakli({ taslaklar: [] });
    await handler(istek());
    const sorgu = cagrilar.find((c) => c.adres.includes('/rest/v1/invoices?status=eq.taslak'));
    expect(sorgu?.adres).toContain('limit=25');
  });

  it('taslaklar okunamazsa 502 döner', async () => {
    const handler = await handlerYukle();
    fetchTakli({ taslaklar: 'hata' });
    const yanit = await handler(istek());
    expect(yanit.status).toBe(502);
    await expect(yanit.json()).resolves.toMatchObject({ error: 'Faturalar gönderilemedi.' });
  });

  it('hiçbir yanıtta entegratör ya da veritabanı sırrı geçmez', async () => {
    const handler = await handlerYukle();
    fetchTakli({ reddedilen: ['SHT'] });
    const metin = await (await handler(istek())).text();
    expect(metin).not.toContain('gizli-parasut-sifresi');
    expect(metin).not.toContain('istemci-sirri');
    expect(metin).not.toContain('service-anahtari');
  });
});
