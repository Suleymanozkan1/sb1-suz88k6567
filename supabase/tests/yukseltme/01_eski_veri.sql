-- =====================================================================
-- YÜKSELTME TESTİ, 1. ADIM: güncelleme ÖNCESİ sistemin verisi
--
-- Bu dosya YALNIZCA 0000-0023 göçleri uygulanmış bir veritabanında
-- çalışır; yani 36 maddelik güncelleme başlamadan önceki şema.
-- Amacı, gerçek bir salonun elindeki veriyi taklit etmek: geçmiş
-- rezervasyonlar, tahsilatlar, gelir/gider satırları, çelik kasa
-- hareketleri, faturalar ve müşteri adayları.
--
-- 2. adım (02_dogrula.sql) yeni göçler uygulandıktan sonra bu verinin
-- bozulmadığını sınıyor. Şartnamenin 36. maddesi tam olarak bunu
-- soruyor: "Eski rezervasyonlar bozuldu mu? Eski ödemeler bozuldu mu?
-- Kasa hesapları doğru mu?"
--
-- Testler TEMİZ bir veritabanında çalışıyor; burada yazılan rakamlar
-- 02_dogrula.sql içindeki beklenen değerlerle birebir eşleşmeli.
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off

do $$
declare
  v_owner uuid := '11111111-1111-1111-1111-111111111111';
  v_biz   uuid := '22222222-2222-2222-2222-222222222222';
  v_hall  uuid;
  v_r1    uuid;
  v_r2    uuid;
begin
  insert into auth.users (id, email) values (v_owner, 'eski-sahip@ornek.com');
  insert into public.businesses (id, owner_id, name, city, currency)
  values (v_biz, v_owner, 'Eski Salon', 'Ankara', 'TL');

  insert into public.halls (business_id, name, capacity)
  values (v_biz, 'Eski Ana Salon', 500) returning id into v_hall;

  -- İKİ FARKLI YILDA düğün: sözleşme numarası kuralı 0029'da düğün
  -- yılına bağlandı, eski kodların DEĞİŞMEDEN kalması gerekiyor.
  insert into public.reservations
    (business_id, hall_id, code, customer_name, customer_phone, customer_email,
     date, slot, organization_type, guest_count, total_amount, deposit, status)
  values
    (v_biz, v_hall, '2025-7', 'Eski Çift Bir', '5321110001', 'cift1@ornek.com',
     '2025-06-14', 'Gece', 'Düğün', 350, 180000, 40000, 'Tamamlandı'),
    (v_biz, v_hall, '2026-3', 'Eski Çift İki', '5321110002', null,
     '2026-08-22', 'Gündüz', 'Nişan', 200, 90000, 20000, 'Kesin Rezervasyon');

  select id into v_r1 from public.reservations where code = '2025-7';
  select id into v_r2 from public.reservations where code = '2026-3';

  /*
    Tahsilatlar. `payments.method` ESKİ ŞEMADA DA zorunluydu; tipi
    bilinmeyen satır yalnızca gelir/gider ve kaporada olabiliyor.
    Üç ayrı kanal seçildi: kasa dağılımının kanal başına doğru
    toplandığı 02_dogrula.sql'de sınanıyor.
  */
  insert into public.payments (reservation_id, date, amount, method, note)
  values
    (v_r1, '2025-05-01', 60000, 'Nakit', 'Ara ödeme'),
    (v_r1, '2025-06-10', 80000, 'Kredi Kartı', 'Kapanış'),
    (v_r2, '2026-07-01', 25000, 'Havale/EFT', 'Banka havalesi');

  -- Rezervasyon dışı gelir/gider: kasa hesabının diğer ayağı.
  insert into public.cash_flow (business_id, kind, date, category, amount, description)
  values
    (v_biz, 'Gelir', '2025-07-01', 'Kira geliri', 15000, 'Salon kirası'),
    (v_biz, 'Gider', '2025-07-05', 'Personel',    9000,  'Aylık ödeme');

  -- Çelik kasa hareketleri: 0024 bu tabloyu DÜŞÜRÜYOR. Satırların
  -- düşmesi beklenen davranış, ama rezervasyonu ve tahsilatı
  -- götürmemeli -- CASCADE kazası tam burada yakalanır.
  insert into public.safe_movements
    (business_id, date, direction, amount, source_kind, source_id, description)
  values (v_biz, '2025-05-01', 'Giriş', 60000, 'reservation', v_r1::text, 'Kasaya alındı');

  -- Müşteri adayı: 0028 bu tabloya alan ekliyor, 0023 durumları taşıyor.
  insert into public.customer_leads
    (business_id, name, phone, source, status, note)
  values (v_biz, 'Eski Aday', '5321110003', 'Telefon', 'yeni', 'Eski not');

  -- Fatura: 0031 ve 0032 fatura tablolarına dokunuyor.
  insert into public.invoices
    (business_id, reservation_id, invoice_number, kind, buyer_kind, buyer_name,
     buyer_tax_id, issue_date, currency,
     gross_kurus, base_kurus, vat_kurus, total_kurus, status)
  values (v_biz, v_r1, 'SHT2025000000001', 'e-Arsiv', 'bireysel', 'Eski Çift Bir',
          '11111111111', '2025-06-15', 'TRY',
          18000000, 18000000, 3600000, 21600000, 'gonderildi');
end $$;

\echo '=== Eski veri yazildi ==='
