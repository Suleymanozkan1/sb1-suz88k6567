/**
 * Çevirinin ürettiği SQL'i GERÇEK PostgreSQL'e çalıştırır.
 *
 * `_pgrest.test.ts` metni sınıyor; metin doğru görünüp veritabanı
 * tarafından reddedilebilir (takma ad sözdizimi, `json_agg` çıktısının
 * biçimi, `on conflict` hedefinin gerçekten benzersiz olması...). O
 * yüzden bu dosya şemanın tamamı kurulu bir veritabanına bağlanıyor.
 *
 * `TEST_DATABASE_URL` tanımlı değilse testler ATLANIR: katkı verenin
 * makinesinde veritabanı olmayabilir ve kırmızı bir paket, gerçek
 * hatayı gölgede bırakır. CI'da tanımlanınca kendiliğinden çalışır.
 *
 * Şema kurulumu:
 *   for f in supabase/migrations/*.sql; do psql -d sahra -f "$f"; done
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { cevir, type Istek } from './_pgrest';

const ADRES = process.env.TEST_DATABASE_URL;
const calistir = ADRES ? describe : describe.skip;

function istek(kismi: Partial<Istek> & { tablo: string }): Istek {
  return {
    yontem: 'GET',
    parametreler: new URLSearchParams(),
    temsilDondur: false,
    cakismaCozumu: false,
    ...kismi,
  };
}

calistir('gerçek veritabanına karşı çeviri', () => {
  const havuz = new Pool({ connectionString: ADRES, max: 1 });

  /** Çeviriyi yapıp çalıştırır; SQL kabul edilmezse test burada düşer. */
  async function sor(i: Istek): Promise<Record<string, unknown>[]> {
    const { metin, degerler } = cevir(i);
    const { rows } = await havuz.query(metin, degerler);
    return rows as Record<string, unknown>[];
  }

  let isletmeId = '';
  let salonId = '';
  let rezervasyonId = '';

  beforeAll(async () => {
    /*
      Testin kendi verisi. Tablo sahibi olarak bağlanıldığı için RLS
      araya girmiyor -- burada sınanan izolasyon değil, SQL'in
      GEÇERLİLİĞİ. İzolasyonu SQL test paketleri sınıyor.
    */
    // E-posta benzersiz: test aynı veritabanında ikinci kez koşulabilmeli.
    const { rows: kul } = await havuz.query(
      'insert into auth.users (id, email, encrypted_password)'
      + " values (gen_random_uuid(), 'cevrim-' || gen_random_uuid() || '@ornek.com', 'x')"
      + ' returning id',
    );
    const sahip = (kul[0] as { id: string }).id;

    const { rows: isl } = await havuz.query(
      'insert into public.businesses (owner_id, name) values ($1, $2) returning id',
      [sahip, 'Çevrim Testi Salonu'],
    );
    isletmeId = (isl[0] as { id: string }).id;

    const { rows: sal } = await havuz.query(
      'insert into public.halls (business_id, name, capacity) values ($1, $2, $3) returning id',
      [isletmeId, 'Kristal', 400],
    );
    salonId = (sal[0] as { id: string }).id;

    const { rows: rez } = await havuz.query(
      'insert into public.reservations '
      + '(business_id, hall_id, customer_name, customer_phone, date, slot,'
      + ' organization_type, guest_count, total_amount, status)'
      + " values ($1, $2, 'Test Çifti', '5321110000', current_date, 'Gece', 'Düğün',"
      + " 200, 150000, 'Kesin Rezervasyon')"
      + ' returning id',
      [isletmeId, salonId],
    );
    rezervasyonId = (rez[0] as { id: string }).id;
  });

  afterAll(async () => { await havuz.end(); });

  it('basit okuma çalışır', async () => {
    const satirlar = await sor(istek({
      tablo: 'halls',
      parametreler: new URLSearchParams(`business_id=eq.${isletmeId}&name=eq.Kristal`),
    }));
    /*
      Ada göre süzülüyor: işletme açılınca tetikleyici "Ana Salon"u
      kendiliğinden ekliyor, yani salon sayısı hiçbir zaman yalnızca
      testin eklediği kadar değil.
    */
    expect(satirlar).toHaveLength(1);
    expect(satirlar[0]!.name).toBe('Kristal');
  });

  it('seçilen sütun, sıralama ve sınır birlikte çalışır', async () => {
    const satirlar = await sor(istek({
      tablo: 'halls',
      parametreler: new URLSearchParams(
        `select=id,name&business_id=eq.${isletmeId}&name=eq.Kristal&order=name.asc&limit=5`,
      ),
    }));
    expect(Object.keys(satirlar[0]!).sort()).toEqual(['id', 'name']);
  });

  it('is null süzgeci geçerli SQL üretir', async () => {
    await expect(sor(istek({
      tablo: 'reservations',
      parametreler: new URLSearchParams('start_time=is.null'),
    }))).resolves.toBeInstanceOf(Array);
  });

  it('in listesi çalışır', async () => {
    const satirlar = await sor(istek({
      tablo: 'halls',
      parametreler: new URLSearchParams(`id=in.("${salonId}")`),
    }));
    expect(satirlar).toHaveLength(1);
  });

  /*
    ASIL RİSKLİ İKİ SORGU. Metin testi bunların Postgres tarafından
    kabul edildiğini gösteremezdi.
  */
  it('!inner join ile tahsilatları işletmeye göre süzer', async () => {
    await havuz.query(
      "insert into public.payments (reservation_id, date, amount, method)"
      + " values ($1, current_date, 5000, 'Nakit')",
      [rezervasyonId],
    );

    const satirlar = await sor(istek({
      tablo: 'payments',
      parametreler: new URLSearchParams(
        `select=*, reservations!inner(business_id)&reservations.business_id=eq.${isletmeId}`,
      ),
    }));
    expect(satirlar).toHaveLength(1);
    // Join yalnızca SÜZÜYOR; rezervasyon sütunları sonuca karışmamalı.
    expect(satirlar[0]).not.toHaveProperty('business_id');
    expect(Number(satirlar[0]!.amount)).toBe(5000);
  });

  it('gömülü fatura kalemlerini json dizisi olarak döndürür', async () => {
    const { rows: fat } = await havuz.query(
      'insert into public.invoices'
      + ' (business_id, invoice_number, buyer_name, issue_date, kind, status)'
      + " values ($1, 'TST' || lpad((random() * 1e13)::bigint::text, 13, '0'), 'Alıcı',"
      + " current_date, 'e-Arsiv', 'taslak') returning id",
      [isletmeId],
    );
    const faturaId = (fat[0] as { id: string }).id;
    await havuz.query(
      'insert into public.invoice_lines (invoice_id, line_no, description, quantity, unit,'
      + ' unit_price_kurus, vat_rate, gross_kurus, base_kurus, vat_kurus, total_kurus)'
      + " values ($1, 1, 'Menü', 100, 'Kişi', 45000, 20, 4500000, 4500000, 900000, 5400000)",
      [faturaId],
    );

    const satirlar = await sor(istek({
      tablo: 'invoices',
      parametreler: new URLSearchParams(`select=*, invoice_lines(*)&id=eq.${faturaId}`),
    }));
    expect(satirlar).toHaveLength(1);
    const kalemler = satirlar[0]!.invoice_lines as Record<string, unknown>[];
    expect(Array.isArray(kalemler)).toBe(true);
    expect(kalemler).toHaveLength(1);
    // Sütun adları korunmalı: json_agg whole-row referansı f1/f2 üretirse
    // ekran alanları okuyamaz.
    expect(kalemler[0]!.description).toBe('Menü');
    expect(Number(kalemler[0]!.line_no)).toBe(1);
  });

  it('kalemi olmayan faturada boş dizi döner, null değil', async () => {
    const { rows: fat } = await havuz.query(
      'insert into public.invoices'
      + ' (business_id, invoice_number, buyer_name, issue_date, kind, status)'
      + " values ($1, 'TST' || lpad((random() * 1e13)::bigint::text, 13, '0'), 'Kalemsiz',"
      + " current_date, 'e-Arsiv', 'taslak') returning id",
      [isletmeId],
    );
    const satirlar = await sor(istek({
      tablo: 'invoices',
      parametreler: new URLSearchParams(
        `select=*, invoice_lines(*)&id=eq.${(fat[0] as { id: string }).id}`,
      ),
    }));
    expect(satirlar[0]!.invoice_lines).toEqual([]);
  });

  it('ekleme ve temsil döndürme çalışır', async () => {
    const satirlar = await sor(istek({
      yontem: 'POST', tablo: 'halls', temsilDondur: true,
      govde: { business_id: isletmeId, name: 'Zümrüt', capacity: 250 },
    }));
    expect(satirlar).toHaveLength(1);
    expect(satirlar[0]!.name).toBe('Zümrüt');
  });

  it('upsert aynı kaydı ikinci kez açmaz, günceller', async () => {
    const { rows } = await havuz.query(
      'insert into public.halls (business_id, name, capacity) values ($1, $2, $3) returning id',
      [isletmeId, 'Upsert Salonu', 100],
    );
    const id = (rows[0] as { id: string }).id;

    await sor(istek({
      yontem: 'POST', tablo: 'halls', cakismaCozumu: true, temsilDondur: true,
      govde: { id, business_id: isletmeId, name: 'Upsert Salonu', capacity: 999 },
    }));

    const { rows: sonra } = await havuz.query(
      'select capacity, count(*) over () as adet from public.halls where id = $1', [id],
    );
    expect(sonra).toHaveLength(1);
    expect(Number((sonra[0] as { capacity: number }).capacity)).toBe(999);
  });

  it('güncellemede süzgeç ve atama doğru satıra gider', async () => {
    const { rows } = await havuz.query(
      'insert into public.halls (business_id, name, capacity) values ($1, $2, $3) returning id',
      [isletmeId, 'Güncellenecek', 50],
    );
    const id = (rows[0] as { id: string }).id;

    const donen = await sor(istek({
      yontem: 'PATCH', tablo: 'halls', temsilDondur: true,
      parametreler: new URLSearchParams(`id=eq.${id}`),
      govde: { name: 'Güncellendi', capacity: 77 },
    }));
    expect(donen).toHaveLength(1);
    expect(donen[0]!.name).toBe('Güncellendi');
    expect(Number(donen[0]!.capacity)).toBe(77);
  });

  it('silme yalnızca süzgece uyan satırı siler', async () => {
    const { rows } = await havuz.query(
      'insert into public.halls (business_id, name, capacity) values ($1, $2, $3) returning id',
      [isletmeId, 'Silinecek', 10],
    );
    const id = (rows[0] as { id: string }).id;
    const oncekiSayi = (await havuz.query(
      'select count(*)::int as n from public.halls where business_id = $1', [isletmeId],
    )).rows[0] as { n: number };

    await sor(istek({
      yontem: 'DELETE', tablo: 'halls',
      parametreler: new URLSearchParams(`id=eq.${id}`),
    }));

    const sonrakiSayi = (await havuz.query(
      'select count(*)::int as n from public.halls where business_id = $1', [isletmeId],
    )).rows[0] as { n: number };
    expect(sonrakiSayi.n).toBe(oncekiSayi.n - 1);
  });
});
