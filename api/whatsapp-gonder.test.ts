import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * WhatsApp Cloud API ile mesaj gönderme.
 *
 * Testlerin ağırlığı 24 saatlik hizmet penceresinde. Pencere kapalıyken
 * gönderilen serbest metni Meta reddediyor; kontrol edilmezse mesaj
 * gönderildi sanılır ve müşteri cevapsız bekler.
 */
const ESKI_ENV = { ...process.env };

async function moduluYukle(env: Record<string, string | undefined> = {}) {
  process.env = {
    ...ESKI_ENV,
    PGRST_URL: 'http://veri.yerel',
        JWT_SECRET: 'test-icin-en-az-otuz-iki-karakterlik-sir',
    WHATSAPP_ACCESS_TOKEN: 'jeton',
    WHATSAPP_PHONE_NUMBER_ID: '111222333',
    ...env,
  };
  vi.resetModules();
  return import('./whatsapp-gonder');
}

let aday: { id: string; business_id: string; phone: string } | null = null;
let sonGelen: string | null = null;
let metaYanit = { ok: true, status: 200 };
let yazilanMesaj: Record<string, unknown>[] = [];
let metaGovde: Record<string, unknown> | null = null;
/** Jetondaki kullanıcının profili; `null` ise kullanıcı yok sayılır. */
let profil: { owner_id: string | null; permissions: string[] } | null = null;
/** Adayın işletmesinin sahibi. Çağıranın kapsamıyla eşleşmezse aday görünmez. */
let isletmeSahibi: string | null = null;
/** Yapılan veritabanı çağrılarının adresleri; tur sayısını ölçmek için. */
let sorgular: string[] = [];

beforeEach(() => {
  aday = { id: 'lead-1', business_id: 'biz-1', phone: '5332642537' };
  sonGelen = new Date().toISOString();
  metaYanit = { ok: true, status: 200 };
  yazilanMesaj = [];
  metaGovde = null;
  // Varsayılan çağıran: işletmenin sahibi (owner_id boş).
  profil = { owner_id: null, permissions: [] };
  isletmeSahibi = SAHIP;
  sorgular = [];

  vi.stubGlobal('fetch', vi.fn(async (girdi: string | URL, init?: RequestInit) => {
    const adres = String(girdi);
    sorgular.push(adres);
    if (adres.includes('profiles')) {
      return new Response(JSON.stringify(profil ? [profil] : []), { status: 200 });
    }
    if (adres.includes('businesses')) {
      // `biz-1` işletmesinin sahibi `isletmeSahibi`; çağıranın kapsamı
      // tutmuyorsa bu sorgu hiçbir işletme döndürmez.
      const kapsamUyuyor = isletmeSahibi !== null
        && adres.includes(`owner_id=eq.${encodeURIComponent(isletmeSahibi)}`);
      return new Response(JSON.stringify(kapsamUyuyor ? [{ id: 'biz-1' }] : []), { status: 200 });
    }
    if (adres.includes('customer_leads') && (init?.method ?? 'GET') === 'GET'
      && adres.includes('business_id=in.')) {
      /*
        Aday sorgusu artık kapsamla SINIRLI geliyor. Taklit de bunu
        uygulamalı: aday'ın işletmesi listede değilse satır dönmemeli --
        yoksa test, kapsam süzgecinin çalıştığını değil sadece sorgunun
        atıldığını ölçerdi.
      */
      const listede = aday !== null
        && adres.includes(encodeURIComponent(`"${aday.business_id}"`));
      return new Response(JSON.stringify(listede ? [aday] : []), { status: 200 });
    }
    if (adres.includes('customer_lead_messages') && (init?.method ?? 'GET') === 'GET') {
      return new Response(JSON.stringify(sonGelen ? [{ created_at: sonGelen }] : []), { status: 200 });
    }
    if (adres.includes('customer_lead_messages')) {
      yazilanMesaj.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response('[]', { status: 201 });
    }
    if (adres.includes('graph.facebook.com')) {
      metaGovde = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.OUT' }] }), metaYanit);
    }
    return new Response('[]', { status: 200 });
  }));
});

