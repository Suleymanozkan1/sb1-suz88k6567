-- =====================================================================
-- YÜKSELTME TESTİ, 2. ADIM: güncelleme SONRASI veri bozulmamış olmalı
--
-- 0024-0034 göçleri uygulandıktan sonra çalışır. Şartnamenin 36.
-- maddesindeki soruları tek tek sınıyor:
--
--   1. Eski rezervasyonlar duruyor mu, alanları değişti mi?
--   2. Sözleşme numaraları değişti mi? (0029 kuralı değiştirdi, ESKİ
--      KODLARA DOKUNMAMALI)
--   3. Eski ödemeler duruyor mu, tutarları değişti mi?
--   4. Kasa hesabı doğru mu? (tahsilat + gelir - gider)
--   5. Tipi bilinmeyen eski kayıtlara tip UYDURULDU mu? (uydurulmamalı)
--   6. Çelik kasa defteri düşerken rezervasyon/tahsilat gitti mi?
--   7. Fatura ve müşteri adayı duruyor mu?
--   8. Yeni alanlar eski satırlara güvenli varsayılanla geldi mi?
--   9. Yeni tablolar eski işletmeye de kuruldu mu? (şablon, durum)
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off

\echo '=== 1) Eski rezervasyonlar DEGISMEDEN duruyor ==='
do $$
declare r record; v_sayi integer;
begin
  select count(*) into v_sayi from public.reservations;
  if v_sayi <> 2 then
    raise exception 'BASARISIZ: rezervasyon sayisi degisti (%)', v_sayi;
  end if;

  select * into r from public.reservations where code = '2025-7';
  if r.customer_name <> 'Eski Çift Bir' then
    raise exception 'BASARISIZ: musteri adi degisti (%)', r.customer_name;
  end if;
  if r.total_amount <> 180000 or r.deposit <> 40000 then
    raise exception 'BASARISIZ: tutarlar degisti (% / %)', r.total_amount, r.deposit;
  end if;
  if r.date <> '2025-06-14'::date or r.guest_count <> 350 then
    raise exception 'BASARISIZ: tarih ya da davetli sayisi degisti';
  end if;
  if r.status::text <> 'Tamamlandı' then
    raise exception 'BASARISIZ: durum degisti (%)', r.status;
  end if;
end $$;

\echo '=== 2) Sozlesme numaralari DEGISMEDI ==='
do $$
declare v_sayi integer;
begin
  /*
    0029 sözleşme numarasını düğün yılına bağladı. Kural YALNIZCA YENİ
    kayıtlar için geçerli; var olan kodlar müşterinin elindeki
    sözleşmede yazılı ve değişirse iki belge birbirini tutmaz.
  */
  select count(*) into v_sayi from public.reservations
   where code in ('2025-7', '2026-3');
  if v_sayi <> 2 then
    raise exception 'BASARISIZ: eski sozlesme numaralari degismis';
  end if;
end $$;

\echo '=== 3) Eski odemeler DEGISMEDEN duruyor ==='
do $$
declare v_sayi integer; v_toplam numeric;
begin
  select count(*), coalesce(sum(amount), 0) into v_sayi, v_toplam from public.payments;
  if v_sayi <> 3 then
    raise exception 'BASARISIZ: tahsilat sayisi degisti (%)', v_sayi;
  end if;
  -- 60.000 + 80.000 + 25.000
  if v_toplam <> 165000 then
    raise exception 'BASARISIZ: tahsilat toplami degisti (%)', v_toplam;
  end if;
end $$;

\echo '=== 4) Kasa hesabi dogru ==='
do $$
declare v_tahsilat numeric; v_kapora numeric; v_gelir numeric; v_gider numeric; v_kasa numeric;
begin
  /*
    Tek gerçek veri kaynağı (madde 34): kasa, tahsilat + kapora + serbest
    gelir - gider'den TÜRETİLİYOR. cash_flow'a ayrıca rezervasyon geliri
    yazılmıyor; yazılsaydı aynı para iki kez sayılırdı.
  */
  select coalesce(sum(amount), 0) into v_tahsilat from public.payments;
  select coalesce(sum(deposit), 0) into v_kapora from public.reservations
   where status::text <> 'İptal';
  select coalesce(sum(amount), 0) into v_gelir from public.cash_flow where kind = 'Gelir';
  select coalesce(sum(amount), 0) into v_gider from public.cash_flow where kind = 'Gider';

  v_kasa := v_tahsilat + v_kapora + v_gelir - v_gider;
  -- 165.000 + 60.000 + 15.000 - 9.000
  if v_kasa <> 231000 then
    raise exception 'BASARISIZ: kasa bakiyesi % (beklenen 231000)', v_kasa;
  end if;

  -- Rezervasyon geliri cash_flow'a SIZMAMIS olmali.
  if exists (select 1 from public.cash_flow where reservation_id is not null) then
    raise exception 'BASARISIZ: rezervasyon geliri cash_flow''a yazilmis (cift sayim)';
  end if;
end $$;

\echo '=== 5) Tipi bilinmeyen eski kayitlara tip UYDURULMAMIS ==='
do $$
declare v_sayi integer;
begin
  /*
    0024 ödeme tipi kolonlarını NULL kabul ederek ekledi. Hepsine
    "Nakit" yazılsaydı kasa dağılımı uydurma bir rakam gösterirdi;
    ekranda bu satırlar "Belirtilmemiş" olarak toplanıyor.
  */
  -- `payments.method` eski şemada da zorunluydu; dokunulmamış olmalı.
  select count(*) into v_sayi from public.payments where method is null;
  if v_sayi <> 0 then
    raise exception 'BASARISIZ: tahsilat tipi bosaltilmis (%)', v_sayi;
  end if;

  select count(*) into v_sayi from public.reservations where deposit_method is null;
  if v_sayi <> 2 then
    raise exception 'BASARISIZ: eski kaporalara tip uydurulmus (%)', v_sayi;
  end if;

  select count(*) into v_sayi from public.cash_flow where method is null;
  if v_sayi <> 2 then
    raise exception 'BASARISIZ: eski gelir/gider satirlarina tip uydurulmus (%)', v_sayi;
  end if;
