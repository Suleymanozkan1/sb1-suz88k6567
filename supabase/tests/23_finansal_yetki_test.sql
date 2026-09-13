-- =====================================================================
-- Finansal yetkilerin sunucuda uygulanması testi (0032, madde 33)
--
-- Sınanan davranışlar:
--   1. İşletme sahibi her şeyi görebiliyor mu?
--   2. Yetkisiz personel tahsilatı GÖREBİLİYOR mu? (görmemeli)
--   3. Yetkisiz personel tahsilat YAZABİLİYOR mu? (yazmamalı)
--   4. Yalnızca görüntüleme yetkisi olan personel yazabiliyor mu?
--      (yazmamalı, ama görmeli)
--   5. Gelir/gider ve düğün gideri aynı kurala bağlı mı?
--   6. Rezervasyon silme ayrı yetkiye mi bağlı?
--   7. Başka sahibin personeli veriyi görebiliyor mu? (görmemeli)
--
-- Bu paketin varlık sebebi: yetkiler şimdiye kadar yalnızca ARAYÜZDE
-- kontrol ediliyordu. Tarayıcı konsolundan atılan bir istek kasayı
-- görebiliyor, tahsilat silebiliyordu.
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off

\echo '=== 0) Test verisi ==='
do $$
declare
  v_owner   uuid := gen_random_uuid();
  v_tam     uuid := gen_random_uuid();
  v_okur    uuid := gen_random_uuid();
  v_yetkisiz uuid := gen_random_uuid();
  v_yabanci uuid := gen_random_uuid();
  v_biz     uuid;
  v_hall    uuid;
  v_rez     uuid;
begin
  insert into auth.users (id, email) values
    (v_owner, 'yetki-sahip@ornek.com'),
    (v_tam, 'yetki-tam@ornek.com'),
    (v_okur, 'yetki-okur@ornek.com'),
    (v_yetkisiz, 'yetki-yok@ornek.com'),
    (v_yabanci, 'yetki-yabanci@ornek.com');

  -- auth.users eklenince profil tetikleyiciyle acildi; yetkileri burada
  -- guncelleniyor.
  update public.profiles
  set full_name = 'Sahip', role = 'owner', owner_id = null,
      permissions = array['kasa.goruntule','kasa.duzenle']
  where id = v_owner;

  update public.profiles
  set full_name = 'Tam Yetkili', role = 'staff', owner_id = v_owner,
      permissions = array['rezervasyon.goruntule','rezervasyon.duzenle',
                          'rezervasyon.sil','kasa.goruntule','kasa.duzenle']
  where id = v_tam;

  update public.profiles
  set full_name = 'Okuyucu', role = 'staff', owner_id = v_owner,
      permissions = array['rezervasyon.goruntule','kasa.goruntule']
  where id = v_okur;

  update public.profiles
  set full_name = 'Yetkisiz', role = 'staff', owner_id = v_owner,
      permissions = array['rezervasyon.goruntule']
  where id = v_yetkisiz;

  update public.profiles
  set full_name = 'Yabanci', role = 'owner', owner_id = null,
      permissions = array['kasa.goruntule','kasa.duzenle']
  where id = v_yabanci;

  insert into public.businesses (owner_id, name) values (v_owner, 'Yetki Test Salonu')
    returning id into v_biz;
  insert into public.halls (business_id, name, capacity) values (v_biz, 'Kristal', 400)
    returning id into v_hall;
  insert into public.reservations
    (business_id, hall_id, customer_name, customer_phone, date, slot,
     organization_type, guest_count, total_amount, deposit)
  values (v_biz, v_hall, 'Yetki Testi', '5330000041', '2030-05-05', 'Gece',
          'Düğün', 200, 100000, 20000)
  returning id into v_rez;

  insert into public.payments (reservation_id, date, amount, method)
  values (v_rez, '2030-01-10', 30000, 'Nakit');
  insert into public.cash_flow (business_id, kind, date, category, amount, description)
  values (v_biz, 'Gider', '2030-01-10', 'Personel Maaş', 5000, 'test');
  insert into public.reservation_expenses (business_id, reservation_id, kind, unit_count, unit_price)
  values (v_biz, v_rez, 'Garson', 5, 1000);

  perform set_config('test.owner', v_owner::text, false);
  perform set_config('test.tam', v_tam::text, false);
  perform set_config('test.okur', v_okur::text, false);
  perform set_config('test.yok', v_yetkisiz::text, false);
  perform set_config('test.yabanci', v_yabanci::text, false);
  perform set_config('test.biz', v_biz::text, false);
  perform set_config('test.rez', v_rez::text, false);
end $$;

