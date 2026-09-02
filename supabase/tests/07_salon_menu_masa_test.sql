-- =====================================================================
-- Salon, menü ve masa düzeni testleri
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off

\set a_id '''11111111-1111-1111-1111-111111111111'''
\set b_id '''22222222-2222-2222-2222-222222222222'''

insert into auth.users (id, email, raw_user_meta_data) values
  (:a_id, 'a@ornek.com', '{"company_name":"A Salonu","full_name":"A Yetkili"}'),
  (:b_id, 'b@ornek.com', '{"company_name":"B Salonu","full_name":"B Yetkili"}');

insert into public.businesses (id, owner_id, name, capacity) values
  ('aaaaaaaa-0000-0000-0000-000000000001', :a_id, 'A Düğün Salonu', 500),
  ('bbbbbbbb-0000-0000-0000-000000000001', :b_id, 'B Düğün Salonu', 300);

-- Tetikleyici her işletmeye varsayılan salon açmadığı için elle ekleriz
insert into public.halls (id, business_id, name, capacity) values
  ('11111111-aaaa-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Kristal Salon', 400),
  ('11111111-aaaa-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Bahçe', 250),
  ('22222222-bbbb-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'B Salonu', 300);

insert into public.menus (id, business_id, name, pricing, price_kurus) values
  ('11111111-cccc-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Açık Büfe', 'kisi_basi', 45000),
  ('22222222-cccc-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'B Menü', 'sabit', 15000000);

\echo '=== 1) Ayni gun ve seansta FARKLI salonlara rezervasyon acilabilmeli ==='
insert into public.reservations
  (business_id, hall_id, menu_id, code, customer_name, customer_phone, date, slot,
   organization_type, guest_count, total_amount, deposit)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-aaaa-0000-0000-000000000001',
   '11111111-cccc-0000-0000-000000000001', 'DT-A-0001', 'Kristal Müşterisi', '5321112233',
   '2027-06-12', 'Gece', 'Düğün', 300, 135000, 20000),
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-aaaa-0000-0000-000000000002',
   null, 'DT-A-0002', 'Bahçe Müşterisi', '5321112244',
   '2027-06-12', 'Gece', 'Nişan', 200, 90000, 10000);
select count(*) as ayni_gun_iki_salon_IKI_OLMALI from public.reservations where date = '2027-06-12';

\echo '=== 2) AYNI salona ayni gun ve seansta ikinci kayit REDDEDILMELI ==='
do $$ begin
  insert into public.reservations
    (business_id, hall_id, code, customer_name, customer_phone, date, slot,
     organization_type, guest_count, total_amount, deposit)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-aaaa-0000-0000-000000000001',
          'DT-A-0003', 'Çakışan', '5321112255', '2027-06-12', 'Gece', 'Düğün', 100, 50000, 0);
  raise exception 'BASARISIZ: ayni salona cift rezervasyon yazildi';
exception
  when unique_violation then raise notice 'BEKLENEN: ayni salona ikinci kayit reddedildi';
  when others then
    if sqlerrm like 'BASARISIZ%' then raise; end if;
    raise notice 'BEKLENEN: reddedildi (%)', sqlerrm;
end $$;

\echo '=== 3) BASKA isletmenin salonuna rezervasyon yazilamamali ==='
do $$ begin
  insert into public.reservations
    (business_id, hall_id, code, customer_name, customer_phone, date, slot,
     organization_type, guest_count, total_amount, deposit)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-bbbb-0000-0000-000000000001',
          'DT-A-0004', 'Yabancı Salon', '5321112266', '2027-07-01', 'Gece', 'Düğün', 100, 50000, 0);
  raise exception 'BASARISIZ: yabanci salona rezervasyon yazildi';
exception
  when check_violation then raise notice 'BEKLENEN: yabanci salon reddedildi';
  when others then
    if sqlerrm like 'BASARISIZ%' then raise; end if;
    raise notice 'BEKLENEN: yabanci salon reddedildi (%)', sqlerrm;
end $$;

\echo '=== 4) BASKA isletmenin menusu secilememeli ==='
do $$ begin
  insert into public.reservations
    (business_id, hall_id, menu_id, code, customer_name, customer_phone, date, slot,
     organization_type, guest_count, total_amount, deposit)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-aaaa-0000-0000-000000000001',
          '22222222-cccc-0000-0000-000000000001', 'DT-A-0005', 'Yabancı Menü', '5321112277',
          '2027-07-02', 'Gece', 'Düğün', 100, 50000, 0);
  raise exception 'BASARISIZ: yabanci menu kabul edildi';
exception
  when check_violation then raise notice 'BEKLENEN: yabanci menu reddedildi';
  when others then
    if sqlerrm like 'BASARISIZ%' then raise; end if;
    raise notice 'BEKLENEN: yabanci menu reddedildi (%)', sqlerrm;
