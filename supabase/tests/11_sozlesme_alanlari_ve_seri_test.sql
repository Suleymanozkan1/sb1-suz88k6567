-- =====================================================================
-- Sözleşme alanları ve sıralı numara testi (0014)
--
-- Sınanan davranışlar:
--   1. Dört yeni sütun eklendi mi, hepsi isteğe bağlı mı?
--   2. TC kimlik numarası biçim kontrolü tutuyor mu?
--   3. Kod boş gönderilince veritabanı sıradaki numarayı atıyor mu?
--   4. Numara sayısal ilerliyor mu (20269 sonrası 202610)?
--   5. Mevcut bir kaydın numarası güncellemede korunuyor mu?
--   6. Eski biçimli kodlar (SA-2026-4821) diziyi geriye çekiyor mu?
--   7. Kimlik numarası herkese açık kod sorgulamasına sızıyor mu?
--
-- Üçüncü madde asıl sebep: numarayı istemci üretseydi panel ile mobil
-- uygulama aynı numarayı iki kayda verebilirdi.
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off

\echo '=== 0) Test verisi ==='
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_biz   uuid;
  v_hall  uuid;
begin
  insert into auth.users (id, email) values (v_owner, 'seri-test@ornek.com');

  insert into public.businesses (owner_id, name, category, city, district, phone, capacity, currency)
  values (v_owner, 'Seri Test Salonu', 'Düğün Salonu', 'İstanbul', 'Beylikdüzü', '5320000000', 500, 'TL')
  returning id into v_biz;

  insert into public.halls (business_id, name, capacity)
  values (v_biz, 'Seri Test Ana Salon', 400)
  returning id into v_hall;

  -- Sonraki bloklar bu kimlikleri okusun.
  perform set_config('test.owner', v_owner::text, false);
  perform set_config('test.biz', v_biz::text, false);
  perform set_config('test.hall', v_hall::text, false);
end $$;

\echo '=== 1) Dort yeni sutun VAR ve hepsi ISTEGE BAGLI olmali ==='
select column_name, is_nullable, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'reservations'
  and column_name in ('start_time', 'end_time', 'identity_no', 'second_phone')
order by column_name;

do $$
declare v_adet int;
begin
  select count(*) into v_adet
  from information_schema.columns
  where table_schema = 'public' and table_name = 'reservations'
    and column_name in ('start_time', 'end_time', 'identity_no', 'second_phone')
    and is_nullable = 'YES';
  if v_adet <> 4 then
    raise exception 'BASARISIZ: dort sutunun hepsi istege bagli degil (%)', v_adet;
  end if;
end $$;

\echo '=== 2) Hatali TC kimlik numarasi REDDEDILMELI ==='
do $$
declare v_hata boolean := false;
begin
  begin
    insert into public.reservations
      (business_id, hall_id, code, customer_name, customer_phone, date, slot,
       organization_type, guest_count, total_amount, identity_no)
    values (current_setting('test.biz')::uuid, current_setting('test.hall')::uuid,
            'TC-HATA', 'Hatali Kimlik', '5330000000', date '2030-01-05', 'Gece',
            'Düğün', 100, 1000, '123');
  exception when check_violation then
    v_hata := true;
  end;
  if not v_hata then
    raise exception 'BASARISIZ: 3 haneli kimlik numarasi kabul edildi';
  end if;
end $$;

\echo '=== 3) Kod bos gonderilince VERITABANI atamali ==='
do $$
declare
  v_kod text;
  v_yil text := extract(year from current_date)::text;
begin
  insert into public.reservations
    (business_id, hall_id, code, customer_name, customer_phone, date, slot,
     organization_type, guest_count, total_amount, identity_no, second_phone,
     start_time, end_time)
  values (current_setting('test.biz')::uuid, current_setting('test.hall')::uuid,
          null, 'Birinci Kayit', '5330000001', date '2030-01-05', 'Gece',
          'Düğün', 300, 100000, '12345678901', '5331111111', time '19:00', time '23:00')
  returning code into v_kod;

  if v_kod <> v_yil || '1' then
    raise exception 'BASARISIZ: ilk numara % olmali, % geldi', v_yil || '1', v_kod;
  end if;

  insert into public.reservations
    (business_id, hall_id, code, customer_name, customer_phone, date, slot,
     organization_type, guest_count, total_amount)
  values (current_setting('test.biz')::uuid, current_setting('test.hall')::uuid,
          '', 'Ikinci Kayit', '5330000002', date '2030-01-06', 'Gece',
          'Düğün', 200, 50000)
  returning code into v_kod;

  if v_kod <> v_yil || '2' then
    raise exception 'BASARISIZ: ikinci numara % olmali, % geldi', v_yil || '2', v_kod;
  end if;
end $$;

