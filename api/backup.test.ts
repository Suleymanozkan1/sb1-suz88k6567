import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Yedek artık Supabase Storage'a değil sunucu diskine yazılıyor. */
let KOK = '';

/**
 * Günlük yedekleme görevi.
 *
 * Yedeğin sessizce başarısız olması, yedeğin hiç olmamasından kötüdür:
 * kimse fark etmez. Bu yüzden testler, başarısızlığın hem `backup_runs`
 * satırına hem de HTTP durumuna yansıdığını doğruluyor. Bir hesabın
 * hatası diğer hesapların yedeğini de engellememeli.
 */
const SIR = 'cron-sirri';
const ESKI_ENV = { ...process.env };

async function handlerYukle(env: Record<string, string | undefined> = {}) {
  process.env = {
    ...ESKI_ENV,
    CRON_SECRET: SIR,
    BACKUP_BUCKET: 'yedekler',
    PGRST_URL: 'http://veri.yerel',
    JWT_SECRET: 'test-icin-en-az-otuz-iki-karakterlik-sir',
    YEDEK_DIZINI: KOK,
    ...env,
  };
  vi.resetModules();
  return (await import('./backup')).default;
}

interface Senaryo {
  sahipler?: { id: string }[] | 'hata';
  /**
   * Bu sahip kimlikleri için diske yazma başarısız olsun.
   *
   * Hedef dizinin yerine bir DOSYA konuyor: `mkdir` ENOTDIR ile düşüyor.
   * Gerçekçi bir arıza (dolu disk, izin sorunu) ile aynı yoldan geçiyor.
   */
  yuklemeHatasi?: string[];
  /** backup_runs satırı açılamasın */
  kayitAcilamasin?: boolean;
}

function fetchTakli(senaryo: Senaryo = {}) {
  // Diske yazmayı düşürmek için hedef dizinin yerine bir DOSYA konuyor;
  // mkdir EEXIST ile düşüyor, gerçek bir arızayla aynı yoldan geçiyor.
  const kova = process.env.BACKUP_BUCKET ?? 'yedekler';
  for (const sahip of senaryo.yuklemeHatasi ?? []) {
    mkdirSync(join(KOK, kova), { recursive: true });
    writeFileSync(join(KOK, kova, sahip), 'dizin degil');
  }

  const cagrilar: { adres: string; yontem: string; govde: unknown }[] = [];

  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const adres = String(url);
    const ham = init?.body ? String(init.body) : undefined;
    let govde: unknown;
    try { govde = ham ? JSON.parse(ham) : undefined; } catch { govde = ham; }
    cagrilar.push({ adres, yontem: init?.method ?? 'GET', govde });

    if (adres.includes('/profiles')) {
      if (senaryo.sahipler === 'hata') return new Response('izin yok', { status: 403 });
      return new Response(JSON.stringify(senaryo.sahipler ?? [{ id: 'sahip-1' }]));
    }
    if (adres.includes('/backup_runs') && init?.method === 'POST') {
      if (senaryo.kayitAcilamasin) return new Response('', { status: 500 });
      return new Response(JSON.stringify([{ id: 'kosu-1' }]), { status: 201 });
    }
    if (adres.includes('/backup_runs')) return new Response(null, { status: 204 });
    if (adres.endsWith('/rpc/export_owner_data')) return new Response(JSON.stringify({ rezervasyonlar: [] }));
    if (adres.endsWith('/rpc/backup_row_counts')) return new Response(JSON.stringify({ rezervasyonlar: 0 }));
    return new Response('{}');
  }));

  return cagrilar;
}

function istek(yetkili = true): Request {
  return new Request('https://ornek.test/api/backup', {
    method: 'POST',
    headers: yetkili ? { authorization: `Bearer ${SIR}` } : {},
  });
}

beforeEach(() => {
  KOK = mkdtempSync(join(tmpdir(), 'sahra-yedek-')); vi.unstubAllGlobals(); });
afterEach(() => {
  if (KOK) rmSync(KOK, { recursive: true, force: true }); process.env = { ...ESKI_ENV }; vi.unstubAllGlobals(); });

describe('yedekleme görevi, yetkilendirme', () => {
  it('cron sırrı olmadan çağrılamaz', async () => {
    const handler = await handlerYukle();
    const cagrilar = fetchTakli();
    expect((await handler(istek(false))).status).toBe(401);
    expect(cagrilar).toHaveLength(0);
  });

  it('CRON_SECRET tanımlı değilse hiçbir istek geçmez', async () => {
    const handler = await handlerYukle({ CRON_SECRET: undefined });
    fetchTakli();
    expect((await handler(istek())).status).toBe(401);
  });

  it('veritabanı yapılandırması eksikse 500 döner', async () => {
    const handler = await handlerYukle({
      JWT_SECRET: undefined,
    });
    fetchTakli();
    expect((await handler(istek())).status).toBe(500);
  });
});

