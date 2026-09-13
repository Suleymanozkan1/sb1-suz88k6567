-- =====================================================================
-- MEB okul takvimi yazma testi (0039)
--
-- Sınanan davranışlar:
--   1. Okul günleri paylaşılan kayıt olarak yazılıyor mu?
--   2. Yeniden çalıştırma o yılın satırlarını tazeliyor mu? (MEB bir
--      tatili ertelediğinde eski tarih ortada kalmamalı)
--   3. Başka yılların satırlarına dokunuyor mu? (dokunmamalı)
--   4. İşletmenin KENDİ eklediği okul günü siliniyor mu? (silinmemeli)
--   5. Boş girdi mevcut kayıtları siliyor mu? (silmemeli)
--
-- Paketin varlık sebebi: MEB'in bir sayfa değişikliği çözümlemeyi
-- boşa düşürebilir. Boş liste silme yapsaydı, o an takvimdeki bütün
-- okul tatilleri kaybolurdu.
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off

\echo '=== 0) Test verisi ==='
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_biz   uuid;
begin
  insert into auth.users (id, email) values (v_owner, 'meb-sahip@ornek.com');
  update public.profiles set full_name = 'Sahip', role = 'owner', owner_id = null
  where id = v_owner;

  insert into public.businesses (owner_id, name) values (v_owner, 'MEB Test Salonu')
  returning id into v_biz;

  -- İşletmenin KENDİ eklediği okul günü: özel bir okulun takvimi.
  insert into public.special_days (business_id, day, label, kind, source)
  values (v_biz, '2026-11-17', 'Özel okul tatili', 'okul', 'isletme');

  -- Başka bir yılın sağlayıcı kaydı: dokunulmamalı.
  insert into public.special_days (business_id, day, label, kind, source)
  values (null, '2025-11-10', '1. ara tatil', 'okul', 'saglayici');

  perform set_config('test.biz', v_biz::text, false);
end $$;

\echo '=== 1) Okul gunleri paylasilan kayit olarak yaziliyor ==='
do $$
declare v_adet integer;
begin
  perform public.okul_gunlerini_yaz('[
    {"day":"2026-11-16","label":"1. ara tatil"},
    {"day":"2026-11-17","label":"1. ara tatil"},
    {"day":"2026-11-18","label":"1. ara tatil"}
  ]'::jsonb);

  select count(*) into v_adet from public.special_days
  where business_id is null and kind = 'okul' and source = 'saglayici'
    and extract(year from day) = 2026;
  if v_adet <> 3 then
    raise exception 'BASARISIZ: 3 gun yazilmaliydi, % yazildi', v_adet;
  end if;
end $$;

\echo '=== 2) Yeniden calistirma o yili tazeliyor ==='
do $$
declare v_adet integer;
begin
  -- MEB tatili bir hafta erteledi: eski tarihler kalkmali.
  perform public.okul_gunlerini_yaz('[
    {"day":"2026-11-23","label":"1. ara tatil"},
    {"day":"2026-11-24","label":"1. ara tatil"}
  ]'::jsonb);

  select count(*) into v_adet from public.special_days
  where business_id is null and kind = 'okul' and source = 'saglayici'
    and extract(year from day) = 2026;
  if v_adet <> 2 then
    raise exception 'BASARISIZ: tazeleme sonrasi % satir var, 2 olmaliydi', v_adet;
  end if;

  if exists (
    select 1 from public.special_days
    where business_id is null and day = '2026-11-16' and source = 'saglayici'
  ) then
    raise exception 'BASARISIZ: ertelenen eski tarih silinmedi';
  end if;
end $$;

\echo '=== 3) Baska yillara dokunmuyor ==='
do $$
begin
  if not exists (
    select 1 from public.special_days
    where business_id is null and day = '2025-11-10' and source = 'saglayici'
  ) then
    raise exception 'BASARISIZ: baska yilin kaydi silindi';
  end if;
end $$;

\echo '=== 4) Isletmenin kendi gunu korunuyor ==='
do $$
begin
  /*
    Aynı gün (2026-11-17) hem işletmenin kendi kaydında hem sağlayıcı
    listesindeydi. Sağlayıcı silmesi kaynağa bakmasaydı, salonun kendi
    girdiği özel okul tatili de gidecekti.
  */
  if not exists (
    select 1 from public.special_days
    where business_id = current_setting('test.biz')::uuid
      and day = '2026-11-17' and source = 'isletme'
  ) then
    raise exception 'BASARISIZ: isletmenin kendi okul gunu silindi';
  end if;
end $$;

\echo '=== 5) Bos girdi hicbir seyi silmiyor ==='
do $$
declare v_once integer; v_sonra integer;
begin
  select count(*) into v_once from public.special_days where kind = 'okul';

  perform public.okul_gunlerini_yaz('[]'::jsonb);
  perform public.okul_gunlerini_yaz(null);

  select count(*) into v_sonra from public.special_days where kind = 'okul';
  if v_once <> v_sonra then
    raise exception 'BASARISIZ: bos girdi % satiri sildi', v_once - v_sonra;
  end if;
end $$;

\echo '=== 28_meb_okul_takvimi_test TAMAM ==='
