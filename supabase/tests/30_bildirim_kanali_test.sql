-- =====================================================================
-- Bildirim kanalı testi (0041)
--
-- Yönetici uyarıları artık WhatsApp'tan da gidebiliyor. Kanal ayrı bir
-- kuyruk değil, mevcut `sms_queue` satırının bir alanı; bu paket o
-- kararın gerçekten işlediğini sınıyor.
--
-- Sınanan davranışlar:
--   1. Alıcının kanalı kuyruk satırına geçiyor mu?
--   2. Kanal belirtilmezse SMS'e mi düşüyor? (eski çağrılar bozulmamalı)
--   3. Aynı olayda farklı kanallı iki alıcı ayrı ayrı yazılıyor mu?
--   4. complete_sms hangi kanaldan gittiğini yazıyor mu?
--   5. WhatsApp kanalı İYS kuralını ATLATIYOR mu? (atlatmamalı)
--   6. Günlük tavan kanaldan bağımsız mı?
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
  insert into auth.users (id, email) values (v_owner, 'kanal-sahip@ornek.com');
  update public.profiles set role = 'owner', owner_id = null where id = v_owner;

  insert into public.businesses (owner_id, name) values (v_owner, 'Kanal Test Salonu')
    returning id into v_biz;
  insert into public.halls (business_id, name, capacity) values (v_biz, 'Kristal', 400)
    returning id into v_hall;
  insert into public.reservations
    (business_id, hall_id, customer_name, customer_phone, date, slot,
     organization_type, guest_count, total_amount, deposit)
  values (v_biz, v_hall, 'Kanal Testi', '5330000077', '2030-08-08', 'Gece',
          'Düğün', 200, 100000, 20000)
  returning id into v_rez;

  -- İki alıcı, iki farklı kanal.
  insert into public.payment_alert_recipients (business_id, name, phone, enabled, channel)
  values (v_biz, 'WhatsApp Yöneticisi', '5551110001', true, 'whatsapp'),
         (v_biz, 'SMS Yöneticisi',      '5551110002', true, 'sms');

  -- Tahsilat eklendi kuralını aç.
  update public.payment_alerts set enabled = true
  where business_id = v_biz and event = 'tahsilat_eklendi';

  perform set_config('test.biz', v_biz::text, false);
  perform set_config('test.rez', v_rez::text, false);
end $$;

\echo '=== 1) Alicinin kanali kuyruga geciyor ==='
do $$
declare v_wa integer; v_sms integer;
begin
  insert into public.payments (reservation_id, date, amount, method)
  values (current_setting('test.rez')::uuid, '2030-02-02', 5000, 'Nakit');

  select count(*) into v_wa from public.sms_queue
  where business_id = current_setting('test.biz')::uuid
    and phone = '5551110001' and channel = 'whatsapp';
  select count(*) into v_sms from public.sms_queue
  where business_id = current_setting('test.biz')::uuid
    and phone = '5551110002' and channel = 'sms';

  if v_wa <> 1 then
    raise exception 'BASARISIZ: whatsapp alicisina % satir yazildi, 1 olmaliydi', v_wa;
  end if;
  if v_sms <> 1 then
    raise exception 'BASARISIZ: sms alicisina % satir yazildi, 1 olmaliydi', v_sms;
  end if;
end $$;

\echo '=== 2) Kanal belirtilmezse SMS ==='
do $$
declare v_id uuid; v_kanal message_channel;
begin
  -- Eski cagri bicimi (alti argüman): kanal parametresi verilmiyor.
  select queue_id into v_id from public.enqueue_sms(
    current_setting('test.biz')::uuid, '5551110003', 'varsayilan kanal',
    'Bilgilendirme'::sms_kind, 'islem'::message_category);

  select channel into v_kanal from public.sms_queue where id = v_id;
  if v_kanal <> 'sms' then
    raise exception 'BASARISIZ: varsayilan kanal % (sms olmaliydi)', v_kanal;
  end if;
end $$;

