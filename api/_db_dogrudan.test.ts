/**
 * Doğrudan kip: PostgREST olmadan aynı sonucu veriyor mu?
 *
 * Bu dosyanın asıl sorusu ŞEKİL: PostgREST bir çağrıya dizi, ötekine tek
 * değer döndürüyor ve çağıran taraf buna göre yazılmış. Doğrudan kip
 * hepsini dizi (ya da hepsini tek değer) döndürseydi kod çökmezdi --
 * `check_rate_limit` dolu bir dizi gördüğü için her isteği "izinli"
 * sayardı ve hız sınırı SESSİZCE kalkardı. En pahalı hata türü bu.
 *
 * `TEST_DATABASE_URL` yoksa ATLANIR (bkz. `_pgrest.veritabani.test.ts`).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';

const ADRES = process.env.TEST_DATABASE_URL;
const calistir = ADRES ? describe : describe.skip;

calistir('doğrudan kip', () => {
  const havuz = new Pool({ connectionString: ADRES, max: 1 });

  let db: typeof import('./_db.js');
  let havuzuKapat: () => Promise<void>;

  let isletmeId = '';
  let sahipId = '';
  let eposta = '';

  beforeAll(async () => {
    process.env.DATABASE_URL = ADRES;
    process.env.JWT_SECRET = 'test-icin-en-az-otuz-iki-karakterlik-bir-dize';
    // PostgREST adresi VERİLMİYOR: kip seçimi tam olarak buna bakıyor.
    delete process.env.PGRST_URL;
    delete process.env.PGRST_FATURA_URL;
    vi.resetModules();

    db = await import('./_db.js');
    ({ havuzuKapat } = await import('./_pg.js'));

    eposta = `dogrudan-${crypto.randomUUID()}@ornek.com`;
    const { rows: k } = await havuz.query(
      'insert into auth.users (id, email, encrypted_password)'
      + " values (gen_random_uuid(), $1, 'x') returning id",
      [eposta],
    );
    sahipId = (k[0] as { id: string }).id;

    const { rows: b } = await havuz.query(
      'insert into public.businesses (owner_id, name) values ($1, $2) returning id',
      [sahipId, 'Doğrudan Kip Salonu'],
    );
    isletmeId = (b[0] as { id: string }).id;
  });

  afterAll(async () => {
    await havuzuKapat();
    await havuz.end();
  });

  /*
    ASIL MESELE. PostgREST'in yanıt ŞEKLİ taklit edilebiliyor mu?
  */
  describe('fonksiyon yanıt şekli', () => {
    it('tek değer döndüren fonksiyon dizi değil, değer döndürür', async () => {
      const sonuc = await db.callRpc<boolean>('check_rate_limit', {
        p_bucket: 'dogrudan-test',
        p_identifier: crypto.randomUUID(),
        p_limit: 2,
        p_window_seconds: 60,
      });
      expect(sonuc).toBe(true);
      expect(Array.isArray(sonuc)).toBe(false);
    });

    it('hız sınırı gerçekten sayıyor', async () => {
      // Şekil doğru ama değer hep `true` olsaydı yukarıdaki test yine
      // geçerdi; sınırın ÇALIŞTIĞI ayrıca gösteriliyor.
      const kimlik = crypto.randomUUID();
      const arguman = {
        p_bucket: 'dogrudan-sayac', p_identifier: kimlik, p_limit: 2, p_window_seconds: 60,
      };
      expect(await db.callRpc<boolean>('check_rate_limit', arguman)).toBe(true);
      expect(await db.callRpc<boolean>('check_rate_limit', arguman)).toBe(true);
      expect(await db.callRpc<boolean>('check_rate_limit', arguman)).toBe(false);
    });

    it('küme döndüren fonksiyon satır dizisi döndürür', async () => {
      const satirlar = await db.callRpc<{ id: string; encrypted_password: string }[]>(
        'kimlik_bul', { p_email: eposta },
      );
      expect(Array.isArray(satirlar)).toBe(true);
      expect(satirlar[0]?.id).toBe(sahipId);
    });

    it('jsonb döndüren fonksiyon nesne döndürür', async () => {
      const saglik = await db.callRpc<Record<string, unknown>>('system_health', {
        p_owner_id: sahipId,
      });
      expect(saglik).toBeTypeOf('object');
      expect(Array.isArray(saglik)).toBe(false);
    });

    it('varsayılan değerli parametre atlanabiliyor', async () => {
      // Argümanlar ADLA gidiyor; sırayla gitseydi bu çağrı düşerdi.
      const satirlar = await db.callRpc<unknown[]>('claim_sms_batch', {});
      expect(Array.isArray(satirlar)).toBe(true);
    });
  });

  /*
    `pg` sürücüsü bir JS dizisini varsayılan olarak Postgres dizi
    değişmezine çeviriyor. jsonb bekleyen parametrede bu ya hata verir
    ya da veriyi bozar; özel günler ve okul takvimi tam olarak böyle bir
    dizi gönderiyor.
  */
  describe('jsonb parametreler', () => {
    it('dizi jsonb olarak gider', async () => {
      const yil = 2099;
      const sayi = await db.callRpc<number>('ozel_gunleri_yaz', {
        p_yil: yil,
        p_gunler: [
          { day: `${yil}-04-23`, label: 'Doğrudan Kip Testi', kind: 'resmi_tatil' },
          { day: `${yil}-05-19`, label: 'İkinci Gün', kind: 'resmi_tatil', tentative: true },
        ],
      });
      expect(Number(sayi)).toBe(2);

      const { rows } = await havuz.query(
        "select label, tentative from public.special_days"
        + " where business_id is null and extract(year from day) = $1 order by day",
        [yil],
      );
      expect(rows).toHaveLength(2);
      expect((rows[0] as { label: string }).label).toBe('Doğrudan Kip Testi');
      expect((rows[1] as { tentative: boolean }).tentative).toBe(true);
    });

    it('jsonb olmayan parametreye dizi verilirse durur', async () => {
      await expect(db.callRpc('kimlik_bul', { p_email: ['a', 'b'] }))
        .rejects.toThrow(/dizi değil/);
    });
  });

  describe('tablo işlemleri', () => {
    it('okuma: süzgeç, seçim ve sıralama birlikte çalışır', async () => {
      const satirlar = await db.selectRows<{ id: string; name: string }>(
        `businesses?select=id,name&id=eq.${isletmeId}`,
      );
      expect(satirlar).toHaveLength(1);
      expect(satirlar[0]!.name).toBe('Doğrudan Kip Salonu');
    });

    it('okuma: aynı sütuna iki süzgeç de uygulanır', async () => {
      // `customer_email=not.is.null&customer_email=neq.` (api/anket.ts)
      // bunu kullanıyor: sözlük yerine giriş listesi okunmalı.
      const satirlar = await db.selectRows<{ id: string }>(
        `businesses?select=id&id=eq.${isletmeId}&name=neq.Doğrudan Kip Salonu`,
      );
      expect(satirlar).toHaveLength(0);
    });

    it('okuma: tırnaksız in listesi çalışır', async () => {
      const satirlar = await db.selectRows<{ id: string }>(
        `businesses?select=id&id=in.(${isletmeId})`,
      );
      expect(satirlar).toHaveLength(1);
    });

    it('ekleme eklenen satırı döndürür', async () => {
      const salon = await db.insertRow<{ id: string; name: string }>('halls', {
        business_id: isletmeId, name: 'Doğrudan Salon', capacity: 120,
      });
      expect(salon.name).toBe('Doğrudan Salon');
      expect(salon.id).toBeTruthy();
    });

    it('güncelleme yalnızca süzgece uyan satıra gider', async () => {
      const salon = await db.insertRow<{ id: string }>('halls', {
        business_id: isletmeId, name: 'Güncellenecek Salon', capacity: 30,
      });
      await db.patchRows(`halls?id=eq.${salon.id}`, { capacity: 44 });

      const { rows } = await havuz.query(
        'select capacity from public.halls where id = $1', [salon.id],
      );
      expect(Number((rows[0] as { capacity: number }).capacity)).toBe(44);
    });

    it('toplu yazma aynı kaydı ikinci kez açmaz', async () => {
      const gun = '2099-07-07';
      const satir = {
        business_id: isletmeId, day: gun, min_c: 10, max_c: 20, summary: 'Açık', icon: 'gunesli',
      };
      await db.upsertRows('weather_forecasts', [satir], 'business_id,day');
      await db.upsertRows(
        'weather_forecasts', [{ ...satir, max_c: 31 }], 'business_id,day',
      );

      const { rows } = await havuz.query(
        'select max_c from public.weather_forecasts where business_id = $1 and day = $2',
        [isletmeId, gun],
      );
      expect(rows).toHaveLength(1);
      expect(Number((rows[0] as { max_c: number }).max_c)).toBe(31);
    });

    it('boş listede hiç sorgu çalıştırmaz', async () => {
      await expect(db.upsertRows('weather_forecasts', [], 'business_id,day'))
        .resolves.toBeUndefined();
    });
  });

  describe('kip seçimi', () => {
    it('PGRST_URL verilince PostgREST kipine döner', async () => {
      // Kendi sunucumuzdaki kurulum bu değişikliğe rağmen eskisi gibi
      // çalışmalı: adres verilmişse doğrudan kip DEVREYE GİRMEMELİ.
      process.env.PGRST_URL = 'http://127.0.0.1:59999';
      try {
        await expect(db.selectRows('businesses?select=id')).rejects.toThrow();
      } finally {
        delete process.env.PGRST_URL;
      }
    });

    it('fatura bölmesi doğrudan kipte sessizce yok sayılmaz', async () => {
      vi.resetModules();
      process.env.PGRST_FATURA_URL = 'http://127.0.0.1:3001';
      try {
        const ikinci = await import('./_db.js');
        expect(() => ikinci.faturaBolmesiVar()).toThrow(/tek veritabanı/);
      } finally {
        delete process.env.PGRST_FATURA_URL;
        vi.resetModules();
      }
    });
  });
});
