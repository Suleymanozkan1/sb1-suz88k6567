-- =====================================================================
-- Yedekleme ve geri yükleme doğrulaması
--
-- Amaç: yedeğin GERÇEKTEN geri yüklenebildiğini kanıtlamak.
-- Test edilmemiş bir yedek, yedek değildir.
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off

\set a_id '''11111111-1111-1111-1111-111111111111'''
\set b_id '''22222222-2222-2222-2222-222222222222'''
\set biz '''aaaaaaaa-0000-0000-0000-000000000001'''
\set res '''cccccccc-0000-0000-0000-000000000001'''

-- Kaynak veri
insert into auth.users (id, email, raw_user_meta_data) values
  (:a_id, 'a@ornek.com', '{"company_name":"A Salonu","full_name":"A Yetkili"}'),
  (:b_id, 'b@ornek.com', '{"company_name":"B Salonu","full_name":"B Yetkili"}');

insert into public.businesses (id, owner_id, name, city, capacity) values
  (:biz, :a_id, 'A Düğün Salonu', 'İstanbul', 500),
  ('bbbbbbbb-0000-0000-0000-000000000001', :b_id, 'B Salonu', 'Ankara', 300);

insert into public.reservations
  (id, business_id, code, customer_name, customer_phone, date, slot, organization_type,
   guest_count, total_amount, deposit)
values
  (:res, :biz, 'DT-A-0001', 'A Müşterisi', '5321110000', '2026-10-10', 'Gece', 'Düğün', 200, 100000, 20000),
  (gen_random_uuid(), :biz, 'DT-A-0002', 'İkinci Müşteri', '5321110001', '2026-11-11', 'Gündüz', 'Nişan', 150, 60000, 10000);

insert into public.payments (reservation_id, date, amount, method)
values (:res, '2026-09-01', 30000, 'Nakit');

insert into public.cash_flow (business_id, kind, date, category, amount)
values (:biz, 'Gider', '2026-09-01', 'Elektrik', 5000);

insert into public.sms_consents (business_id, phone, status, source)
values (:biz, '5321110000', 'ONAY', 'HS_FIZIKSEL_ORTAM');

\echo ''
\echo '=== 1) Disa aktarim tum bolumleri icermeli ==='
select
  jsonb_object_keys_count as bolum_sayisi,
  (d ? 'isletmeler') and (d ? 'rezervasyonlar') and (d ? 'tahsilatlar')
    and (d ? 'kasa') and (d ? 'sms_izinleri') as tum_bolumler_var
from (
  select public.export_owner_data('11111111-1111-1111-1111-111111111111') as d
) x, lateral (select count(*) from jsonb_object_keys(x.d)) k(jsonb_object_keys_count);

\echo '=== 2) Yedek YALNIZCA kendi kapsamini icermeli (sizinti yok) ==='
select
  jsonb_array_length(d -> 'isletmeler') as isletme_sayisi,
  (d -> 'isletmeler') @> '[{"name": "A Düğün Salonu"}]'::jsonb as kendi_isletmesi_var,
  (d -> 'isletmeler') @> '[{"name": "B Salonu"}]'::jsonb as YABANCI_ISLETME_FALSE_OLMALI
from (select public.export_owner_data('11111111-1111-1111-1111-111111111111') as d) x;

\echo '=== 3) Satir sayilari kaynakla eslesmeli ==='
select public.backup_row_counts('11111111-1111-1111-1111-111111111111') as sayimlar;

\echo ''
\echo '=== 4) Yedegi TEMIZ bir semaya GERI YUKLE ==='
create schema if not exists geri_yukleme;
drop table if exists geri_yukleme.isletmeler, geri_yukleme.rezervasyonlar,
                     geri_yukleme.tahsilatlar, geri_yukleme.kasa, geri_yukleme.izinler;

