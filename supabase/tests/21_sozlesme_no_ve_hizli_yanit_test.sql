-- =====================================================================
-- Sözleşme numarası ve hızlı yanıtlar testi (0029, 0030)
--
-- Sınanan davranışlar:
--   1. Numara DÜĞÜN YILINA göre mi veriliyor? (madde 13)
--   2. Aynı yıl içinde sıra ilerliyor mu?
--   3. Farklı yıllar ayrı sayaç mı kullanıyor?
--   4. Tarih güncellenince numara değişiyor mu? (değişmemeli)
--   5. Elle verilen numara korunuyor mu?
--   6. Yeni şablon türleri tohumlanıyor mu? (madde 14)
--   7. Hızlı yanıtta aynı başlık iki kez açılabiliyor mu? (açılmamalı)
--
-- Dördüncü madde önemli: imzalanmış bir sözleşmenin numarası, tarihi bir
-- gün kaydırıldığı için değişemez; o kâğıt artık hiçbir kayda karşılık
-- gelmezdi.
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off

\echo '=== 0) Test verisi ==='
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_biz   uuid;
  v_hall  uuid;
begin
  insert into auth.users (id, email) values (v_owner, 'sozlesme-test@ornek.com');
  insert into public.businesses (owner_id, name) values (v_owner, 'Sozlesme Test Salonu')
    returning id into v_biz;
  insert into public.halls (business_id, name, capacity) values (v_biz, 'Kristal', 400)
    returning id into v_hall;

  perform set_config('test.biz', v_biz::text, false);
  perform set_config('test.hall', v_hall::text, false);
end $$;

\echo '=== 1) Numara DUGUN YILINA gore verilmeli ==='
do $$
declare
  v_biz  uuid := current_setting('test.biz')::uuid;
  v_hall uuid := current_setting('test.hall')::uuid;
  v_kod  text;
  v_id   uuid;
begin
  -- 2030'da yapilacak dugun: numara 2030 ile baslamali, bugunun yiliyla degil.
  insert into public.reservations
    (business_id, hall_id, customer_name, customer_phone, date, slot,
     organization_type, guest_count, total_amount, deposit)
  values (v_biz, v_hall, 'Uzak Dugun', '5330000021', '2030-06-12', 'Gece',
          'Düğün', 300, 200000, 50000)
  returning id, code into v_id, v_kod;
  perform set_config('test.rez', v_id::text, false);

  if v_kod !~ '^2030-[0-9]+$' then
    raise exception 'BASARISIZ: numara % (2030 ile baslamaliydi)', v_kod;
  end if;
  perform set_config('test.kod', v_kod, false);
end $$;

\echo '=== 2) Ayni yilda sira ilerlemeli, farkli yil ayri sayac ==='
do $$
declare
  v_biz  uuid := current_setting('test.biz')::uuid;
  v_hall uuid := current_setting('test.hall')::uuid;
  v_kod2 text;
  v_kod3 text;
begin
  insert into public.reservations
    (business_id, hall_id, customer_name, customer_phone, date, slot,
     organization_type, guest_count, total_amount, deposit)
  values (v_biz, v_hall, 'Ikinci Dugun', '5330000022', '2030-07-20', 'Gece',
          'Düğün', 250, 180000, 40000)
  returning code into v_kod2;

  if v_kod2 = current_setting('test.kod') then
    raise exception 'BASARISIZ: ayni numara iki kez verildi (%)', v_kod2;
  end if;
  if v_kod2 !~ '^2030-[0-9]+$' then
    raise exception 'BASARISIZ: ikinci numara % 2030 degil', v_kod2;
  end if;

  insert into public.reservations
    (business_id, hall_id, customer_name, customer_phone, date, slot,
     organization_type, guest_count, total_amount, deposit)
  values (v_biz, v_hall, 'Sonraki Yil', '5330000023', '2031-05-10', 'Gece',
          'Düğün', 200, 160000, 30000)
  returning code into v_kod3;

  -- Her yil 1'den basliyor: 2031'in ilk dugunu 2031-1.
  if v_kod3 <> '2031-1' then
    raise exception 'BASARISIZ: yeni yilin ilk numarasi % (2031-1 olmaliydi)', v_kod3;
  end if;
