import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const KOK = mkdtempSync(join(tmpdir(), 'sahra-yedek-'));

/**
 * `_db.ts` yapılandırmayı modül yüklenirken bir kez okur. Bu yüzden her
 * senaryo `vi.resetModules()` sonrası dinamik `import()` ile taze bir modül
 * alır; ortam değişkeni testler arasında sızmaz.
 */
type Db = typeof import('./_db');

const ESKI_ENV = { ...process.env };

async function moduluYukle(env: Record<string, string | undefined>): Promise<Db> {
  process.env = { ...ESKI_ENV, ...env };
  vi.resetModules();
  return import('./_db');
}

/** fetch taklidi: çağrıları kaydeder, sırayla verilen yanıtları döndürür. */
function fetchTakli(...yanitlar: Response[]) {
  const cagrilar: { url: string; init?: RequestInit }[] = [];
  const sahte = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    cagrilar.push({ url: String(url), init });
    return yanitlar.shift() ?? new Response('{}', { status: 200 });
  });
  vi.stubGlobal('fetch', sahte);
  return cagrilar;
}

const YAPILI = {
  PGRST_URL: 'http://veri.yerel',
  JWT_SECRET: 'test-icin-en-az-otuz-iki-karakterlik-sir',
  YEDEK_DIZINI: undefined as string | undefined,
};

const YAPILANDIRILMAMIS = { JWT_SECRET: undefined };

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { process.env = { ...ESKI_ENV }; vi.unstubAllGlobals(); });

describe('isDbConfigured', () => {
  it('imza sırrı varsa doğru döner', async () => {
    const db = await moduluYukle(YAPILI);
    expect(db.isDbConfigured()).toBe(true);
  });

  it('sır yoksa yanlış döner', async () => {
    const db = await moduluYukle(YAPILANDIRILMAMIS);
    expect(db.isDbConfigured()).toBe(false);
  });

  it('sır çok kısaysa yanlış döner', async () => {
    // Kısa bir imza anahtarı deneme yanılmayla bulunabilir; jeton
    // üretilebilseydi herkes service_role yetkisi alırdı.
    const db = await moduluYukle({ ...YAPILI, JWT_SECRET: 'kisa' });
    expect(db.isDbConfigured()).toBe(false);
  });
});

describe('callRpc', () => {
  it('yapılandırma eksikken ağa çıkmadan hata verir', async () => {
    const db = await moduluYukle(YAPILANDIRILMAMIS);
    const cagrilar = fetchTakli();
    await expect(db.callRpc('bir_fn', {})).rejects.toThrow('Veritabanı yapılandırması eksik.');
    expect(cagrilar).toHaveLength(0);
  });

  it('rpc yoluna service_role başlıklarıyla POST atar', async () => {
    const db = await moduluYukle(YAPILI);
    const cagrilar = fetchTakli(new Response(JSON.stringify({ ok: 1 }), { status: 200 }));

    const sonuc = await db.callRpc<{ ok: number }>('kuyruk_isle', { p_limit: 5 });

    expect(sonuc).toEqual({ ok: 1 });
    expect(cagrilar[0].url).toBe('http://veri.yerel/rpc/kuyruk_isle');
    expect(cagrilar[0].init?.method).toBe('POST');
    const basliklar = cagrilar[0].init?.headers as Record<string, string>;
    expect(cagrilar[0].init?.body).toBe(JSON.stringify({ p_limit: 5 }));

    // Yetki, service_role talebiyle imzalanmış bir jetonla taşınıyor.
    const jeton = basliklar.authorization.replace('Bearer ', '');
    const govde = JSON.parse(Buffer.from(jeton.split('.')[1], 'base64url').toString());
    expect(govde.role).toBe('service_role');
    // Ömrü kısa: yığın dökümüne düşen bir jeton uzun süre kullanılamasın.
    expect(govde.exp - govde.iat).toBeLessThanOrEqual(300);
  });

  it('başarısız yanıtta durum kodunu ve gövdeyi hataya taşır', async () => {
    const db = await moduluYukle(YAPILI);
    fetchTakli(new Response('izin yok', { status: 403 }));
    await expect(db.callRpc('kuyruk_isle', {}))
      .rejects.toThrow('RPC kuyruk_isle başarısız (403): izin yok');
  });
});

describe('selectRows', () => {
  it('yapılandırma eksikken hata verir', async () => {
    const db = await moduluYukle(YAPILANDIRILMAMIS);
    await expect(db.selectRows('reservations')).rejects.toThrow('Veritabanı yapılandırması eksik.');
  });

  it('satır dizisini döndürür', async () => {
    const db = await moduluYukle(YAPILI);
    const cagrilar = fetchTakli(new Response(JSON.stringify([{ id: 'a' }]), { status: 200 }));

    await expect(db.selectRows('reservations?select=id')).resolves.toEqual([{ id: 'a' }]);
    expect(cagrilar[0].url).toBe('http://veri.yerel/reservations?select=id');
    expect(cagrilar[0].init?.method).toBeUndefined();
  });

  it('başarısız yanıtta durum kodunu bildirir', async () => {
    const db = await moduluYukle(YAPILI);
    fetchTakli(new Response('', { status: 500 }));
    await expect(db.selectRows('reservations')).rejects.toThrow('Sorgu başarısız (500)');
  });
});

