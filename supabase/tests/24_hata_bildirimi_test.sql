-- =====================================================================
-- Hata bildirimi ve ekran kilidi testi (0033, maddeler 27 ve 32)
--
-- Sınanan davranışlar:
--   1. Tablo ve kilit alanı kuruldu mu?
--   2. Kullanıcı ve kapsam KENDİLİĞİNDEN doluyor mu?
--   3. Bildirim düzeltilebiliyor/silinebiliyor mu? (yapılamamalı)
--   4. Başkasının kapsamındaki bildirim görülebiliyor mu? (görülmemeli)
--   5. Boş bildirim kabul ediliyor mu? (edilmemeli)
--   6. Geçersiz kilit süresi kabul ediliyor mu? (edilmemeli)
--
-- İkinci madde önemli: kullanıcı adı formdan gelseydi bildirim
-- başkasının adına yazılabilirdi.
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off

\echo '=== 0) Test verisi ==='
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_baska uuid := gen_random_uuid();
  v_biz   uuid;
begin
  insert into auth.users (id, email) values
    (v_owner, 'hata-sahip@ornek.com'), (v_baska, 'hata-baska@ornek.com');

  insert into public.businesses (owner_id, name) values (v_owner, 'Hata Test Salonu')
    returning id into v_biz;

  perform set_config('test.owner', v_owner::text, false);
  perform set_config('test.baska', v_baska::text, false);
  perform set_config('test.biz', v_biz::text, false);
end $$;

\echo '=== 1) Sema ==='
select
  to_regclass('public.error_reports') as tablo,
  (select count(*) from information_schema.columns
   where table_schema = 'public' and table_name = 'businesses'
     and column_name = 'lock_seconds') as kilit_alani;

do $$ begin
  if to_regclass('public.error_reports') is null then
    raise exception 'BASARISIZ: error_reports tablosu yok';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'businesses'
                   and column_name = 'lock_seconds') then
    raise exception 'BASARISIZ: lock_seconds alani yok';
  end if;
end $$;

\echo '=== 2) Kullanici ve kapsam KENDILIGINDEN dolmali ==='
do $$
declare r record;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.owner'))::text, true);
  set local role authenticated;

  -- owner_id ve actor_email GONDERILMIYOR.
  insert into public.error_reports (business_id, path, message, user_agent)
  values (current_setting('test.biz')::uuid, '/panel/kasa', 'Kasa toplami yanlis', 'test-tarayici');

  select * into r from public.error_reports order by id desc limit 1;
  if r.owner_id <> current_setting('test.owner')::uuid then
    raise exception 'BASARISIZ: kapsam kendiliginden dolmadi (%)', r.owner_id;
  end if;
  if r.actor_email <> 'hata-sahip@ornek.com' then
    raise exception 'BASARISIZ: kullanici kendiliginden dolmadi (%)', r.actor_email;
  end if;
  if r.path <> '/panel/kasa' then
    raise exception 'BASARISIZ: sayfa kaydedilmedi (%)', r.path;
  end if;

  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

\echo '=== 3) Bos bildirim REDDEDILMELI ==='
do $$ begin
  -- Oturum gerekiyor: kapsam ve kullanici kolon varsayilanindan geliyor.
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.owner'))::text, true);
  begin
    insert into public.error_reports (business_id, path, message)
    values (current_setting('test.biz')::uuid, '/panel', '   ');
    raise exception 'BASARISIZ: bos bildirim kabul edildi';
  exception when check_violation then null;
  end;
  perform set_config('request.jwt.claims', '', true);
end $$;

\echo '=== 4) Bildirim DUZELTILEMEZ ve SILINEMEZ olmali ==='
select
  has_table_privilege('authenticated', 'public.error_reports', 'INSERT') as yazar,
  has_table_privilege('authenticated', 'public.error_reports', 'UPDATE') as duzeltir,
  has_table_privilege('authenticated', 'public.error_reports', 'DELETE') as siler;

do $$ begin
  if not has_table_privilege('authenticated', 'public.error_reports', 'INSERT') then
    raise exception 'BASARISIZ: kullanici bildirim yazamiyor';
  end if;
  /*
    Bildirimi alan kisi, canini sikan bir kaydi kaldirabilseydi bildirim
    sistemi kimseyi korumazdi.
  */
  if has_table_privilege('authenticated', 'public.error_reports', 'UPDATE')
     or has_table_privilege('authenticated', 'public.error_reports', 'DELETE') then
    raise exception 'BASARISIZ: bildirim duzeltilebiliyor ya da silinebiliyor';
  end if;
end $$;

\echo '=== 5) Baskasinin bildirimi GORULEMEMELI ==='
do $$
declare v_adet integer;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.baska'))::text, true);
  set local role authenticated;

  select count(*) into v_adet from public.error_reports;
  if v_adet <> 0 then
    raise exception 'BASARISIZ: baska kullanici % bildirim gordu', v_adet;
  end if;

  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

\echo '=== 6) Gecersiz kilit suresi REDDEDILMELI ==='
do $$
declare v_biz uuid := current_setting('test.biz')::uuid;
begin
  -- 0 (kapali) ve 30-3600 arasi kabul; arasi degerler degil.
  update public.businesses set lock_seconds = 0 where id = v_biz;
  update public.businesses set lock_seconds = 600 where id = v_biz;

  begin
    update public.businesses set lock_seconds = 5 where id = v_biz;
    raise exception 'BASARISIZ: cok kisa kilit suresi kabul edildi';
  exception when check_violation then null;
  end;

  begin
    update public.businesses set lock_seconds = -1 where id = v_biz;
    raise exception 'BASARISIZ: eksi kilit suresi kabul edildi';
  exception when check_violation then null;
  end;
end $$;

\echo '=== TEMIZLIK ==='
do $$ begin
  delete from public.businesses where id = current_setting('test.biz')::uuid;
  delete from public.profiles where email like 'hata-%@ornek.com';
  delete from auth.users where email like 'hata-%@ornek.com';
end $$;

\echo '=== 24_hata_bildirimi_test: TUM KONTROLLER GECTI ==='
