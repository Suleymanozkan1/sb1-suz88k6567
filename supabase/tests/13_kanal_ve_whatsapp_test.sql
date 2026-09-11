-- =====================================================================
-- Ulaşım kanalı ve müşteri adayları (0019)
--
-- Sınanan davranışlar:
--   1. Şema kuruldu mu (tipler, tablolar, indeksler)?
--   2. "Diğer" seçilip açıklama yazılmazsa kayıt reddediliyor mu?
--   3. Diğer kanallarda açıklama isteğe bağlı mı?
--   4. Kanal raporu doğru sayıyor mu?
--   5. Aynı telefonla ikinci aday açılabiliyor mu? (açılmamalı)
--   6. Durum değişikliği geçmişe otomatik yazılıyor mu?
--   7. İşletme silinince adaylar ve geçmişleri de düşüyor mu?
--
-- Beşinci madde asıl sebep: aynı numaradan gelen ikinci mesaj yeni bir
-- kayıt açsaydı "bu müşteri daha önce arandı mı" sorusu cevapsız kalırdı.
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
  insert into auth.users (id, email) values (v_owner, 'kanal-test@ornek.com');

  insert into public.businesses (owner_id, name, category, city, district, phone, capacity, currency)
  values (v_owner, 'Kanal Test Salonu', 'Düğün Salonu', 'İstanbul', 'Kartal', '5320000000', 400, 'TL')
  returning id into v_biz;

  select id into v_hall from public.halls where business_id = v_biz limit 1;

  perform set_config('test.owner', v_owner::text, false);
  perform set_config('test.biz', v_biz::text, false);
  perform set_config('test.hall', v_hall::text, false);
end $$;

\echo '=== 1) Sema KURULMUS olmali ==='
select
  to_regtype('public.lead_channel')          is not null as kanal_tipi,
  to_regtype('public.lead_status')           is not null as durum_tipi,
  to_regclass('public.customer_leads')       is not null as aday_tablosu,
  to_regclass('public.customer_lead_messages') is not null as mesaj_tablosu,
  to_regclass('public.whatsapp_accounts')    is not null as hesap_tablosu;

do $$ begin
  if to_regtype('public.lead_channel') is null
     or to_regclass('public.customer_leads') is null
     or to_regclass('public.customer_lead_messages') is null
     or to_regclass('public.customer_lead_status_history') is null
     or to_regclass('public.whatsapp_accounts') is null then
    raise exception 'BASARISIZ: kanal/whatsapp semasi eksik';
  end if;
end $$;

\echo '=== 2) "Diger" ACIKLAMASIZ kabul EDILMEMELI ==='
do $$
declare v_hata boolean := false;
begin
  begin
    insert into public.reservations
      (business_id, hall_id, code, customer_name, customer_phone, date, slot,
       organization_type, guest_count, total_amount, source_channel)
    values (current_setting('test.biz')::uuid, current_setting('test.hall')::uuid,
            null, 'Aciklamasiz Diger', '5330000001', date '2030-06-01', 'Gece',
            'Düğün', 200, 100000, 'Diğer');
  exception when check_violation then v_hata := true; end;

  if not v_hata then
    raise exception 'BASARISIZ: aciklamasiz "Diger" kabul edildi';
  end if;
end $$;

\echo '=== 3) Diger kanallarda aciklama ISTEGE BAGLI ==='
do $$ begin
  -- Referansta "varsa isim": tavsiye edenin adi bilinmiyor olabilir.
  insert into public.reservations
    (business_id, hall_id, code, customer_name, customer_phone, date, slot,
     organization_type, guest_count, total_amount, source_channel)
  values (current_setting('test.biz')::uuid, current_setting('test.hall')::uuid,
          null, 'Referans Aciklamasiz', '5330000002', date '2030-06-02', 'Gece',
          'Düğün', 200, 100000, 'Referans');

  insert into public.reservations
    (business_id, hall_id, code, customer_name, customer_phone, date, slot,
     organization_type, guest_count, total_amount, source_channel, source_detail)
  values (current_setting('test.biz')::uuid, current_setting('test.hall')::uuid,
          null, 'Diger Aciklamali', '5330000003', date '2030-06-03', 'Gece',
          'Düğün', 200, 100000, 'Diğer', 'Tabela');

  -- Kanal hic yazilmayabilir: eski kayitlarin hepsi boyle.
  insert into public.reservations
    (business_id, hall_id, code, customer_name, customer_phone, date, slot,
     organization_type, guest_count, total_amount)
  values (current_setting('test.biz')::uuid, current_setting('test.hall')::uuid,
          null, 'Kanalsiz', '5330000004', date '2030-06-04', 'Gece',
          'Düğün', 200, 100000);
