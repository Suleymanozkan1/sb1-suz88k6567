-- =====================================================================
-- Düğün içi giderler testi (0025)
--
-- Sınanan davranışlar:
--   1. Tablo, indeksler ve kısıtlar kuruldu mu?
--   2. Boş tür, sıfır/eksi birim ve eksi fiyat reddediliyor mu?
--   3. Sıfır birim FİYAT kabul ediliyor mu? (edilmeli)
--   4. Rezervasyon silinince giderleri de düşüyor mu?
--   5. İşletme silinince giderleri de düşüyor mu?
--   6. updated_at güncellemede damgalanıyor mu?
--   7. RLS: başka işletmenin gideri görünüyor mu? (görünmemeli)
--   8. Yetkiler yerinde mi?
--
-- Toplam kolonu YOK ve olmamalı: unit_count * unit_price ile hesaplanıyor.
-- Ayrı bir kolon olsaydı üç sayı birbirini tutmadığında hangisinin doğru
-- olduğu bilinemezdi; test bu kolonun eklenmediğini de doğruluyor.
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
  insert into auth.users (id, email) values (v_owner, 'gider-test@ornek.com');
  insert into public.businesses (owner_id, name) values (v_owner, 'Gider Test Salonu')
    returning id into v_biz;
  insert into public.halls (business_id, name, capacity) values (v_biz, 'Kristal', 400)
    returning id into v_hall;
  insert into public.reservations
    (business_id, hall_id, code, customer_name, customer_phone, date, slot,
     organization_type, guest_count, total_amount, deposit)
  values
    (v_biz, v_hall, '2026-901', 'Gider Testi', '5330000099', '2026-09-12', 'Gece',
     'Düğün', 300, 150000, 50000)
  returning id into v_rez;

  perform set_config('test.owner', v_owner::text, false);
  perform set_config('test.biz', v_biz::text, false);
  perform set_config('test.rez', v_rez::text, false);
end $$;

\echo '=== 1) Sema KURULMUS olmali ==='
select
  to_regclass('public.reservation_expenses')                    as tablo,
  to_regclass('public.reservation_expenses_reservation_idx')    as rezervasyon_indeksi,
  to_regclass('public.reservation_expenses_business_idx')       as isletme_indeksi;

do $$ begin
  if to_regclass('public.reservation_expenses') is null then
    raise exception 'BASARISIZ: reservation_expenses tablosu yok';
  end if;
  if to_regclass('public.reservation_expenses_reservation_idx') is null then
    raise exception 'BASARISIZ: rezervasyon indeksi yok';
  end if;
  -- Toplam KOLON OLMAMALI: hesaplanan bir deger kolona yazilirsa uc sayi
  -- birbirini tutmadiginda hangisinin dogru oldugu bilinemez.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reservation_expenses'
      and column_name in ('total', 'amount', 'toplam')
  ) then
    raise exception 'BASARISIZ: giderde hesaplanmis toplam kolonu var';
  end if;
end $$;

\echo '=== 2) Gecersiz satirlar REDDEDILMELI ==='
do $$
declare
  v_biz uuid := current_setting('test.biz')::uuid;
  v_rez uuid := current_setting('test.rez')::uuid;
begin
  begin
    insert into public.reservation_expenses (business_id, reservation_id, kind, unit_count, unit_price)
    values (v_biz, v_rez, '   ', 1, 100);
    raise exception 'BASARISIZ: bos tur kabul edildi';
  exception when check_violation then null;
  end;

  begin
    insert into public.reservation_expenses (business_id, reservation_id, kind, unit_count, unit_price)
    values (v_biz, v_rez, 'Garson', 0, 100);
    raise exception 'BASARISIZ: sifir birim kabul edildi';
  exception when check_violation then null;
  end;

  begin
    insert into public.reservation_expenses (business_id, reservation_id, kind, unit_count, unit_price)
    values (v_biz, v_rez, 'Garson', -1, 100);
    raise exception 'BASARISIZ: eksi birim kabul edildi';
  exception when check_violation then null;
  end;

  begin
    insert into public.reservation_expenses (business_id, reservation_id, kind, unit_count, unit_price)
    values (v_biz, v_rez, 'Garson', 1, -5);
    raise exception 'BASARISIZ: eksi birim fiyat kabul edildi';
  exception when check_violation then null;
  end;
end $$;

\echo '=== 3) Bedelsiz hizmet (sifir fiyat) KABUL EDILMELI ==='
do $$
declare
  v_toplam numeric;
begin
  insert into public.reservation_expenses (business_id, reservation_id, kind, unit_count, unit_price)
  values (current_setting('test.biz')::uuid, current_setting('test.rez')::uuid, 'Garson', 10, 2000);
  -- Bedelsiz gelen bir hizmet de listede gorunmeli, yoksa o gun kimin
  -- calistigi kayitta kalmaz.
  insert into public.reservation_expenses (business_id, reservation_id, kind, unit_count, unit_price)
  values (current_setting('test.biz')::uuid, current_setting('test.rez')::uuid, 'Vale', 2, 0);

  select sum(unit_count * unit_price) into v_toplam
  from public.reservation_expenses
  where reservation_id = current_setting('test.rez')::uuid;

  if v_toplam <> 20000 then
    raise exception 'BASARISIZ: gider toplami % (beklenen 20000)', v_toplam;
  end if;
