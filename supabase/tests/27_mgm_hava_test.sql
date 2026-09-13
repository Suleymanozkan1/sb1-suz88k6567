-- =====================================================================
-- MGM hava durumu şeması testi (0038)
--
-- Sınanan davranışlar:
--   1. Üç istasyon numarası ayrı ayrı saklanıyor mu?
--   2. Saatlik tablo geçersiz saat biçimini reddediyor mu?
--   3. Aynı saat iki kez yazılabiliyor mu? (yazılmamalı)
--   4. Temizlik fonksiyonu dünden öncesini siliyor, bugünü bırakıyor mu?
--   5. Personel saatlik tahmini GÖREBİLİYOR ama YAZAMIYOR mu?
--
-- Paketin varlık sebebi: MGM günlük, saatlik ve anlık gözlem için farklı
-- istasyon numaraları veriyor (Konya/Meram: 94201 / 17245 / 17245). Tek
-- numara saklansaydı saatlik tahmin sessizce boş kalırdı.
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off

\echo '=== 0) Test verisi ==='
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_pers  uuid := gen_random_uuid();
  v_biz   uuid;
begin
  insert into auth.users (id, email) values
    (v_owner, 'mgm-sahip@ornek.com'),
    (v_pers,  'mgm-personel@ornek.com');

  update public.profiles
  set full_name = 'Sahip', role = 'owner', owner_id = null
  where id = v_owner;

  update public.profiles
  set full_name = 'Personel', role = 'staff', owner_id = v_owner,
      permissions = array['rezervasyon.goruntule','tanim.goruntule'],
      permissions_version = 1
  where id = v_pers;

  insert into public.businesses (owner_id, name, city, district)
  values (v_owner, 'MGM Test Salonu', 'Konya', 'Meram')
  returning id into v_biz;

  perform set_config('test.owner', v_owner::text, false);
  perform set_config('test.pers', v_pers::text, false);
  perform set_config('test.biz', v_biz::text, false);
end $$;

\echo '=== 1) Uc istasyon numarasi ayri saklaniyor ==='
do $$
declare v_g text; v_s text; v_d text;
begin
  update public.businesses
  set weather_station = '94201',
      weather_station_hourly = '17245',
      weather_station_current = '17245'
  where id = current_setting('test.biz')::uuid;

  select weather_station, weather_station_hourly, weather_station_current
    into v_g, v_s, v_d
  from public.businesses where id = current_setting('test.biz')::uuid;

  if v_g <> '94201' or v_s <> '17245' or v_d <> '17245' then
    raise exception 'BASARISIZ: istasyon numaralari yazilmadi (% / % / %)', v_g, v_s, v_d;
  end if;
  -- Gunluk ve saatlik AYNI OLMAK ZORUNDA DEGIL; ayri kolonlar olmali.
  if v_g = v_s then
    raise exception 'BASARISIZ: gunluk ve saatlik numara ayrilmiyor';
  end if;
end $$;

\echo '=== 2) Gecersiz saat bicimi reddedilmeli ==='
do $$
declare v_hata boolean := false;
begin
  begin
    insert into public.weather_hourly (business_id, hour, temp_c)
    values (current_setting('test.biz')::uuid, '2026-09-13 19:00', 22);
  exception when others then
    v_hata := true;
  end;
  if not v_hata then
    raise exception 'BASARISIZ: bosluklu saat bicimi kabul edildi';
  end if;
end $$;

\echo '=== 3) Ayni saat iki kez yazilamaz ==='
do $$
declare v_hata boolean := false;
begin
  insert into public.weather_hourly (business_id, hour, temp_c, hadise)
  values (current_setting('test.biz')::uuid, '2026-09-13T19:00', 22, 'HY');
  begin
    insert into public.weather_hourly (business_id, hour, temp_c, hadise)
    values (current_setting('test.biz')::uuid, '2026-09-13T19:00', 25, 'A');
  exception when unique_violation then
    v_hata := true;
  end;
  if not v_hata then
    raise exception 'BASARISIZ: ayni saat ikinci kez yazildi';
  end if;
end $$;

\echo '=== 4) Temizlik dunden oncesini siler, bugunu birakir ==='
do $$
declare v_kalan integer;
begin
  delete from public.weather_hourly;
  insert into public.weather_hourly (business_id, hour, temp_c) values
    (current_setting('test.biz')::uuid, to_char(current_date - 5, 'YYYY-MM-DD') || 'T10:00', 10),
    (current_setting('test.biz')::uuid, to_char(current_date, 'YYYY-MM-DD') || 'T10:00', 20),
    (current_setting('test.biz')::uuid, to_char(current_date + 1, 'YYYY-MM-DD') || 'T10:00', 21);

  perform public.saatlik_havayi_temizle();

  select count(*) into v_kalan from public.weather_hourly;
  if v_kalan <> 2 then
    raise exception 'BASARISIZ: temizlik sonrasi % satir kaldi, 2 kalmaliydi', v_kalan;
  end if;

  -- Bugunun satiri DURMALI: "sabah ne oldu" da sorulan bir soru.
  if not exists (
    select 1 from public.weather_hourly
    where hour like to_char(current_date, 'YYYY-MM-DD') || '%'
  ) then
    raise exception 'BASARISIZ: bugunun satiri silindi';
  end if;
end $$;

\echo '=== 5) Personel saatligi GORUR ama YAZAMAZ ==='
do $$
declare v_adet integer; v_hata boolean := false;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.pers'))::text, true);
  set local role authenticated;

  select count(*) into v_adet from public.weather_hourly;
  if v_adet = 0 then
    raise exception 'BASARISIZ: tanim.goruntule yetkisi saatligi acmadi';
  end if;

  /*
    Hava tahminini elle degistirmenin bir anlami yok; satirlari yalnizca
    zamanlanmis gorev (service_role) yazar.
  */
  begin
    insert into public.weather_hourly (business_id, hour, temp_c)
    values (current_setting('test.biz')::uuid, '2030-01-01T10:00', 99);
  exception when others then
    v_hata := true;
  end;
  if not v_hata then
    raise exception 'BASARISIZ: personel saatlik tahmin yazabildi';
  end if;

  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

\echo '=== 27_mgm_hava_test TAMAM ==='
