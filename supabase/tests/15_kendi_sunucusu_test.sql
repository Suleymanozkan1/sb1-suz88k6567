-- =====================================================================
-- Kendi sunucusunda çalışma güvenceleri (0000 + 0021)
--
-- Bu paket, Supabase'in sessizce sağladığı şeylerin artık göç
-- dosyalarında gerçekten var olduğunu doğrular. Eksiklikleri yönetilen
-- ortamda GÖRÜNMÜYORDU: Supabase `public` şemasındaki tablolara
-- yetkileri kendiliğinden verdiği için, 15 çekirdek tabloda hiç grant
-- satırı olmamasına rağmen sistem çalışıyordu. Kendi sunucusunda aynı
-- sistem "permission denied" verip hiç açılmazdı.
--
-- Sınanan davranışlar:
--   1. auth şeması ve auth.uid() göçlerde kurulu mu?
--   2. auth.uid() PostgREST'in HER İKİ talep biçimini de okuyor mu?
--   3. Politikası olan her tablonun yetkisi de var mı?
--   4. Kiracı izolasyonu gerçekten ayırıyor mu?
--   5. Şifre hash'i ve giriş denemeleri tarayıcıya kapalı mı?
--   6. İletişim geçmişi düzeltilemez kaldı mı? (0019 güvencesi)
--   7. Müşterinin kod sorgusu oturumsuz çalışıyor mu?
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off

\echo '=== 1) auth katmani GOCLERDE kurulu olmali ==='
do $$
begin
  if to_regclass('auth.users') is null then
    raise exception 'HATA: auth.users yok; 0000 uygulanmamis';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'uid'
  ) then
    raise exception 'HATA: auth.uid() yok; butun RLS politikalari coker';
  end if;
  raise notice 'OK: auth semasi ve auth.uid() kurulu';
end $$;

\echo '=== 2) auth.uid() HER IKI talep bicimini de okumali ==='
do $$
declare
  v_kimlik uuid := gen_random_uuid();
  v_okunan uuid;
begin
  -- Eski biçim: PostgREST 9 ve oncesi
  perform set_config('request.jwt.claim.sub', v_kimlik::text, true);
  perform set_config('request.jwt.claims', '', true);
  select auth.uid() into v_okunan;
  if v_okunan is distinct from v_kimlik then
    raise exception 'HATA: eski talep bicimi okunamadi';
  end if;

  -- Yeni biçim: PostgREST 10 ve sonrasi JSON olarak yayimliyor
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_kimlik)::text, true);
  select auth.uid() into v_okunan;
  if v_okunan is distinct from v_kimlik then
    -- PostgREST yukseltilince butun sorgular sessizce bos donerdi.
    raise exception 'HATA: yeni talep bicimi okunamadi';
  end if;

  perform set_config('request.jwt.claims', '', true);
  raise notice 'OK: iki talep bicimi de okunuyor';
end $$;

\echo '=== 3) Politikasi olan her tablonun YETKISI de olmali ==='
do $$
declare v_eksik text;
begin
  select string_agg(c.relname, ', ') into v_eksik
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and exists (
      select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = c.relname and p.cmd in ('ALL', 'SELECT')
    )
    and not has_table_privilege('authenticated', c.oid, 'SELECT');

  if v_eksik is not null then
    raise exception 'HATA: politikasi olup yetkisi olmayan tablolar: %', v_eksik;
  end if;
  raise notice 'OK: politika ve yetki ortusuyor';
end $$;

\echo '=== 4) Kiraci izolasyonu AYIRMALI ==='
do $$
declare
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_sayi int;
begin
  insert into auth.users (id, email) values (v_a, 'izolasyon-a@ornek.com'), (v_b, 'izolasyon-b@ornek.com');
  insert into public.businesses (owner_id, name, category, city, district, phone, capacity, currency)
  values (v_a, 'A Salonu', 'Düğün Salonu', 'İstanbul', 'Kadıköy', '5320000001', 300, 'TL');
  insert into public.businesses (owner_id, name, category, city, district, phone, capacity, currency)
  values (v_b, 'B Salonu', 'Düğün Salonu', 'Ankara', 'Çankaya', '5320000002', 300, 'TL');

  perform set_config('request.jwt.claims', json_build_object('sub', v_a)::text, true);
  set local role authenticated;
  select count(*) into v_sayi from public.businesses;
  reset role;

  if v_sayi <> 1 then
    raise exception 'HATA: A kullanicisi % isletme gordu, 1 gormeliydi', v_sayi;
  end if;
  perform set_config('request.jwt.claims', '', true);
  raise notice 'OK: kiraci izolasyonu calisiyor';
end $$;

\echo '=== 5) Sifre ve giris denemeleri tarayiciya KAPALI olmali ==='
do $$
begin
  if has_table_privilege('authenticated', 'auth.users', 'SELECT') then
    raise exception 'HATA: sifre hash''i tarayiciya acik';
  end if;
  if has_table_privilege('authenticated', 'public.login_attempts', 'SELECT')
     or has_table_privilege('authenticated', 'public.rate_limits', 'SELECT') then
    raise exception 'HATA: guvenlik sayaclari tarayiciya acik';
  end if;
  -- Denetim kaydi okunur ama YAZILAMAZ: yazilabilen bir kayit delil olmaz.
  if has_table_privilege('authenticated', 'public.audit_log', 'INSERT') then
    raise exception 'HATA: denetim kaydina tarayicidan yazilabiliyor';
  end if;
  raise notice 'OK: sunucuya ait tablolar kapali';
end $$;

\echo '=== 6) Iletisim gecmisi DUZELTILEMEZ kalmali ==='
do $$
begin
  if not has_table_privilege('authenticated', 'public.customer_lead_messages', 'INSERT') then
    raise exception 'HATA: gecmise mesaj eklenemiyor';
  end if;
  if has_table_privilege('authenticated', 'public.customer_lead_messages', 'UPDATE')
     or has_table_privilege('authenticated', 'public.customer_lead_messages', 'DELETE') then
    raise exception 'HATA: gecmis duzeltilebilir hale gelmis; duzeltilebilen gecmis gecmis degildir';
  end if;
  raise notice 'OK: gecmis degismez';
end $$;

\echo '=== 7) Musterinin kod sorgusu OTURUMSUZ calismali ==='
do $$
begin
  set local role anon;
  perform public.verify_reservation_code('OLMAYAN-KOD');
  reset role;
  raise notice 'OK: kod sorgusu anon ile cagrilabiliyor';
exception when insufficient_privilege then
  reset role;
  raise exception 'HATA: musteri kod sorgusu yapamaz; /kod-dogrulama sayfasi calismaz';
end $$;

\echo '=== TUM KENDI SUNUCUSU TESTLERI GECTI ==='
