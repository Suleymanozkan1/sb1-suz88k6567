-- =====================================================================
-- Sira ureticisi (sequence) yetkileri
--
-- NEDEN VAR. 0021 ve 0023 yetkiyi o an var olan sira ureticilerini
-- dolasarak veriyordu; sonraki gocte acilan tablo listeye girmiyordu.
-- Tabloya insert yetkisi vardi ama sira numarasi uretilemiyordu:
--
--   42501 permission denied for sequence weather_forecasts_id_seq
--
-- Canlida hava durumu hic yazilmadi, aylik rapor kaydi hic tutulmadi.
-- Tek tek tablo saymak ayni tuzak olurdu -- yarin acilan tablo yine
-- listede olmazdi. Bu yuzden test KURALI sinar: yazma yetkisi olan
-- rolun, ayni tablonun sira ureticisine de yetkisi olmali.
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off

-- --------------------------------------------------------------------
-- 1) Insert yetkisi verilen her tablonun sira ureticisi de acik mi
--
-- Sira uretici ile tablo `pg_depend` uzerinden eslesiyor: sutunun
-- varsayilani olan uretici tabloya bagli kayitli duruyor.
-- --------------------------------------------------------------------
/*
  Yetki islevleri MATERIALIZED bir ara katmanin ardinda cagriliyor.
  Planlayici `relkind = 'S'` suzgecini her zaman once uygulamiyor;
  suzgec disinda kalan bir nesneye (ornegin toast tablosu)
  `has_sequence_privilege` sorulunca sorgu hata veriyor.
*/
do $$
declare r record; v_eksik text := '';
begin
  for r in
    with dizi as materialized (
      select s.oid as dizi_oid, s.relname as dizi, t.oid as tablo_oid, t.relname as tablo
      from pg_class s
      join pg_depend d    on d.objid = s.oid and d.deptype = 'a'
      join pg_class t     on t.oid = d.refobjid
      join pg_namespace n on n.oid = s.relnamespace
      where n.nspname = 'public' and s.relkind = 'S'
    )
    select distinct dizi.tablo, dizi.dizi, g.rol
    from dizi
    cross join (values ('authenticated'), ('service_role')) as g(rol)
    where has_table_privilege(g.rol, dizi.tablo_oid, 'INSERT')
      and not has_sequence_privilege(g.rol, dizi.dizi_oid, 'USAGE')
  loop
    v_eksik := v_eksik || format(E'\n  %s -> %s (%s)', r.tablo, r.dizi, r.rol);
  end loop;

  if v_eksik <> '' then
    raise exception
      'BASARISIZ: insert yetkisi olan tablonun sira ureticisi kapali:%', v_eksik;
  end if;
end $$;

-- --------------------------------------------------------------------
-- 2) Bundan sonra acilacak tablolar da kapsanacak mi
--
-- 0050 varsayilan yetki tanimladi. Kural yoksa bir sonraki goc ayni
-- hatayi sessizce geri getirir; test onu simdi yakalar.
-- --------------------------------------------------------------------
create table public.dizi_yetki_denemesi (id bigserial primary key, x text);

do $$
begin
  if not has_sequence_privilege(
       'service_role', 'public.dizi_yetki_denemesi_id_seq', 'USAGE') then
    raise exception
      'BASARISIZ: yeni acilan tablonun sira ureticisi service_role''e kapali '
      '(varsayilan yetki tanimli degil)';
  end if;
  if not has_sequence_privilege(
       'authenticated', 'public.dizi_yetki_denemesi_id_seq', 'USAGE') then
    raise exception
      'BASARISIZ: yeni acilan tablonun sira ureticisi authenticated''a kapali '
      '(varsayilan yetki tanimli degil)';
  end if;
end $$;

drop table public.dizi_yetki_denemesi;

-- --------------------------------------------------------------------
-- 3) Giris yapmamis ziyaretci hicbir sira ureticisine erisemesin
--
-- Varsayilan yetki iki role veriliyor; `anon` listede olmamali.
-- --------------------------------------------------------------------
do $$
declare v_adet integer;
begin
  with dizi as materialized (
    select s.oid from pg_class s join pg_namespace n on n.oid = s.relnamespace
    where n.nspname = 'public' and s.relkind = 'S'
  )
  select count(*) into v_adet
  from dizi where has_sequence_privilege('anon', oid, 'USAGE');

  if v_adet > 0 then
    raise exception 'BASARISIZ: anon % sira ureticisine erisebiliyor', v_adet;
  end if;
end $$;

\echo '=== 32_dizi_yetkileri_test TAMAM ==='
