-- =====================================================================
-- Çelik kasa testi (0015)
--
-- Sınanan davranışlar:
--   1. Tablo, tip ve indeksler kuruldu mu?
--   2. Kasada duran satır ikinci kez kasaya yazılabiliyor mu? (yazılmamalı)
--   3. Aynı satırın ters yönü yazılabiliyor mu? (yazılmalı)
--   3b. Girip çıkan satır YENIDEN kasaya eklenebiliyor mu? (eklenmeli)
--   4. Sıfır ve eksi tutar reddediliyor mu?
--   5. Rezervasyondan türeyen satır ("kapora:<id>") kabul ediliyor mu?
--   6. İşletme silinince hareketleri de düşüyor mu?
--   7. Hareketler güncellenebiliyor mu? (güncellenmemeli)
--   8. Kasa bakiyesi gelir/gider bakiyesinden ayrı mı?
--
-- İkinci madde asıl sebep: iki kez tıklamaktan doğan çift sayım, kasadaki
-- parayı olduğundan farklı gösterir ve akşam sayımda tutmayan bir fark
-- bırakır. Ama 3b de en az onun kadar önemli: para kasa ile banka arasında
-- bir kez değil sürekli gidip gelir; 0015'teki yön benzersizliği bu döngüyü
-- ikinci turda kilitliyordu (0016 bunu net kuralına çevirdi).
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off

\echo '=== 0) Test verisi ==='
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_biz   uuid;
  v_hall  uuid;
  v_res   uuid;
  v_cf    uuid;
begin
  insert into auth.users (id, email) values (v_owner, 'kasa-test@ornek.com');

  insert into public.businesses (owner_id, name, category, city, district, phone, capacity, currency)
  values (v_owner, 'Kasa Test Salonu', 'Düğün Salonu', 'İstanbul', 'Beylikdüzü', '5320000000', 400, 'TL')
  returning id into v_biz;

  select id into v_hall from public.halls where business_id = v_biz limit 1;

  insert into public.reservations
    (business_id, hall_id, code, customer_name, customer_phone, date, slot,
     organization_type, guest_count, total_amount, deposit)
  values (v_biz, v_hall, null, 'Kasa Müşterisi', '5331110000', date '2030-05-05', 'Gece',
          'Düğün', 200, 100000, 30000)
  returning id into v_res;

  insert into public.cash_flow (business_id, kind, date, category, amount, description)
  values (v_biz, 'Gelir', date '2030-05-05', 'Diğer Gelir', 5000, 'Nakit tahsilat')
  returning id into v_cf;

  perform set_config('test.owner', v_owner::text, false);
  perform set_config('test.biz', v_biz::text, false);
  perform set_config('test.res', v_res::text, false);
  perform set_config('test.cf', v_cf::text, false);
end $$;

\echo '=== 1) Tablo, tip ve indeksler KURULMUS olmali ==='
select
  to_regclass('public.safe_movements')  is not null as tablo_var,
  to_regtype('public.safe_direction')   is not null as tip_var,
  to_regclass('public.safe_movements_source_idx') is not null as indeks_var;

do $$ begin
  if to_regclass('public.safe_movements') is null
     or to_regtype('public.safe_direction') is null then
    raise exception 'BASARISIZ: celik kasa semasi eksik';
  end if;
end $$;

\echo '=== 2) Kasada DURAN satir ikinci kez yazilamamali ==='
do $$
declare v_hata boolean := false;
begin
  insert into public.safe_movements (business_id, date, direction, amount, description, source_kind, source_id)
  values (current_setting('test.biz')::uuid, date '2030-05-05', 'Giriş', 5000,
          'Gelir · Diğer Gelir', 'cash_flow', current_setting('test.cf'));

  begin
    insert into public.safe_movements (business_id, date, direction, amount, description, source_kind, source_id)
    values (current_setting('test.biz')::uuid, date '2030-05-05', 'Giriş', 5000,
            'Gelir · Diğer Gelir', 'cash_flow', current_setting('test.cf'));
  exception when sqlstate 'DT001' then
    v_hata := true;
  end;

  if not v_hata then
    raise exception 'BASARISIZ: ayni satir kasaya iki kez girdi olarak yazildi';
  end if;
end $$;

\echo '=== 2b) Kasada OLMAYAN satir kasadan cikarilamamali ==='
do $$
declare v_hata boolean := false;
begin
  begin
    insert into public.safe_movements (business_id, date, direction, amount, source_kind, source_id)
    values (current_setting('test.biz')::uuid, date '2030-05-05', 'Çıkış', 100, 'cash_flow', 'hic-girmedi');
  exception when sqlstate 'DT001' then v_hata := true; end;
  if not v_hata then
    raise exception 'BASARISIZ: kasada olmayan para kasadan cikarildi';
  end if;
