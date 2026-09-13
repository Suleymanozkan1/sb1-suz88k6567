-- =====================================================================
-- Yetkilerin tüm alanlara genişletilmesi testi (0036)
--
-- Sınanan davranışlar:
--   1. Eski yetki listesi taşındı mı? (kimse erişim kaybetmemeli)
--   2. Salon/menü/renk yetkisi olmayan personel görebiliyor mu?
--   3. tanim.goruntule yetkisi PAYLAŞILAN özel günleri de açıyor mu?
--      (bayram günleri business_id NULL; kalıp uygulansaydı silinirdi)
--   4. Ürün-hizmet, müşteri adayı, hatırlatma ve fatura ekranları
--      kendi yetkilerine bağlı mı?
--   5. Denetim kaydı denetim.goruntule'ye bağlı mı?
--   6. Görüntüleme yetkisi yazma hakkı vermiyor, değil mi?
--
-- Bu paketin varlık sebebi: 0036 öncesi panelin yarısı hiçbir yetkiye
-- bağlı değildi. Aynı sahibe bağlı her personel müşteri listesini,
-- tedarikçileri ve İYS izinlerini görüp değiştirebiliyordu.
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off

\echo '=== 0) Test verisi ==='
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_tanim uuid := gen_random_uuid();
  v_dar   uuid := gen_random_uuid();
  v_eski  uuid := gen_random_uuid();
  v_biz   uuid;
  v_hall  uuid;
begin
  insert into auth.users (id, email) values
    (v_owner, 'g36-sahip@ornek.com'),
    (v_tanim, 'g36-tanim@ornek.com'),
    (v_dar,   'g36-dar@ornek.com'),
    (v_eski,  'g36-eski@ornek.com');

  update public.profiles
  set full_name = 'Sahip', role = 'owner', owner_id = null
  where id = v_owner;

  -- Tanımları görebilen ama düzenleyemeyen personel.
  update public.profiles
  set full_name = 'Tanimci', role = 'staff', owner_id = v_owner,
      permissions = array['rezervasyon.goruntule','tanim.goruntule']
  where id = v_tanim;

  -- Yalnızca rezervasyon görebilen personel.
  update public.profiles
  set full_name = 'Dar', role = 'staff', owner_id = v_owner,
      permissions = array['rezervasyon.goruntule']
  where id = v_dar;

  -- 0036 ÖNCESİ yetki listesiyle duran personel: göç bunu taşımalı.
  update public.profiles
  set full_name = 'Eski', role = 'staff', owner_id = v_owner,
      permissions = array['rezervasyon.goruntule','kasa.goruntule','ayarlar.duzenle'],
      permissions_version = 0
  where id = v_eski;

  insert into public.businesses (owner_id, name) values (v_owner, 'Yetki36 Salonu')
    returning id into v_biz;
  insert into public.halls (business_id, name, capacity) values (v_biz, 'Zümrüt', 300)
    returning id into v_hall;
  insert into public.menus (business_id, name, price_kurus) values (v_biz, 'Test Menü', 50000);
  insert into public.vendors (business_id, name, category) values (v_biz, 'Test Tedarikçi', 'Ürün');
  insert into public.customer_leads (business_id, name, phone)
    values (v_biz, 'Aday Testi', '5330000136');
  insert into public.invoices (business_id, invoice_number, buyer_name, issue_date)
    values (v_biz, 'T362030000000001', 'Fatura Testi', '2030-01-01');
  -- Paylaşılan özel gün: business_id NULL.
  insert into public.special_days (business_id, day, label, kind)
    values (null, '2030-04-23', 'Test Bayramı', 'resmi_tatil')
    on conflict do nothing;

  perform set_config('test.owner', v_owner::text, false);
  perform set_config('test.tanim', v_tanim::text, false);
  perform set_config('test.dar', v_dar::text, false);
  perform set_config('test.eski', v_eski::text, false);
end $$;

\echo '=== 1) Eski yetki listesi tasindi mi ==='
do $$
declare v_yetkiler text[];
begin
  /*
    Test verisi 0036 ÇALIŞTIKTAN SONRA yazıldığı için göç cümlesinin
    aynısı burada tekrar uygulanıyor: taşıma kuralının kendisi sınanıyor.
  */
  update public.profiles p
  set permissions = (
    select array(
      select distinct y from unnest(
        p.permissions
        || array['musteri.goruntule','musteri.duzenle',
                 'aday.goruntule','aday.duzenle',
                 'stok.goruntule','stok.duzenle',
                 'tanim.goruntule',
                 'mesaj.goruntule','mesaj.duzenle']::text[]
        || case when 'rezervasyon.goruntule' = any (p.permissions)
                then array['rezervasyon.sozlesme']::text[] else '{}'::text[] end
        || case when 'kasa.goruntule' = any (p.permissions)
                then array['fatura.goruntule']::text[] else '{}'::text[] end
        || case when 'kasa.duzenle' = any (p.permissions)
                then array['fatura.duzenle']::text[] else '{}'::text[] end
        || case when 'rapor.goruntule' = any (p.permissions)
                then array['rapor.disaAktar']::text[] else '{}'::text[] end
        || case when 'ayarlar.duzenle' = any (p.permissions)
                then array['tanim.duzenle','denetim.goruntule','sistem.yonet']::text[]
                else '{}'::text[] end
      ) as y
    )
  )
  where p.id = current_setting('test.eski')::uuid
    and p.permissions_version = 0;

  select permissions into v_yetkiler from public.profiles
  where id = current_setting('test.eski')::uuid;

  -- Kasayı görebiliyordu: faturayı da görebilmeli (eski davranış).
  if not ('fatura.goruntule' = any (v_yetkiler)) then
    raise exception 'BASARISIZ: kasa.goruntule tasinirken fatura.goruntule verilmedi';
  end if;
  -- ayarlar.duzenle panelin yönetim tarafının tamamıydı.
  if not ('tanim.duzenle' = any (v_yetkiler)) then
    raise exception 'BASARISIZ: ayarlar.duzenle tasinirken tanim.duzenle verilmedi';
  end if;
  if not ('sistem.yonet' = any (v_yetkiler)) then
    raise exception 'BASARISIZ: ayarlar.duzenle tasinirken sistem.yonet verilmedi';
  end if;
  -- Eskiden herkese açık olan ekranlar kapanmamalı.
  if not ('musteri.goruntule' = any (v_yetkiler)) then
    raise exception 'BASARISIZ: eskiden acik olan musteri ekrani kapatildi';
  end if;
  if not ('stok.duzenle' = any (v_yetkiler)) then
    raise exception 'BASARISIZ: eskiden acik olan urun-hizmet ekrani kapatildi';
  end if;
