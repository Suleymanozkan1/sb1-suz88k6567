import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Otomatik hatırlatmalar.
 *
 * Görev yalnızca kuyruğa alır; gönderimi kuyruk işleyicisi yapar. Bu
 * testlerin koruduğu sözleşme: yetkisiz tetikleme müşteriye mesaj
 * gönderemez, engellenen kayıt sessizce atılmaz ve görev günlüğüne
 * müşteri telefonu ya da adı yazılmaz.
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
    ...env,
  };
  vi.resetModules();
  return (await import('./reminders')).default;
}

interface Satir {
  business_id: string;
  reservation_id: string;
  key: string;
  queued: boolean;
  reason: string | null;
}

function fetchTakli(satirlar: Satir[] | 'hata') {
  const cagrilar: { adres: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const adres = String(url);
    cagrilar.push({ adres, govde: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (adres.endsWith('/rpc/enqueue_due_reminders')) {
      if (satirlar === 'hata') return new Response('kilit', { status: 500 });
      return new Response(JSON.stringify(satirlar));
    }
    return new Response('{}');
  }));
  return cagrilar;
}

function istek(yetkili = true): Request {
  return new Request('https://ornek.test/api/reminders', {
    method: 'POST',
    headers: yetkili ? { authorization: `Bearer ${SIR}` } : {},
  });
}

function satir(over: Partial<Satir> = {}): Satir {
  return {
    business_id: 'biz-1', reservation_id: 'rez-1', key: 'tarih_hatirlatma',
    queued: true, reason: null, ...over,
  };
}

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { process.env = { ...ESKI_ENV }; vi.unstubAllGlobals(); });

describe('hatırlatma görevi, yetkilendirme', () => {
  it('cron sırrı olmadan çağrılamaz', async () => {
    const handler = await handlerYukle();
    const cagrilar = fetchTakli([]);
    expect((await handler(istek(false))).status).toBe(401);
    expect(cagrilar).toHaveLength(0);
  });

  it('CRON_SECRET tanımlı değilse hiçbir istek geçmez', async () => {
    const handler = await handlerYukle({ CRON_SECRET: undefined });
    fetchTakli([]);
    expect((await handler(istek())).status).toBe(401);
  });

  it('veritabanı yapılandırması eksikse 500 döner', async () => {
    const handler = await handlerYukle({
      SUPABASE_URL: undefined, VITE_SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined,
    });
    fetchTakli([]);
    expect((await handler(istek())).status).toBe(500);
  });
});

describe('hatırlatma görevi, sayım', () => {
  it('boş sonuçta sıfır döner', async () => {
    const handler = await handlerYukle();
    fetchTakli([]);
    await expect((await handler(istek())).json())
      .resolves.toEqual({ scanned: 0, queued: 0, blocked: 0, reasons: [] });
  });

  it('kuyruğa alınan ve engellenen kayıtları ayrı sayar', async () => {
    const handler = await handlerYukle();
    fetchTakli([
      satir({ reservation_id: 'r1' }),
      satir({ reservation_id: 'r2' }),
      satir({ reservation_id: 'r3', key: 'kampanya', queued: false, reason: 'iys_onayi_yok' }),
    ]);

    await expect((await handler(istek())).json()).resolves.toEqual({
      scanned: 3, queued: 2, blocked: 1, reasons: ['iys_onayi_yok'],
    });
  });

  it('aynı gerekçeyi bir kez listeler', async () => {
    const handler = await handlerYukle();
    fetchTakli([
      satir({ queued: false, reason: 'iys_onayi_yok' }),
      satir({ queued: false, reason: 'iys_onayi_yok' }),
      satir({ queued: false, reason: 'telefon_yok' }),
    ]);
    const govde = await (await handler(istek())).json() as { reasons: string[] };
    expect(govde.reasons.sort()).toEqual(['iys_onayi_yok', 'telefon_yok']);
  });

  it('gerekçesi olmayan engellemeyi "bilinmiyor" olarak bildirir', async () => {
    const handler = await handlerYukle();
    fetchTakli([satir({ queued: false, reason: null })]);
    await expect((await handler(istek())).json())
      .resolves.toMatchObject({ blocked: 1, reasons: ['bilinmiyor'] });
  });

  it('görev günlüğüne müşteri telefonu ya da adı yazmaz', async () => {
    // Zamanlanmış görev çıktısı kişisel veri taşımamalı.
    const handler = await handlerYukle();
    fetchTakli([satir({ queued: false, reason: 'iys_onayi_yok' })]);
    const metin = await (await handler(istek())).text();
    expect(metin).not.toContain('biz-1');
    expect(metin).not.toContain('rez-1');
    expect(metin).not.toMatch(/\b5\d{9}\b/);
  });

  it('RPC hata verirse 502 döner', async () => {
    const handler = await handlerYukle();
    fetchTakli('hata');
    const yanit = await handler(istek());
    expect(yanit.status).toBe(502);
    await expect(yanit.json()).resolves.toMatchObject({ error: 'Hatırlatmalar okunamadı.' });
  });
});