end $$;

\echo '=== 2c) Kasaya girenden FAZLASI cikarilamamali ==='
do $$
declare v_hata boolean := false;
begin
  begin
    insert into public.safe_movements (business_id, date, direction, amount, source_kind, source_id)
    values (current_setting('test.biz')::uuid, date '2030-05-06', 'Çıkış', 9000,
            'cash_flow', current_setting('test.cf'));
  exception when sqlstate 'DT001' then v_hata := true; end;
  if not v_hata then
    raise exception 'BASARISIZ: kasadan girenden fazlasi cikarildi';
  end if;
end $$;

\echo '=== 3) Ayni satirin TERS YONU yazilabilmeli ==='
do $$ begin
  -- Kasaya giren para sonradan bankaya yatirilabilir.
  insert into public.safe_movements (business_id, date, direction, amount, description, source_kind, source_id)
  values (current_setting('test.biz')::uuid, date '2030-05-06', 'Çıkış', 5000,
          'Bankaya yatırıldı', 'cash_flow', current_setting('test.cf'));
end $$;

select
  count(*) filter (where direction = 'Giriş') as giris_adedi,
  count(*) filter (where direction = 'Çıkış') as cikis_adedi,
  coalesce(sum(case when direction = 'Giriş' then amount else -amount end), 0) as kasa_bakiyesi
from public.safe_movements
where business_id = current_setting('test.biz')::uuid;

do $$
declare v_bakiye numeric;
begin
  select coalesce(sum(case when direction = 'Giriş' then amount else -amount end), 0)
    into v_bakiye
  from public.safe_movements where business_id = current_setting('test.biz')::uuid;
  if v_bakiye <> 0 then
    raise exception 'BASARISIZ: giris ve cikis birbirini gotürmedi (%)', v_bakiye;
  end if;
end $$;

\echo '=== 3b) Girip cikan satir YENIDEN kasaya eklenebilmeli ==='
do $$
declare v_net numeric; v_adet integer;
begin
  -- Kullanicinin bildirdigi hata tam olarak buydu: bir tur donen satir
  -- ikinci kez eklenemiyordu.
  insert into public.safe_movements (business_id, date, direction, amount, description, source_kind, source_id)
  values (current_setting('test.biz')::uuid, date '2030-05-07', 'Giriş', 5000,
          'Kasaya geri kondu', 'cash_flow', current_setting('test.cf'));

  insert into public.safe_movements (business_id, date, direction, amount, description, source_kind, source_id)
  values (current_setting('test.biz')::uuid, date '2030-05-08', 'Çıkış', 5000,
          'Yine bankaya', 'cash_flow', current_setting('test.cf'));

  insert into public.safe_movements (business_id, date, direction, amount, description, source_kind, source_id)
  values (current_setting('test.biz')::uuid, date '2030-05-09', 'Giriş', 5000,
          'Ucuncu tur', 'cash_flow', current_setting('test.cf'));

  select count(*),
         coalesce(sum(case when direction = 'Giriş' then amount else -amount end), 0)
    into v_adet, v_net
  from public.safe_movements
  where business_id = current_setting('test.biz')::uuid
    and source_id = current_setting('test.cf');

  if v_adet <> 5 or v_net <> 5000 then
    raise exception 'BASARISIZ: dongu yurumedi (% hareket, net %)', v_adet, v_net;
  end if;
end $$;

\echo '=== 3c) Ayni yondeki hareketlerin SIRASI ayri olmali ==='
select direction, seq, amount
from public.safe_movements
where business_id = current_setting('test.biz')::uuid
  and source_id = current_setting('test.cf')
order by direction, seq;

do $$
declare v_tekrar integer;
begin
  -- Sira benzersizligi, ayni anda gelen iki istegin ikisinin de yazilmasini
  -- engelleyen tek koruma; sayilar cakisirsa o koruma yoktur.
  select count(*) into v_tekrar from (
    select direction, seq from public.safe_movements
    where business_id = current_setting('test.biz')::uuid
      and source_id = current_setting('test.cf')
    group by direction, seq having count(*) > 1
  ) t;
  if v_tekrar > 0 then
    raise exception 'BASARISIZ: ayni yonde ayni sira % kez uretildi', v_tekrar;
  end if;
end $$;

\echo '=== 3d) Kasayi bosaltip 7. maddenin beklentisine don ==='
do $$ begin
  insert into public.safe_movements (business_id, date, direction, amount, description, source_kind, source_id)
  values (current_setting('test.biz')::uuid, date '2030-05-10', 'Çıkış', 5000,
          'Kapanis', 'cash_flow', current_setting('test.cf'));
end $$;