end $$;

\echo '=== 4) Kanal RAPORU dogru saymali ==='
do $$ begin
  insert into public.reservations
    (business_id, hall_id, code, customer_name, customer_phone, date, slot,
     organization_type, guest_count, total_amount, source_channel)
  values (current_setting('test.biz')::uuid, current_setting('test.hall')::uuid,
          null, 'Instagram Bir', '5330000005', date '2030-06-05', 'Gece', 'Düğün', 200, 100000, 'Instagram'),
         (current_setting('test.biz')::uuid, current_setting('test.hall')::uuid,
          null, 'Instagram Iki', '5330000006', date '2030-06-06', 'Gece', 'Düğün', 200, 100000, 'Instagram');
end $$;

select coalesce(source_channel::text, 'Belirtilmemiş') as kanal, count(*) as adet
from public.reservations
where business_id = current_setting('test.biz')::uuid
group by source_channel
order by adet desc, kanal;

do $$
declare v_instagram integer; v_bos integer;
begin
  select count(*) into v_instagram from public.reservations
  where business_id = current_setting('test.biz')::uuid and source_channel = 'Instagram';
  select count(*) into v_bos from public.reservations
  where business_id = current_setting('test.biz')::uuid and source_channel is null;

  if v_instagram <> 2 or v_bos <> 1 then
    raise exception 'BASARISIZ: kanal sayimi tutmadi (instagram %, bos %)', v_instagram, v_bos;
  end if;
end $$;

\echo '=== 5) Ayni telefonla IKINCI aday acilamamali ==='
do $$
declare v_hata boolean := false; v_lead uuid;
begin
  insert into public.whatsapp_accounts (phone_number_id, business_id, display_phone)
  values ('111222333', current_setting('test.biz')::uuid, '905330000000');

  insert into public.customer_leads (business_id, name, phone, email, guest_count, source)
  values (current_setting('test.biz')::uuid, 'Ömer Ay', '5332642537',
          'oay685126@gmail.com', 1000, 'WhatsApp')
  returning id into v_lead;
  perform set_config('test.lead', v_lead::text, false);

  -- "Bu musteri daha once arandi mi" sorusunun cevapsiz kalmamasi buna bagli.
  begin
    insert into public.customer_leads (business_id, name, phone, source)
    values (current_setting('test.biz')::uuid, 'Ayni Numara', '5332642537', 'WhatsApp');
  exception when unique_violation then v_hata := true; end;

  if not v_hata then
    raise exception 'BASARISIZ: ayni telefonla ikinci aday acildi';
  end if;
end $$;

\echo '=== 5b) TELEFONSUZ iki aday cakisma saymamali ==='
do $$ begin
  insert into public.customer_leads (business_id, name, phone, source)
  values (current_setting('test.biz')::uuid, 'Telefonsuz Bir', '', 'Manuel'),
         (current_setting('test.biz')::uuid, 'Telefonsuz Iki', '', 'Manuel');
end $$;

\echo '=== 5c) Sifir ve eksi kisi sayisi REDDEDILMELI ==='
do $$
declare v_hata boolean := false;
begin
  begin
    insert into public.customer_leads (business_id, name, phone, guest_count, source)
    values (current_setting('test.biz')::uuid, 'Sifir Kisi', '5339990000', 0, 'Manuel');
  exception when check_violation then v_hata := true; end;
  if not v_hata then
    raise exception 'BASARISIZ: sifir kisi sayisi kabul edildi';
  end if;
end $$;

\echo '=== 6) Durum degisikligi GECMISE otomatik yazilmali ==='
select from_status, to_status
from public.customer_lead_status_history
where lead_id = current_setting('test.lead')::uuid
order by created_at;

