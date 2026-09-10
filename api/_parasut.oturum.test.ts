import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Paraşüt oturumu ve gönderim döngüsü.
 *
 * `_parasut.test.ts` gövde üretimini saf fonksiyon olarak doğruluyor; bu
 * dosya ağ tarafını kapsıyor: jeton önbelleği, yenileme, e-Fatura ile
 * e-Arşiv arasındaki seçim ve iş yoklaması. Paraşüt şifresi hiçbir hataya
 * ya da yanıta yansımamalı.
 */
const ESKI_ENV = { ...process.env };

async function moduluYukle(env: Record<string, string | undefined> = {}) {
  process.env = {
    ...ESKI_ENV,
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
  return import('./_parasut');
}

type Yanit = { status?: number; body?: unknown; text?: string };

interface Senaryo {
  /** Jeton uç noktası yanıtları, sırayla */
  jeton?: Yanit[];
  /** filter[tax_number] / filter[email] araması sonucu */
  kisiBulundu?: boolean;
  /** e_invoice_inboxes araması sonucu */
  eFaturaKutusu?: string | null;
  /** trackable_jobs durumları, sırayla */
  isDurumlari?: string[];
  /** sales_invoices POST yanıtı */
  satisFaturasi?: Yanit;
}

function fetchTakli(senaryo: Senaryo = {}) {
  const cagrilar: { adres: string; yontem: string; govde: unknown }[] = [];
  const jetonlar = [...(senaryo.jeton ?? [])];
  const durumlar = [...(senaryo.isDurumlari ?? ['done'])];

  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const adres = String(url);
    const yontem = init?.method ?? 'GET';
    cagrilar.push({
      adres, yontem, govde: init?.body ? JSON.parse(String(init.body)) : undefined,
    });

    if (adres.endsWith('/oauth/token')) {
      const y = jetonlar.shift() ?? {
        body: { access_token: 'jeton-1', refresh_token: 'yenile-1', expires_in: 7200 },
      };
      return new Response(y.text ?? JSON.stringify(y.body ?? {}), { status: y.status ?? 200 });
    }
    if (adres.includes('/contacts?')) {
      return new Response(JSON.stringify({ data: senaryo.kisiBulundu ? [{ id: 'kisi-9' }] : [] }));
    }
    if (adres.endsWith('/contacts')) {
      return new Response(JSON.stringify({ data: { id: 'kisi-yeni', type: 'contacts' } }), { status: 201 });
    }
    if (adres.includes('/e_invoice_inboxes')) {
      return new Response(JSON.stringify({
        data: senaryo.eFaturaKutusu
          ? [{ id: 'kutu-1', attributes: { e_invoice_address: senaryo.eFaturaKutusu } }]
          : [],
      }));
    }
    if (adres.endsWith('/sales_invoices')) {
      const y = senaryo.satisFaturasi;
      if (y) return new Response(y.text ?? JSON.stringify(y.body ?? {}), { status: y.status ?? 200 });
      return new Response(JSON.stringify({ data: { id: 'satis-1', type: 'sales_invoices' } }), { status: 201 });
    }
    if (adres.endsWith('/e_invoices') || adres.endsWith('/e_archives')) {
      return new Response(JSON.stringify({ data: { id: 'is-1', type: 'trackable_jobs' } }), { status: 201 });
    }
    if (adres.includes('/trackable_jobs/')) {
      const durum = durumlar.shift() ?? 'done';
      return new Response(JSON.stringify({
        data: { id: 'is-1', type: 'trackable_jobs', attributes: { status: durum, errors: [{ detail: 'VKN hatalı' }] } },
      }));
    }
    return new Response('{}');
  }));

  return cagrilar;
}

function fatura(over: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    invoice_number: 'SHT2026000000042',
    uuid_ettn: '11111111-2222-3333-4444-555555555555',
    kind: 'e-Arsiv',
    issue_date: '2026-09-02',
    buyer_kind: 'bireysel',
    buyer_name: 'Ayşe Yılmaz',
    buyer_tax_id: null,
    buyer_tax_office: null,
    buyer_address: 'Bahçelievler Mah. 12/3',
    buyer_city: 'Ankara',
    buyer_district: 'Çankaya',
    buyer_email: 'ayse@ornek.com',
    base_kurus: 25_000_00,
    vat_kurus: 5_000_00,
    total_kurus: 30_000_00,
    note: null,
    ...over,
  } as Parameters<Awaited<ReturnType<typeof moduluYukle>>['sendInvoice']>[0];
}

