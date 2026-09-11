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
    SUPABASE_URL: 'https://ornek.supabase.co',
    VITE_SUPABASE_URL: undefined,
    SUPABASE_SERVICE_ROLE_KEY: 'service-anahtari',
    WHATSAPP_TOKEN: 'jeton',
    WHATSAPP_PHONE_ID: '111222333',
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

beforeEach(() => {
  aday = { id: 'lead-1', business_id: 'biz-1', phone: '5332642537' };
  sonGelen = new Date().toISOString();
  metaYanit = { ok: true, status: 200 };
  yazilanMesaj = [];
  metaGovde = null;

  vi.stubGlobal('fetch', vi.fn(async (girdi: string | URL, init?: RequestInit) => {
    const adres = String(girdi);
    if (adres.includes('customer_leads')) {
      return new Response(JSON.stringify(aday ? [aday] : []), { status: 200 });
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

function istek(govde: unknown) {
  return new Request('https://x/api/whatsapp-gonder', {
    method: 'POST', body: JSON.stringify(govde),
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
    const yanit = await handler(istek({ leadId: 'lead-1', body: 'Merhaba' }));

    expect(yanit.status).toBe(409);
    expect(await yanit.json()).toMatchObject({ pencere: 'kapali' });
    expect(metaGovde).toBeNull();
  });

  it('hiç gelen mesaj yoksa pencere kapalıdır', async () => {
    sonGelen = null;
    const { default: handler } = await moduluYukle();
    expect((await handler(istek({ leadId: 'lead-1', body: 'x' }))).status).toBe(409);
  });
});

describe('gönderim', () => {
  it('pencere açıkken Meta API üzerinden gönderir ve geçmişe yazar', async () => {
    const { default: handler } = await moduluYukle();
    const yanit = await handler(istek({ leadId: 'lead-1', body: 'Merhaba' }));

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
    const yanit = await handler(istek({ leadId: 'lead-1', body: 'Merhaba' }));

    expect(yanit.status).toBe(502);
    expect(yazilanMesaj).toHaveLength(0);
  });

  it('telefonu olmayan adaya göndermez', async () => {
    aday = { id: 'lead-1', business_id: 'biz-1', phone: '' };
    const { default: handler } = await moduluYukle();
    expect((await handler(istek({ leadId: 'lead-1', body: 'x' }))).status).toBe(404);
  });

  it('eksik gövdeyi reddeder', async () => {
    const { default: handler } = await moduluYukle();
    expect((await handler(istek({ leadId: 'lead-1' }))).status).toBe(400);
    expect((await handler(istek({ body: 'x' }))).status).toBe(400);
    expect((await handler(istek({ leadId: 'lead-1', body: '   ' }))).status).toBe(400);
  });

  it('jeton tanımlı değilse çalışmaz', async () => {
    const { default: handler, isSendConfigured } = await moduluYukle({ WHATSAPP_TOKEN: undefined });
    expect(isSendConfigured()).toBe(false);
    expect((await handler(istek({ leadId: 'l', body: 'x' }))).status).toBe(503);
  });

  it('desteklenmeyen yöntemi reddeder', async () => {
    const { default: handler } = await moduluYukle();
    const yanit = await handler(new Request('https://x/api/whatsapp-gonder', { method: 'GET' }));
    expect(yanit.status).toBe(405);
  });
});
