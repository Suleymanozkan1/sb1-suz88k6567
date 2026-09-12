-- =====================================================================
-- Aylık rapor testi (0031, madde 24)
--
-- Sınanan davranışlar:
--   1. Alanlar ve kayıt tablosu kuruldu mu?
--   2. Aylık özet doğru mu sayıyor? (kapora dahil)
--   3. İptal edilmiş rezervasyon sayılıyor mu? (sayılmamalı)
--   4. Başka ayın kaydı karışıyor mu? (karışmamalı)
--   5. Aynı ayın raporu iki kez yazılabiliyor mu? (yazılmamalı)
--   6. Gönderim kaydı kullanıcı tarafından düzeltilebiliyor mu?
--      (düzeltilememeli)
--
-- İkinci madde önemli: kapora rezervasyon satırında durur, ödemeler
-- listesinde değil. Katılmazsa "tahsil edilen" salonun en büyük girişini
-- atlar ve rapor olduğundan küçük çıkar.
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off

\echo '=== 0) Test verisi ==='
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_biz   uuid;
  v_hall  uuid;
  v_rez   uuid;
begin
  insert into auth.users (id, email) values (v_owner, 'rapor-test@ornek.com');
  insert into public.businesses (owner_id, name, report_email)
  values (v_owner, 'Rapor Test Salonu', 'rapor@ornek.com')
  returning id into v_biz;
  insert into public.halls (business_id, name, capacity) values (v_biz, 'Kristal', 400)
    returning id into v_hall;

  -- Ağustos 2026: iki kayıt, biri iptal.
  insert into public.reservations
    (business_id, hall_id, customer_name, customer_phone, date, slot,
     organization_type, guest_count, total_amount, deposit)
  values (v_biz, v_hall, 'Agustos Dugun', '5330000031', '2026-08-15', 'Gece',
          'Düğün', 300, 200000, 50000)
  returning id into v_rez;

  insert into public.payments (reservation_id, date, amount, method)
  values (v_rez, '2026-08-20', 70000, 'Nakit');

  insert into public.reservation_expenses (business_id, reservation_id, kind, unit_count, unit_price)
  values (v_biz, v_rez, 'Garson', 10, 2000);

  insert into public.reservations
    (business_id, hall_id, customer_name, customer_phone, date, slot,
     organization_type, guest_count, total_amount, deposit, status)
  values (v_biz, v_hall, 'Iptal Dugun', '5330000032', '2026-08-22', 'Gündüz',
          'Düğün', 100, 90000, 10000, 'İptal');

  -- Eylül 2026: baska ayin kaydi, raporda gorunmemeli.
  insert into public.reservations
    (business_id, hall_id, customer_name, customer_phone, date, slot,
     organization_type, guest_count, total_amount, deposit)
  values (v_biz, v_hall, 'Eylul Dugun', '5330000033', '2026-09-05', 'Gece',
          'Düğün', 250, 150000, 30000);

  -- Gorusme kaydi: biri rezervasyona donmus.
  insert into public.customer_leads (business_id, name, phone, status, meeting_date, reservation_id)
  values (v_biz, 'Donen Musteri', '5330000034', 'yeni', '2026-08-10', v_rez);
  insert into public.customer_leads (business_id, name, phone, status, meeting_date)
  values (v_biz, 'Donmeyen Musteri', '5330000035', 'yeni', '2026-08-11');

  perform set_config('test.biz', v_biz::text, false);
end $$;