function satir() {
  return [{
    line_no: 1, description: 'Düğün salonu kiralama', quantity: 1, unit: 'ADET',
    unit_price_kurus: 25_000_00, discount_rate: 0, vat_rate: 20,
    base_kurus: 25_000_00, vat_kurus: 5_000_00, total_kurus: 30_000_00,
  }] as Parameters<Awaited<ReturnType<typeof moduluYukle>>['sendInvoice']>[1];
}

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { process.env = { ...ESKI_ENV }; vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('isConfigured', () => {
  it('beş değişken de tanımlıysa doğru döner', async () => {
    const p = await moduluYukle();
    expect(p.isConfigured()).toBe(true);
  });

  const eksikler = [
    'PARASUT_CLIENT_ID', 'PARASUT_CLIENT_SECRET', 'PARASUT_USERNAME',
    'PARASUT_PASSWORD', 'PARASUT_COMPANY_ID',
  ];
  for (const anahtar of eksikler) {
    it(`${anahtar} eksikse yanlış döner`, async () => {
      const p = await moduluYukle({ [anahtar]: undefined });
      expect(p.isConfigured()).toBe(false);
    });
  }
});

describe('isExpired', () => {
  it('süresi dolmuş jetonu bayat sayar', async () => {
    const p = await moduluYukle();
    expect(p.isExpired({ accessToken: 'a', refreshToken: 'b', expiresAt: 1_000 }, 2_000)).toBe(true);
  });

  it('son 60 saniyeyi güvenlik payı olarak bayat sayar', async () => {
    // İstek uçuşta iken sürenin dolmaması için erken yenilenir.
    const p = await moduluYukle();
    const jeton = { accessToken: 'a', refreshToken: 'b', expiresAt: 100_000 };
    expect(p.isExpired(jeton, 100_000 - 59_000)).toBe(true);
    expect(p.isExpired(jeton, 100_000 - 61_000)).toBe(false);
  });
});

describe('jeton önbelleği', () => {
  it('ilk çağrıda şifreyle oturum açar', async () => {
    const p = await moduluYukle();
    const cagrilar = fetchTakli();
    p.resetToken();

    await p.sendInvoice(fatura(), satir());

    const jeton = cagrilar.find((c) => c.adres.endsWith('/oauth/token'))!;
    expect(jeton.govde).toMatchObject({ grant_type: 'password', username: 'muhasebe@ornek.com' });
  });

  it('ikinci gönderimde jetonu yeniden istemez', async () => {
    const p = await moduluYukle();
    const cagrilar = fetchTakli();
    p.resetToken();

    await p.sendInvoice(fatura(), satir());
    const ilkSayim = cagrilar.filter((c) => c.adres.endsWith('/oauth/token')).length;
    await p.sendInvoice(fatura({ id: 'inv-2' }), satir());

    expect(cagrilar.filter((c) => c.adres.endsWith('/oauth/token'))).toHaveLength(ilkSayim);
  });

  it('jeton bayatladığında yenileme jetonuyla tazeler, şifreyi tekrar göndermez', async () => {
    const p = await moduluYukle();
    const cagrilar = fetchTakli({
      jeton: [
        { body: { access_token: 'j1', refresh_token: 'y1', expires_in: 1 } },
        { body: { access_token: 'j2', refresh_token: 'y2', expires_in: 7200 } },
      ],
    });
    p.resetToken();

    await p.sendInvoice(fatura(), satir());
    await p.sendInvoice(fatura({ id: 'inv-2' }), satir());

    const jetonlar = cagrilar.filter((c) => c.adres.endsWith('/oauth/token'));
    expect(jetonlar).toHaveLength(2);
    expect(jetonlar[1].govde).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'y1' });
    expect(JSON.stringify(jetonlar[1].govde)).not.toContain('gizli-parasut-sifresi');
  });

  it('yenileme reddedilirse şifreyle baştan oturum açar', async () => {
    const p = await moduluYukle();
    const cagrilar = fetchTakli({
      jeton: [
        { body: { access_token: 'j1', refresh_token: 'y1', expires_in: 1 } },
        { status: 401, text: JSON.stringify({ error: 'invalid_grant' }) },
        { body: { access_token: 'j3', refresh_token: 'y3', expires_in: 7200 } },
      ],
    });
    p.resetToken();

    await p.sendInvoice(fatura(), satir());
    await p.sendInvoice(fatura({ id: 'inv-2' }), satir());

    const jetonlar = cagrilar.filter((c) => c.adres.endsWith('/oauth/token'));
    expect(jetonlar).toHaveLength(3);
    expect(jetonlar[2].govde).toMatchObject({ grant_type: 'password' });
  });

  it('resetToken önbelleği boşaltır', async () => {
    const p = await moduluYukle();
    const cagrilar = fetchTakli();
    p.resetToken();

    await p.sendInvoice(fatura(), satir());
    p.resetToken();
    await p.sendInvoice(fatura({ id: 'inv-2' }), satir());

    expect(cagrilar.filter((c) => c.adres.endsWith('/oauth/token'))).toHaveLength(2);
  });
});

