-- =====================================================================
-- RLS güvenlik testi
-- İki ayrı şirket ve bir personel oluşturulur; her kimliğin yalnızca
-- kendi kapsamındaki veriyi görebildiği doğrulanır.
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off

-- Test kimlikleri
\set a_id '''11111111-1111-1111-1111-111111111111'''
\set b_id '''22222222-2222-2222-2222-222222222222'''
\set s_id '''33333333-3333-3333-3333-333333333333'''

-- auth.users -> tetikleyici profilleri oluşturur
insert into auth.users (id, email, raw_user_meta_data) values
  (:a_id, 'a@ornek.com', '{"company_name":"A Salonu","full_name":"A Yetkili"}'),
  (:b_id, 'b@ornek.com', '{"company_name":"B Salonu","full_name":"B Yetkili"}'),
  (:s_id, 's@ornek.com', '{"company_name":"A Salonu","full_name":"A Personel"}');

-- Personeli A'ya bağla
update public.profiles set role = 'staff', owner_id = :a_id where id = :s_id;

-- İşletmeler ve rezervasyonlar (RLS'yi atlayarak kurulum)
insert into public.businesses (id, owner_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', :a_id, 'A Düğün Salonu'),
  ('bbbbbbbb-0000-0000-0000-000000000001', :b_id, 'B Düğün Salonu');

insert into public.reservations
  (business_id, code, customer_name, customer_phone, date, slot, organization_type, guest_count, total_amount, deposit)
values
  ('aaaaaaaa-0000-0000-0000-000000000001','DT-A-0001','A Müşterisi','5321110000','2026-10-10','Gece','Düğün',200,100000,20000),
  ('bbbbbbbb-0000-0000-0000-000000000001','DT-B-0001','B Müşterisi','5332220000','2026-10-11','Gece','Düğün',300,150000,30000);

-- Supabase'de oturum açan kullanıcılar "authenticated" rolündedir;
-- politikalar bu role bağlı olduğu için test de bu rolle çalışır.
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.businesses, public.reservations, public.payments, public.cash_flow,
  public.profiles, public.color_settings, public.sms_log to authenticated;

\echo '=== 1) A yöneticisi: yalnızca kendi rezervasyonunu görmeli ==='
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select count(*) as "A_gordugu_rezervasyon", string_agg(code, ',') as kodlar from public.reservations;

\echo '=== 2) B yöneticisi: yalnızca kendi rezervasyonunu görmeli ==='
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select count(*) as "B_gordugu_rezervasyon", string_agg(code, ',') as kodlar from public.reservations;

\echo '=== 3) A personeli: A yöneticisinin verisini görmeli ==='
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
select count(*) as "personel_gordugu", string_agg(code, ',') as kodlar from public.reservations;

\echo '=== 4) B, A''nin isletmesine rezervasyon YAZAMAMALI ==='
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
do $$
begin
  insert into public.reservations
    (business_id, code, customer_name, customer_phone, date, slot, organization_type, guest_count, total_amount, deposit)
  values ('aaaaaaaa-0000-0000-0000-000000000001','DT-HACK','Saldirgan','5000000000','2026-12-01','Gece','Düğün',10,1000,0);
  raise exception 'GUVENLIK ACIGI: B, A''nin isletmesine yazabildi!';
exception when insufficient_privilege or check_violation then
  raise notice 'BEKLENEN: yazma reddedildi (%)', sqlerrm;
end $$;

\echo '=== 5) B, A''nin rezervasyonunu SILEMEMELI ==='
with silinen as (delete from public.reservations where code = 'DT-A-0001' returning 1)
select count(*) as "B_silebildigi_satir" from silinen;

\echo '=== 6) B, A''nin profilini gorememeli ==='
select count(*) as "B_gordugu_profil", string_agg(email, ',') as epostalar from public.profiles;

\echo '=== 7) Kod dogrulama herkese acik ve telefon maskeli olmali ==='
reset role;
grant usage on schema public to anon;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select code, customer_name, customer_phone as maskeli_telefon, business_name
from public.verify_reservation_code('dt-a-0001');

\echo '=== 8) anon rolu rezervasyon tablosunu DOGRUDAN okuyamamali ==='
do $$
begin
  perform 1 from public.reservations limit 1;
  raise notice 'DIKKAT: anon tabloyu okuyabildi (satir sayisi RLS ile 0 olabilir)';
exception when insufficient_privilege then
  raise notice 'BEKLENEN: anon tabloya erisemedi';
end $$;

reset role;