-- Oturumu taklit eden yardımcı: PostgREST'in yaptığı gibi rol ve JWT
-- iddiası ayarlanıyor.
\echo '=== 1) Isletme sahibi HER SEYI gormeli ==='
do $$
declare v_adet integer;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.owner'))::text, true);
  set local role authenticated;

  select count(*) into v_adet from public.payments;
  if v_adet <> 1 then
    raise exception 'BASARISIZ: sahip % tahsilat gordu, 1 gormeliydi', v_adet;
  end if;

  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

\echo '=== 2) Yetkisiz personel tahsilati GOREMEMELI ==='
do $$
declare v_adet integer;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.yok'))::text, true);
  set local role authenticated;

  select count(*) into v_adet from public.payments;
  if v_adet <> 0 then
    raise exception 'BASARISIZ: yetkisiz personel % tahsilat gordu', v_adet;
  end if;

  select count(*) into v_adet from public.cash_flow;
  if v_adet <> 0 then
    raise exception 'BASARISIZ: yetkisiz personel % gelir/gider gordu', v_adet;
  end if;

  select count(*) into v_adet from public.reservation_expenses;
  if v_adet <> 0 then
    raise exception 'BASARISIZ: yetkisiz personel % dugun gideri gordu', v_adet;
  end if;

  -- Rezervasyonu gorebilmeli: o yetkisi var.
  select count(*) into v_adet from public.reservations;
  if v_adet <> 1 then
    raise exception 'BASARISIZ: rezervasyon yetkisi calismadi (% satir)', v_adet;
  end if;

  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

\echo '=== 3) Yalnizca GORUNTULEME yetkisi olan YAZAMAMALI ==='
do $$
declare v_adet integer;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.okur'))::text, true);
  set local role authenticated;

  -- Gorebiliyor.
  select count(*) into v_adet from public.payments;
  if v_adet <> 1 then
    raise exception 'BASARISIZ: okuma yetkisi calismadi (% satir)', v_adet;
  end if;

  -- Yazamiyor: RLS kontrolu yeni satiri reddetmeli.
  begin
    insert into public.payments (reservation_id, date, amount, method)
    values (current_setting('test.rez')::uuid, '2030-02-01', 1000, 'Nakit');
    raise exception 'BASARISIZ: okuma yetkili personel tahsilat yazdi';
  exception when insufficient_privilege then null;
  end;

  -- Silemiyor: silme de yazma yetkisine bagli. Politika satiri
  -- gostermedigi icin silme sessizce 0 satir etkiliyor.
  delete from public.payments where amount = 30000;
  select count(*) into v_adet from public.payments where amount = 30000;
  if v_adet <> 1 then
    raise exception 'BASARISIZ: okuma yetkili personel tahsilat sildi';
  end if;

  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

\echo '=== 4) Tam yetkili personel yazabilmeli ==='
do $$
declare v_adet integer;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.tam'))::text, true);
  set local role authenticated;

  insert into public.payments (reservation_id, date, amount, method)
  values (current_setting('test.rez')::uuid, '2030-02-01', 2000, 'Nakit');

  select count(*) into v_adet from public.payments;
  if v_adet <> 2 then
    raise exception 'BASARISIZ: tam yetkili yazamadi (% satir)', v_adet;
  end if;

  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

\echo '=== 5) Rezervasyon silme AYRI yetkiye bagli olmali ==='
do $$
declare v_adet integer;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.okur'))::text, true);
  set local role authenticated;

  -- Okuyucunun rezervasyon.sil yetkisi yok.
  delete from public.reservations where id = current_setting('test.rez')::uuid;
  select count(*) into v_adet from public.reservations where id = current_setting('test.rez')::uuid;
  if v_adet <> 1 then
    raise exception 'BASARISIZ: silme yetkisi olmayan personel rezervasyon sildi';
  end if;

  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

\echo '=== 6) Baska sahibin personeli VERIYI GOREMEMELI ==='
do $$
declare v_adet integer;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.yabanci'))::text, true);
  set local role authenticated;

  select count(*) into v_adet from public.payments;
  if v_adet <> 0 then
    raise exception 'BASARISIZ: yabanci kullanici % tahsilat gordu', v_adet;
  end if;

  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

\echo '=== 7) has_permission sahipte her zaman true ==='
do $$ begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.owner'))::text, true);
  -- Sahibin permissions dizisinde rapor.goruntule YOK ama yine de true
  -- olmali: yetkileri bos birakilmis bir sahip kendi kasasini goremez hale
  -- gelirdi.
  if not public.has_permission('rapor.goruntule') then
    raise exception 'BASARISIZ: sahip yetkisiz sayildi';
  end if;
  perform set_config('request.jwt.claims', '', true);
end $$;

\echo '=== TEMIZLIK ==='
do $$ begin
  delete from public.businesses where id = current_setting('test.biz')::uuid;
  delete from public.profiles where email like 'yetki-%@ornek.com';
  delete from auth.users where email like 'yetki-%@ornek.com';
end $$;

\echo '=== 23_finansal_yetki_test: TUM KONTROLLER GECTI ==='