\echo '=== 4) Sifir ve eksi tutar REDDEDILMELI ==='
do $$
declare v_sifir boolean := false; v_eksi boolean := false;
begin
  begin
    insert into public.safe_movements (business_id, date, direction, amount, source_kind, source_id)
    values (current_setting('test.biz')::uuid, date '2030-05-07', 'Giriş', 0, 'cash_flow', 'sifir');
  exception when check_violation then v_sifir := true; end;

  begin
    insert into public.safe_movements (business_id, date, direction, amount, source_kind, source_id)
    values (current_setting('test.biz')::uuid, date '2030-05-07', 'Giriş', -100, 'cash_flow', 'eksi');
  exception when check_violation then v_eksi := true; end;

  if not v_sifir or not v_eksi then
    raise exception 'BASARISIZ: gecersiz tutar kabul edildi';
  end if;
end $$;

\echo '=== 5) Rezervasyondan tureyen satir KABUL EDILMELI ==='
do $$ begin
  -- Bu satir kasa tablosunda durmaz; kimligi "kapora:<id>" bicimindedir.
  insert into public.safe_movements (business_id, date, direction, amount, description, source_kind, source_id)
  values (current_setting('test.biz')::uuid, date '2030-05-05', 'Giriş', 30000,
          'Gelir · Kapora', 'reservation', 'kapora:' || current_setting('test.res'));
end $$;

do $$
declare v_hata boolean := false;
begin
  -- Tanimsiz kaynak turu reddedilmeli.
  begin
    insert into public.safe_movements (business_id, date, direction, amount, source_kind, source_id)
    values (current_setting('test.biz')::uuid, date '2030-05-05', 'Giriş', 100, 'baska', 'x');
  exception when check_violation then v_hata := true; end;
  if not v_hata then
    raise exception 'BASARISIZ: tanimsiz kaynak turu kabul edildi';
  end if;
end $$;

\echo '=== 6) Hareketler GUNCELLENEMEMELI ==='
select
  has_table_privilege('authenticated', 'public.safe_movements', 'INSERT') as ekleyebilir,
  has_table_privilege('authenticated', 'public.safe_movements', 'DELETE') as silebilir,
  has_table_privilege('authenticated', 'public.safe_movements', 'UPDATE') as guncelleyebilir;

do $$ begin
  if has_table_privilege('authenticated', 'public.safe_movements', 'UPDATE') then
    raise exception 'BASARISIZ: hareket guncellenebiliyor; duzeltme iz birakmali';
  end if;
  if not has_table_privilege('authenticated', 'public.safe_movements', 'INSERT')
     or not has_table_privilege('authenticated', 'public.safe_movements', 'DELETE') then
    raise exception 'BASARISIZ: kullanici hareket ekleyip silemiyor';
  end if;
end $$;

\echo '=== 7) Kasa bakiyesi GELIR/GIDER bakiyesinden AYRI olmali ==='
select
  (select coalesce(sum(case when kind = 'Gelir' then amount else -amount end), 0)
     from public.cash_flow where business_id = current_setting('test.biz')::uuid) as muhasebe_bakiyesi,
  (select coalesce(sum(case when direction = 'Giriş' then amount else -amount end), 0)
     from public.safe_movements where business_id = current_setting('test.biz')::uuid) as celik_kasa;

do $$
declare v_muhasebe numeric; v_kasa numeric;
begin
  select coalesce(sum(case when kind = 'Gelir' then amount else -amount end), 0) into v_muhasebe
  from public.cash_flow where business_id = current_setting('test.biz')::uuid;
  select coalesce(sum(case when direction = 'Giriş' then amount else -amount end), 0) into v_kasa
  from public.safe_movements where business_id = current_setting('test.biz')::uuid;

  -- Muhasebe 5000 (tek gelir), kasa 30000 (kapora girdi, digeri girip cikti).
  if v_muhasebe <> 5000 or v_kasa <> 30000 then
    raise exception 'BASARISIZ: bakiyeler beklenen degil (muhasebe %, kasa %)', v_muhasebe, v_kasa;
  end if;
end $$;

\echo '=== 8) Isletme silinince hareketleri de DUSMELI ==='
do $$
declare v_kalan integer;
begin
  delete from public.businesses where id = current_setting('test.biz')::uuid;
  select count(*) into v_kalan
  from public.safe_movements where business_id = current_setting('test.biz')::uuid;
  if v_kalan <> 0 then
    raise exception 'BASARISIZ: isletme silindi ama % hareket kaldi', v_kalan;
  end if;
end $$;

\echo '=== 9) Temizlik ==='
delete from auth.users where id = current_setting('test.owner')::uuid;

\echo '=== TUM CELIK KASA TESTLERI GECTI ==='
