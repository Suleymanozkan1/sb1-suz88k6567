/**
 * Vercel kipinde UÇTAN UCA: giriş yap, dönen jetonla veri oku.
 *
 * NEDEN AYRI BİR DOSYA. `_db_dogrudan.test.ts` yardımcıların tek tek
 * doğru çalıştığını gösteriyor, `veri.test.ts` de izolasyonu. Ama
 * kullanıcının gördüğü şey bu ikisinin BİRLEŞİMİ: giriş uç noktası
 * jetonu üretiyor, tarayıcı onu `/veri`ye taşıyor. Aradaki bağlantı
 * kopuksa -- jeton başka bir sırla imzalanmışsa, giriş kilidi
 * PostgREST'siz çalışmıyorsa -- iki paket de yeşil kalır ve site
 * açılmaz.
 *
 * `TEST_DATABASE_URL` yoksa ATLANIR (bkz. `_pgrest.veritabani.test.ts`).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';

const ADRES = process.env.TEST_DATABASE_URL;
const calistir = ADRES ? describe : describe.skip;

calistir('Vercel kipinde giriş ve veri akışı', () => {
  const havuz = new Pool({ connectionString: ADRES, max: 1 });

  let girisIsle: (r: Request) => Promise<Response>;
  let veriIsle: (r: Request) => Promise<Response>;
  let havuzuKapat: () => Promise<void>;

  const SIFRE = 'Cok-Guclu-Bir-Sifre-2099';
  let eposta = '';
  let salonAdi = '';

  beforeAll(async () => {
    process.env.DATABASE_URL = ADRES;
    process.env.JWT_SECRET = 'test-icin-en-az-otuz-iki-karakterlik-bir-dize';
    delete process.env.PGRST_URL;
    delete process.env.PGRST_FATURA_URL;
    vi.resetModules();

    ({ default: girisIsle } = await import('./login.js'));
    ({ default: veriIsle } = await import('./veri.js'));
    ({ havuzuKapat } = await import('./_pg.js'));
    const { sifreyiKarmala } = await import('./_kimlik.js');

    eposta = `akis-${crypto.randomUUID()}@ornek.com`;
    salonAdi = `Akış Salonu ${crypto.randomUUID().slice(0, 8)}`;

    const { rows: k } = await havuz.query(
      'insert into auth.users (id, email, encrypted_password)'
      + ' values (gen_random_uuid(), $1, $2) returning id',
      [eposta, await sifreyiKarmala(SIFRE)],
    );
    const sahip = (k[0] as { id: string }).id;

    const { rows: b } = await havuz.query(
      'insert into public.businesses (owner_id, name) values ($1, $2) returning id',
      [sahip, 'Akış Testi İşletmesi'],
    );
    const isletme = (b[0] as { id: string }).id;
    await havuz.query(
      'update public.profiles set active_business_id = $1 where id = $2', [isletme, sahip],
    );
    await havuz.query(
      'insert into public.halls (business_id, name, capacity) values ($1, $2, 500)',
      [isletme, salonAdi],
    );
  });

  afterAll(async () => {
    await havuzuKapat();
    await havuz.end();
  });

  function giris(govde: unknown, ek: Record<string, string> = {}): Promise<Response> {
    return girisIsle(new Request('https://ornek.com/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7', ...ek },
      body: JSON.stringify(govde),
    }));
  }

  it('doğru şifreyle giriş jetonu verir', async () => {
    const yanit = await giris({ email: eposta, password: SIFRE });
    expect(yanit.status).toBe(200);
    const govde = await yanit.json() as { accessToken?: string; refreshToken?: string };
    expect(govde.accessToken).toBeTruthy();
    expect(govde.refreshToken).toBeTruthy();
  });

  it('yanlış şifre jeton vermez', async () => {
    const yanit = await giris({ email: eposta, password: 'yanlis-sifre' });
    expect(yanit.status).toBeGreaterThanOrEqual(400);
    const govde = await yanit.json() as { accessToken?: string };
    expect(govde.accessToken).toBeUndefined();
  });

  /*
    ASIL MESELE. Giriş uç noktasının ürettiği jeton, veri uç noktasında
    GEÇERLİ mi? İki taraf ayrı sırlarla çalışsaydı giriş başarılı görünür,
    ardından her ekran boş açılırdı.
  */
  it('giriş jetonuyla kendi salonunu okur', async () => {
    const yanit = await giris({ email: eposta, password: SIFRE });
    const { accessToken: jeton } = await yanit.json() as { accessToken: string };

    const veri = await veriIsle(new Request('https://ornek.com/veri/halls?select=name', {
      headers: { authorization: `Bearer ${jeton}` },
    }));
    expect(veri.status).toBe(200);
    const satirlar = await veri.json() as { name: string }[];
    expect(satirlar.map((s) => s.name)).toContain(salonAdi);
  });

  it('oturum kaydı veritabanına düşüyor', async () => {
    // `oturum_ac` çağrısı PostgREST'siz çalışmazsa giriş yine 200
    // dönebilirdi ama yenileme jetonu hiçbir zaman geçerli olmazdı:
    // kullanıcı bir saat sonra sessizce dışarı atılırdı.
    const { rows } = await havuz.query(
      'select count(*)::int as n from auth.sessions s'
      + ' join auth.users u on u.id = s.user_id where u.email = $1',
      [eposta],
    );
    expect((rows[0] as { n: number }).n).toBeGreaterThan(0);
  });
});