afterEach(() => {
  process.env = { ...ESKI_ENV };
  vi.unstubAllGlobals();
});

const SAHIP = '11111111-1111-4111-8111-111111111111';
const PERSONEL = '33333333-3333-4333-8333-333333333333';

/** Geçerli bir erişim jetonu üretir (gerçek imzayla; sahte dizge kabul edilmez). */
async function jeton(kullanici = SAHIP): Promise<string> {
  const { erisimJetonuUret } = await import('./_kimlik.js');
  return erisimJetonuUret(kullanici);
}

/*
  İSTEKLER VARSAYILAN OLARAK GEÇERLİ JETON TAŞIYOR.

  Uç nokta artık hem yetki hem kiracı kontrolü yapıyor; aşağıdaki
  testler bunları değil pencere ve gönderim davranışını ölçüyor.
  Yetkinin kendisi "yetki ve kiracı" başlıklı testlerde sınanıyor.
*/
async function istek(govde: unknown, yetkiBasligi?: string | null) {
  const baslik = yetkiBasligi === undefined ? `Bearer ${await jeton()}` : yetkiBasligi;
  return new Request('https://x/api/whatsapp-gonder', {
    method: 'POST',
    headers: baslik ? { authorization: baslik } : {},
    body: JSON.stringify(govde),
  });
}

describe('24 saatlik hizmet penceresi', () => {
  it('pencere fonksiyonu sınırları doğru okur', async () => {
    const { pencereAcikMi } = await moduluYukle();
    const simdi = new Date('2026-09-11T12:00:00Z');

    expect(pencereAcikMi('2026-09-11T11:00:00Z', simdi)).toBe(true);
    // Tam 24 saat dolduğunda pencere kapanıyor.
    expect(pencereAcikMi('2026-09-10T12:00:00Z', simdi)).toBe(false);
    expect(pencereAcikMi('2026-09-09T12:00:00Z', simdi)).toBe(false);
    expect(pencereAcikMi(null, simdi)).toBe(false);
  });

  it('pencere kapalıysa göndermez ve sebebini söyler', async () => {
    // Sessizce düşen bir mesaj, gönderildi sanılır.
    sonGelen = '2020-01-01T00:00:00Z';
    const { default: handler } = await moduluYukle();
    const yanit = await handler(await istek({ leadId: 'lead-1', body: 'Merhaba' }));

    expect(yanit.status).toBe(409);
    expect(await yanit.json()).toMatchObject({ pencere: 'kapali' });
    expect(metaGovde).toBeNull();
  });

  it('hiç gelen mesaj yoksa pencere kapalıdır', async () => {
    sonGelen = null;
    const { default: handler } = await moduluYukle();
    expect((await handler(await istek({ leadId: 'lead-1', body: 'x' }))).status).toBe(409);
  });
});