do $$
declare v_adet integer;
begin
  -- Acilista bir satir yazilmis olmali.
  select count(*) into v_adet from public.customer_lead_status_history
  where lead_id = current_setting('test.lead')::uuid;
  if v_adet <> 1 then
    raise exception 'BASARISIZ: acilista gecmis yazilmadi (% satir)', v_adet;
  end if;

  update public.customer_leads set status = 'Arandı'
  where id = current_setting('test.lead')::uuid;

  select count(*) into v_adet from public.customer_lead_status_history
  where lead_id = current_setting('test.lead')::uuid;
  if v_adet <> 2 then
    raise exception 'BASARISIZ: durum degisikligi gecmise yazilmadi (% satir)', v_adet;
  end if;

  -- Durum degismeden yapilan guncelleme gecmise satir EKLEMEMELI.
  update public.customer_leads set note = 'not guncellendi'
  where id = current_setting('test.lead')::uuid;

  select count(*) into v_adet from public.customer_lead_status_history
  where lead_id = current_setting('test.lead')::uuid;
  if v_adet <> 2 then
    raise exception 'BASARISIZ: durum degismeden gecmise satir yazildi (% satir)', v_adet;
  end if;
end $$;

\echo '=== 6b) Gecmis DUZELTILEMEMELI ==='
select
  has_table_privilege('authenticated', 'public.customer_lead_status_history', 'SELECT') as okuyabilir,
  has_table_privilege('authenticated', 'public.customer_lead_status_history', 'INSERT') as yazabilir,
  has_table_privilege('authenticated', 'public.customer_lead_messages', 'UPDATE') as mesaj_duzeltebilir,
  has_table_privilege('authenticated', 'public.customer_lead_messages', 'DELETE') as mesaj_silebilir;

do $$ begin
  -- Duzeltilebilen bir gecmis, gecmis degildir.
  if has_table_privilege('authenticated', 'public.customer_lead_status_history', 'INSERT')
     or has_table_privilege('authenticated', 'public.customer_lead_messages', 'UPDATE')
     or has_table_privilege('authenticated', 'public.customer_lead_messages', 'DELETE') then
    raise exception 'BASARISIZ: gecmis duzeltilebiliyor';
  end if;
end $$;

\echo '=== 6c) Ayni WhatsApp mesaji IKI KEZ yazilamamali ==='
do $$
declare v_hata boolean := false;
begin
  insert into public.customer_lead_messages
    (business_id, lead_id, direction, channel, body, wa_message_id)
  values (current_setting('test.biz')::uuid, current_setting('test.lead')::uuid,
          'gelen', 'whatsapp', 'Ömer Ay', 'wamid.AAA');

  begin
    insert into public.customer_lead_messages
      (business_id, lead_id, direction, channel, body, wa_message_id)
    values (current_setting('test.biz')::uuid, current_setting('test.lead')::uuid,
            'gelen', 'whatsapp', 'Ömer Ay', 'wamid.AAA');
  exception when unique_violation then v_hata := true; end;

  if not v_hata then
    raise exception 'BASARISIZ: ayni mesaj gecmise iki kez yazildi';
  end if;
end $$;

\echo '=== 7) Isletme silinince adaylar ve gecmisleri de DUSMELI ==='
do $$
declare v_aday integer; v_mesaj integer; v_gecmis integer; v_hesap integer;
begin
  delete from public.businesses where id = current_setting('test.biz')::uuid;

  select count(*) into v_aday from public.customer_leads
  where business_id = current_setting('test.biz')::uuid;
  select count(*) into v_mesaj from public.customer_lead_messages
  where business_id = current_setting('test.biz')::uuid;
  select count(*) into v_gecmis from public.customer_lead_status_history
  where business_id = current_setting('test.biz')::uuid;
  select count(*) into v_hesap from public.whatsapp_accounts
  where business_id = current_setting('test.biz')::uuid;

  if v_aday <> 0 or v_mesaj <> 0 or v_gecmis <> 0 or v_hesap <> 0 then
    raise exception 'BASARISIZ: isletme silindi ama % aday, % mesaj, % gecmis, % hesap kaldi',
      v_aday, v_mesaj, v_gecmis, v_hesap;
  end if;
end $$;

\echo '=== 8) Temizlik ==='
delete from auth.users where id = current_setting('test.owner')::uuid;

\echo '=== TUM KANAL VE MUSTERI ADAYI TESTLERI GECTI ==='