\echo '=== 1) Sema ==='
select
  to_regclass('public.monthly_report_log') as kayit,
  (select count(*) from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles' and column_name = 'monthly_report') as kullanici_ayari,
  (select count(*) from information_schema.columns
   where table_schema = 'public' and table_name = 'businesses' and column_name = 'report_email') as adres_alani;

\echo '=== 2) Aylik ozet ==='
do $$
declare r record;
begin
  select * into r from public.aylik_ozet(current_setting('test.biz')::uuid, '2026-08');

  -- Iptal edilen kayit sayilmamali.
  if r.rezervasyon <> 1 then
    raise exception 'BASARISIZ: rezervasyon sayisi % (beklenen 1)', r.rezervasyon;
  end if;
  if r.davetli <> 300 then
    raise exception 'BASARISIZ: davetli % (beklenen 300)', r.davetli;
  end if;
  if r.ciro <> 200000 then
    raise exception 'BASARISIZ: ciro % (beklenen 200000)', r.ciro;
  end if;
  -- Kapora 50.000 + tahsilat 70.000
  if r.tahsilat <> 120000 then
    raise exception 'BASARISIZ: tahsilat % (beklenen 120000)', r.tahsilat;
  end if;
  if r.kalan <> 80000 then
    raise exception 'BASARISIZ: kalan % (beklenen 80000)', r.kalan;
  end if;
  -- 10 garson x 2.000
  if r.gider <> 20000 then
    raise exception 'BASARISIZ: gider % (beklenen 20000)', r.gider;
  end if;
  if r.aday <> 2 or r.donusen <> 1 then
    raise exception 'BASARISIZ: aday %, donusen % (beklenen 2 / 1)', r.aday, r.donusen;
  end if;
end $$;

\echo '=== 3) Baska ay karismalimali ==='
do $$
declare r record;
begin
  select * into r from public.aylik_ozet(current_setting('test.biz')::uuid, '2026-09');
  if r.rezervasyon <> 1 or r.ciro <> 150000 then
    raise exception 'BASARISIZ: eylul ozeti % kayit / % ciro', r.rezervasyon, r.ciro;
  end if;
end $$;

\echo '=== 4) Ayni ayin raporu IKI KEZ yazilamamali ==='
do $$
declare v_biz uuid := current_setting('test.biz')::uuid;
begin
  insert into public.monthly_report_log (business_id, period, recipient, status)
  values (v_biz, '2026-08', 'rapor@ornek.com', 'gonderildi');

  begin
    insert into public.monthly_report_log (business_id, period, recipient, status)
    values (v_biz, '2026-08', 'rapor@ornek.com', 'gonderildi');
    raise exception 'BASARISIZ: ayni ayin raporu iki kez yazildi';
  exception when unique_violation then null;
  end;

  -- Gecersiz donem bicimi reddedilmeli.
  begin
    insert into public.monthly_report_log (business_id, period)
    values (v_biz, '2026/08');
    raise exception 'BASARISIZ: gecersiz donem kabul edildi';
  exception when check_violation then null;
  end;
end $$;

\echo '=== 5) Gonderim kaydi DUZELTILEMEZ olmali ==='
select
  has_table_privilege('authenticated', 'public.monthly_report_log', 'SELECT') as okur,
  has_table_privilege('authenticated', 'public.monthly_report_log', 'UPDATE') as yazar,
  has_table_privilege('service_role', 'public.monthly_report_log', 'INSERT')  as sunucu_yazar;

do $$ begin
  if not has_table_privilege('authenticated', 'public.monthly_report_log', 'SELECT') then
    raise exception 'BASARISIZ: kullanici gonderim kaydini okuyamiyor';
  end if;
  -- Duzeltilebilseydi "rapor gitti mi" sorusunun cevabi da degistirilebilirdi.
  if has_table_privilege('authenticated', 'public.monthly_report_log', 'UPDATE')
     or has_table_privilege('authenticated', 'public.monthly_report_log', 'INSERT') then
    raise exception 'BASARISIZ: gonderim kaydi duzeltilebiliyor';
  end if;
  if not has_table_privilege('service_role', 'public.monthly_report_log', 'INSERT') then
    raise exception 'BASARISIZ: gorev gonderim kaydi yazamiyor';
  end if;
end $$;

\echo '=== TEMIZLIK ==='
do $$ begin
  delete from public.businesses where id = current_setting('test.biz')::uuid;
  delete from auth.users where email = 'rapor-test@ornek.com';
end $$;

\echo '=== 22_aylik_rapor_test: TUM KONTROLLER GECTI ==='
