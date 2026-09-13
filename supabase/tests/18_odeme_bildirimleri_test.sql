-- =====================================================================
-- Ödeme olay kaydı ve yönetici bildirimi testi (0026)
--
-- Sınanan davranışlar:
--   1. Şema kuruldu mu, yeni işletmeye 6 kural tohumlandı mı?
--   2. Kurallar KAPALI mı geliyor? (SMS ücretli; açık gelmemeli)
--   3. Tahsilat eklenince olay yazılıyor mu?
--   4. Çek/senet ayrıca "kasaya girmedi" olayı üretiyor mu?
--   5. Tutar ve tip aynı anda değişince İKİ olay mı yazılıyor?
--   6. Hiçbir anlamlı alan değişmemişse olay yazılmıyor mu?
--   7. Tahsilat silinince olay kalıyor mu? (kalmalı)
--   8. Kural kapalıyken SMS kuyruğa giriyor mu? (girmemeli)
--   9. Kural açıkken kuyruğa giriyor ve yer tutucular doluyor mu?
--  10. Alıcı kapalıysa ona mesaj gidiyor mu? (gitmemeli)
--  11. Geçmiş düzeltilebiliyor mu? (düzeltilememeli)
--  12. Geçersiz telefon alıcı olarak kabul ediliyor mu? (edilmemeli)
--
-- Yedinci madde kaydın asıl sebebi: silinen tahsilatın olayı da
-- silinseydi "bu para neden kayboldu" sorusu cevapsız kalırdı.
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off

\echo '=== 0) Test verisi ==='
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_biz   uuid;
  v_hall  uuid;
  v_rez   uuid;
begin
  insert into auth.users (id, email) values (v_owner, 'odeme-test@ornek.com');

  insert into public.businesses (owner_id, name) values (v_owner, 'Odeme Test Salonu')
    returning id into v_biz;
  insert into public.halls (business_id, name, capacity) values (v_biz, 'Kristal', 400)
    returning id into v_hall;
  insert into public.reservations
    (business_id, hall_id, code, customer_name, customer_phone, date, slot,
     organization_type, guest_count, total_amount, deposit)
  values
    (v_biz, v_hall, '2026-950', 'Odeme Testi', '5330000097', '2026-09-12', 'Gece',
     'Düğün', 300, 200000, 50000)
  returning id into v_rez;

  perform set_config('test.biz', v_biz::text, false);
  perform set_config('test.rez', v_rez::text, false);
end $$;

\echo '=== 1) Sema ve tohumlama ==='
select
  to_regclass('public.payment_events')           as olaylar,
  to_regclass('public.payment_alerts')           as kurallar,
  to_regclass('public.payment_alert_recipients') as alicilar,
  to_regtype('public.payment_event_kind')        as olay_turu;

do $$
declare v_adet integer;
begin
  select count(*) into v_adet from public.payment_alerts
  where business_id = current_setting('test.biz')::uuid;
  if v_adet <> 6 then
    raise exception 'BASARISIZ: yeni isletmeye % kural tohumlandi, 6 olmaliydi', v_adet;
  end if;

  -- SMS ucretli: yeni kurulan bir salonda metni okunmadan mesaj gitmemeli.
  if exists (select 1 from public.payment_alerts
             where business_id = current_setting('test.biz')::uuid and enabled) then
    raise exception 'BASARISIZ: kurallar acik geliyor';
  end if;
end $$;

\echo '=== 2) Tahsilat eklenince olay YAZILMALI ==='
do $$
declare
  v_pid uuid;
  v_adet integer;
begin
  insert into public.payments (reservation_id, date, amount, method)
  values (current_setting('test.rez')::uuid, '2026-08-01', 60000, 'Nakit')
  returning id into v_pid;
  perform set_config('test.odeme', v_pid::text, false);

  select count(*) into v_adet from public.payment_events
  where payment_id = v_pid and event = 'tahsilat_eklendi';
  if v_adet <> 1 then
    raise exception 'BASARISIZ: ekleme olayi % satir', v_adet;
  end if;

  -- Nakit kasaya girer; "kasaya girmedi" olayi OLMAMALI.
  if exists (select 1 from public.payment_events
             where payment_id = v_pid and event = 'kasaya_girmedi') then
    raise exception 'BASARISIZ: nakit tahsilat kasaya girmedi sayildi';
  end if;
