import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { havuzuKapat, sorgu } from './_pg.js';

/**
 * Veritabanı erişim katmanı, GERÇEK PostgreSQL'e karşı.
 *
 * NEDEN SAHTE VERİTABANI YOK. Bu katmanın tek işi doğru rol ve kimlikle
 * bağlanmak; sahte bir istemciye karşı sınandığında "SET LOCAL çağrıldı
 * mı" sorusuna cevap verilirdi, oysa asıl soru "İZOLASYON TUTUYOR MU".
 * Ona ancak politikaları uygulayan gerçek bir veritabanı cevap verebilir.
 *
 * VERİSİNİ KENDİ KURUYOR. Önce sabit kimlikler (A/B) ve "A Salonu",
 * "B Salonu" adları varsayılıyordu; o satırları kuran bir betik depoda
 * YOKTU, yani test ancak elle hazırlanmış bir veritabanında geçiyordu.
 * Şemanın kurulu olduğu herhangi bir veritabanında -- göçler
 * uygulandıktan sonra -- düşüyordu ve düşmesinin sebebi izolasyonun
 * bozulması değil, verinin olmamasıydı. Artık her koşuda kendi iki
 * kullanıcısını açıyor ve yalnızca KENDİ satırlarına bakıyor; başka
 * testlerin bıraktığı kayıtlar sonucu etkilemiyor.
 *
 * Test veritabanı yoksa (CI'da bağlantı adresi verilmemişse) testler
 * atlanıyor; sahte bir geçiş üretmiyor.
 */
const ADRES = process.env.TEST_DATABASE_URL;
const varMi = Boolean(ADRES);
if (varMi) process.env.DATABASE_URL = ADRES;

describe.skipIf(!varMi)('PostgreSQL erişimi', () => {
  const havuz = new Pool({ connectionString: ADRES, max: 1 });

  let A = '';
  let B = '';
  let aSalon = '';
  let bSalon = '';
  let bIsletme = '';

  /** Bu testin açtığı işletmelerin adları; başkalarınınki elenmiş. */
  function bizimkiler(satirlar: { name: string }[]): string[] {
    return satirlar.map((r) => r.name).filter((n) => n === aSalon || n === bSalon).sort();
  }

  beforeAll(async () => {
    const kur = async (etiket: string): Promise<{ id: string; ad: string; isletme: string }> => {
      const { rows: k } = await havuz.query(
        'insert into auth.users (id, email, encrypted_password)'
        + " values (gen_random_uuid(), 'pg-' || gen_random_uuid() || '@ornek.com', 'x')"
        + ' returning id',
      );
      const id = (k[0] as { id: string }).id;
      const ad = `${etiket} Salonu ${crypto.randomUUID().slice(0, 8)}`;
      const { rows: b } = await havuz.query(
        'insert into public.businesses (owner_id, name) values ($1, $2) returning id',
        [id, ad],
      );
      return { id, ad, isletme: (b[0] as { id: string }).id };
    };

    const a = await kur('A');
    const b = await kur('B');
    A = a.id; aSalon = a.ad;
    B = b.id; bSalon = b.ad; bIsletme = b.isletme;
  });

  afterAll(async () => {
    await havuzuKapat();
    await havuz.end();
  });

  it('kullanıcı yalnızca KENDİ işletmesini görüyor', async () => {
    const a = await sorgu<{ name: string }>(
      'select name from public.businesses order by name', [], { kullaniciId: A },
    );
    const b = await sorgu<{ name: string }>(
      'select name from public.businesses order by name', [], { kullaniciId: B },
    );

    expect(a.map((r) => r.name)).toEqual([aSalon]);
    expect(b.map((r) => r.name)).toEqual([bSalon]);
  });

  it('servis kimliği satır güvenliğini aşıyor', async () => {
    // Zamanlanmış görevler ve yedekleme bütün satırları görmek zorunda:
    // tek bir kullanıcının göremeyeceği İKİ işletme de görünmeli.
    const hepsi = await sorgu<{ name: string }>(
      'select name from public.businesses', [], { servis: true },
    );
    expect(bizimkiler(hepsi)).toEqual([aSalon, bSalon].sort());
  });

  it('başkasının işletmesine yazamıyor', async () => {
    await expect(sorgu(
      "update public.businesses set name = 'Ele geçirildi' where id = $1",
      [bIsletme],
      { kullaniciId: A },
    )).resolves.toEqual([]);

    // Satır gerçekten değişmemiş olmalı: RLS yazmayı sessizce eliyor.
    const b = await sorgu<{ name: string }>(
      'select name from public.businesses', [], { kullaniciId: B },
    );
    expect(b[0]!.name).toBe(bSalon);
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
    expect(b.map((r) => r.name)).toEqual([bSalon]);

    // Servis çağrısından sonra da kullanıcı kimliği doğru daralmalı.
    await sorgu('select 1', [], { servis: true });
    const a = await sorgu<{ name: string }>(
      'select name from public.businesses', [], { kullaniciId: A },
    );
    expect(a.map((r) => r.name)).toEqual([aSalon]);
  });

  /*
    Yukarıdaki test sızıntıyı DOLAYLI arıyor ve kaçırabiliyor: her
    kullanıcı çağrısı kimliği baştan yazdığı için, önceki çağrıdan kalan
    bir değer sonucu değiştirmiyor. Fark yalnızca kimliği HİÇ yazmayan
    bir çağrıda görünür -- servis çağrısı böyle. Ayar bağlantıda kalsaydı
    o çağrı önceki kullanıcının gözüyle başlardı; burada doğrudan
    bağlantının durumuna bakılıyor.
  */
  it('rol ve kimlik işlem bitince bağlantıdan siliniyor', async () => {
    await sorgu('select 1', [], { kullaniciId: A });

    const [durum] = await sorgu<{ kimlik: string | null; rol: string }>(
      "select current_setting('request.jwt.claim.sub', true) as kimlik,"
      + ' current_user as rol',
      [], { servis: true },
    );
    expect(durum!.kimlik ?? '').toBe('');
    expect(durum!.rol).not.toBe('authenticated');
  });

  it('kimliksiz çağrı reddediliyor', async () => {
    await expect(sorgu('select 1', [], {})).rejects.toThrow(/Kimlik yok/);
  });
});