describe('gönderim', () => {
  it('pencere açıkken Meta API üzerinden gönderir ve geçmişe yazar', async () => {
    const { default: handler } = await moduluYukle();
    const yanit = await handler(await istek({ leadId: 'lead-1', body: 'Merhaba' }));

    expect(yanit.status).toBe(200);
    expect(metaGovde).toMatchObject({
      messaging_product: 'whatsapp', to: '905332642537', type: 'text',
    });
    expect(yazilanMesaj[0]).toMatchObject({
      lead_id: 'lead-1', direction: 'giden', channel: 'whatsapp', body: 'Merhaba',
      wa_message_id: 'wamid.OUT',
    });
  });

  it('Meta hatasını 502 ile bildirir ve geçmişe yazmaz', async () => {
    metaYanit = { ok: false, status: 400 };
    const { default: handler } = await moduluYukle();
    const yanit = await handler(await istek({ leadId: 'lead-1', body: 'Merhaba' }));

    expect(yanit.status).toBe(502);
    expect(yazilanMesaj).toHaveLength(0);
  });

  it('telefonu olmayan adaya göndermez', async () => {
    aday = { id: 'lead-1', business_id: 'biz-1', phone: '' };
    const { default: handler } = await moduluYukle();
    expect((await handler(await istek({ leadId: 'lead-1', body: 'x' }))).status).toBe(404);
  });

  it('eksik gövdeyi reddeder', async () => {
    const { default: handler } = await moduluYukle();
    expect((await handler(await istek({ leadId: 'lead-1' }))).status).toBe(400);
    expect((await handler(await istek({ body: 'x' }))).status).toBe(400);
    expect((await handler(await istek({ leadId: 'lead-1', body: '   ' }))).status).toBe(400);
  });

  it('jeton tanımlı değilse çalışmaz', async () => {
    const { default: handler, isSendConfigured } = await moduluYukle({ WHATSAPP_ACCESS_TOKEN: undefined });
    expect(isSendConfigured()).toBe(false);
    expect((await handler(await istek({ leadId: 'l', body: 'x' }))).status).toBe(503);
  });

  it('desteklenmeyen yöntemi reddeder', async () => {
    const { default: handler } = await moduluYukle();
    const yanit = await handler(new Request('https://x/api/whatsapp-gonder', { method: 'GET' }));
    expect(yanit.status).toBe(405);
  });
});

/*
  YETKİ VE KİRACI.

  Denetimde çıktı: bu uç HİÇBİR kimlik doğrulaması yapmıyordu ve
  `/api/sms`'teki açığın iki kat ağırıydı. Gönderim ücretli olduğu
  için internetteki herkes işletmenin Meta hesabından mesaj
  attırabilirdi; üstelik uç, verilen `leadId`'nin telefonunu
  service_role ile okuduğu için hangi işletmenin adayı olursa olsun
  ona yazılabiliyordu.

  Bu yüzden İKİ ayrı soru soruluyor ve ikisi de ayrı sınanıyor:
  "bu işlemi yapabilir mi" ve "bu kayıt onun mu".
*/
describe('whatsapp-gonder, yetki ve kiracı', () => {
  it('kimliksiz isteği reddeder', async () => {
    const { default: handler } = await moduluYukle();
    const yanit = await handler(await istek({ leadId: 'lead-1', body: 'x' }, null));

    expect(yanit.status).toBe(401);
    expect(metaGovde).toBeNull();
  });

  it('geçersiz jetonu reddeder', async () => {
    const { default: handler } = await moduluYukle();
    const yanit = await handler(await istek({ leadId: 'lead-1', body: 'x' }, 'Bearer uydurma'));

    expect(yanit.status).toBe(401);
    expect(metaGovde).toBeNull();
  });

  it('profili olmayan kullanıcıyı reddeder', async () => {
    profil = null;
    const { default: handler } = await moduluYukle();
    expect((await handler(await istek({ leadId: 'lead-1', body: 'x' }))).status).toBe(401);
  });

  it('mesaj.duzenle yetkisi olmayan personeli reddeder', async () => {
    profil = { owner_id: SAHIP, permissions: ['rezervasyon.goruntule'] };
    const { default: handler } = await moduluYukle();
    const yanit = await handler(await istek({ leadId: 'lead-1', body: 'x' }));

    expect(yanit.status).toBe(403);
    expect(metaGovde).toBeNull();
  });

  it('mesaj.duzenle yetkisi olan personele izin verir', async () => {
    profil = { owner_id: SAHIP, permissions: ['mesaj.duzenle'] };
    const { default: handler } = await moduluYukle();
    const yanit = await handler(await istek({ leadId: 'lead-1', body: 'Merhaba' }));

    expect(yanit.status).toBe(200);
    expect(metaGovde).toMatchObject({ to: '905332642537' });
  });

  it('başka işletmenin adayına yazdırmaz', async () => {
    // Yetki var, ama aday başka bir yöneticinin işletmesinde.
    isletmeSahibi = '22222222-2222-4222-8222-222222222222';
    const { default: handler } = await moduluYukle();
    const yanit = await handler(await istek({ leadId: 'lead-1', body: 'x' }));

    expect(yanit.status).toBe(404);
    expect(metaGovde).toBeNull();
    expect(yazilanMesaj).toHaveLength(0);
  });

  it('kapsam dışı adayı "yok" diye bildirir, "yetkin yok" demez', async () => {
    /*
      403 demek, o kimlikte bir kaydın VAR olduğunu doğrulardı.
      Var olmayan aday ile kapsam dışı aday aynı yanıtı vermeli.
    */
    const { default: handler } = await moduluYukle();

    isletmeSahibi = '22222222-2222-4222-8222-222222222222';
    const kapsamDisi = await handler(await istek({ leadId: 'lead-1', body: 'x' }));

    aday = null;
    const hicYok = await handler(await istek({ leadId: 'lead-1', body: 'x' }));

    expect(kapsamDisi.status).toBe(hicYok.status);
    expect(await kapsamDisi.json()).toEqual(await hicYok.json());
  });

  it('personelin kapsamı bağlı olduğu yöneticidir', async () => {
    // Personelin kendi kimliği değil, owner_id'si kapsam sayılmalı.
    profil = { owner_id: SAHIP, permissions: ['mesaj.duzenle'] };
    isletmeSahibi = SAHIP;
    const { default: handler } = await moduluYukle();
    const yanit = await handler(
      await istek({ leadId: 'lead-1', body: 'Merhaba' }, `Bearer ${await jeton(PERSONEL)}`),
    );

    expect(yanit.status).toBe(200);
  });
});