create table geri_yukleme.isletmeler     (like public.businesses    including defaults);
create table geri_yukleme.rezervasyonlar (like public.reservations  including defaults);
create table geri_yukleme.tahsilatlar    (like public.payments      including defaults);
create table geri_yukleme.kasa           (like public.cash_flow     including defaults);
create table geri_yukleme.izinler        (like public.sms_consents  including defaults);

do $$
declare v_backup jsonb;
begin
  v_backup := public.export_owner_data('11111111-1111-1111-1111-111111111111');

  insert into geri_yukleme.isletmeler
    select * from jsonb_populate_recordset(null::public.businesses, v_backup -> 'isletmeler');
  insert into geri_yukleme.rezervasyonlar
    select * from jsonb_populate_recordset(null::public.reservations, v_backup -> 'rezervasyonlar');
  insert into geri_yukleme.tahsilatlar
    select * from jsonb_populate_recordset(null::public.payments, v_backup -> 'tahsilatlar');
  insert into geri_yukleme.kasa
    select * from jsonb_populate_recordset(null::public.cash_flow, v_backup -> 'kasa');
  insert into geri_yukleme.izinler
    select * from jsonb_populate_recordset(null::public.sms_consents, v_backup -> 'sms_izinleri');
end $$;

\echo '=== 5) Geri yuklenen satir sayilari kaynakla AYNI olmali ==='
select
  (select count(*) from geri_yukleme.isletmeler)     as isletme,
  (select count(*) from geri_yukleme.rezervasyonlar) as rezervasyon,
  (select count(*) from geri_yukleme.tahsilatlar)    as tahsilat,
  (select count(*) from geri_yukleme.kasa)           as kasa,
  (select count(*) from geri_yukleme.izinler)        as izin;

\echo '=== 6) Parasal degerler bozulmadan gelmeli ==='
select code, customer_name, total_amount, deposit, guest_count, date, slot
from geri_yukleme.rezervasyonlar order by code;

\echo '=== 7) Iliskisel butunluk korunmali (tahsilat -> rezervasyon) ==='
select
  count(*) as tahsilat_sayisi,
  count(*) filter (
    where exists (select 1 from geri_yukleme.rezervasyonlar r where r.id = t.reservation_id)
  ) as eslesen_rezervasyon_AYNI_OLMALI
from geri_yukleme.tahsilatlar t;

\echo '=== 8) Turkce karakterler ve tarihler bozulmamali ==='
select customer_name, date::text
from geri_yukleme.rezervasyonlar where customer_name like 'İkinci%';

\echo ''
\echo '=== 9) Baska kapsamin verisi disa aktarilamamali ==='
grant usage on schema public to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
do $$
begin
  perform public.export_owner_data('11111111-1111-1111-1111-111111111111');
  raise exception 'GUVENLIK ACIGI: baskasinin verisi disa aktarilabildi!';
exception when insufficient_privilege then
  raise notice 'BEKLENEN: yabanci kapsam disa aktarilamadi';
end $$;

\echo '=== 10) Kendi kapsamini disa aktarabilmeli ==='
select jsonb_array_length(public.export_owner_data('22222222-2222-2222-2222-222222222222') -> 'isletmeler')
  as B_kendi_isletme_sayisi;

\echo ''
\echo '=== 11) Sistem durumu ozeti calismali ==='
reset role;
select public.system_health('11111111-1111-1111-1111-111111111111') as durum;

\echo '=== 12) Yedek kaydi istemciden degistirilememeli ==='
insert into public.backup_runs (owner_id, status, finished_at)
values ('11111111-1111-1111-1111-111111111111', 'basarili', now());
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$
begin
  update public.backup_runs set status = 'basarisiz' where true;
  raise exception 'GUVENLIK ACIGI: yedek kaydi degistirilebildi!';
exception when insufficient_privilege then
  raise notice 'BEKLENEN: yedek kaydi degistirilemedi';
end $$;

\echo '=== 13) Son yedek bilgisi durum ozetinde gorunmeli ==='
select public.system_health('11111111-1111-1111-1111-111111111111') -> 'son_yedek' as son_yedek;

reset role;
drop schema geri_yukleme cascade;
