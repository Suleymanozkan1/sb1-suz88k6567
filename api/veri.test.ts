/**
 * Veri uç noktası: kimlik kapısı ve KİRACI İZOLASYONU.
 *
 * Bu dosyanın tek bir asıl sorusu var: uç noktadan geçen bir kullanıcı
 * başkasının satırlarını görebiliyor mu? Çeviri testleri SQL'in doğru
 * üretildiğini gösteriyor, ama doğru SQL yanlış rolle çalıştırılırsa
 * izolasyon yine kaybolur. Burada gerçek jetonlar üretilip gerçek
 * veritabanına karşı koşuluyor.
 *
 * `TEST_DATABASE_URL` yoksa ATLANIR (bkz. `_pgrest.veritabani.test.ts`).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';

const ADRES = process.env.TEST_DATABASE_URL;
const calistir = ADRES ? describe : describe.skip;

calistir('veri uç noktası', () => {
  const havuz = new Pool({ connectionString: ADRES, max: 1 });

  let handler: (r: Request) => Promise<Response>;
  let erisimJetonuUret: (k: string) => string;
  let havuzuKapat: () => Promise<void>;

  const kullanici: { id: string; isletme: string; salon: string }[] = [];

  beforeAll(async () => {
    // Modüller ortam değişkenlerini yüklenirken okuyor.
    process.env.DATABASE_URL = ADRES;
    process.env.JWT_SECRET = 'test-icin-en-az-otuz-iki-karakterlik-bir-dize';
    vi.resetModules();

    ({ default: handler } = await import('./veri.js'));
    ({ erisimJetonuUret } = await import('./_kimlik.js'));
    ({ havuzuKapat } = await import('./_pg.js'));

    // İki ayrı sahip, iki ayrı işletme, her birinde bir salon.
    for (const ad of ['Bir', 'Iki']) {
      const { rows: k } = await havuz.query(
        'insert into auth.users (id, email, encrypted_password)'
        + " values (gen_random_uuid(), 'izolasyon-' || gen_random_uuid() || '@ornek.com', 'x')"
        + ' returning id',
      );
      const id = (k[0] as { id: string }).id;
      const { rows: b } = await havuz.query(
        'insert into public.businesses (owner_id, name) values ($1, $2) returning id',
        [id, `İzolasyon ${ad}`],
      );
      const isletme = (b[0] as { id: string }).id;
      await havuz.query(
        'update public.profiles set active_business_id = $1 where id = $2', [isletme, id],
      );
      const { rows: h } = await havuz.query(
        'insert into public.halls (business_id, name, capacity) values ($1, $2, 300) returning id',
        [isletme, `Salon ${ad}`],
      );
      kullanici.push({ id, isletme, salon: (h[0] as { id: string }).id });
    }
  });

  afterAll(async () => {
    await havuzuKapat();
    await havuz.end();
  });

  function cagir(yol: string, jeton?: string, ek: RequestInit = {}): Promise<Response> {
    const basliklar: Record<string, string> = {};
    if (jeton) basliklar.authorization = `Bearer ${jeton}`;
    return handler(new Request(`https://ornek.com${yol}`, {
      ...ek,
      headers: { ...basliklar, ...(ek.headers as Record<string, string> ?? {}) },
    }));
  }

  describe('kimlik kapısı', () => {
    it('jetonsuz istek 401 döner', async () => {
      const yanit = await cagir('/veri/halls');
      expect(yanit.status).toBe(401);
    });

    it('bozuk jetonla 401 döner', async () => {
      const yanit = await cagir('/veri/halls', 'kesinlikle.gecerli.degil');
      expect(yanit.status).toBe(401);
    });

    it('bilinmeyen yol 404 döner', async () => {
      const jeton = erisimJetonuUret(kullanici[0]!.id);
      expect((await cagir('/veri/a/b/c', jeton)).status).toBe(404);
    });
  });

  /*
    ASIL MESELE. Bu blok düşerse bir salonun cirosu başka bir salona
    görünüyor demektir; sistemin en pahalı hatası budur.
  */
  describe('kiracı izolasyonu', () => {
    it('kullanıcı yalnızca kendi salonunu görür', async () => {
      const jeton = erisimJetonuUret(kullanici[0]!.id);
      const yanit = await cagir('/veri/halls', jeton);
      expect(yanit.status).toBe(200);

      const satirlar = await yanit.json() as { id: string; name: string }[];
      const adlar = satirlar.map((s) => s.name);
      expect(adlar).toContain('Salon Bir');
      expect(adlar).not.toContain('Salon Iki');
    });

    it('başkasının satırını kimliğiyle sorsa da göremez', async () => {
      const jeton = erisimJetonuUret(kullanici[0]!.id);
      const yanit = await cagir(`/veri/halls?id=eq.${kullanici[1]!.salon}`, jeton);
      expect(await yanit.json()).toEqual([]);
    });

    it('başkasının satırını güncelleyemez', async () => {
      const jeton = erisimJetonuUret(kullanici[0]!.id);
      await cagir(`/veri/halls?id=eq.${kullanici[1]!.salon}`, jeton, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', prefer: 'return=representation' },
        body: JSON.stringify({ name: 'Ele geçirildi' }),
      });

      const { rows } = await havuz.query(
        'select name from public.halls where id = $1', [kullanici[1]!.salon],
      );
      expect((rows[0] as { name: string }).name).toBe('Salon Iki');
    });

    it('başkasının işletmesine satır ekleyemez', async () => {
      const jeton = erisimJetonuUret(kullanici[0]!.id);
      const yanit = await cagir('/veri/halls', jeton, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          business_id: kullanici[1]!.isletme, name: 'Sızan Salon', capacity: 100,
        }),
      });
      // RLS `with check` ihlali: kayıt açılmamalı.
      expect(yanit.status).toBeGreaterThanOrEqual(400);

      const { rows } = await havuz.query(
        "select count(*)::int as n from public.halls where name = 'Sızan Salon'",
      );
      expect((rows[0] as { n: number }).n).toBe(0);
    });
  });

  describe('sözleşme', () => {
    it('temsil istenmeyen yazmada 204 döner', async () => {
      const jeton = erisimJetonuUret(kullanici[0]!.id);
      const yanit = await cagir('/veri/halls', jeton, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          business_id: kullanici[0]!.isletme, name: 'Sessiz Salon', capacity: 80,
        }),
      });
      expect(yanit.status).toBe(204);
    });

    it('tek satır istenip birden çok dönerse hata verir', async () => {
      // Sessizce ilkini almak "iki satır döndü ama birini aldık"
      // yanlışına kapı aralardı.
      const jeton = erisimJetonuUret(kullanici[0]!.id);
      const yanit = await cagir(`/veri/halls?business_id=eq.${kullanici[0]!.isletme}`, jeton, {
        headers: { accept: 'application/vnd.pgrst.object+json' },
      });
      expect(yanit.status).toBe(406);
    });

    it('geçersiz tablo adını veritabanına hiç götürmez', async () => {
      const jeton = erisimJetonuUret(kullanici[0]!.id);
      const yanit = await cagir('/veri/halls;%20drop%20table%20users', jeton);
      expect(yanit.status).toBe(400);
      const govde = await yanit.json() as { message: string };
      expect(govde.message).toMatch(/Geçersiz ad/);
    });

    it('veritabanı hatasını olduğu gibi geçirir', async () => {
      // Depo katmanı SQLSTATE'e bakıp kullanıcıya anlamlı mesaj
      // üretiyor; genel bir "sunucu hatası" o ayrımı yok ederdi.
      const jeton = erisimJetonuUret(kullanici[0]!.id);
      const yanit = await cagir('/veri/halls', jeton, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ business_id: kullanici[0]!.isletme }),
      });
      expect(yanit.status).toBe(400);
      const govde = await yanit.json() as { code: string };
      expect(govde.code).toBeTruthy();
    });
  });
});
