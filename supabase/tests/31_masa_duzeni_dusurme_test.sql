-- =====================================================================
-- Masa düzenini düşürme testi (0042)
--
-- Göç geri alınamaz olduğu için iki yönü de sınanır:
--   1. Düşmesi gereken düştü mü?
--   2. Düşmemesi gereken hiçbir şeye dokunuldu mu?
--
-- İkincisi asıl risk. Bu göçte özellikle `owns_reservation`: 0013'te
-- düşen tablonun yardımcı fonksiyonu da düşürülmüştü, aynı refleksle
-- burada da düşürülseydi iş emri, tedarikçi, düğün içi gider ve stok
-- politikaları birden çalışamaz hâle gelirdi.
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off

\echo '=== 1) seating_tables DUSMUS OLMALI ==='
select to_regclass('public.seating_tables') is null as masa_tablosu_YOK;

do $$ begin
  if to_regclass('public.seating_tables') is not null then
    raise exception 'BASARISIZ: seating_tables hala duruyor';
  end if;
end $$;

\echo '=== 2) Tabloya ait politika ve indeks de DUSMUS OLMALI ==='
select
  not exists (select 1 from pg_policy where polname = 'seating_tables_all') as politika_YOK,
  to_regclass('public.seating_tables_reservation_idx') is null              as indeks_YOK;

do $$ begin
  if exists (select 1 from pg_policy where polname = 'seating_tables_all') then
    raise exception 'BASARISIZ: seating_tables_all politikasi hala duruyor';
  end if;
  if to_regclass('public.seating_tables_reservation_idx') is not null then
    raise exception 'BASARISIZ: indeks hala duruyor';
  end if;
end $$;

\echo '=== 3) owns_reservation YERINDE OLMALI ==='
-- 0013'te `is_owner` düşürülmüştü çünkü onu yalnızca düşen tablonun
-- politikası çağırıyordu. Burada tersi geçerli: dört tablo daha bu
-- fonksiyona bağlı.
select to_regproc('public.owns_reservation') is not null as yardimci_VAR;

do $$ begin
  if to_regproc('public.owns_reservation') is null then
    raise exception 'BASARISIZ: owns_reservation dusurulmus';
  end if;
end $$;

\echo '=== 4) owns_reservation kullanan politikalar AYAKTA OLMALI ==='
-- Politika ADLARI yazilmiyor, BAGIMLILIK araniyor: ad listesi zamanla
-- kayar ve yanlis yazilmis tek bir ad, testi sessizce hicbir sey
-- sinamayan bir kabuga cevirir. Burada politikanin ifadesinde
-- owns_reservation gecip gecmedigine bakiliyor.
select polname, polrelid::regclass::text as tablo
from pg_policy
where pg_get_expr(polqual, polrelid) like '%owns_reservation%'
order by tablo, polname;

do $$
declare
  v_tablolar text;
begin
  select string_agg(distinct polrelid::regclass::text, ', ')
    into v_tablolar
  from pg_policy
  where pg_get_expr(polqual, polrelid) like '%owns_reservation%';

  -- Bugun iki tablo bagli: event_tasks ve reservation_vendors.
  if v_tablolar is null then
    raise exception 'BASARISIZ: owns_reservation kullanan hicbir politika kalmamis';
  end if;
  if v_tablolar not like '%event_tasks%' then
    raise exception 'BASARISIZ: event_tasks politikasi kaybolmus (bulunan: %)', v_tablolar;
  end if;
  if v_tablolar not like '%reservation_vendors%' then
    raise exception 'BASARISIZ: reservation_vendors politikasi kaybolmus (bulunan: %)', v_tablolar;
  end if;
end $$;

\echo '=== 5) Kullanilan tablolarin HICBIRI silinmemis olmali ==='
-- Bir CASCADE kazasi en kolay burada yakalanir.
select ad, to_regclass('public.' || ad) is not null as var_OLMALI
from unnest(array[
  'profiles', 'businesses', 'reservations', 'payments', 'cash_flow',
  'halls', 'menus', 'event_tasks', 'vendors', 'reservation_vendors',
  'reservation_expenses', 'invoices', 'audit_log', 'backup_runs'
]) as ad
order by ad;