end $$;

\echo '=== 3) Cek/senet AYRICA kasaya girmedi olayi uretmeli ==='
do $$
declare v_pid uuid;
begin
  insert into public.payments (reservation_id, date, amount, method)
  values (current_setting('test.rez')::uuid, '2026-08-05', 10000, 'Çek')
  returning id into v_pid;

  if not exists (select 1 from public.payment_events
                 where payment_id = v_pid and event = 'kasaya_girmedi') then
    raise exception 'BASARISIZ: cek tahsilati kasaya girmedi sayilmadi';
  end if;
  perform set_config('test.cek', v_pid::text, false);
end $$;

\echo '=== 4) Tutar ve tip birlikte degisince IKI olay yazilmali ==='
do $$
declare
  v_pid uuid := current_setting('test.odeme')::uuid;
  v_adet integer;
begin
  update public.payments set amount = 70000, method = 'Havale/EFT' where id = v_pid;

  select count(*) into v_adet from public.payment_events
  where payment_id = v_pid and event in ('tutar_degisti', 'tip_degisti');
  -- Tek bir "guncellendi" olayi yazilsaydi NEYIN degistigi kaybolurdu.
  if v_adet <> 2 then
    raise exception 'BASARISIZ: tutar+tip degisiminde % olay yazildi, 2 olmaliydi', v_adet;
  end if;

  select old_amount into v_adet from public.payment_events
  where payment_id = v_pid and event = 'tutar_degisti';
  if v_adet <> 60000 then
    raise exception 'BASARISIZ: eski tutar % kaydedildi', v_adet;
  end if;
end $$;

\echo '=== 5) Anlamsiz guncelleme olay YAZMAMALI ==='
do $$
declare
  v_pid  uuid := current_setting('test.odeme')::uuid;
  v_once integer;
  v_sonra integer;
begin
  select count(*) into v_once from public.payment_events where payment_id = v_pid;
  update public.payments set note = coalesce(note, '') || '' where id = v_pid;
  select count(*) into v_sonra from public.payment_events where payment_id = v_pid;
  if v_sonra <> v_once then
    raise exception 'BASARISIZ: rakam degismeden % yeni olay yazildi', v_sonra - v_once;
  end if;
end $$;

\echo '=== 6) Tahsilat silinince olay KALMALI ==='
do $$
declare
  v_pid uuid := current_setting('test.cek')::uuid;
  v_adet integer;
begin
  delete from public.payments where id = v_pid;

  if not exists (select 1 from public.payment_events
                 where payment_id = v_pid and event = 'tahsilat_silindi') then
    raise exception 'BASARISIZ: silme olayi yazilmadi';
  end if;
  -- Silinen tahsilatin gecmisi de silinseydi "bu para neden kayboldu"
  -- sorusu cevapsiz kalirdi.
  select count(*) into v_adet from public.payment_events where payment_id = v_pid;
  if v_adet < 3 then
    raise exception 'BASARISIZ: silinen tahsilatin gecmisi % satira dustu', v_adet;
  end if;
end $$;

\echo '=== 7) Kural KAPALIYKEN mesaj kuyruga girmemeli ==='
do $$
declare v_adet integer;
begin
  select count(*) into v_adet from public.sms_queue
  where business_id = current_setting('test.biz')::uuid;
  if v_adet <> 0 then
    raise exception 'BASARISIZ: kural kapaliyken % mesaj kuyruga girdi', v_adet;
  end if;
end $$;

\echo '=== 8) Kural ACIKKEN mesaj kuyruga girmeli, yer tutucular dolmali ==='
do $$
declare
  v_biz  uuid := current_setting('test.biz')::uuid;
  v_body text;
  v_adet integer;
