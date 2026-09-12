import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';

/**
 * WhatsApp webhook'u.
 *
 * Bu adres herkese açık: Meta'nın ulaşabilmesi için başka türlüsü mümkün
 * değil. O yüzden testlerin ağırlığı imza doğrulamasında. İmza atlanabilir
 * olsaydı isteyen istediği kadar sahte talep yazar, kanal raporu da
 * rezervasyon listesi de çöple dolardı.
 */
const SIR = 'uygulama-sirri';
const JETON = 'dogrulama-jetonu';
const ESKI_ENV = { ...process.env };

async function moduluYukle(env: Record<string, string | undefined> = {}) {
  process.env = {
    ...ESKI_ENV,
    PGRST_URL: 'http://veri.yerel',
        JWT_SECRET: 'test-icin-en-az-otuz-iki-karakterlik-sir',
    WHATSAPP_VERIFY_TOKEN: JETON,
    WHATSAPP_APP_SECRET: SIR,
    ...env,
  };
  vi.resetModules();
  return import('./whatsapp');
}

function imzala(govde: string, sir = SIR): string {
  return `sha256=${createHmac('sha256', sir).update(govde, 'utf8').digest('hex')}`;
}

function metaGovdesi(metin: string, over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: '111222333' },
          messages: [{
            id: 'wamid.TEST1', from: '905332642537', timestamp: '1789000000',
            type: 'text', text: { body: metin }, ...over,
          }],
        },
      }],
    }],
  });
}

let acilanAday: Record<string, unknown>[] = [];
let yazilanMesaj: Record<string, unknown>[] = [];
let guncellenen: Record<string, unknown>[] = [];
let hesapVar = true;
let hesapAyari: Record<string, unknown> = {};
let gonderilen: Record<string, unknown>[] = [];
let otomatikGecmis: { auto_kind: string; created_at: string }[] = [];
let mevcutAday: { id: string; name: string; email: string; status: string } | null = null;
let yazmaHatasi = false;

beforeEach(() => {
  acilanAday = [];
  yazilanMesaj = [];
  guncellenen = [];
  hesapVar = true;
  hesapAyari = {};
  gonderilen = [];
  otomatikGecmis = [];
  mevcutAday = null;
  yazmaHatasi = false;
  vi.stubGlobal('fetch', vi.fn(async (girdi: string | URL, init?: RequestInit) => {
    const adres = String(girdi);
    const yontem = init?.method ?? 'GET';

    if (adres.includes('whatsapp_accounts')) {
      const satir = {
        business_id: 'biz-1',
        auto_reply_enabled: false,
        welcome_message: 'Mesajınız bize ulaştı.',
        after_hours_enabled: false,
        after_hours_message: 'Şu an kapalıyız.',
        work_start: '09:00:00',
        work_end: '19:00:00',
        work_days: [1, 2, 3, 4, 5, 6, 7],
        ...hesapAyari,
      };
      return new Response(JSON.stringify(hesapVar ? [satir] : []), { status: 200 });
    }
    if (adres.includes('graph.facebook.com')) {
      gonderilen.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.OUT1' }] }), { status: 200 });
    }
    if (adres.includes('customer_leads')) {
      if (yontem === 'GET') {
        return new Response(JSON.stringify(mevcutAday ? [mevcutAday] : []), { status: 200 });
      }
      if (yontem === 'PATCH') {
        guncellenen.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return new Response('[]', { status: 200 });
      }
      if (yazmaHatasi) return new Response('duplicate key', { status: 409 });
      acilanAday.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify([{ id: 'lead-1' }]), { status: 201 });
    }
    if (adres.includes('customer_lead_messages')) {
      if (yontem === 'GET') return new Response(JSON.stringify(otomatikGecmis), { status: 200 });
      yazilanMesaj.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify([{ id: 'msg-1' }]), { status: 201 });
    }
    return new Response('[]', { status: 200 });
  }));
});

afterEach(() => {
  process.env = { ...ESKI_ENV };
  vi.unstubAllGlobals();
});

