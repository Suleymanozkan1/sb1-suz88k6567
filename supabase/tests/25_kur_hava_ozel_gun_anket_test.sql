-- =====================================================================
-- Döviz/altın, hava durumu, özel günler ve anket testi
-- (0034, maddeler 28-31)
--
-- Sınanan davranışlar:
--   1. Tablolar, enum ve alanlar kuruldu mu?
--   2. Kur YAZMA istemciye kapalı mı? (kapalı olmalı)
--   3. Hava tahmini başka işletmeye sızıyor mu? (sızmamalı)
--   4. Ortak resmî tatiller herkese görünüyor mu? (görünmeli)
--   5. Ortak gün istemciden değiştirilebiliyor mu? (değiştirilememeli)
--   6. İşletme kendi gününü ekleyip silebiliyor mu? (ekleyebilmeli)
--   7. Yetkisiz personel özel gün yazabiliyor mu? (yazamamalı)
--   8. Anket jetonu tahmin edilebilir mi? (olmamalı)
--   9. Anket istemciden yazılabiliyor mu? (yazılamamalı)
--  10. Rezervasyon başına ikinci anket açılabiliyor mu? (açılamamalı)
--  11. Tohumlanan günler yalnızca SABİT TARİHLİ mi? (dini gün olmamalı)
--
-- Sekizinci ve dokuzuncu maddeler kritik: anket bağlantısı müşteriye
-- e-postayla gidiyor ve müşterinin sistemde hesabı yok. Jeton tahmin
-- edilebilseydi ya da istemci doğrudan yazabilseydi, herkes başka
-- çiftin anketini doldurabilirdi.
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off

\echo '=== 0) Test verisi ==='
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_baska uuid := gen_random_uuid();
  v_pers  uuid := gen_random_uuid();
  v_biz   uuid;
  v_biz2  uuid;
  v_hall  uuid;
  v_rez   uuid;
begin
  insert into auth.users (id, email) values
    (v_owner, 'anket-sahip@ornek.com'),
    (v_baska, 'anket-baska@ornek.com'),
    (v_pers,  'anket-personel@ornek.com');

  insert into public.businesses (owner_id, name) values (v_owner, 'Anket Test Salonu')
    returning id into v_biz;
  insert into public.businesses (owner_id, name) values (v_baska, 'Baska Salon')
    returning id into v_biz2;

  -- Personel: aynı kapsamda ama ayarlar yetkisi YOK.
  update public.profiles
     set owner_id = v_owner, role = 'staff', permissions = array['rezervasyon.goruntule']
   where id = v_pers;

  insert into public.halls (business_id, name) values (v_biz, 'Anket Test Salonu A')
    returning id into v_hall;

  insert into public.reservations
    (business_id, hall_id, code, customer_name, customer_phone, date, slot,
     organization_type, guest_count, total_amount, deposit)
  values (v_biz, v_hall, '2026-900', 'Anket Cifti', '5321112233', '2026-09-12',
          'Gece', 'Düğün', 300, 250000, 60000)
    returning id into v_rez;

  perform set_config('test.owner', v_owner::text, false);
  perform set_config('test.baska', v_baska::text, false);
  perform set_config('test.pers',  v_pers::text,  false);
  perform set_config('test.biz',   v_biz::text,   false);
  perform set_config('test.biz2',  v_biz2::text,  false);
  perform set_config('test.rez',   v_rez::text,   false);
end $$;

\echo '=== 1) Sema ==='
select
  to_regclass('public.exchange_rates')   as kur,
  to_regclass('public.weather_forecasts') as hava,
  to_regclass('public.special_days')     as ozel_gun,
  to_regclass('public.surveys')          as anket,
  to_regtype('special_day_kind')         as gun_turu;

do $$ begin
  if to_regclass('public.exchange_rates') is null then
    raise exception 'BASARISIZ: exchange_rates yok';
  end if;
  if to_regclass('public.weather_forecasts') is null then
    raise exception 'BASARISIZ: weather_forecasts yok';
  end if;
  if to_regclass('public.special_days') is null then
    raise exception 'BASARISIZ: special_days yok';
  end if;
  if to_regclass('public.surveys') is null then
    raise exception 'BASARISIZ: surveys yok';
  end if;
  if to_regtype('special_day_kind') is null then
    raise exception 'BASARISIZ: special_day_kind enum yok';
  end if;

  -- Ayarlardan girilen alanlar (maddeler 29 ve 31).
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'businesses'
                   and column_name = 'weather_location') then
    raise exception 'BASARISIZ: businesses.weather_location yok';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'businesses'
                   and column_name = 'survey_email') then
    raise exception 'BASARISIZ: businesses.survey_email yok';
  end if;
  -- Bugünün anlık sıcaklığı.
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'weather_forecasts'
                   and column_name = 'current_c') then
    raise exception 'BASARISIZ: weather_forecasts.current_c yok';
  end if;
end $$;