describe('sendInvoice', () => {
  it('yapılandırma eksikse ağa çıkmadan hata verir', async () => {
    const p = await moduluYukle({ PARASUT_COMPANY_ID: undefined });
    const cagrilar = fetchTakli();
    await expect(p.sendInvoice(fatura(), satir())).rejects.toThrow('Paraşüt yapılandırması eksik.');
    expect(cagrilar).toHaveLength(0);
  });

  it('kişi bulunamazsa oluşturur ve satış faturasına bağlar', async () => {
    const p = await moduluYukle();
    const cagrilar = fetchTakli({ kisiBulundu: false });
    p.resetToken();

    await expect(p.sendInvoice(fatura(), satir())).resolves.toBe('satis-1');

    const satis = cagrilar.find((c) => c.adres.endsWith('/sales_invoices'))!;
    const govde = satis.govde as { data: { relationships: { contact: { data: { id: string } } } } };
    expect(govde.data.relationships.contact.data.id).toBe('kisi-yeni');
  });

  it('kişi bulunursa yenisini oluşturmaz', async () => {
    const p = await moduluYukle();
    const cagrilar = fetchTakli({ kisiBulundu: true });
    p.resetToken();

    await p.sendInvoice(fatura(), satir());

    expect(cagrilar.some((c) => c.adres.endsWith('/contacts') && c.yontem === 'POST')).toBe(false);
  });

  it('vergi numarası yoksa e-Arşiv düzenler', async () => {
    const p = await moduluYukle();
    const cagrilar = fetchTakli();
    p.resetToken();

    await p.sendInvoice(fatura({ buyer_tax_id: null }), satir());

    expect(cagrilar.some((c) => c.adres.endsWith('/e_archives'))).toBe(true);
    expect(cagrilar.some((c) => c.adres.endsWith('/e_invoices'))).toBe(false);
    expect(cagrilar.some((c) => c.adres.includes('/e_invoice_inboxes'))).toBe(false);
  });

  it('alıcı e-Fatura mükellefiyse e-Fatura düzenler', async () => {
    const p = await moduluYukle();
    const cagrilar = fetchTakli({ eFaturaKutusu: 'urn:mail:defaultpk@ornek.com' });
    p.resetToken();

    await p.sendInvoice(fatura({ buyer_kind: 'kurumsal', buyer_tax_id: '1234567890' }), satir());

    expect(cagrilar.some((c) => c.adres.endsWith('/e_invoices'))).toBe(true);
    expect(cagrilar.some((c) => c.adres.endsWith('/e_archives'))).toBe(false);
  });

  it('vergi numarası var ama posta kutusu yoksa e-Arşive düşer', async () => {
    const p = await moduluYukle();
    const cagrilar = fetchTakli({ eFaturaKutusu: null });
    p.resetToken();

    await p.sendInvoice(fatura({ buyer_kind: 'kurumsal', buyer_tax_id: '1234567890' }), satir());

    expect(cagrilar.some((c) => c.adres.endsWith('/e_archives'))).toBe(true);
  });

  it('iş hata verirse gerekçesiyle birlikte fırlatır', async () => {
    const p = await moduluYukle();
    fetchTakli({ isDurumlari: ['error'] });
    p.resetToken();

    await expect(p.sendInvoice(fatura(), satir()))
      .rejects.toThrow(/Paraşüt gönderimi reddetti.*VKN hatalı/);
  });

  it('iş tamamlanana kadar yoklar', async () => {
    vi.useFakeTimers();
    const p = await moduluYukle();
    const cagrilar = fetchTakli({ isDurumlari: ['pending', 'pending', 'done'] });
    p.resetToken();

    const sonuc = p.sendInvoice(fatura(), satir());
    await vi.runAllTimersAsync();
    await expect(sonuc).resolves.toBe('satis-1');

    expect(cagrilar.filter((c) => c.adres.includes('/trackable_jobs/'))).toHaveLength(3);
  });

  it('iş bitmezse zaman aşımı hatası verir', async () => {
    vi.useFakeTimers();
    const p = await moduluYukle();
    fetchTakli({ isDurumlari: Array(20).fill('pending') });
    p.resetToken();

    const sonuc = p.sendInvoice(fatura(), satir());
    const beklenti = expect(sonuc).rejects.toThrow('zaman aşımına uğradı');
    await vi.runAllTimersAsync();
    await beklenti;
  });

  it('401 alındığında jetonu düşürür ve anlaşılır hata verir', async () => {
    const p = await moduluYukle();
    fetchTakli({ satisFaturasi: { status: 401, text: '{}' } });
    p.resetToken();

    await expect(p.sendInvoice(fatura(), satir()))
      .rejects.toThrow('Paraşüt oturumu reddedildi; bir sonraki denemede yenilenecek.');
  });

  it('Paraşüt şifresi hata metinlerine sızmaz', async () => {
    const p = await moduluYukle();
    fetchTakli({ satisFaturasi: { status: 422, text: JSON.stringify({ errors: [{ detail: 'Geçersiz alan' }] }) } });
    p.resetToken();

    let mesaj = '';
    try {
      await p.sendInvoice(fatura(), satir());
    } catch (hata) {
      mesaj = (hata as Error).message;
    }
    expect(mesaj).toContain('Geçersiz alan');
    expect(mesaj).not.toContain('gizli-parasut-sifresi');
    expect(mesaj).not.toContain('istemci-sirri');
  });
});