describe('yedekleme görevi, akış', () => {
  it('yalnızca yönetici hesaplarını yedekler', async () => {
    const handler = await handlerYukle();
    const cagrilar = fetchTakli();
    await handler(istek());
    const sorgu = cagrilar.find((c) => c.adres.includes('/profiles'));
    expect(sorgu?.adres).toContain('role=eq.owner');
  });

  it('başarılı yedekte kovaya yazar ve koşuyu başarılı işaretler', async () => {
    const handler = await handlerYukle();
    const cagrilar = fetchTakli();

    const yanit = await handler(istek());

    expect(yanit.status).toBe(200);
    await expect(yanit.json()).resolves.toEqual({
      total: 1, failed: 0, results: [{ ownerId: 'sahip-1', ok: true }],
    });

    // Yedek artık ağa değil sunucu diskine yazılıyor.
    const bugun = new Date().toISOString().slice(0, 10);
    expect(existsSync(join(KOK, 'yedekler', 'sahip-1', `${bugun}.json`))).toBe(true);

    const kapanis = cagrilar.filter((c) => c.adres.includes('backup_runs') && c.yontem === 'PATCH').at(-1);
    expect(kapanis?.govde).toMatchObject({
      status: 'basarili',
      storage_path: `yedekler/sahip-1/${bugun}.json`,
      size_bytes: JSON.stringify({ rezervasyonlar: [] }).length,
    });
  });

  it('kova adı ortam değişkeninden okunur', async () => {
    const handler = await handlerYukle({ BACKUP_BUCKET: 'baska-kova' });
    fetchTakli();
    await handler(istek());
    expect(existsSync(join(KOK, 'baska-kova'))).toBe(true);
  });

  it('yükleme başarısız olursa koşuyu başarısız işaretler ve 500 döner', async () => {
    const handler = await handlerYukle();
    const cagrilar = fetchTakli({ yuklemeHatasi: ['sahip-1'] });

    const yanit = await handler(istek());

    expect(yanit.status).toBe(500);
    const govde = await yanit.json() as { failed: number; results: { ok: boolean }[] };
    expect(govde.failed).toBe(1);
    expect(govde.results[0].ok).toBe(false);

    const kapanis = cagrilar.filter((c) => c.adres.includes('backup_runs') && c.yontem === 'PATCH').at(-1);
    expect(kapanis?.govde).toMatchObject({ status: 'basarisiz' });
  });

  it('bir hesabın hatası diğer hesapların yedeğini engellemez', async () => {
    const handler = await handlerYukle();
    fetchTakli({
      sahipler: [{ id: 'sahip-1' }, { id: 'sahip-2' }, { id: 'sahip-3' }],
      yuklemeHatasi: ['sahip-2'],
    });

    const yanit = await handler(istek());
    const govde = await yanit.json() as { total: number; failed: number; results: { ownerId: string; ok: boolean }[] };

    expect(govde.total).toBe(3);
    expect(govde.failed).toBe(1);
    expect(govde.results.filter((r) => r.ok).map((r) => r.ownerId)).toEqual(['sahip-1', 'sahip-3']);
  });

  it('koşu satırı açılamazsa hesabı başarısız sayar ve çökmez', async () => {
    const handler = await handlerYukle();
    fetchTakli({ kayitAcilamasin: true });
    const yanit = await handler(istek());
    expect(yanit.status).toBe(500);
    await expect(yanit.json()).resolves.toMatchObject({ total: 1, failed: 1 });
  });

  it('hesap listesi okunamazsa 502 döner', async () => {
    const handler = await handlerYukle();
    fetchTakli({ sahipler: 'hata' });
    const yanit = await handler(istek());
    expect(yanit.status).toBe(502);
    await expect(yanit.json()).resolves.toMatchObject({ error: 'Hesaplar okunamadı.' });
  });

  it('yedeklenecek hesap yoksa boş sonuç döner', async () => {
    const handler = await handlerYukle();
    fetchTakli({ sahipler: [] });
    const yanit = await handler(istek());
    expect(yanit.status).toBe(200);
    await expect(yanit.json()).resolves.toEqual({ total: 0, failed: 0, results: [] });
  });

  it('yanıtta service_role anahtarı geçmez', async () => {
    const handler = await handlerYukle();
    fetchTakli({ yuklemeHatasi: ['sahip-1'] });
    const metin = await (await handler(istek())).text();
    expect(metin).not.toContain('service-anahtari');
  });
});
