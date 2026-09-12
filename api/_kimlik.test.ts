import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Kimlik çekirdeği.
 *
 * Supabase Auth'un yerini alan katman; hata payı en düşük olması
 * gereken yer burası. Testlerin ağırlığı reddedilmesi gereken
 * durumlarda: kabul edilen sahte bir jeton, bütün RLS politikalarını
 * tek hamlede anlamsız kılar.
 */
process.env.JWT_SECRET = 'test-icin-en-az-otuz-iki-karakterlik-sir';

let K: typeof import('./_kimlik');
beforeAll(async () => { K = await import('./_kimlik'); });

describe('şifre saklama', () => {
  it('aynı şifre her seferinde farklı karma üretir', async () => {
    // Tuz olmasaydı, iki kullanıcının aynı şifreyi kullandığı
    // veritabanına bakan biri tarafından görülebilirdi.
    const a = await K.sifreyiKarmala('gizli1234');
    const b = await K.sifreyiKarmala('gizli1234');
    expect(a).not.toBe(b);
  });

  it('doğru şifreyi kabul eder', async () => {
    const karma = await K.sifreyiKarmala('gizli1234');
    expect(await K.sifreDogru('gizli1234', karma)).toBe(true);
  });

  it('yanlış şifreyi reddeder', async () => {
    const karma = await K.sifreyiKarmala('gizli1234');
    expect(await K.sifreDogru('gizli1235', karma)).toBe(false);
    expect(await K.sifreDogru('', karma)).toBe(false);
  });

  it('karma biçimi bozuksa reddeder, çökmez', async () => {
    for (const bozuk of ['', 'abc', 'scrypt$1$2$3', 'bcrypt$1$2$3$x$y', 'scrypt$a$b$c$d$e']) {
      expect(await K.sifreDogru('gizli1234', bozuk)).toBe(false);
    }
  });

  it('şifreyi düz metin olarak saklamaz', async () => {
    const karma = await K.sifreyiKarmala('cokGizliSifre');
    expect(karma).not.toContain('cokGizliSifre');
  });
});

describe('erişim jetonu', () => {
  const KIMLIK = '11111111-1111-1111-1111-111111111111';

  it('çözülebilir ve kimliği taşır', () => {
    const talepler = K.jetonuCoz(K.erisimJetonuUret(KIMLIK));
    expect(talepler?.sub).toBe(KIMLIK);
  });

  it('rolü authenticated olur', () => {
    // Başka bir değer yazılsaydı PostgREST o role geçer ve RLS
    // politikaları hiç uygulanmazdı.
    expect(K.jetonuCoz(K.erisimJetonuUret(KIMLIK))?.role).toBe('authenticated');
  });

  it('imzası bozulmuş jetonu reddeder', () => {
    const jeton = K.erisimJetonuUret(KIMLIK);
    const [b, g] = jeton.split('.');
    expect(K.jetonuCoz(`${b}.${g}.sahteimza`)).toBeNull();
  });

  it('gövdesi değiştirilmiş jetonu reddeder', () => {
    // Saldırgan kendi kimliğini başkasınınkiyle değiştirmeyi dener.
    const jeton = K.erisimJetonuUret(KIMLIK);
    const [baslik, , imza] = jeton.split('.');
    const sahteGovde = Buffer.from(JSON.stringify({
      sub: '22222222-2222-2222-2222-222222222222',
      role: 'authenticated', iat: 0, exp: 9999999999,
    })).toString('base64url');
    expect(K.jetonuCoz(`${baslik}.${sahteGovde}.${imza}`)).toBeNull();
  });

  it('başka bir sırla imzalanmış jetonu reddeder', () => {
    const jeton = K.erisimJetonuUret(KIMLIK);
    const eski = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'baska-bir-otuz-iki-karakterlik-gizli-anahtar';
    expect(K.jetonuCoz(jeton)).toBeNull();
    process.env.JWT_SECRET = eski;
  });

  it('süresi dolmuş jetonu reddeder', () => {
    const jeton = K.erisimJetonuUret(KIMLIK, Date.now());
    const sonra = Date.now() + (K.ERISIM_OMRU_SANIYE + 60) * 1000;
    expect(K.jetonuCoz(jeton, sonra)).toBeNull();
  });

  it('biçimsiz girdilerde çökmez', () => {
    for (const bozuk of ['', 'a', 'a.b', 'a.b.c.d', '...']) {
      expect(K.jetonuCoz(bozuk)).toBeNull();
    }
  });
});

describe('yenileme jetonu', () => {
  it('her çağrıda farklı üretilir', () => {
    const kume = new Set(Array.from({ length: 50 }, () => K.yenilemeJetonuUret()));
    expect(kume.size).toBe(50);
  });

  it('karma jetonun kendisini içermez', () => {
    // Veritabanı yedeği sızsa bile satırlarla oturum açılamamalı.
    const jeton = K.yenilemeJetonuUret();
    expect(K.yenilemeKarmasi(jeton)).not.toContain(jeton);
  });

  it('aynı jeton aynı karmayı verir', () => {
    const jeton = K.yenilemeJetonuUret();
    expect(K.yenilemeKarmasi(jeton)).toBe(K.yenilemeKarmasi(jeton));
  });
});

describe('yapılandırma', () => {
  it('kısa sır kabul edilmez', () => {
    const eski = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'kisa';
    expect(K.kimlikYapilandirildiMi()).toBe(false);
    expect(() => K.erisimJetonuUret('x')).toThrow(/JWT_SECRET/);
    process.env.JWT_SECRET = eski;
  });
});
