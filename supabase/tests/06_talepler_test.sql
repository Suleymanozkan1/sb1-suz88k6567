-- =====================================================================
-- Talep kutusu testleri
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off

\set a_id '''11111111-1111-1111-1111-111111111111'''
\set s_id '''33333333-3333-3333-3333-333333333333'''

insert into auth.users (id, email, raw_user_meta_data) values
  (:a_id, 'a@ornek.com', '{"company_name":"A Salonu","full_name":"A Yetkili"}'),
  (:s_id, 's@ornek.com', '{"company_name":"A Salonu","full_name":"A Personel"}');

update public.profiles set role = 'staff', owner_id = :a_id where id = :s_id;

\echo '=== 1) Herkes (anon) talep gonderebilmeli ==='
set role anon;
select set_config('request.jwt.claim.sub', '', false);
insert into public.contact_messages (name, email, phone, message, kind) values
  ('Ziyaretci', 'z@ornek.com', '5320000001', 'Demo talep ediyorum.', 'demo'),
  ('Musteri', 'm@ornek.com', '5320000002', 'Fiyat bilgisi alabilir miyim?', 'iletisim'),
  ('Teklif', 't@ornek.com', '5320000003', 'Salon icin teklif.', 'teklif');
reset role;
select count(*) as gonderilen_talep from public.contact_messages;

\echo '=== 2) anon GONDERDIGI talebi bile OKUYAMAMALI ==='
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$
declare n integer;
begin
  select count(*) into n from public.contact_messages;
  raise exception 'BASARISIZ: anon % talep okudu', n;
exception
  when insufficient_privilege then raise notice 'BEKLENEN: anon talep okuyamadi';
  when others then
    if sqlerrm like 'BASARISIZ%' then raise; end if;
    raise notice 'BEKLENEN: anon talep okuyamadi (%)', sqlerrm;
end $$;
reset role;

\echo '=== 3) PERSONEL talepleri okuyamamali (0001 acigi kapandi) ==='
set role authenticated;
select set_config('request.jwt.claim.sub', :s_id, false);
select count(*) as personel_gordugu_SIFIR_OLMALI from public.contact_messages;
reset role;

\echo '=== 4) YONETICI tum talepleri okumali ==='
set role authenticated;
select set_config('request.jwt.claim.sub', :a_id, false);
select count(*) as yonetici_gordugu_UC_OLMALI from public.contact_messages;
select kind, status from public.contact_messages order by kind;
reset role;

\echo '=== 5) Yonetici talebi islemde yapinca damga otomatik yazilmali ==='
set role authenticated;
select set_config('request.jwt.claim.sub', :a_id, false);
update public.contact_messages set status = 'islemde', note = 'Arandi.' where email = 'z@ornek.com';
select status, note, handled_by = :a_id as isleyen_dogru, handled_at is not null as damga_var
  from public.contact_messages where email = 'z@ornek.com';
reset role;

\echo '=== 6) Talep ICERIGI degistirilememeli (kanit korunur) ==='
set role authenticated;
select set_config('request.jwt.claim.sub', :a_id, false);
update public.contact_messages
  set name = 'DEGISTIRILDI', email = 'sahte@ornek.com', message = 'silindi', phone = '0'
  where email = 'z@ornek.com';
select name, email, phone, message from public.contact_messages where name = 'Ziyaretci';
reset role;

\echo '=== 7) Yeniye dondurulunce damga temizlenmeli ==='
set role authenticated;
select set_config('request.jwt.claim.sub', :a_id, false);
update public.contact_messages set status = 'yeni' where name = 'Ziyaretci';
select status, handled_by is null as isleyen_bos, handled_at is null as damga_bos
  from public.contact_messages where name = 'Ziyaretci';
reset role;

\echo '=== 8) PERSONEL talep durumunu degistirememeli ==='
set role authenticated;
select set_config('request.jwt.claim.sub', :s_id, false);
do $$
declare n integer;
begin
  update public.contact_messages set status = 'kapatildi' where true;
  get diagnostics n = row_count;
  if n > 0 then raise exception 'BASARISIZ: personel % talebi degistirdi', n; end if;
  raise notice 'BEKLENEN: personel talep durumunu degistiremedi';
end $$;
reset role;

\echo '=== 9) Talep SILINEMEMELI ==='
set role authenticated;
select set_config('request.jwt.claim.sub', :a_id, false);
do $$ begin
  delete from public.contact_messages where true;
  raise exception 'BASARISIZ: talep silindi';
exception
  when insufficient_privilege then raise notice 'BEKLENEN: talep silinemedi';
  when others then
    if sqlerrm like 'BASARISIZ%' then raise; end if;
    raise notice 'BEKLENEN: talep silinemedi (%)', sqlerrm;
end $$;
reset role;

\echo '=== 10) Gecersiz talep turu reddedilmeli ==='
do $$ begin
  insert into public.contact_messages (name, email, phone, message, kind)
    values ('X', 'x@ornek.com', '5320000009', 'test', 'gecersiz');
  raise exception 'BASARISIZ: gecersiz tur kabul edildi';
exception
  when check_violation then raise notice 'BEKLENEN: gecersiz talep turu reddedildi';
  when others then
    if sqlerrm like 'BASARISIZ%' then raise; end if;
    raise notice 'BEKLENEN: gecersiz talep turu reddedildi (%)', sqlerrm;
end $$;

\echo '=== 11) Bos ad veya bos mesaj reddedilmeli ==='
do $$ begin
  insert into public.contact_messages (name, email, phone, message, kind)
    values ('   ', 'x@ornek.com', '5320000009', 'test', 'demo');
  raise exception 'BASARISIZ: bos ad kabul edildi';
exception
  when check_violation then raise notice 'BEKLENEN: bos ad reddedildi';
  when others then
    if sqlerrm like 'BASARISIZ%' then raise; end if;
    raise notice 'BEKLENEN: bos ad reddedildi (%)', sqlerrm;
end $$;
