import { afterAll, describe, expect, it } from 'vitest';
import { havuzuKapat, sorgu } from './_pg.js';

/**
 * Veritabanı erişim katmanı, GERÇEK PostgreSQL'e karşı.
 *
 * NEDEN SAHTE VERİTABANI YOK. Bu katmanın tek işi doğru rol ve kimlikle
 * bağlanmak; sahte bir istemciye karşı sınandığında "SET LOCAL çağrıldı
 * mı" sorusuna cevap verilirdi, oysa asıl soru "İZOLASYON TUTUYOR MU".
 * Ona ancak politikaları uygulayan gerçek bir veritabanı cevap verebilir.
 *
 * Test veritabanı yoksa (CI'da bağlantı adresi verilmemişse) testler
 * atlanıyor; sahte bir geçiş üretmiyor.
 */
const ADRES = process.env.TEST_DATABASE_URL;
const varMi = Boolean(ADRES);
if (varMi) process.env.DATABASE_URL = ADRES;

const A = 'a1111111-1111-1111-1111-111111111111';
const B = 'b2222222-2222-2222-2222-222222222222';

describe.skipIf(!varMi)('PostgreSQL erişimi', () => {
  afterAll(async () => { await havuzuKapat(); });

  it('kullanıcı yalnızca KENDİ işletmesini görüyor', async () => {
    const a = await sorgu<{ name: string }>(
      'select name from public.businesses order by name', [], { kullaniciId: A },
    );
    const b = await sorgu<{ name: string }>(
      'select name from public.businesses order by name', [], { kullaniciId: B },
    );

    expect(a.map((r) => r.name)).toEqual(['A Salonu']);
    expect(b.map((r) => r.name)).toEqual(['B Salonu']);
  });

  it('servis kimliği satır güvenliğini aşıyor', async () => {
    // Zamanlanmış görevler ve yedekleme bütün satırları görmek zorunda.
    const hepsi = await sorgu<{ name: string }>(
      'select name from public.businesses', [], { servis: true },
    );
    expect(hepsi).toHaveLength(2);
  });

  it('başkasının işletmesine yazamıyor', async () => {
    await expect(sorgu(
      "update public.businesses set name = 'Ele geçirildi' where id = $1",
      ['bbbbbbbb-0000-0000-0000-00000000000b'],
      { kullaniciId: A },
    )).resolves.toEqual([]);

    // Satır gerçekten değişmemiş olmalı: RLS yazmayı sessizce eliyor.
    const b = await sorgu<{ name: string }>(
      'select name from public.businesses', [], { kullaniciId: B },
    );
    expect(b[0].name).toBe('B Salonu');
  });

  /*
    ASIL TEHLİKE BURADA. `SET` (LOCAL'siz) kullanılsaydı kimlik bağlantıda
    kalır ve havuzdan aynı bağlantıyı alan bir sonraki istek önceki
    kullanıcının gözüyle çalışırdı. Havuz `max: 1` olduğu için bu testteki
    iki çağrı AYNI bağlantıyı kullanıyor; sızıntı olsaydı burada çıkardı.
  */
  it('kimlik bağlantıda kalmıyor, sonraki isteğe sızmıyor', async () => {
    await sorgu('select 1', [], { kullaniciId: A });
    const b = await sorgu<{ name: string }>(
      'select name from public.businesses', [], { kullaniciId: B },
    );
    expect(b.map((r) => r.name)).toEqual(['B Salonu']);

    // Servis çağrısından sonra da kullanıcı kimliği doğru daralmalı.
    await sorgu('select 1', [], { servis: true });
    const a = await sorgu<{ name: string }>(
      'select name from public.businesses', [], { kullaniciId: A },
    );
    expect(a.map((r) => r.name)).toEqual(['A Salonu']);
  });

  it('kimliksiz çağrı reddediliyor', async () => {
    await expect(sorgu('select 1', [], {})).rejects.toThrow(/Kimlik yok/);
  });
});