describe('adres doğrulama (GET)', () => {
  it('jeton doğruysa meydan okumayı düz metin döner', async () => {
    const { default: handler } = await moduluYukle();
    const yanit = await handler(new Request(
      `https://x/api/whatsapp?hub.mode=subscribe&hub.verify_token=${JETON}&hub.challenge=1234`,
    ));
    expect(yanit.status).toBe(200);
    // Meta düz metin bekliyor; JSON gönderilirse kurulum tamamlanmaz.
    expect(yanit.headers.get('content-type')).toContain('text/plain');
    expect(await yanit.text()).toBe('1234');
  });

  it('yanlış jetonu reddeder', async () => {
    const { default: handler } = await moduluYukle();
    const yanit = await handler(new Request(
      'https://x/api/whatsapp?hub.mode=subscribe&hub.verify_token=yanlis&hub.challenge=1234',
    ));
    expect(yanit.status).toBe(403);
  });

  it('jeton tanımlı değilse kurulumu kabul etmez', async () => {
    const { default: handler } = await moduluYukle({ WHATSAPP_VERIFY_TOKEN: undefined });
    const yanit = await handler(new Request(
      'https://x/api/whatsapp?hub.mode=subscribe&hub.verify_token=&hub.challenge=1',
    ));
    expect(yanit.status).toBe(503);
  });
});

describe('imza doğrulama', () => {
  it('imzasız isteği reddeder', async () => {
    const { default: handler } = await moduluYukle();
    const govde = metaGovdesi('Ali Veli');
    const yanit = await handler(new Request('https://x/api/whatsapp', { method: 'POST', body: govde }));
    expect(yanit.status).toBe(401);
    expect(acilanAday).toHaveLength(0);
  });

  it('başka bir sırla imzalanmış isteği reddeder', async () => {
    const { default: handler } = await moduluYukle();
    const govde = metaGovdesi('Ali Veli');
    const yanit = await handler(new Request('https://x/api/whatsapp', {
      method: 'POST', body: govde,
      headers: { 'x-hub-signature-256': imzala(govde, 'baska-sir') },
    }));
    expect(yanit.status).toBe(401);
    expect(acilanAday).toHaveLength(0);
  });

  it('gövdesi değiştirilmiş isteği reddeder', async () => {
    // İmza ham gövde üzerinden hesaplanıyor; tek karakter değişse tutmamalı.
    const { default: handler } = await moduluYukle();
    const govde = metaGovdesi('Ali Veli');
    const yanit = await handler(new Request('https://x/api/whatsapp', {
      method: 'POST', body: metaGovdesi('Baska Kisi'),
      headers: { 'x-hub-signature-256': imzala(govde) },
    }));
    expect(yanit.status).toBe(401);
  });

  it('bozuk imza başlığını reddeder', async () => {
    const { default: handler } = await moduluYukle();
    const govde = metaGovdesi('Ali Veli');
    for (const baslik of ['', 'sha1=abcd', 'sha256=', 'abcd', 'sha256=zz']) {
      const yanit = await handler(new Request('https://x/api/whatsapp', {
        method: 'POST', body: govde, headers: { 'x-hub-signature-256': baslik },
      }));
      expect(yanit.status).toBe(401);
    }
  });

  it('imza fonksiyonu doğru imzayı kabul eder', async () => {
    const { imzaDogru } = await moduluYukle();
    expect(imzaDogru('govde', imzala('govde'), SIR)).toBe(true);
    expect(imzaDogru('govde', imzala('govde', 'x'), SIR)).toBe(false);
    expect(imzaDogru('govde', null, SIR)).toBe(false);
  });
});