/*
  ZAMANLAMA SIZINTISI.

  Yanıtların metnini aynı yapmak yetmiyor. Önce aday çekilip sonra
  ayrı bir sorguyla kapsam denetlenseydi, var olmayan aday TEK
  veritabanı turundan sonra dönerdi; kapsam dışı aday ise İKİ tur
  yapardı. Metin aynı olsa bile bu süre farkı, yeterli tekrarla
  "bu kimlikte başka bir işletmede gerçek bir aday var" bilgisini
  verirdi (CWE-208).

  Bu yüzden iki durumun aynı sayıda ve aynı biçimde sorgu yapması
  sınanıyor.
*/
describe('whatsapp-gonder, kapsam sızıntısı zamanlamadan da olmamalı', () => {
  it('var olmayan aday ile kapsam dışı aday aynı sorguları yapar', async () => {
    const { default: handler } = await moduluYukle();

    isletmeSahibi = '22222222-2222-4222-8222-222222222222';
    await handler(await istek({ leadId: 'lead-1', body: 'x' }));
    const kapsamDisiSorgular = [...sorgular];

    sorgular = [];
    isletmeSahibi = SAHIP;
    aday = null;
    await handler(await istek({ leadId: 'lead-1', body: 'x' }));
    const hicYokSorgular = [...sorgular];

    // Tur sayısı eşit olmalı: biri erken dönüp ötekinden az sorgu yapmamalı.
    expect(kapsamDisiSorgular).toHaveLength(hicYokSorgular.length);

    // Sorgulanan tablolar da aynı sırada olmalı.
    const tablolar = (liste: string[]) => liste.map((a) => a.split('?')[0]);
    expect(tablolar(kapsamDisiSorgular)).toEqual(tablolar(hicYokSorgular));
  });

  it('aday sorgusu kapsamla sınırlı gidiyor', async () => {
    // Kapsam süzgeci sorgunun İÇİNDE olmalı; sonradan elde ayıklanmamalı.
    const { default: handler } = await moduluYukle();
    await handler(await istek({ leadId: 'lead-1', body: 'Merhaba' }));

    const adaySorgusu = sorgular.find((a) => a.includes('customer_leads') && a.includes('id=eq.'));
    expect(adaySorgusu).toBeDefined();
    expect(adaySorgusu).toContain('business_id=in.');
  });
});