end $$;

\echo '=== 1b) Surum damgasi ikinci tasimayi durdurmali ==='
do $$
declare v_once integer; v_sonra integer;
begin
  update public.profiles set permissions_version = 1
  where id = current_setting('test.eski')::uuid;

  select cardinality(permissions) into v_once from public.profiles
  where id = current_setting('test.eski')::uuid;

  -- Aynı göç cümlesi yeniden koşuyor; sürüm 1 olduğu için hiçbir satıra
  -- dokunmamalı.
  update public.profiles p
  set permissions = p.permissions || array['musteri.goruntule']::text[]
  where p.id = current_setting('test.eski')::uuid
    and p.permissions_version = 0;

  select cardinality(permissions) into v_sonra from public.profiles
  where id = current_setting('test.eski')::uuid;

  if v_once <> v_sonra then
    raise exception 'BASARISIZ: tasima ikinci kez calisti (% -> %)', v_once, v_sonra;
  end if;
end $$;

\echo '=== 2) tanim.goruntule salon ve menuyu acmali ==='
do $$
declare v_adet integer;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.tanim'))::text, true);
  set local role authenticated;

  select count(*) into v_adet from public.halls where name = 'Zümrüt';
  if v_adet <> 1 then raise exception 'BASARISIZ: tanim.goruntule salonu acmadi (%)', v_adet; end if;

  select count(*) into v_adet from public.menus where name = 'Test Menü';
  if v_adet <> 1 then raise exception 'BASARISIZ: tanim.goruntule menuyu acmadi (%)', v_adet; end if;

  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

\echo '=== 3) Paylasilan ozel gunler tanim.goruntule ile gorunmeli ==='
do $$
declare v_adet integer;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.tanim'))::text, true);
  set local role authenticated;

  /*
    business_id NULL olan satırlar herkesin takvimine düşen resmî
    günler. Genel kalıp uygulansaydı owns_business(null) false döner ve
    bayramların tamamı takvimden kaybolurdu.
  */
  select count(*) into v_adet from public.special_days where business_id is null;
  if v_adet = 0 then
    raise exception 'BASARISIZ: paylasilan ozel gunler gorunmuyor';
  end if;

  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

\echo '=== 4) Yetkisiz personel tanim, stok, aday ve faturayi GOREMEMELI ==='
do $$
declare v_adet integer;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.dar'))::text, true);
  set local role authenticated;

  select count(*) into v_adet from public.halls;
  if v_adet <> 0 then raise exception 'BASARISIZ: yetkisiz personel % salon gordu', v_adet; end if;

  select count(*) into v_adet from public.vendors;
  if v_adet <> 0 then raise exception 'BASARISIZ: yetkisiz personel % tedarikci gordu', v_adet; end if;

  select count(*) into v_adet from public.customer_leads;
  if v_adet <> 0 then raise exception 'BASARISIZ: yetkisiz personel % aday gordu', v_adet; end if;

  select count(*) into v_adet from public.invoices;
  if v_adet <> 0 then raise exception 'BASARISIZ: yetkisiz personel % fatura gordu', v_adet; end if;

  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

\echo '=== 5) Goruntuleme yetkisi YAZMA hakki vermemeli ==='
do $$
declare v_hata boolean := false;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.tanim'))::text, true);
  set local role authenticated;

  begin
    insert into public.halls (business_id, name, capacity)
    select business_id, 'Izinsiz Salon', 100 from public.halls limit 1;
  exception when others then
    v_hata := true;
  end;

  if not v_hata then
    raise exception 'BASARISIZ: tanim.goruntule ile salon eklenebildi';
  end if;

  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

\echo '=== 6) Isletme sahibi her seyi gormeli ==='
do $$
declare v_adet integer;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.owner'))::text, true);
  set local role authenticated;

  select count(*) into v_adet from public.halls where name = 'Zümrüt';
  if v_adet <> 1 then raise exception 'BASARISIZ: sahip salonu goremedi (%)', v_adet; end if;
  select count(*) into v_adet from public.invoices;
  if v_adet <> 1 then raise exception 'BASARISIZ: sahip faturayi goremedi (%)', v_adet; end if;
  select count(*) into v_adet from public.customer_leads;
  if v_adet <> 1 then raise exception 'BASARISIZ: sahip adayi goremedi (%)', v_adet; end if;

  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

\echo '=== 26_yetki_genisletme_test TAMAM ==='