describe('mesajı müşteri adayına çevirme', () => {
  const ORNEK = `Ömer Ay
p:+905332642537
oay685126@gmail.com
1000
14.07.2029
düğün`;

  async function gonder(metin: string, over: Record<string, unknown> = {}) {
    const { default: handler } = await moduluYukle();
    const govde = metaGovdesi(metin, over);
    return handler(new Request('https://x/api/whatsapp', {
      method: 'POST', body: govde, headers: { 'x-hub-signature-256': imzala(govde) },
    }));
  }

  it('yeni adayı Aranmadı durumuyla açar', async () => {
    const yanit = await gonder(ORNEK);

    expect(yanit.status).toBe(200);
    expect(acilanAday).toHaveLength(1);
    expect(acilanAday[0]).toMatchObject({
      business_id: 'biz-1', name: 'Ömer Ay', phone: '5332642537',
      email: 'oay685126@gmail.com', guest_count: 1000, event_date: '2029-07-14',
      organization_type: 'Düğün', source: 'WhatsApp', status: 'Aranmadı',
    });
    expect(await yanit.json()).toMatchObject({ yeniAday: 1 });
  });

  it('mesajı geçmişe gelen olarak yazar', async () => {
    await gonder(ORNEK);
    expect(yazilanMesaj[0]).toMatchObject({
      lead_id: 'lead-1', direction: 'gelen', channel: 'whatsapp', body: ORNEK,
      wa_message_id: 'wamid.TEST1',
    });
  });

  it('aynı numaradan ikinci mesaj YENİ aday açmaz', async () => {
    // "Bu müşteri daha önce arandı mı" sorusunun cevapsız kalmaması buna bağlı.
    mevcutAday = { id: 'lead-eski', name: 'Ömer Ay', email: 'o@x.com', status: 'Arandı' };
    const yanit = await gonder('İkinci mesajım');

    expect(acilanAday).toHaveLength(0);
    expect(yazilanMesaj[0]).toMatchObject({ lead_id: 'lead-eski', direction: 'gelen' });
    expect(await yanit.json()).toMatchObject({ eklenen: 1, yeniAday: 0 });
  });

  it('mevcut adayın dolu alanlarını EZMEZ', async () => {
    // Personelin elle düzelttiği adı, gelen mesajdaki çözümleme yanlışıyla
    // bozmak kaydı kötüleştirirdi.
    mevcutAday = { id: 'lead-eski', name: 'Elle Düzeltilmiş Ad', email: 'eski@x.com', status: 'Arandı' };
    await gonder('Başka Bir İsim\nyeni@x.com');

    expect(guncellenen[0]).not.toHaveProperty('name');
    expect(guncellenen[0]).not.toHaveProperty('email');
    expect(guncellenen[0]).toHaveProperty('last_contact_at');
  });

  it('mevcut adayın BOŞ alanlarını doldurur', async () => {
    mevcutAday = { id: 'lead-eski', name: '', email: '', status: 'Aranmadı' };
    await gonder('Ömer Ay\nomer@x.com');

    expect(guncellenen[0]).toMatchObject({ name: 'Ömer Ay', email: 'omer@x.com' });
  });

  it('telefonu metinden değil GÖNDERENDEN alır', async () => {
    // Mesajı gönderen numara, metinde yazandan güvenilirdir.
    await gonder('Ali Veli\n0555 111 22 33');
    expect(acilanAday[0]).toMatchObject({ phone: '5332642537' });
  });

  it('ham metni olduğu gibi saklar', async () => {
    await gonder(ORNEK);
    expect(yazilanMesaj[0]!.body).toBe(ORNEK);
  });

  it('tanımadığı numaraya gelen mesajı kaydetmez', async () => {
    hesapVar = false;
    const yanit = await gonder('Ali Veli');
    expect(acilanAday).toHaveLength(0);
    expect(await yanit.json()).toMatchObject({ atlanan: 1 });
  });

  it('metin olmayan mesajı atlar', async () => {
    const yanit = await gonder('', { type: 'image', text: undefined });
    expect(yanit.status).toBe(200);
    expect(acilanAday).toHaveLength(0);
  });

  it('yazma hatasında 200 döner', async () => {
    // 200 dönmezsek Meta sonsuza kadar yeniden dener ve kuyruk tıkanır.
    yazmaHatasi = true;
    const yanit = await gonder('Ali Veli');
    expect(yanit.status).toBe(200);
    expect(await yanit.json()).toMatchObject({ atlanan: 1 });
  });

  it('bozuk gövdeyi 400 ile geçer', async () => {
    const { default: handler } = await moduluYukle();
    const govde = 'bu json degil';
    const yanit = await handler(new Request('https://x/api/whatsapp', {
      method: 'POST', body: govde, headers: { 'x-hub-signature-256': imzala(govde) },
    }));
    expect(yanit.status).toBe(400);
  });
});

describe('yapılandırma', () => {
  it('sır tanımlı değilse çalışmaz', async () => {
    const { default: handler, isWhatsappConfigured } = await moduluYukle({ WHATSAPP_APP_SECRET: undefined });
    expect(isWhatsappConfigured()).toBe(false);
    const yanit = await handler(new Request('https://x/api/whatsapp', { method: 'POST', body: '{}' }));
    expect(yanit.status).toBe(503);
  });

  it('desteklenmeyen yöntemi reddeder', async () => {
    const { default: handler } = await moduluYukle();
    const yanit = await handler(new Request('https://x/api/whatsapp', { method: 'DELETE' }));
    expect(yanit.status).toBe(405);
  });
});

/**
 * Otomatik cevap.
 *
 * Sistem yalnızca "mesajınız alındı" ve "şu saatte döneceğiz" der; fiyat,
 * tarih ve doluluk sorusuna cevap vermez. Buradaki testlerin ağırlığı,
 * gönderilmemesi gereken durumlarda gönderilmediğinde: gereksiz otomatik
 * mesaj, müşteriye salonun onu dinlemediğini söyler.
 */