describe('patchRows', () => {
  it('yapılandırma eksikken hata verir', async () => {
    const db = await moduluYukle(YAPILANDIRILMAMIS);
    await expect(db.patchRows('sms_queue?id=eq.1', { status: 'gonderildi' }))
      .rejects.toThrow('Veritabanı yapılandırması eksik.');
  });

  it('PATCH gönderir ve gövde döndürmesini istemez', async () => {
    const db = await moduluYukle(YAPILI);
    const cagrilar = fetchTakli(new Response(null, { status: 204 }));

    await db.patchRows('sms_queue?id=eq.1', { status: 'gonderildi' });

    expect(cagrilar[0].init?.method).toBe('PATCH');
    const basliklar = cagrilar[0].init?.headers as Record<string, string>;
    expect(basliklar.prefer).toBe('return=minimal');
    expect(cagrilar[0].init?.body).toBe(JSON.stringify({ status: 'gonderildi' }));
  });

  it('başarısız yanıtta hata verir', async () => {
    const db = await moduluYukle(YAPILI);
    fetchTakli(new Response('', { status: 409 }));
    await expect(db.patchRows('sms_queue', {})).rejects.toThrow('Güncelleme başarısız (409)');
  });
});

describe('insertRow', () => {
  it('yapılandırma eksikken hata verir', async () => {
    const db = await moduluYukle(YAPILANDIRILMAMIS);
    await expect(db.insertRow('sms_log', {})).rejects.toThrow('Veritabanı yapılandırması eksik.');
  });

  it('eklenen ilk satırı döndürür', async () => {
    const db = await moduluYukle(YAPILI);
    const cagrilar = fetchTakli(
      new Response(JSON.stringify([{ id: 'yeni' }]), { status: 201 }),
    );

    await expect(db.insertRow<{ id: string }>('sms_log', { to: '5321112233' }))
      .resolves.toEqual({ id: 'yeni' });

    const basliklar = cagrilar[0].init?.headers as Record<string, string>;
    expect(basliklar.prefer).toBe('return=representation');
  });

  it('başarısız yanıtta hata verir', async () => {
    const db = await moduluYukle(YAPILI);
    fetchTakli(new Response('', { status: 400 }));
    await expect(db.insertRow('sms_log', {})).rejects.toThrow('Kayıt eklenemedi (400)');
  });
});

describe('uploadToStorage', () => {
  it('yedeği diske yazar', async () => {
    const db = await moduluYukle({ ...YAPILI, YEDEK_DIZINI: KOK });
    await db.uploadToStorage('yedekler', '2026/01.json', '{"a":1}');

    const hedef = join(KOK, 'yedekler', '2026', '01.json');
    expect(readFileSync(hedef, 'utf8')).toBe('{"a":1}');
  });

  it('dosyayı yalnızca sahibinin okuyabileceği izinle yazar', async () => {
    // Yedek müşteri adı ve telefonu içeriyor; sunucudaki başka bir
    // kullanıcı okuyabilseydi kişisel veri sızardı.
    const db = await moduluYukle({ ...YAPILI, YEDEK_DIZINI: KOK });
    await db.uploadToStorage('yedekler', 'izin.json', '{}');

    const mod = statSync(join(KOK, 'yedekler', 'izin.json')).mode & 0o777;
    expect(mod & 0o077).toBe(0);
  });

  it('aynı dosyayı yeniden yazar', async () => {
    const db = await moduluYukle({ ...YAPILI, YEDEK_DIZINI: KOK });
    await db.uploadToStorage('yedekler', 'tekrar.json', '{"v":1}');
    await db.uploadToStorage('yedekler', 'tekrar.json', '{"v":2}');
    expect(readFileSync(join(KOK, 'yedekler', 'tekrar.json'), 'utf8')).toBe('{"v":2}');
  });

  it('ağa hiç çıkmaz', async () => {
    // Yedek artık dışarı gitmiyor; sunucudan ayrılmaması KVKK açısından da iyi.
    const db = await moduluYukle({ ...YAPILI, YEDEK_DIZINI: KOK });
    const cagrilar = fetchTakli();
    await db.uploadToStorage('yedekler', 'ag.json', '{}');
    expect(cagrilar).toHaveLength(0);
  });
});

describe('isAuthorizedCron', () => {
  function istek(basliklar: Record<string, string> = {}): Request {
    return new Request('https://ornek.test/api/backup', { headers: basliklar });
  }

  it('sır tanımlı değilse hiçbir isteği kabul etmez', async () => {
    const db = await moduluYukle({ ...YAPILI, CRON_SECRET: undefined });
    expect(db.isAuthorizedCron(istek({ authorization: 'Bearer herhangi' }))).toBe(false);
  });

  it('doğru taşıyıcı sırrı kabul eder', async () => {
    const db = await moduluYukle({ ...YAPILI, CRON_SECRET: 'gizli' });
    expect(db.isAuthorizedCron(istek({ authorization: 'Bearer gizli' }))).toBe(true);
  });

  it('yanlış sırrı reddeder', async () => {
    const db = await moduluYukle({ ...YAPILI, CRON_SECRET: 'gizli' });
    expect(db.isAuthorizedCron(istek({ authorization: 'Bearer baska' }))).toBe(false);
  });

  it('başlık hiç yoksa reddeder', async () => {
    const db = await moduluYukle({ ...YAPILI, CRON_SECRET: 'gizli' });
    expect(db.isAuthorizedCron(istek())).toBe(false);
  });

  it('şemasız sırrı reddeder: "gizli" tek başına yetmez', async () => {
    const db = await moduluYukle({ ...YAPILI, CRON_SECRET: 'gizli' });
    expect(db.isAuthorizedCron(istek({ authorization: 'gizli' }))).toBe(false);
  });
});
