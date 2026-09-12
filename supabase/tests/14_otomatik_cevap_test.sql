-- =====================================================================
-- WhatsApp otomatik cevap ayarları (0020)
--
-- Sınanan davranışlar:
--   1. Ayar sütunları kuruldu mu ve varsayılanları kapalı mı?
--   2. Çalışma günü kısıtı geçersiz değeri reddediyor mu?
--   3. Boş gün listesi reddediliyor mu?
--   4. auto_kind yalnızca bilinen iki değeri kabul ediyor mu?
--   5. İşletme silinince numara eşlemesi de düşüyor mu?
--
-- Birinci madde asıl sebep: özellik VARSAYILAN OLARAK KAPALI olmalı.
-- Göç uygulanır uygulanmaz müşterilere program adına mesaj gitmesi,
-- salonun haberi olmadan onun ağzından konuşmak demekti.
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off

\echo '=== 0) Test verisi ==='
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_biz   uuid;
begin
  insert into auth.users (id, email) values (v_owner, 'otomatik-test@ornek.com');

  insert into public.businesses (owner_id, name, category, city, district, phone, capacity, currency)
  values (v_owner, 'Otomatik Test Salonu', 'Düğün Salonu', 'Ankara', 'Çankaya', '5320000001', 300, 'TL')
  returning id into v_biz;

  perform set_config('test.biz', v_biz::text, false);
end $$;

\echo '=== 1) Ayar sutunlari VAR ve varsayilan KAPALI olmali ==='
do $$
declare
  v_eksik text;
  v_acik  boolean;
begin
  select string_agg(k, ', ') into v_eksik
  from unnest(array[
    'auto_reply_enabled', 'welcome_message', 'after_hours_enabled',
    'after_hours_message', 'work_start', 'work_end', 'work_days'
  ]) as k
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'whatsapp_accounts' and column_name = k
  );
  if v_eksik is not null then
    raise exception 'HATA: whatsapp_accounts sutunlari eksik: %', v_eksik;
  end if;

  insert into public.whatsapp_accounts (phone_number_id, business_id, display_phone)
  values ('pnid-varsayilan', current_setting('test.biz')::uuid, '+905320000001');

  select auto_reply_enabled or after_hours_enabled into v_acik
  from public.whatsapp_accounts where phone_number_id = 'pnid-varsayilan';

  if v_acik then
    raise exception 'HATA: otomatik cevap varsayilan olarak ACIK gelmis';
  end if;
  raise notice 'OK: ayarlar kurulu, varsayilan kapali';
end $$;

\echo '=== 2) Gecersiz calisma gunu REDDEDILMELI ==='
do $$
begin
  begin
    insert into public.whatsapp_accounts (phone_number_id, business_id, work_days)
    values ('pnid-gun-8', current_setting('test.biz')::uuid, array[1, 8]);
    raise exception 'HATA: 8 numarali gun kabul edildi';
  exception when check_violation then
    raise notice 'OK: gecersiz gun reddedildi';
  end;
end $$;

\echo '=== 3) Bos gun listesi REDDEDILMELI ==='
do $$
begin
  begin
    insert into public.whatsapp_accounts (phone_number_id, business_id, work_days)
    values ('pnid-bos-gun', current_setting('test.biz')::uuid, array[]::int[]);
    raise exception 'HATA: bos gun listesi kabul edildi';
  exception when check_violation then
    raise notice 'OK: bos gun listesi reddedildi';
  end;
end $$;

\echo '=== 4) auto_kind YALNIZCA bilinen degerleri almali ==='
do $$
declare
  v_lead uuid;
begin
  insert into public.customer_leads (business_id, name, phone, source, status)
  values (current_setting('test.biz')::uuid, 'Otomatik Deneme', '5551112233', 'WhatsApp', 'yeni')
  returning id into v_lead;

  -- bilinen deger gecmeli
  insert into public.customer_lead_messages (business_id, lead_id, direction, channel, body, auto_kind)
  values (current_setting('test.biz')::uuid, v_lead, 'giden', 'whatsapp', 'Mesajınız ulaştı.', 'karsilama');

  -- personelin yazdigi mesajda bos kalmali
  insert into public.customer_lead_messages (business_id, lead_id, direction, channel, body)
  values (current_setting('test.biz')::uuid, v_lead, 'giden', 'whatsapp', 'Elle yazildi.');

  begin
    insert into public.customer_lead_messages (business_id, lead_id, direction, channel, body, auto_kind)
    values (current_setting('test.biz')::uuid, v_lead, 'giden', 'whatsapp', 'x', 'reklam');
    raise exception 'HATA: tanimsiz auto_kind kabul edildi';
  exception when check_violation then
    raise notice 'OK: tanimsiz auto_kind reddedildi';
  end;

  if (select count(*) from public.customer_lead_messages
      where lead_id = v_lead and auto_kind is not null) <> 1 then
    raise exception 'HATA: otomatik mesaj sayisi beklenenden farkli';
  end if;
  raise notice 'OK: otomatik ve elle yazilan mesaj ayirt ediliyor';
end $$;

\echo '=== 5) Isletme silinince numara eslemesi de DUSMELI ==='
do $$
declare
  v_kalan int;
begin
  delete from public.businesses where id = current_setting('test.biz')::uuid;

  select count(*) into v_kalan from public.whatsapp_accounts
  where business_id = current_setting('test.biz')::uuid;

  if v_kalan <> 0 then
    raise exception 'HATA: isletme silindi ama % numara eslemesi kaldi', v_kalan;
  end if;
  raise notice 'OK: numara eslemesi isletmeyle birlikte dustu';
end $$;

\echo '=== TUM OTOMATIK CEVAP TESTLERI GECTI ==='
