import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';

/**
 * Mock mod uç noktası.
 *
 * Testlerin ağırlığı KAPILARDA: bu uç nokta oturum açmış birine
 * veritabanına kayıt yazdırıyor. Yanlışlıkla açık bırakıldığında
 * herkesin herhangi bir işletmeye kayıt açabildiği bir kapı olmamalı.
 */
const JWT = 'test-icin-en-az-otuz-iki-karakterlik-sir';
const ESKI_ENV = { ...process.env };
const BIZ = 'biz-1';
const KULLANICI = 'kul-1';

async function moduluYukle(env: Record<string, string | undefined> = {}) {
  process.env = {
    ...ESKI_ENV,
    PGRST_URL: 'http://veri.yerel',
    JWT_SECRET: JWT,
    WHATSAPP_MOCK_MODE: 'true',
    ...env,
  };
  vi.resetModules();
  return import('./whatsapp-test');
}

/** api/_kimlik.ts ile aynı biçimde erişim jetonu üretir. */
function jeton(sub = KULLANICI, omurSaniye = 3600): string {
  const b64 = (g: string) => Buffer.from(g).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const simdi = Math.floor(Date.now() / 1000);
  const baslik = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const govde = b64(JSON.stringify({ sub, iat: simdi, exp: simdi + omurSaniye }));
  const imza = Buffer.from(
    createHmac('sha256', JWT).update(`${baslik}.${govde}`).digest(),
  ).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${baslik}.${govde}.${imza}`;
}

let acilanAday: Record<string, unknown>[] = [];
let yazilanMesaj: Record<string, unknown>[] = [];
let profilVar = true;

function istek(govde: unknown, jetonMetni: string | null = jeton()): Request {
  return new Request('https://x/api/whatsapp-test', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(jetonMetni ? { authorization: `Bearer ${jetonMetni}` } : {}),
    },
    body: JSON.stringify(govde),
  });
}

beforeEach(() => {
  acilanAday = [];
  yazilanMesaj = [];
  profilVar = true;
  vi.stubGlobal('fetch', vi.fn(async (girdi: string | URL, init?: RequestInit) => {
    const adres = String(girdi);
    const yontem = init?.method ?? 'GET';

    if (adres.includes('/rpc/check_rate_limit')) {
      return new Response('true', { status: 200 });
    }
    if (adres.includes('profiles')) {
      return new Response(JSON.stringify(profilVar ? [{ id: KULLANICI }] : []), { status: 200 });
    }
    if (adres.includes('lead_statuses')) {
      return new Response(JSON.stringify([{ code: 'yeni' }]), { status: 200 });
    }
    if (adres.includes('customer_leads')) {
      if (yontem === 'GET') return new Response('[]', { status: 200 });
      acilanAday.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify([{ id: 'lead-1' }]), { status: 201 });
    }
    if (adres.includes('customer_lead_messages')) {
      if (yontem === 'GET') return new Response('[]', { status: 200 });
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

describe('kapılar', () => {
  it('mock mod kapalıyken hiçbir şey yazmaz', async () => {
    const { default: handler } = await moduluYukle({ WHATSAPP_MOCK_MODE: undefined });
    const yanit = await handler(istek({ businessId: BIZ, text: 'Ömer Ay' }));

    expect(yanit.status).toBe(403);
    expect(acilanAday).toHaveLength(0);
  });

  it('"true" dışındaki değer modu AÇMAZ', async () => {
    // "1", "yes", "evet" gibi değerlerle kazara açılmamalı.
    const { default: handler } = await moduluYukle({ WHATSAPP_MOCK_MODE: '1' });
    expect((await handler(istek({ businessId: BIZ, text: 'x' }))).status).toBe(403);
  });

  it('jetonsuz isteği reddeder', async () => {
    const { default: handler } = await moduluYukle();
    const yanit = await handler(istek({ businessId: BIZ, text: 'Ömer Ay' }, null));

    expect(yanit.status).toBe(401);
    expect(acilanAday).toHaveLength(0);
  });

  it('başka bir sırla imzalanmış jetonu reddeder', async () => {
    const { default: handler } = await moduluYukle();
    const sahte = jeton().split('.').slice(0, 2).join('.') + '.bozukimza';
    expect((await handler(istek({ businessId: BIZ, text: 'x' }, sahte))).status).toBe(401);
  });

  it('süresi dolmuş jetonu reddeder', async () => {
    const { default: handler } = await moduluYukle();
    expect((await handler(istek({ businessId: BIZ, text: 'x' }, jeton(KULLANICI, -10)))).status)
      .toBe(401);
  });

  it('kullanıcının olmadığı işletmeye yazdırmaz', async () => {
    // Yalnızca ortam değişkenine bakan bir uç nokta, herkesin herhangi
    // bir işletmeye kayıt açabildiği bir kapı olurdu.
    profilVar = false;
    const { default: handler } = await moduluYukle();
    const yanit = await handler(istek({ businessId: 'baska-biz', text: 'Ömer Ay' }));

    expect(yanit.status).toBe(403);
    expect(acilanAday).toHaveLength(0);
  });

  it('GET kabul etmez', async () => {
    const { default: handler } = await moduluYukle();
    const yanit = await handler(new Request('https://x/api/whatsapp-test'));
    expect(yanit.status).toBe(405);
  });
});

describe('girdi denetimi', () => {
  it('boş metni reddeder', async () => {
    const { default: handler } = await moduluYukle();
    expect((await handler(istek({ businessId: BIZ, text: '   ' }))).status).toBe(400);
  });

  it('işletme seçilmemişse reddeder', async () => {
    const { default: handler } = await moduluYukle();
    expect((await handler(istek({ text: 'Ömer Ay' }))).status).toBe(400);
  });

  it('bozuk gövdede çökmez', async () => {
    const { default: handler } = await moduluYukle();
    const yanit = await handler(new Request('https://x/api/whatsapp-test', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${jeton()}` },
      body: '{bozuk',
    }));
    expect(yanit.status).toBe(400);
  });
});