end $$;

\echo '=== 6) Celik kasa defteri dustu, veri gitmedi ==='
do $$ begin
  if to_regclass('public.safe_movements') is not null then
    raise exception 'BASARISIZ: safe_movements hala duruyor';
  end if;
  -- CASCADE kazasi: hareketi silen goc rezervasyonu da almis olabilirdi.
  if (select count(*) from public.reservations) <> 2 then
    raise exception 'BASARISIZ: celik kasa goculeri rezervasyon sildi';
  end if;
  if (select count(*) from public.payments) <> 3 then
    raise exception 'BASARISIZ: celik kasa goculeri tahsilat sildi';
  end if;
end $$;

\echo '=== 7) Fatura ve musteri adayi duruyor ==='
do $$
declare r record;
begin
  select * into r from public.invoices limit 1;
  if r is null then raise exception 'BASARISIZ: fatura kayboldu'; end if;
  if r.total_kurus <> 21600000 then
    raise exception 'BASARISIZ: fatura tutari degisti (%)', r.total_kurus;
  end if;
  if r.status::text <> 'gonderildi' then
    raise exception 'BASARISIZ: fatura durumu degisti (%)', r.status;
  end if;

  if (select count(*) from public.customer_leads) <> 1 then
    raise exception 'BASARISIZ: musteri adayi kayboldu';
  end if;
  if (select note from public.customer_leads limit 1) <> 'Eski not' then
    raise exception 'BASARISIZ: aday notu degisti';
  end if;
end $$;

\echo '=== 8) Yeni alanlar eski satirlara guvenli varsayilanla geldi ==='
do $$
declare r record;
begin
  select * into r from public.businesses limit 1;
  -- Boş string: "tanımlı değil" demek ve ilgili özellik kendiliğinden
  -- devre dışı kalıyor. Uydurma bir adres ya da konum yazılmamalı.
  if r.report_email <> '' or r.survey_email <> '' or r.weather_location <> '' then
    raise exception 'BASARISIZ: eski isletmeye uydurma adres/konum yazilmis';
  end if;
  if r.lock_seconds is null then
    raise exception 'BASARISIZ: ekran kilidi suresi bos kalmis';
  end if;

  -- Aday takip alanları: eski adayda boş olmalı, uydurma tarih olmamalı.
  if (select count(*) from public.customer_leads where next_followup_at is not null) <> 0 then
    raise exception 'BASARISIZ: eski adaya uydurma takip tarihi yazilmis';
  end if;
end $$;

\echo '=== 9) Yeni tablolar eski isletmeye de kuruldu ==='
do $$
declare v_sayi integer;
begin
  /*
    Göçlerin tohumladığı satırlar, GÖÇTEN ÖNCE açılmış işletmelere de
    gelmeli. Yalnızca tetikleyiciyle kurulsalardı eski salon bu
    özellikleri hiç göremezdi -- ekranlar boş açılır, sebebi de
    anlaşılmazdı.
  */
  select count(*) into v_sayi from public.payment_alerts;
  if v_sayi = 0 then
    raise exception 'BASARISIZ: eski isletmeye odeme bildirim kurallari gelmemis';
  end if;
  -- Hepsi KAPALI gelmeli: SMS ücretli, yönetici metni okumadan gitmemeli.
  if exists (select 1 from public.payment_alerts where enabled) then
    raise exception 'BASARISIZ: odeme bildirimleri acik geldi';
  end if;

  select count(*) into v_sayi from public.lead_statuses;
  if v_sayi = 0 then
    raise exception 'BASARISIZ: eski isletmeye aday durumlari gelmemis';
  end if;

  select count(*) into v_sayi from public.message_templates;
  if v_sayi = 0 then
    raise exception 'BASARISIZ: eski isletmeye hazir mesajlar gelmemis';
  end if;

  -- Ortak resmî tatiller herkes için: işletmeye bağlı değiller.
  select count(*) into v_sayi from public.special_days where business_id is null;
  if v_sayi = 0 then
    raise exception 'BASARISIZ: resmi tatiller tohumlanmamis';
  end if;
end $$;

\echo '=== 10) Aylik ozet eski veriyi dogru topluyor ==='
do $$
declare r record; v_biz uuid := '22222222-2222-2222-2222-222222222222';
begin
  -- Haziran 2025: bir organizasyon (2025-7), cirosu 180.000.
  select * into r from public.aylik_ozet(v_biz, '2025-06');
  if r.rezervasyon <> 1 then
    raise exception 'BASARISIZ: aylik ozet organizasyon sayisi % (beklenen 1)', r.rezervasyon;
  end if;
  if r.ciro <> 180000 then
    raise exception 'BASARISIZ: aylik ozet cirosu % (beklenen 180000)', r.ciro;
  end if;
  if r.davetli <> 350 then
    raise exception 'BASARISIZ: aylik ozet davetli sayisi % (beklenen 350)', r.davetli;
  end if;

  -- Kayıt olmayan ay sıfır dönmeli, hata değil.
  select * into r from public.aylik_ozet(v_biz, '2025-01');
  if r.rezervasyon <> 0 or r.ciro <> 0 then
    raise exception 'BASARISIZ: bos ay sifir donmedi';
  end if;
end $$;

\echo '=== YUKSELTME TESTI GECTI ==='
