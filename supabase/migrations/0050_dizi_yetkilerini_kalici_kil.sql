-- =====================================================================
-- Sıra üreticisi (sequence) yetkilerini KALICI hâle getir
--
-- 0021 ve 0023, `bigserial` sütunu olan tabloların sıra üreticilerine
-- yetki verirken o an VAR OLANLARI tek tek dolaşıyordu. Sonraki
-- göçlerde açılan tablolar o döngüye hiç girmedi; tabloya insert
-- yetkisi verilse de sıra numarası üretilemediği için yazma
-- reddediliyordu:
--
--   42501 permission denied for sequence weather_forecasts_id_seq
--
-- Sonuç canlı sistemde şuydu: hava durumu hiç yazılmadı (0034 ve 0038),
-- aylık rapor kaydı hiç tutulmadı (0031). Uç noktalar hatayı yakalayıp
-- düzgün bir cevap döndürdüğü için zamanlayıcı da çökmedi -- yani hata
-- tek satır günlük bırakmadan sürdü.
--
-- İKİ ADIMDA kapatılıyor:
--   1) bugün var olan bütün sıra üreticilerine yetki (geçmişi onarır)
--   2) VARSAYILAN YETKİ (geleceği onarır): bundan sonra açılan her sıra
--      üreticisi yetkiyi kendiliğinden alır, yeni göç yazan kimsenin
--      bunu hatırlamasına gerek kalmaz.
--
-- Yetki yalnızca USAGE ve SELECT: sıra numarası üretmek ve okumak için
-- yeterli. `anon` hiçbir şey almıyor -- giriş yapmamış ziyaretçinin
-- hiçbir tabloya yazması söz konusu değil.
-- =====================================================================

-- --------------------------------------------------------------------
-- 1) Bugün var olanlar
-- --------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'S'
  loop
    execute format(
      'grant usage, select on sequence public.%I to authenticated, service_role', r.relname
    );
  end loop;
end $$;

-- --------------------------------------------------------------------
-- 2) Bundan sonra açılacaklar
--
-- Varsayılan yetki, onu TANIMLAYAN rolün açtığı nesneler için geçerli.
-- Göçler şemanın sahibiyle çalıştığı için kural o role bağlanıyor;
-- `current_user` yazılması, kurulumdan kuruluma değişen sahip adını
-- (postgres, supabase_admin, sahra...) elle yazmaktan kurtarıyor.
-- --------------------------------------------------------------------
do $$
begin
  execute format(
    'alter default privileges for role %I in schema public '
    || 'grant usage, select on sequences to authenticated, service_role',
    current_user
  );
end $$;