do $$
declare
  v_eksik text;
begin
  select string_agg(ad, ', ') into v_eksik
  from unnest(array[
    'profiles', 'businesses', 'reservations', 'payments', 'cash_flow',
    'halls', 'menus', 'event_tasks', 'vendors', 'reservation_vendors',
    'reservation_expenses', 'invoices', 'audit_log', 'backup_runs'
  ]) as ad
  where to_regclass('public.' || ad) is null;

  if v_eksik is not null then
    raise exception 'BASARISIZ: kullanilan tablo(lar) silinmis: %', v_eksik;
  end if;
end $$;

\echo '=== 6) Rezervasyon akisi CALISMAYA DEVAM ETMELI ==='
\set a_id '''31111111-1111-1111-1111-111111111111'''
insert into auth.users (id, email, raw_user_meta_data) values
  (:a_id, 'masa@ornek.com', '{"company_name":"M","full_name":"M"}');
insert into public.businesses (id, owner_id, name, capacity) values
  ('aaaaaaaa-0000-0000-0000-000000000042', :a_id, 'M Salonu', 400);
-- 0007 gocu her yeni isletme icin "Ana Salon" acar; ayni adi kullanmak
-- benzersizlik kisitina carpar.
insert into public.halls (id, business_id, name, capacity) values
  ('cccccccc-0000-0000-0000-000000000042','aaaaaaaa-0000-0000-0000-000000000042','M Kristal Salon',400);

insert into public.reservations
  (id, business_id, hall_id, code, customer_name, customer_phone, date, slot,
   organization_type, guest_count, total_amount, deposit)
values
  ('dddddddd-0000-0000-0000-000000000042','aaaaaaaa-0000-0000-0000-000000000042',
   'cccccccc-0000-0000-0000-000000000042','SA-M-0001','M Müşterisi','5321110042',
   '2027-06-12','Gece','Düğün',300,250000.00,60000.00);

-- Masa düzeni düştü; is emri ayni rezervasyona yazilabilmeye devam etmeli.
insert into public.event_tasks (reservation_id, at_time, title) values
  ('dddddddd-0000-0000-0000-000000000042','17:00','Süsleme kurulumu');

select count(*) as is_emri_satiri_BIR_OLMALI
from public.event_tasks
where reservation_id = 'dddddddd-0000-0000-0000-000000000042';

do $$ begin
  if (select count(*) from public.event_tasks
      where reservation_id = 'dddddddd-0000-0000-0000-000000000042') <> 1 then
    raise exception 'BASARISIZ: is emri yazilamadi';
  end if;
end $$;

\echo '=== 7) Denetim kaydi geriye donuk KORUNMALI ==='
-- Düşen tabloya ait geçmiş satırlar "kim neyi ne zaman değiştirdi"
-- sorusunun cevabıdır; tablo düştü diye silinmemeli.
insert into public.audit_log (actor_email, action, table_name, record_id, summary)
values ('eski@ornek.com', 'DELETE', 'seating_tables',
        'ffffffff-0000-0000-0000-000000000042', 'Gecmis masa kaydi');

select count(*) as gecmis_denetim_satiri_BIR_OLMALI
from public.audit_log where table_name = 'seating_tables';

do $$ begin
  if (select count(*) from public.audit_log
      where table_name = 'seating_tables') <> 1 then
    raise exception 'BASARISIZ: gecmis denetim satiri korunmadi';
  end if;
end $$;

\echo '=== 8) Yedek disa aktarimi CALISMAYA DEVAM ETMELI ==='
-- export_owner_data düşen bir tabloyu okumaya kalkarsa gecelik yedek
-- her gece sessizce başarısız olurdu.
select public.export_owner_data(:a_id) is not null as disa_aktarim_CALISIYOR;

\echo '=== 9) Sistem sagligi sorgusu CALISMAYA DEVAM ETMELI ==='
select public.system_health(:a_id) is not null as saglik_CALISIYOR;

\echo '=== TAMAM: 0042 gocu dogrulandi ==='