begin
  update public.payment_alerts set enabled = true
  where business_id = v_biz and event = 'tahsilat_eklendi';

  insert into public.payment_alert_recipients (business_id, name, phone)
  values (v_biz, 'Yonetici', '5551112233');
  -- Kapali alici: mesaj GITMEMELI.
  insert into public.payment_alert_recipients (business_id, name, phone, enabled)
  values (v_biz, 'Eski Yonetici', '5551112244', false);

  insert into public.payments (reservation_id, date, amount, method)
  values (current_setting('test.rez')::uuid, '2026-08-20', 15000, 'Nakit');

  select count(*) into v_adet from public.sms_queue
  where business_id = v_biz and phone = '5551112233';
  if v_adet <> 1 then
    raise exception 'BASARISIZ: acik aliciya % mesaj gitti, 1 olmaliydi', v_adet;
  end if;

  if exists (select 1 from public.sms_queue where business_id = v_biz and phone = '5551112244') then
    raise exception 'BASARISIZ: kapali aliciya mesaj gitti';
  end if;

  select body into v_body from public.sms_queue
  where business_id = v_biz and phone = '5551112233' limit 1;
  if v_body like '%{%' then
    raise exception 'BASARISIZ: yer tutucu dolmadi: %', v_body;
  end if;
  if v_body not like '%2026-950%' then
    raise exception 'BASARISIZ: mesajda sozlesme numarasi yok: %', v_body;
  end if;
  if v_body not like '%15.000,00 TL%' then
    raise exception 'BASARISIZ: mesajda tutar yok: %', v_body;
  end if;
end $$;

\echo '=== 9) Gecmis DUZELTILEMEZ olmali ==='
select
  has_table_privilege('authenticated', 'public.payment_events', 'SELECT') as okur,
  has_table_privilege('authenticated', 'public.payment_events', 'UPDATE') as yazar,
  has_table_privilege('authenticated', 'public.payment_alerts', 'UPDATE') as kural_yazar;

do $$ begin
  if not has_table_privilege('authenticated', 'public.payment_events', 'SELECT') then
    raise exception 'BASARISIZ: kullanici gecmisi okuyamiyor';
  end if;
  -- Yazma hakki verilseydi "bu parayi kim degistirdi" sorusunun cevabi da
  -- degistirilebilirdi ve kayit hicbir ise yaramazdi.
  if has_table_privilege('authenticated', 'public.payment_events', 'UPDATE')
     or has_table_privilege('authenticated', 'public.payment_events', 'DELETE')
     or has_table_privilege('authenticated', 'public.payment_events', 'INSERT') then
    raise exception 'BASARISIZ: gecmis duzeltilebiliyor';
  end if;
  if not has_table_privilege('authenticated', 'public.payment_alerts', 'UPDATE') then
    raise exception 'BASARISIZ: kullanici kurali duzenleyemiyor';
  end if;
end $$;

\echo '=== 10) Gecersiz telefon REDDEDILMELI ==='
do $$ begin
  begin
    insert into public.payment_alert_recipients (business_id, name, phone)
    values (current_setting('test.biz')::uuid, 'Hatali', '0212 555 44 33');
    raise exception 'BASARISIZ: gecersiz numara kabul edildi';
  exception when check_violation then null;
  end;

  begin
    insert into public.payment_alert_recipients (business_id, name, phone)
    values (current_setting('test.biz')::uuid, '  ', '5551119988');
    raise exception 'BASARISIZ: bos ad kabul edildi';
  exception when check_violation then null;
  end;
end $$;

\echo '=== TEMIZLIK ==='
do $$ begin
  delete from public.businesses where id = current_setting('test.biz')::uuid;
  delete from auth.users where email = 'odeme-test@ornek.com';
end $$;

\echo '=== 18_odeme_bildirimleri_test: TUM KONTROLLER GECTI ==='