\echo '=== 2) Kur: okuma acik, YAZMA KAPALI ==='
do $$ begin
  -- Sağlayıcı anahtarı sunucuda; istemci yazabilseydi ekrandaki kur
  -- kullanıcıdan kullanıcıya değişirdi.
  if has_table_privilege('authenticated', 'public.exchange_rates', 'INSERT') then
    raise exception 'BASARISIZ: istemci kur ekleyebiliyor';
  end if;
  if has_table_privilege('authenticated', 'public.exchange_rates', 'UPDATE') then
    raise exception 'BASARISIZ: istemci kur guncelleyebiliyor';
  end if;
  if has_table_privilege('authenticated', 'public.exchange_rates', 'DELETE') then
    raise exception 'BASARISIZ: istemci kur silebiliyor';
  end if;
  if not has_table_privilege('authenticated', 'public.exchange_rates', 'SELECT') then
    raise exception 'BASARISIZ: istemci kuru okuyamiyor';
  end if;
end $$;

do $$ begin
  -- Tanınmayan kod kısıta takılmalı; ekranda karşılığı yok.
  begin
    insert into public.exchange_rates (code, buy, sell, quoted_at)
    values ('BTC', 1, 2, now());
    raise exception 'BASARISIZ: taninmayan kur kodu kabul edildi';
  exception when check_violation then null;
  end;
end $$;

\echo '=== 3) Hava tahmini yalnizca kendi isletmesine ==='
do $$
declare v_sayi integer;
begin
  insert into public.weather_forecasts (business_id, day, min_c, max_c, summary)
  values (current_setting('test.biz')::uuid, '2026-09-12', 17.4, 28.6, 'Parcali bulutlu');

  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.baska'))::text, true);
  set local role authenticated;

  select count(*) into v_sayi from public.weather_forecasts;
  if v_sayi <> 0 then
    raise exception 'BASARISIZ: baskasinin hava tahmini gorunuyor (%)', v_sayi;
  end if;

  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

do $$ begin
  if has_table_privilege('authenticated', 'public.weather_forecasts', 'INSERT') then
    raise exception 'BASARISIZ: istemci hava tahmini yazabiliyor';
  end if;
end $$;

\echo '=== 4) Resmi tatiller herkese gorunur ==='
do $$
declare v_sayi integer;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.baska'))::text, true);
  set local role authenticated;

  select count(*) into v_sayi from public.special_days where business_id is null;
  if v_sayi = 0 then
    raise exception 'BASARISIZ: ortak resmi tatiller gorunmuyor';
  end if;

  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

\echo '=== 5) Ortak gun ISTEMCIDEN degistirilemez ==='
do $$
declare v_id uuid; v_etkilenen integer;
begin
  select id into v_id from public.special_days where business_id is null limit 1;

  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.owner'))::text, true);
  set local role authenticated;

  /*
    RLS silmeyi ENGELLEMEZ, satiri GORUNMEZ kilar: politika eslesmeyen
    satir silinmez ve komut hata da vermez. Bu yuzden hata degil,
    ETKILENEN SATIR SAYISI sinaniyor.
  */
  delete from public.special_days where id = v_id;
  get diagnostics v_etkilenen = row_count;
  if v_etkilenen <> 0 then
    raise exception 'BASARISIZ: ortak gun silindi';
  end if;

  update public.special_days set label = 'Degistirildi' where id = v_id;
  get diagnostics v_etkilenen = row_count;
  if v_etkilenen <> 0 then
    raise exception 'BASARISIZ: ortak gun degistirildi';
  end if;

  -- İstemci yeni bir ORTAK gün de ekleyememeli.
  begin
    insert into public.special_days (business_id, day, label, kind)
    values (null, '2026-04-01', 'Sahte tatil', 'resmi_tatil');
    raise exception 'BASARISIZ: istemci ortak gun ekledi';
  exception when insufficient_privilege then null;
  end;

  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

\echo '=== 6) Isletme kendi gununu ekler ve siler ==='
do $$
declare v_id uuid; v_etkilenen integer;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.owner'))::text, true);
  set local role authenticated;

  insert into public.special_days (business_id, day, label, kind)
  values (current_setting('test.biz')::uuid, '2026-03-20', 'Ramazan Bayrami 1. Gun', 'dini_bayram')
  returning id into v_id;

  -- Aynı gün ve isimde ikinci kayıt olmamalı.
  begin
    insert into public.special_days (business_id, day, label, kind)
    values (current_setting('test.biz')::uuid, '2026-03-20', 'Ramazan Bayrami 1. Gun', 'kandil');
    raise exception 'BASARISIZ: ayni gun ve isimde ikinci kayit kabul edildi';
  exception when unique_violation then null;
  end;

  -- Boş isim kabul edilmemeli.
  begin
    insert into public.special_days (business_id, day, label)
    values (current_setting('test.biz')::uuid, '2026-03-21', '   ');
    raise exception 'BASARISIZ: bos isimli gun kabul edildi';
  exception when check_violation then null;
  end;

  delete from public.special_days where id = v_id;
  get diagnostics v_etkilenen = row_count;
  if v_etkilenen <> 1 then
    raise exception 'BASARISIZ: isletme kendi gununu silemedi';
  end if;

  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

