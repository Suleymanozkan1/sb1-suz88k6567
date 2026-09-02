-- =====================================================================
-- İYS uyumu ve kuyruk testleri
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off

\set a_id '''11111111-1111-1111-1111-111111111111'''
\set biz '''aaaaaaaa-0000-0000-0000-000000000001'''

insert into auth.users (id, email, raw_user_meta_data)
values (:a_id, 'a@ornek.com', '{"company_name":"A Salonu","full_name":"A Yetkili"}');
insert into public.businesses (id, owner_id, name) values (:biz, :a_id, 'A Düğün Salonu');

\echo ''
\echo '=== 1) ISLEM bildirimi ONAY OLMADAN da kuyruga girmeli (MUAF) ==='
select queued as "islem_kuyruga_girdi", coalesce(reason,'-') as sebep
from public.enqueue_sms(:biz, '5321234567', 'Rezervasyonunuz kayit edildi.', 'Rezervasyon', 'islem');

\echo '=== 2) TICARI ileti ONAY OLMADAN kuyruga GIRMEMELI ==='
select queued as "ticari_engellendi_FALSE_OLMALI", reason as sebep
from public.enqueue_sms(:biz, '5321234567', 'Kampanya: %20 indirim!', 'Bilgilendirme', 'ticari');

\echo '=== 3) Engellenen ticari ileti denetlenebilir olsun (iptal kaydi) ==='
select status, category, last_error from public.sms_queue where category = 'ticari';

\echo ''
\echo '=== 4) ONAY verilince ticari ileti kuyruga girmeli ==='
insert into public.sms_consents (business_id, phone, status, source)
values (:biz, '5321234567', 'ONAY', 'HS_FIZIKSEL_ORTAM');
select queued as "onaydan_sonra_ticari_gecti"
from public.enqueue_sms(:biz, '5321234567', 'Kampanya: %20 indirim!', 'Bilgilendirme', 'ticari');

\echo '=== 5) RET verilince ticari ileti tekrar ENGELLENMELI ==='
update public.sms_consents set status = 'RET' where phone = '5321234567';
select queued as "ret_sonrasi_ticari_FALSE_OLMALI", reason
from public.enqueue_sms(:biz, '5321234567', 'Kampanya 2', 'Bilgilendirme', 'ticari');

\echo '=== 6) RET verse bile ISLEM bildirimi gitmeye devam etmeli (MUAF) ==='
select queued as "ret_sonrasi_islem_TRUE_OLMALI"
from public.enqueue_sms(:biz, '5321234567', 'Rezervasyon hatirlatma', 'Hatırlatma', 'islem');

\echo ''
\echo '=== 7) Izin gecmisi degisiklikleri kaydetmeli (ispat yukumlulugu) ==='
select status, source from public.sms_consent_history
where phone = '5321234567' order by changed_at;

\echo '=== 8) Numara normalize edilmeli (0/90 onekleri) ==='
select queued, (select phone from public.sms_queue order by created_at desc limit 1) as kaydedilen
from public.enqueue_sms(:biz, '+90 532 123 45 68', 'Test', 'Bilgilendirme', 'islem');

\echo '=== 9) Gecersiz numara reddedilmeli ==='
select queued as "gecersiz_FALSE_OLMALI", reason
from public.enqueue_sms(:biz, '12345', 'Test', 'Bilgilendirme', 'islem');

\echo ''
\echo '=== 10) Isleyici sirayi kilitleyerek almali ==='
select count(*) as "alinan_mesaj_sayisi" from public.claim_sms_batch(10);
select status, count(*) from public.sms_queue group by status order by 1;

\echo '=== 11) Basarisizlikta ustel geri cekilme uygulanmali ==='
\set qid '(select id from public.sms_queue where status = ''gonderiliyor'' limit 1)'
select public.complete_sms((select id from public.sms_queue where status='gonderiliyor' limit 1), false, 'Saglayici hatasi');
select status as "yeniden_beklemede", attempts,
       next_attempt_at > now() as "ileri_tarihe_alindi"
from public.sms_queue where last_error = 'Saglayici hatasi';

\echo '=== 12) Azami denemeden sonra kalici basarisiz olmali ==='
do $$
declare v_id uuid;
begin
  select id into v_id from public.sms_queue where last_error = 'Saglayici hatasi' limit 1;
  update public.sms_queue set attempts = 5 where id = v_id;
  perform public.complete_sms(v_id, false, 'Son hata');
end $$;
select status as "kalici_basarisiz" from public.sms_queue where last_error = 'Son hata';

\echo '=== 13) Basarili gonderimde damga ve referans yazilmali ==='
do $$
declare v_id uuid;
begin
  select id into v_id from public.sms_queue where status = 'gonderiliyor' limit 1;
  perform public.complete_sms(v_id, true, null, 'job-123');
end $$;
select status, provider_ref, sent_at is not null as "zaman_damgasi_var"
from public.sms_queue where provider_ref = 'job-123';

\echo '=== 14) Takili kalan kayitlar kurtarilmali ==='
update public.sms_queue set status = 'gonderiliyor', created_at = now() - interval '30 minutes'
where status = 'gonderildi';
select public.requeue_stuck_sms() as "kurtarilan_kayit";

\echo ''
\echo '=== 15) Istemci kuyruga DOGRUDAN yazamamali (kural atlatilamasin) ==='
grant usage on schema public to authenticated;
grant select on public.sms_queue, public.sms_consents to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$
begin
  insert into public.sms_queue (business_id, phone, body, category)
  values ('aaaaaaaa-0000-0000-0000-000000000001','5320000000','Kural disi','ticari');
  raise exception 'GUVENLIK ACIGI: istemci kuyruga dogrudan yazabildi!';
exception when insufficient_privilege then
  raise notice 'BEKLENEN: dogrudan yazma reddedildi';
end $$;

\echo '=== 16) Isleyici fonksiyonlari istemciye kapali olmali ==='
do $$
begin
  perform public.claim_sms_batch(1);
  raise exception 'GUVENLIK ACIGI: istemci kuyrugu isleyebildi!';
exception when insufficient_privilege then
  raise notice 'BEKLENEN: claim_sms_batch istemciye kapali';
end $$;

do $$
begin
  perform public.complete_sms(gen_random_uuid(), true);
  raise exception 'GUVENLIK ACIGI: istemci gonderim sonucu yazabildi!';
exception when insufficient_privilege then
  raise notice 'BEKLENEN: complete_sms istemciye kapali';
end $$;

reset role;