end $$;

\echo '=== 3) Tarih degisince numara DEGISMEMELI ==='
do $$
declare
  v_id  uuid := current_setting('test.rez')::uuid;
  v_kod text;
begin
  update public.reservations set date = '2032-01-05' where id = v_id;
  select code into v_kod from public.reservations where id = v_id;
  -- Imzalanmis sozlesmenin numarasi tarih kaydirildigi icin degisemez.
  if v_kod <> current_setting('test.kod') then
    raise exception 'BASARISIZ: tarih degisince numara % oldu', v_kod;
  end if;
end $$;

\echo '=== 4) Elle verilen numara KORUNMALI ==='
do $$
declare
  v_biz  uuid := current_setting('test.biz')::uuid;
  v_hall uuid := current_setting('test.hall')::uuid;
  v_kod  text;
begin
  insert into public.reservations
    (business_id, hall_id, code, customer_name, customer_phone, date, slot,
     organization_type, guest_count, total_amount, deposit)
  values (v_biz, v_hall, 'OZEL-777', 'Elle Numara', '5330000024', '2033-04-04', 'Gece',
          'Düğün', 150, 100000, 20000)
  returning code into v_kod;

  if v_kod <> 'OZEL-777' then
    raise exception 'BASARISIZ: elle verilen numara % oldu', v_kod;
  end if;
end $$;

\echo '=== 5) Yeni sablon turleri tohumlanmali ==='
do $$
declare v_adet integer;
begin
  select count(*) into v_adet from public.message_templates
  where business_id = current_setting('test.biz')::uuid
    and key in ('prova', 'foto_secim', 'foto_hazir');
  if v_adet <> 3 then
    raise exception 'BASARISIZ: yeni sablonlardan % tanesi var, 3 olmaliydi', v_adet;
  end if;

  /*
    Uclu de OLAYA bagli, takvime degil: otomatik kurala baglanmamali.
    Tarihe bagli bir gonderim, hazir olmayan bir albumu "hazir" diye
    duyururdu.
  */
  if exists (select 1 from public.reminder_rules
             where business_id = current_setting('test.biz')::uuid
               and key in ('prova', 'foto_secim', 'foto_hazir')) then
    raise exception 'BASARISIZ: olaya bagli sablona otomatik kural kurulmus';
  end if;
end $$;

\echo '=== 6) Hizli yanit: ayni baslik iki kez ACILAMAMALI ==='
do $$
declare v_biz uuid := current_setting('test.biz')::uuid;
begin
  insert into public.quick_replies (business_id, title, body)
  values (v_biz, 'Yemekli fiyat', 'Yemekli fiyatimiz kisi basi 1.250 TL');

  begin
    insert into public.quick_replies (business_id, title, body)
    values (v_biz, 'Yemekli fiyat', 'Baska bir metin');
    raise exception 'BASARISIZ: ayni baslikla ikinci yanit acildi';
  exception when unique_violation then null;
  end;

  begin
    insert into public.quick_replies (business_id, title, body)
    values (v_biz, '   ', 'Bos baslik');
    raise exception 'BASARISIZ: bos baslik kabul edildi';
  exception when check_violation then null;
  end;
end $$;

\echo '=== 7) Yetkiler ==='
do $$ begin
  if not has_table_privilege('authenticated', 'public.quick_replies', 'DELETE') then
    raise exception 'BASARISIZ: kullanici hizli yanit silemiyor';
  end if;
end $$;

\echo '=== TEMIZLIK ==='
do $$ begin
  delete from public.businesses where id = current_setting('test.biz')::uuid;
  delete from auth.users where email = 'sozlesme-test@ornek.com';
end $$;

\echo '=== 21_sozlesme_no_ve_hizli_yanit_test: TUM KONTROLLER GECTI ==='
