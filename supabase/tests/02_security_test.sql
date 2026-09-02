-- =====================================================================
-- Güvenlik testleri: hız sınırı, giriş kilidi, denetim kaydı
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off

\set a_id '''11111111-1111-1111-1111-111111111111'''
\set b_id '''22222222-2222-2222-2222-222222222222'''

insert into auth.users (id, email, raw_user_meta_data) values
  (:a_id, 'a@ornek.com', '{"company_name":"A Salonu","full_name":"A Yetkili"}'),
  (:b_id, 'b@ornek.com', '{"company_name":"B Salonu","full_name":"B Yetkili"}');

insert into public.businesses (id, owner_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', :a_id, 'A Düğün Salonu'),
  ('bbbbbbbb-0000-0000-0000-000000000001', :b_id, 'B Düğün Salonu');

\echo ''
\echo '=== 1) Hiz siniri: 3 istek/60sn ==='
select
  public.check_rate_limit('test', 'ip-1', 3, 60) as istek_1,
  public.check_rate_limit('test', 'ip-1', 3, 60) as istek_2,
  public.check_rate_limit('test', 'ip-1', 3, 60) as istek_3,
  public.check_rate_limit('test', 'ip-1', 3, 60) as istek_4_REDDEDILMELI,
  public.check_rate_limit('test', 'ip-1', 3, 60) as istek_5_REDDEDILMELI;

\echo '=== 2) Hiz siniri kimlige gore ayri sayilmali ==='
select public.check_rate_limit('test', 'ip-2', 3, 60) as farkli_ip_gecmeli;

\echo '=== 3) Kova (bucket) bazinda ayri sayilmali ==='
select public.check_rate_limit('diger', 'ip-1', 3, 60) as farkli_kova_gecmeli;

\echo ''
\echo '=== 4) Giris kilidi: 5 basarisiz denemeden sonra kilit ==='
select public.record_login_attempt('kurban@ornek.com', '1.2.3.4', false) from generate_series(1, 4);
select locked as "4_denemede_kilit_YOK", failed_count from public.login_lock_status('kurban@ornek.com');

select public.record_login_attempt('kurban@ornek.com', '1.2.3.4', false);
select locked as "5_denemede_KILITLI", failed_count, retry_after_seconds > 0 as sure_var
from public.login_lock_status('kurban@ornek.com');

\echo '=== 5) Kilit e-postaya ozel, digerini etkilememeli ==='
select locked as "baska_hesap_kilitsiz" from public.login_lock_status('baska@ornek.com');

\echo '=== 6) Basarili giris onceki basarisizliklari temizlemeli ==='
select public.record_login_attempt('kurban@ornek.com', '1.2.3.4', true);
select locked as "basarili_giristen_sonra_kilitsiz", failed_count
from public.login_lock_status('kurban@ornek.com');

\echo '=== 7) Buyuk/kucuk harf farki kilidi atlatmamali ==='
select public.record_login_attempt('Test@Ornek.com', '1.2.3.4', false) from generate_series(1, 5);
select locked as "farkli_yazimla_da_KILITLI" from public.login_lock_status('TEST@ORNEK.COM');

\echo ''
\echo '=== 8) Denetim kaydi: rezervasyon eklemede yazilmali ==='
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
insert into public.reservations
  (id, business_id, code, customer_name, customer_phone, date, slot, organization_type, guest_count, total_amount, deposit)
values
  ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
   'DT-A-0001','A Müşterisi','5321110000','2026-10-10','Gece','Düğün',200,100000,20000);

select action, table_name, summary, actor_email
from public.audit_log where table_name = 'reservations';

\echo '=== 9) Guncellemede yalnizca degisen alan kaydedilmeli ==='
update public.reservations set guest_count = 350
where id = 'cccccccc-0000-0000-0000-000000000001';

select action, changed -> 'guest_count' as guest_count_degisimi,
       (changed ? 'customer_name') as degismeyen_alan_var_mi
from public.audit_log where action = 'UPDATE' and table_name = 'reservations';

\echo '=== 10) Anlamsiz guncelleme (ayni deger) kayit YAZMAMALI ==='
select count(*) as onceki from public.audit_log where table_name = 'reservations';
update public.reservations set guest_count = 350
where id = 'cccccccc-0000-0000-0000-000000000001';
select count(*) as sonraki_AYNI_OLMALI from public.audit_log where table_name = 'reservations';

\echo ''
\echo '=== 11) Denetim kaydini yalnizca kapsam sahibi okumali ==='
-- Supabase'de oturum açan kullanıcılar "authenticated" rolündedir;
-- politikalar bu role bağlı olduğu için test de bu rolle çalışır.
grant usage on schema public to authenticated;
grant select on public.audit_log to authenticated;
set role authenticated;

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select
  count(*) filter (where owner_id = '11111111-1111-1111-1111-111111111111') as "A_kendi_kayitlari",
  count(*) filter (where owner_id <> '11111111-1111-1111-1111-111111111111') as "A_gordugu_YABANCI_kayit_SIFIR_OLMALI",
  count(*) filter (where table_name = 'reservations') as "A_rezervasyon_kaydi"
from public.audit_log;

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select
  count(*) filter (where owner_id = '22222222-2222-2222-2222-222222222222') as "B_kendi_kayitlari",
  count(*) filter (where owner_id <> '22222222-2222-2222-2222-222222222222') as "B_gordugu_YABANCI_kayit_SIFIR_OLMALI",
  count(*) filter (where table_name = 'reservations') as "B_gordugu_A_rezervasyonu_SIFIR_OLMALI"
from public.audit_log;

\echo '=== 12) Denetim kaydi degistirilememeli ==='
do $$
begin
  update public.audit_log set summary = 'degistirildi' where true;
  raise exception 'GUVENLIK ACIGI: denetim kaydi degistirilebildi!';
exception when insufficient_privilege then
  raise notice 'BEKLENEN: denetim kaydi degistirilemedi';
end $$;

\echo '=== 13) Hiz siniri tablosu istemciden okunamamali ==='
do $$
begin
  perform 1 from public.rate_limits limit 1;
  raise exception 'GUVENLIK ACIGI: rate_limits okunabildi!';
exception when insufficient_privilege then
  raise notice 'BEKLENEN: rate_limits erisilemez';
end $$;

\echo '=== 14) Giris denemeleri istemciden okunamamali ==='
do $$
begin
  perform 1 from public.login_attempts limit 1;
  raise exception 'GUVENLIK ACIGI: login_attempts okunabildi!';
exception when insufficient_privilege then
  raise notice 'BEKLENEN: login_attempts erisilemez';
end $$;

\echo '=== 15) Kilit fonksiyonu istemciden cagrilamamali ==='
do $$
begin
  perform public.record_login_attempt('sahte@ornek.com', null, true);
  raise exception 'GUVENLIK ACIGI: istemci giris denemesi yazabildi!';
exception when insufficient_privilege then
  raise notice 'BEKLENEN: fonksiyon istemciye kapali';
end $$;

reset role;