describe('otomatik cevap', () => {
  // 2026-09-14 pazartesi. Yerel saat UTC+3.
  const YEREL_OGLE = String(Date.parse('2026-09-14T09:00:00Z') / 1000); // 12:00
  const YEREL_GECE = String(Date.parse('2026-09-14T20:00:00Z') / 1000); // 23:00

  const GONDERIM = { WHATSAPP_TOKEN: 'jeton', WHATSAPP_PHONE_ID: '999' };

  async function calistir(
    env: Record<string, string | undefined>, timestamp: string, metin = 'Ali Veli',
  ) {
    const { default: handler } = await moduluYukle(env);
    const govde = metaGovdesi(metin, { timestamp });
    return handler(new Request('https://x/api/whatsapp', {
      method: 'POST', body: govde,
      headers: { 'x-hub-signature-256': imzala(govde) },
    }));
  }

  it('ayar kapalıyken hiçbir şey göndermez', async () => {
    const yanit = await calistir(GONDERIM, YEREL_OGLE);
    expect(yanit.status).toBe(200);
    expect(gonderilen).toHaveLength(0);
  });

  it('mesai içinde yeni adaya karşılama gönderir ve geçmişe işler', async () => {
    hesapAyari = { auto_reply_enabled: true };
    const yanit = await calistir(GONDERIM, YEREL_OGLE);

    expect((await yanit.json() as { otomatik: number }).otomatik).toBe(1);
    expect(gonderilen).toHaveLength(1);
    expect(gonderilen[0]).toMatchObject({ to: '905332642537', type: 'text' });

    const giden = yazilanMesaj.find((m) => m.direction === 'giden');
    expect(giden).toMatchObject({ auto_kind: 'karsilama', channel: 'whatsapp' });
  });

  it('mevcut adaya ikinci mesajda karşılama göndermez', async () => {
    hesapAyari = { auto_reply_enabled: true };
    mevcutAday = { id: 'lead-9', name: 'Ali Veli', email: '', status: 'Arandı' };
    await calistir(GONDERIM, YEREL_OGLE);
    expect(gonderilen).toHaveLength(0);
  });

  it('mesai dışında bilgilendirme gönderir', async () => {
    hesapAyari = { auto_reply_enabled: true, after_hours_enabled: true };
    await calistir(GONDERIM, YEREL_GECE);

    expect(gonderilen).toHaveLength(1);
    const giden = yazilanMesaj.find((m) => m.direction === 'giden');
    expect(giden).toMatchObject({ auto_kind: 'mesai_disi' });
  });

  it('aynı akşam ikinci mesajda bilgilendirmeyi tekrarlamaz', async () => {
    hesapAyari = { after_hours_enabled: true };
    otomatikGecmis = [{ auto_kind: 'mesai_disi', created_at: '2026-09-14T19:00:00Z' }];
    await calistir(GONDERIM, YEREL_GECE);
    expect(gonderilen).toHaveLength(0);
  });

  it('gönderim yapılandırılmamışsa mesaj yine de kaydedilir', async () => {
    // Jeton yoksa özellik sessizce kapanmalı: gelen talebin kaydı
    // otomatik cevaba bağlı değildir.
    hesapAyari = { auto_reply_enabled: true };
    const yanit = await calistir({}, YEREL_OGLE);

    expect(yanit.status).toBe(200);
    expect(gonderilen).toHaveLength(0);
    expect(acilanAday).toHaveLength(1);
    expect(yazilanMesaj.some((m) => m.direction === 'gelen')).toBe(true);
  });

  it('gönderim hatası webhook yanıtını düşürmez', async () => {
    // 200 dönmezsek Meta aynı mesajı yeniden dener, kuyruk tıkanır ve
    // aday iki kez açılır.
    hesapAyari = { auto_reply_enabled: true };
    const gercekFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (girdi: string | URL, init?: RequestInit) => {
      if (String(girdi).includes('graph.facebook.com')) {
        return new Response('hata', { status: 500 });
      }
      return gercekFetch(girdi as string, init);
    }));

    const yanit = await calistir(GONDERIM, YEREL_OGLE);
    expect(yanit.status).toBe(200);
    const govde = await yanit.json() as { yeniAday: number; otomatik: number };
    expect(govde.yeniAday).toBe(1);
    expect(govde.otomatik).toBe(0);
    // Gitmemiş bir mesaj geçmişe yazılmamalı.
    expect(yazilanMesaj.some((m) => m.auto_kind)).toBe(false);
  });
});