\echo '=== 7) Yetkisiz personel ozel gun yazamaz ==='
do $$ begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.pers'))::text, true);
  set local role authenticated;

  -- Yetki denetimi SUNUCUDA (madde 33): arayüzü atlayan istek de düşmeli.
  begin
    insert into public.special_days (business_id, day, label, kind)
    values (current_setting('test.biz')::uuid, '2026-05-05', 'Personel gunu', 'ozel');
    raise exception 'BASARISIZ: yetkisiz personel ozel gun ekledi';
  exception when insufficient_privilege then null;
  end;

  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

\echo '=== 8) Anket jetonu tahmin edilemez olmali ==='
do $$
declare v_jeton text; v_jeton2 text;
begin
  insert into public.surveys (business_id, reservation_id)
  values (current_setting('test.biz')::uuid, current_setting('test.rez')::uuid)
  returning token into v_jeton;

  if v_jeton is null or length(v_jeton) < 32 then
    raise exception 'BASARISIZ: anket jetonu cok kisa (%)', coalesce(length(v_jeton), 0);
  end if;
  -- Rezervasyon kimliğinden türetilmiş olmamalı.
  if position(current_setting('test.rez') in v_jeton) > 0 then
    raise exception 'BASARISIZ: jeton rezervasyon kimligini tasiyor';
  end if;

  select encode(gen_random_bytes(24), 'hex') into v_jeton2;
  if v_jeton = v_jeton2 then
    raise exception 'BASARISIZ: jeton sabit uretiliyor';
  end if;
end $$;

\echo '=== 9) Rezervasyon basina tek anket ==='
do $$ begin
  -- Görev günde birkaç kez çalışsa da aynı çifte ikinci anket açılmamalı.
  begin
    insert into public.surveys (business_id, reservation_id)
    values (current_setting('test.biz')::uuid, current_setting('test.rez')::uuid);
    raise exception 'BASARISIZ: ayni rezervasyona ikinci anket acildi';
  exception when unique_violation then null;
  end;
end $$;

\echo '=== 10) Anket ISTEMCIDEN yazilamaz ==='
do $$ begin
  if has_table_privilege('authenticated', 'public.surveys', 'INSERT') then
    raise exception 'BASARISIZ: istemci anket acabiliyor';
  end if;
  if has_table_privilege('authenticated', 'public.surveys', 'UPDATE') then
    raise exception 'BASARISIZ: istemci anket cevabi yazabiliyor';
  end if;
  if has_table_privilege('authenticated', 'public.surveys', 'DELETE') then
    raise exception 'BASARISIZ: istemci anket silebiliyor';
  end if;
end $$;

\echo '=== 11) Anket sonucu rapor yetkisine bagli ==='
do $$
declare v_sayi integer;
begin
  -- Personelde rapor.goruntule yok: sonuclari gormemeli (madde 33).
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.pers'))::text, true);
  set local role authenticated;

  select count(*) into v_sayi from public.surveys;
  if v_sayi <> 0 then
    raise exception 'BASARISIZ: yetkisiz personel anket sonucu gordu (%)', v_sayi;
  end if;

  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

\echo '=== 12) Tohumlanan gunler yalnizca SABIT TARIHLI ==='
do $$
declare v_sayi integer;
begin
  /*
    Dini gunler ve okul tarihleri TOHUMLANMIYOR: ilki Diyanet'in yillik
    takvimine, ikincisi MEB'in kararina bagli. Hesaplanmis bir hicri
    tarih gerceginden bir gun sapabilir ve o gunu tatil sanip salonu
    kapatmak salona zarar verir.
  */
  select count(*) into v_sayi from public.special_days
   where business_id is null and kind in ('dini_bayram', 'kandil', 'okul');
  if v_sayi <> 0 then
    raise exception 'BASARISIZ: dini gun/okul tarihi tohumlanmis (%)', v_sayi;
  end if;

  -- 29 Ekim her tohumlanan yilda olmali.
  select count(*) into v_sayi from public.special_days
   where business_id is null and to_char(day, 'MM-DD') = '10-29';
  if v_sayi < 4 then
    raise exception 'BASARISIZ: 29 Ekim yeterli yil icin tohumlanmamis (%)', v_sayi;
  end if;
end $$;

\echo '=== 13) Tohumlama ikinci kez calissa da cogaltmiyor ==='
do $$
declare v_once integer; v_sonra integer; v_yil integer := extract(year from current_date)::int;
begin
  select count(*) into v_once from public.special_days where business_id is null;
  perform public.resmi_tatilleri_tohumla(v_yil);
  select count(*) into v_sonra from public.special_days where business_id is null;
  if v_once <> v_sonra then
    raise exception 'BASARISIZ: tohumlama satirlari cogaltti (% -> %)', v_once, v_sonra;
  end if;
end $$;

\echo '=== TUM TESTLER GECTI ==='