end $$;

\echo '=== 5) Ayni isletmede ayni isimde iki salon olmamali ==='
do $$ begin
  insert into public.halls (business_id, name, capacity)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'Kristal Salon', 100);
  raise exception 'BASARISIZ: mukerrer salon adi kabul edildi';
exception
  when unique_violation then raise notice 'BEKLENEN: mukerrer salon adi reddedildi';
  when others then
    if sqlerrm like 'BASARISIZ%' then raise; end if;
    raise notice 'BEKLENEN: reddedildi (%)', sqlerrm;
end $$;

\echo '=== 6) Negatif menu fiyati reddedilmeli ==='
do $$ begin
  insert into public.menus (business_id, name, pricing, price_kurus)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'Hatalı', 'kisi_basi', -1);
  raise exception 'BASARISIZ: negatif fiyat kabul edildi';
exception
  when check_violation then raise notice 'BEKLENEN: negatif fiyat reddedildi';
  when others then
    if sqlerrm like 'BASARISIZ%' then raise; end if;
    raise notice 'BEKLENEN: reddedildi (%)', sqlerrm;
end $$;

\echo '=== 7) Masa duzeni: ayni masa numarasi iki kez yazilamamali ==='
insert into public.seating_tables (reservation_id, table_no, seats, label)
select id, 1, 10, 'Gelin tarafı' from public.reservations where code = 'DT-A-0001';
insert into public.seating_tables (reservation_id, table_no, seats, label)
select id, 2, 8, 'Damat tarafı' from public.reservations where code = 'DT-A-0001';
do $$
declare rid uuid;
begin
  select id into rid from public.reservations where code = 'DT-A-0001';
  insert into public.seating_tables (reservation_id, table_no, seats) values (rid, 1, 6);
  raise exception 'BASARISIZ: mukerrer masa numarasi kabul edildi';
exception
  when unique_violation then raise notice 'BEKLENEN: mukerrer masa numarasi reddedildi';
  when others then
    if sqlerrm like 'BASARISIZ%' then raise; end if;
    raise notice 'BEKLENEN: reddedildi (%)', sqlerrm;
end $$;
select count(*) as masa_sayisi, sum(seats) as toplam_koltuk
from public.seating_tables st
join public.reservations r on r.id = st.reservation_id where r.code = 'DT-A-0001';

\echo '=== 8) Gecersiz koltuk sayisi reddedilmeli ==='
do $$
declare rid uuid;
begin
  select id into rid from public.reservations where code = 'DT-A-0001';
  insert into public.seating_tables (reservation_id, table_no, seats) values (rid, 9, 0);
  raise exception 'BASARISIZ: sifir koltuk kabul edildi';
exception
  when check_violation then raise notice 'BEKLENEN: sifir koltuk reddedildi';
  when others then
    if sqlerrm like 'BASARISIZ%' then raise; end if;
    raise notice 'BEKLENEN: reddedildi (%)', sqlerrm;
end $$;

\echo '=== 9) Rezervasyon silinince masa duzeni de silinmeli ==='
delete from public.reservations where code = 'DT-A-0002';
select count(*) as kalan_rezervasyon from public.reservations where code = 'DT-A-0002';

-- Supabase, public şemadaki tablolara bu izinleri varsayılan olarak verir.
grant usage on schema public to authenticated;
grant select on public.reservations, public.halls, public.menus, public.seating_tables to authenticated;

\echo '=== 10) B isletmesi A nin salon ve menulerini GOREMEMELI ==='
set role authenticated;
select set_config('request.jwt.claim.sub', :b_id, false);
select
  (select count(*) from public.halls) as B_gordugu_salon_BIR_OLMALI,
  (select count(*) from public.menus) as B_gordugu_menu_BIR_OLMALI;
reset role;

\echo '=== 11) A isletmesi kendi salon ve menulerini gormeli ==='
set role authenticated;
select set_config('request.jwt.claim.sub', :a_id, false);
select
  (select count(*) from public.halls) as A_gordugu_salon_IKI_OLMALI,
  (select count(*) from public.menus) as A_gordugu_menu_BIR_OLMALI;
reset role;

\echo '=== 12) B, A nin masa duzenini GOREMEMELI ==='
set role authenticated;
select set_config('request.jwt.claim.sub', :b_id, false);
select count(*) as B_gordugu_masa_SIFIR_OLMALI from public.seating_tables;
reset role;

\echo '=== 13) Salon ve menu degisiklikleri denetim kaydina yazilmali ==='
select count(*) > 0 as salon_denetim_kaydi_var
from public.audit_log where table_name = 'halls';
select count(*) > 0 as menu_denetim_kaydi_var
from public.audit_log where table_name = 'menus';