\echo '=== 3) complete_sms giden kanali yaziyor ==='
do $$
declare v_id uuid; v_giden message_channel; v_istenen message_channel;
begin
  select queue_id into v_id from public.enqueue_sms(
    current_setting('test.biz')::uuid, '5551110004', 'kanal kaydi',
    'Bilgilendirme'::sms_kind, 'islem'::message_category, null, 'whatsapp');

  -- WhatsApp dustu, SMS'ten gitti senaryosu.
  perform public.complete_sms(v_id, true, null, 'ref-1', 'sms'::message_channel);

  select channel, sent_channel into v_istenen, v_giden
  from public.sms_queue where id = v_id;

  if v_istenen <> 'whatsapp' then
    raise exception 'BASARISIZ: istenen kanal degisti (%)', v_istenen;
  end if;
  if v_giden <> 'sms' then
    raise exception 'BASARISIZ: giden kanal % (sms olmaliydi)', v_giden;
  end if;
end $$;

\echo '=== 4) Kanal belirtilmezse giden kanal istenenle ayni ==='
do $$
declare v_id uuid; v_giden message_channel;
begin
  select queue_id into v_id from public.enqueue_sms(
    current_setting('test.biz')::uuid, '5551110005', 'kanal varsayilani',
    'Bilgilendirme'::sms_kind, 'islem'::message_category, null, 'whatsapp');

  perform public.complete_sms(v_id, true, null, 'ref-2');

  select sent_channel into v_giden from public.sms_queue where id = v_id;
  if v_giden <> 'whatsapp' then
    raise exception 'BASARISIZ: giden kanal % (whatsapp olmaliydi)', v_giden;
  end if;
end $$;

\echo '=== 5) WhatsApp kanali IYS kuralini ATLATMIYOR ==='
do $$
declare v_kuyruklandi boolean; v_id uuid; v_durum queue_status;
begin
  /*
    WhatsApp'tan gitmesi mesaji ticari ileti olmaktan cikarmaz. Kanal
    kurali atlatabilseydi, onaysiz pazarlama mesaji WhatsApp uzerinden
    gonderilebilirdi.
  */
  select queued, queue_id into v_kuyruklandi, v_id from public.enqueue_sms(
    current_setting('test.biz')::uuid, '5551110006', 'kampanya',
    'Bilgilendirme'::sms_kind, 'ticari'::message_category, null, 'whatsapp');

  if v_kuyruklandi then
    raise exception 'BASARISIZ: onaysiz ticari ileti WhatsApp kanalindan kuyruga girdi';
  end if;

  select status into v_durum from public.sms_queue where id = v_id;
  if v_durum <> 'iptal' then
    raise exception 'BASARISIZ: engellenen mesaj % durumunda (iptal olmaliydi)', v_durum;
  end if;
end $$;

\echo '=== 6) Gunluk tavan kanaldan bagimsiz ==='
do $$
declare v_kuyruklandi boolean; v_sebep text; v_biz uuid;
begin
  -- Ayri bir isletme: digerinin sayaci etkilenmesin.
  insert into public.businesses (owner_id, name)
  select owner_id, 'Tavan Testi' from public.businesses
  where id = current_setting('test.biz')::uuid
  returning id into v_biz;

  insert into public.sms_queue (business_id, phone, body, kind, category, channel)
  select v_biz, '5551110007', 'dolgu', 'Bilgilendirme', 'islem', 'whatsapp'
  from generate_series(1, 500);

  select queued, reason into v_kuyruklandi, v_sebep from public.enqueue_sms(
    v_biz, '5551110008', 'tavan sonrasi',
    'Bilgilendirme'::sms_kind, 'islem'::message_category, null, 'whatsapp');

  if v_kuyruklandi then
    raise exception 'BASARISIZ: gunluk tavan WhatsApp kanalinda uygulanmadi';
  end if;
  if v_sebep not like '%sınır%' then
    raise exception 'BASARISIZ: beklenmeyen gerekce: %', v_sebep;
  end if;
end $$;

\echo '=== TUM TESTLER BASARILI ==='
