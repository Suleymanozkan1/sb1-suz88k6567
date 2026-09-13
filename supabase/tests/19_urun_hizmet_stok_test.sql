-- =====================================================================
-- Ürün ve Hizmet + stok testi (0027)
--
-- Sınanan davranışlar:
--   1. Alanlar ve tip kuruldu mu?
--   2. Mevcut satırlar hizmet olarak mı yükseltildi? (veri kaybı olmamalı)
--   3. Hizmete stok yazılabiliyor mu? (yazılmamalı)
--   4. Üründe stok yazılabiliyor mu?
--   5. Eksi koli/adet/fiyat reddediliyor mu?
--   6. Toplam doğru hesaplanıyor mu?
--   7. Toplam KOLON olarak eklenmiş mi? (eklenmemiş olmalı)
--
-- Üçüncü madde önemli: hizmete koli yazılabilseydi stok ekranı "3 koli
-- DJ" gibi anlamsız satırlar gösterirdi.
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off

\echo '=== 0) Test verisi (once eski surumdeki gibi bir satir) ==='
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_biz   uuid;
begin
  insert into auth.users (id, email) values (v_owner, 'stok-test@ornek.com');
  insert into public.businesses (owner_id, name) values (v_owner, 'Stok Test Salonu')
    returning id into v_biz;

  -- Stok alanları verilmeden eklenen satır: eski kayıtların karşılığı.
  insert into public.vendors (business_id, name, category, phone)
  values (v_biz, 'Yildiz Orkestra', 'Orkestra / Müzik', '5321230001');

  perform set_config('test.biz', v_biz::text, false);
end $$;

\echo '=== 1) Sema ==='
select
  to_regtype('public.vendor_kind') as tur,
  (select count(*) from information_schema.columns
   where table_schema = 'public' and table_name = 'vendors'
     and column_name in ('kind','unit_price','box_count','units_per_box','loose_count','min_count')
  ) as yeni_kolon_sayisi;

do $$ begin
  if to_regtype('public.vendor_kind') is null then
    raise exception 'BASARISIZ: vendor_kind tipi yok';
  end if;
  -- Toplam KOLON OLMAMALI: hesaplanan bir deger kolona yazilirsa sayimdan
  -- sonra uc sayi birbirini tutmadiginda hangisinin dogru oldugu bilinemez.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vendors'
      and column_name in ('total_count','toplam','stock_total')
  ) then
    raise exception 'BASARISIZ: stokta hesaplanmis toplam kolonu var';
  end if;
end $$;

\echo '=== 2) Eski satirlar HIZMET olarak yukselmeli ==='
do $$
declare v_kind public.vendor_kind;
begin
  select kind into v_kind from public.vendors
  where business_id = current_setting('test.biz')::uuid and name = 'Yildiz Orkestra';
  if v_kind <> 'hizmet' then
    raise exception 'BASARISIZ: eski satir % olarak yukseldi', v_kind;
  end if;
end $$;

\echo '=== 3) Hizmete stok yazilamamali ==='
do $$
declare v_biz uuid := current_setting('test.biz')::uuid;
begin
  begin
    insert into public.vendors (business_id, name, kind, box_count, units_per_box)
    values (v_biz, 'Kolili DJ', 'hizmet', 3, 24);
    raise exception 'BASARISIZ: hizmete koli yazildi';
  exception when check_violation then null;
  end;

  begin
    update public.vendors set min_count = 5
    where business_id = v_biz and name = 'Yildiz Orkestra';
    raise exception 'BASARISIZ: hizmete kritik seviye yazildi';
  exception when check_violation then null;
  end;
end $$;

\echo '=== 4) Urunde stok yazilabilmeli, toplam dogru olmali ==='
do $$
declare
  v_biz    uuid := current_setting('test.biz')::uuid;
  v_toplam numeric;
begin
  insert into public.vendors
    (business_id, name, category, kind, box_count, units_per_box, loose_count, min_count, unit_price)
  values (v_biz, 'Su', 'İçecek', 'urun', 10, 24, 6, 100, 4);

  select public.stok_toplami(box_count, units_per_box, loose_count) into v_toplam
  from public.vendors where business_id = v_biz and name = 'Su';
  -- 10 x 24 + 6
  if v_toplam <> 246 then
    raise exception 'BASARISIZ: toplam % (beklenen 246)', v_toplam;
  end if;

  -- Kolisi olmayan urun: yalnizca tek adet.
  insert into public.vendors (business_id, name, kind, loose_count)
  values (v_biz, 'Pecete', 'urun', 18);

  select public.stok_toplami(box_count, units_per_box, loose_count) into v_toplam
  from public.vendors where business_id = v_biz and name = 'Pecete';
  if v_toplam <> 18 then
    raise exception 'BASARISIZ: kolisiz urun toplami %', v_toplam;
  end if;
end $$;

\echo '=== 5) Gecersiz degerler REDDEDILMELI ==='
do $$
declare v_biz uuid := current_setting('test.biz')::uuid;
begin
  begin
    insert into public.vendors (business_id, name, kind, box_count)
    values (v_biz, 'Eksi Koli', 'urun', -1);
    raise exception 'BASARISIZ: eksi koli kabul edildi';
  exception when check_violation then null;
  end;

  begin
    insert into public.vendors (business_id, name, kind, unit_price)
    values (v_biz, 'Eksi Fiyat', 'hizmet', -5);
    raise exception 'BASARISIZ: eksi birim fiyat kabul edildi';
  exception when check_violation then null;
  end;
end $$;

\echo '=== 6) Yetkiler yerinde kalmali ==='
do $$ begin
  if not has_table_privilege('authenticated', 'public.vendors', 'UPDATE') then
    raise exception 'BASARISIZ: kullanici urun/hizmet duzenleyemiyor';
  end if;
end $$;

\echo '=== TEMIZLIK ==='
do $$ begin
  delete from public.businesses where id = current_setting('test.biz')::uuid;
  delete from auth.users where email = 'stok-test@ornek.com';
end $$;

\echo '=== 19_urun_hizmet_stok_test: TUM KONTROLLER GECTI ==='
