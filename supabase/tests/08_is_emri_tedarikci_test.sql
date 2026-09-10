-- =====================================================================
-- İş emri ve tedarikçi testleri
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off
\set a_id '''11111111-1111-1111-1111-111111111111'''
\set b_id '''22222222-2222-2222-2222-222222222222'''

insert into auth.users (id, email, raw_user_meta_data) values
  (:a_id, 'a@ornek.com', '{"company_name":"A","full_name":"A"}'),
  (:b_id, 'b@ornek.com', '{"company_name":"B","full_name":"B"}');
insert into public.businesses (id, owner_id, name, capacity) values
  ('aaaaaaaa-0000-0000-0000-000000000001', :a_id, 'A Salonu', 400),
  ('bbbbbbbb-0000-0000-0000-000000000001', :b_id, 'B Salonu', 300);

insert into public.reservations
  (id, business_id, code, customer_name, customer_phone, date, slot,
   organization_type, guest_count, total_amount, deposit)
values
  ('dddddddd-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
   'SA-A-0001','A Müşterisi','5321110001','2027-06-12','Gece','Düğün',300,100000.00,10000.00),
  ('dddddddd-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000001',
   'SA-B-0001','B Müşterisi','5321110002','2027-06-12','Gece','Nişan',150,50000.00,5000.00);

insert into public.vendors (id, business_id, name, category, phone) values
  ('eeeeeeee-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Yıldız Orkestra','Orkestra','5321230001'),
  ('eeeeeeee-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000001','B Fotoğraf','Fotoğraf','5321230002');

\echo '=== 1) Is emri satirlari saate gore okunabilmeli ==='
insert into public.event_tasks (reservation_id, at_time, title, responsible) values
  ('dddddddd-0000-0000-0000-000000000001', '19:00', 'Salon acilis ve karsilama', 'Resepsiyon'),
  ('dddddddd-0000-0000-0000-000000000001', '17:00', 'Masa ve susleme kurulumu', 'Servis ekibi'),
  ('dddddddd-0000-0000-0000-000000000001', '21:30', 'Pasta servisi', 'Mutfak');
select at_time, title from public.event_tasks
where reservation_id = 'dddddddd-0000-0000-0000-000000000001' order by at_time;

\echo '=== 2) Bos is emri basligi REDDEDILMELI ==='
do $$ begin
  insert into public.event_tasks (reservation_id, at_time, title)
  values ('dddddddd-0000-0000-0000-000000000001', '20:00', '   ');
  raise exception 'BASARISIZ: bos baslik kabul edildi';
exception
  when check_violation then raise notice 'BEKLENEN: bos baslik reddedildi';
  when others then
    if sqlerrm like 'BASARISIZ%' then raise; end if;
    raise notice 'BEKLENEN: reddedildi (%)', sqlerrm;
end $$;

\echo '=== 3) Tedarikci rezervasyona baglanabilmeli ==='
insert into public.reservation_vendors (reservation_id, vendor_id, arrive_at, cost, note)
values ('dddddddd-0000-0000-0000-000000000001','eeeeeeee-0000-0000-0000-000000000001',
        '18:30', 15000.00, 'Ses sistemi dahil');
select v.name, rv.arrive_at, rv.cost from public.reservation_vendors rv
join public.vendors v on v.id = rv.vendor_id
where rv.reservation_id = 'dddddddd-0000-0000-0000-000000000001';

\echo '=== 4) BASKA isletmenin tedarikcisi baglanamamali ==='
do $$ begin
  insert into public.reservation_vendors (reservation_id, vendor_id)
  values ('dddddddd-0000-0000-0000-000000000001','eeeeeeee-0000-0000-0000-000000000002');
  raise exception 'BASARISIZ: yabanci tedarikci kabul edildi';
exception
  when check_violation then raise notice 'BEKLENEN: yabanci tedarikci reddedildi';
  when others then
    if sqlerrm like 'BASARISIZ%' then raise; end if;
    raise notice 'BEKLENEN: reddedildi (%)', sqlerrm;
end $$;

\echo '=== 5) Ayni tedarikci ayni rezervasyona iki kez eklenememeli ==='
do $$ begin
  insert into public.reservation_vendors (reservation_id, vendor_id)
  values ('dddddddd-0000-0000-0000-000000000001','eeeeeeee-0000-0000-0000-000000000001');
  raise exception 'BASARISIZ: mukerrer tedarikci kabul edildi';
exception
  when unique_violation then raise notice 'BEKLENEN: mukerrer tedarikci reddedildi';
  when others then
    if sqlerrm like 'BASARISIZ%' then raise; end if;
    raise notice 'BEKLENEN: reddedildi (%)', sqlerrm;
end $$;

\echo '=== 6) Rezervasyona bagli tedarikci SILINEMEMELI ==='
do $$ begin
  delete from public.vendors where id = 'eeeeeeee-0000-0000-0000-000000000001';
  raise exception 'BASARISIZ: bagli tedarikci silindi';
exception
  when foreign_key_violation then raise notice 'BEKLENEN: bagli tedarikci silinemedi';
  when others then
    if sqlerrm like 'BASARISIZ%' then raise; end if;
    raise notice 'BEKLENEN: reddedildi (%)', sqlerrm;
end $$;

\echo '=== 7) Rezervasyon silinince is emri ve atamalar da silinmeli ==='
delete from public.reservations where id = 'dddddddd-0000-0000-0000-000000000001';
select
  (select count(*) from public.event_tasks)         as is_emri_SIFIR,
  (select count(*) from public.reservation_vendors) as atama_SIFIR;

-- Supabase varsayilan izinlerinin karsiligi
grant usage on schema public to authenticated;
grant select on public.reservations, public.vendors,
  public.event_tasks, public.reservation_vendors to authenticated;

\echo '=== 8) B isletmesi A nin tedarikcisini GOREMEMELI ==='
set role authenticated;
select set_config('request.jwt.claim.sub', :b_id, false);
select count(*) as B_gordugu_tedarikci_BIR_OLMALI from public.vendors;
reset role;

\echo '=== 9) Tedarikci degisiklikleri denetim kaydina yazilmali ==='
select count(*) > 0 as tedarikci_denetim_kaydi_var
from public.audit_log where table_name = 'vendors';