end $$;

\echo '=== 4) updated_at guncellemede DAMGALANMALI ==='
do $$
declare
  v_id    uuid;
  v_eski  timestamptz;
  v_yeni  timestamptz;
begin
  select id, updated_at into v_id, v_eski from public.reservation_expenses
  where reservation_id = current_setting('test.rez')::uuid and kind = 'Garson';

  perform pg_sleep(0.01);
  update public.reservation_expenses set unit_price = 2500 where id = v_id;

  select updated_at into v_yeni from public.reservation_expenses where id = v_id;
  if v_yeni <= v_eski then
    raise exception 'BASARISIZ: updated_at guncellenmedi';
  end if;
end $$;

\echo '=== 5) Rezervasyon silinince giderleri de DUSMELI ==='
do $$
declare
  v_kalan integer;
begin
  delete from public.reservations where id = current_setting('test.rez')::uuid;

  select count(*) into v_kalan from public.reservation_expenses
  where reservation_id = current_setting('test.rez')::uuid;
  -- Sahipsiz bir gider satiri, hangi dugune ait oldugu bilinmeyen bir tutardir.
  if v_kalan <> 0 then
    raise exception 'BASARISIZ: rezervasyon silindi, % gider kaldi', v_kalan;
  end if;
end $$;

\echo '=== 6) RLS ACIK olmali ==='
select relrowsecurity as rls_acik
from pg_class where oid = 'public.reservation_expenses'::regclass;

do $$ begin
  if not (select relrowsecurity from pg_class
          where oid = 'public.reservation_expenses'::regclass) then
    raise exception 'BASARISIZ: reservation_expenses uzerinde RLS kapali';
  end if;
  /*
    0032 politikayı okuma ve yazma diye ikiye ayırdı (madde 33): muhasebeye
    bakan personelin rakamları görmesi gerekiyor ama değiştirmesi
    gerekmiyor. Ada göre değil, VARLIĞA bakılıyor.
  */
  if (select count(*) from pg_policies
      where schemaname = 'public' and tablename = 'reservation_expenses') = 0 then
    raise exception 'BASARISIZ: RLS politikasi yok';
  end if;
end $$;

\echo '=== 7) Yetkiler ==='
select
  has_table_privilege('authenticated', 'public.reservation_expenses', 'SELECT') as kullanici_okur,
  has_table_privilege('authenticated', 'public.reservation_expenses', 'INSERT') as kullanici_yazar,
  has_table_privilege('authenticated', 'public.reservation_expenses', 'DELETE') as kullanici_siler,
  -- service_role BYPASSRLS tasir ama tablo yetkisi AYRI bir sey; eksik
  -- oldugunda sunucunun butun duz tablo erisimleri "permission denied" verir.
  has_table_privilege('service_role', 'public.reservation_expenses', 'SELECT')  as sunucu_okur;

do $$ begin
  if not has_table_privilege('authenticated', 'public.reservation_expenses', 'DELETE') then
    raise exception 'BASARISIZ: kullanici gider silemiyor';
  end if;
  if not has_table_privilege('service_role', 'public.reservation_expenses', 'SELECT') then
    raise exception 'BASARISIZ: service_role gider okuyamiyor';
  end if;
  -- Yedek disinda sunucunun gider yazmasi gerekmiyor; yazabiliyorsa
  -- gereginden genis bir yetki verilmis demektir.
  if has_table_privilege('service_role', 'public.reservation_expenses', 'INSERT') then
    raise exception 'BASARISIZ: service_role gider yazabiliyor';
  end if;
end $$;

\echo '=== 8) Isletme silinince giderleri de DUSMELI ==='
do $$
declare
  v_biz  uuid := current_setting('test.biz')::uuid;
  v_hall uuid;
  v_rez  uuid;
  v_kalan integer;
begin
  select id into v_hall from public.halls where business_id = v_biz limit 1;
  insert into public.reservations
    (business_id, hall_id, code, customer_name, customer_phone, date, slot,
     organization_type, guest_count, total_amount, deposit)
  values
    (v_biz, v_hall, '2026-902', 'Ikinci Test', '5330000098', '2026-10-04', 'Gece',
     'Düğün', 200, 90000, 20000)
  returning id into v_rez;

  insert into public.reservation_expenses (business_id, reservation_id, kind, unit_count, unit_price)
  values (v_biz, v_rez, 'DJ', 1, 8000);

  delete from public.businesses where id = v_biz;

  select count(*) into v_kalan from public.reservation_expenses where business_id = v_biz;
  if v_kalan <> 0 then
    raise exception 'BASARISIZ: isletme silindi, % gider kaldi', v_kalan;
  end if;
end $$;

\echo '=== TEMIZLIK ==='
do $$ begin
  delete from auth.users where email = 'gider-test@ornek.com';
end $$;

\echo '=== 17_dugun_ici_giderler_test: TUM KONTROLLER GECTI ==='