\echo '=== 4) Sira SAYISAL ilerlemeli: 9 sonrasi 10 ==='
do $$
declare
  v_yil text := extract(year from current_date)::text;
  v_kod text;
begin
  -- Sayaci dokuza çek.
  update public.contract_series set last_number = 9
  where business_id = current_setting('test.biz')::uuid
    and year = extract(year from current_date)::int;

  insert into public.reservations
    (business_id, hall_id, code, customer_name, customer_phone, date, slot,
     organization_type, guest_count, total_amount)
  values (current_setting('test.biz')::uuid, current_setting('test.hall')::uuid,
          null, 'Onuncu Kayit', '5330000010', date '2030-02-05', 'Gece',
          'Düğün', 100, 1000)
  returning code into v_kod;

  -- Metin siralamasi "202610" < "20269" der; sayiya cevrilmezse dizi burada takilir.
  if v_kod <> v_yil || '10' then
    raise exception 'BASARISIZ: onuncu numara % olmali, % geldi', v_yil || '10', v_kod;
  end if;
end $$;

\echo '=== 5) Mevcut kaydin numarasi GUNCELLEMEDE korunmali ==='
do $$
declare
  v_id  uuid;
  v_eski text;
  v_yeni text;
begin
  select id, code into v_id, v_eski
  from public.reservations
  where business_id = current_setting('test.biz')::uuid and customer_name = 'Birinci Kayit';

  -- Kod alani bos gonderilse bile eski numara yerinde kalmali: basilmis
  -- sozlesmenin ustundeki numara ile kayit arasindaki bag kopmamali.
  update public.reservations set code = null, guest_count = 320 where id = v_id;
  select code into v_yeni from public.reservations where id = v_id;

  if v_yeni is distinct from v_eski then
    raise exception 'BASARISIZ: numara guncellemede degisti (% -> %)', v_eski, v_yeni;
  end if;
end $$;

\echo '=== 6) Eski bicimli kod diziyi GERIYE CEKMEMELI ==='
do $$
declare
  v_yil text := extract(year from current_date)::text;
  v_kod text;
begin
  insert into public.reservations
    (business_id, hall_id, code, customer_name, customer_phone, date, slot,
     organization_type, guest_count, total_amount)
  values (current_setting('test.biz')::uuid, current_setting('test.hall')::uuid,
          'SA-2026-4821', 'Eski Bicim', '5330000099', date '2030-03-05', 'Gece',
          'Düğün', 100, 1000);

  insert into public.reservations
    (business_id, hall_id, code, customer_name, customer_phone, date, slot,
     organization_type, guest_count, total_amount)
  values (current_setting('test.biz')::uuid, current_setting('test.hall')::uuid,
          null, 'Eski Bicimden Sonra', '5330000098', date '2030-04-05', 'Gece',
          'Düğün', 100, 1000)
  returning code into v_kod;

  if v_kod <> v_yil || '11' then
    raise exception 'BASARISIZ: eski bicimli kod diziyi bozdu, % geldi', v_kod;
  end if;
end $$;

\echo '=== 7) Kimlik numarasi HERKESE ACIK sorguya SIZMAMALI ==='
select
  not exists (
    select 1
    from information_schema.routines r
    where r.routine_schema = 'public'
      and r.routine_name = 'verify_reservation_code'
      and r.routine_definition ilike '%identity_no%'
  ) as kimlik_numarasi_sizmiyor;

do $$ begin
  if exists (
    select 1 from information_schema.routines r
    where r.routine_schema = 'public'
      and r.routine_name = 'verify_reservation_code'
      and r.routine_definition ilike '%identity_no%'
  ) then
    raise exception 'BASARISIZ: kimlik numarasi kod dogrulama ciktisinda';
  end if;
end $$;

\echo '=== 8) Sayac tablosu yazmaya KAPALI olmali ==='
select
  has_table_privilege('authenticated', 'public.contract_series', 'SELECT') as okuyabilir,
  has_table_privilege('authenticated', 'public.contract_series', 'INSERT') as yazabilir,
  has_table_privilege('authenticated', 'public.contract_series', 'UPDATE') as guncelleyebilir;

do $$ begin
  if has_table_privilege('authenticated', 'public.contract_series', 'INSERT')
     or has_table_privilege('authenticated', 'public.contract_series', 'UPDATE')
     or has_table_privilege('authenticated', 'public.contract_series', 'DELETE') then
    raise exception 'BASARISIZ: sayac elle degistirilebiliyor; numaralar tekrar eder';
  end if;
end $$;

\echo '=== 9) Temizlik ==='
do $$
declare v_owner uuid := current_setting('test.owner')::uuid;
begin
  delete from public.businesses where owner_id = v_owner;
  delete from auth.users where id = v_owner;
end $$;

\echo '=== TUM SOZLESME SERISI TESTLERI GECTI ==='