describe('mesajı işleme', () => {
  const SARTNAME = `Ömer Ay
+905332642537
oay685126@gmail.com
Fiyat tahminen yemekli ve yemeksiz
1000
Mayısın ilk haftası
düğün`;

  it('gerçek webhook ile AYNI alanları üretir', async () => {
    const { default: handler } = await moduluYukle();
    const yanit = await handler(istek({ businessId: BIZ, text: SARTNAME }));

    expect(yanit.status).toBe(200);
    expect(await yanit.json()).toMatchObject({ ok: true, sonuc: 'yeni' });
    expect(acilanAday[0]).toMatchObject({
      business_id: BIZ, name: 'Ömer Ay', phone: '5332642537',
      email: 'oay685126@gmail.com', guest_count: 1000,
      request_text: 'Fiyat tahminen yemekli ve yemeksiz',
      event_date_text: 'Mayısın ilk haftası',
      organization_type: 'Düğün', source: 'WhatsApp', status: 'yeni',
    });
  });

  it('kaydın test olduğunu geçmişe düşer', async () => {
    // Geçmişe bakan biri hangi satırın denemeden geldiğini görebilmeli.
    const { default: handler } = await moduluYukle();
    await handler(istek({ businessId: BIZ, text: SARTNAME }));

    expect(yazilanMesaj.some((m) => m.direction === 'gelen')).toBe(true);
    expect(yazilanMesaj.some((m) => String(m.body).includes('test modunda'))).toBe(true);
  });

  it('mesaj kimliği test öneki taşır', async () => {
    const { default: handler } = await moduluYukle();
    await handler(istek({ businessId: BIZ, text: SARTNAME }));

    const gelen = yazilanMesaj.find((m) => m.direction === 'gelen');
    expect(String(gelen?.wa_message_id)).toMatch(/^test-/);
  });

  it('gönderen numara verilirse metindekinden ÖNCE gelir', async () => {
    const { default: handler } = await moduluYukle();
    await handler(istek({ businessId: BIZ, text: SARTNAME, from: '905441112233' }));
    expect(acilanAday[0]).toMatchObject({ phone: '5441112233' });
  });

  it('gerçek numaraya otomatik cevap GÖNDERMEZ', async () => {
    /*
      Test amacıyla yazılan bir mesaj yüzünden gerçek bir müşteriye
      WhatsApp mesajı gitmemeli.
    */
    const { default: handler } = await moduluYukle();
    await handler(istek({ businessId: BIZ, text: SARTNAME }));

    const cagrilar = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(cagrilar.some((c) => String(c[0]).includes('graph.facebook.com'))).toBe(false);
  });
});
