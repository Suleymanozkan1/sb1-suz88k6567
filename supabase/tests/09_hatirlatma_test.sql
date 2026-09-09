-- =====================================================================
-- Hatırlatma şablonları ve otomatik hatırlatma testleri
--
-- Sınanan davranışlar:
--   1) Yeni işletmeye varsayılan şablon ve kurallar yazılır
--   2) Yer tutucular rezervasyonun kendi verisiyle doldurulur
--   3) Vadesi gelen hatırlatma kuyruğa girer
--   4) Aynı hatırlatma ikinci kez gönderilmez
--   5) Vadesi gelmemiş hatırlatma gönderilmez
--   6) İptal edilmiş rezervasyona hatırlatma gitmez
--   7) Onayı olmayan numaraya ticari hatırlatma engellenir, kaydı kalır
--   8) reminder_log değiştirilemez (yalnızca okuma yetkisi)
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off

\set a_id '''11111111-1111-1111-1111-111111111111'''
\set biz '''aaaaaaaa-0000-0000-0000-000000000001'''

insert into auth.users (id, email, raw_user_meta_data) values
  (:a_id, 'a@ornek.com', '{"company_name":"A Salonu","full_name":"A Yetkili"}');

insert into public.businesses (id, owner_id, name, capacity) values
  (:biz, :a_id, 'Grand Sahra Düğün ve Davet Salonu', 500);

-- Her sınama rezervasyonu ayrı salona yazılır: aynı salon–gün–seans
-- birleşimine ikinci kayıt açılamıyor (çakışma kuralı) ve sınama verisi
-- bu kurala takılıyordu.
insert into public.halls (id, business_id, name, capacity) values
  ('11111111-aaaa-0000-0000-000000000001', :biz, 'Kristal Salon', 400),
  ('11111111-aaaa-0000-0000-000000000002', :biz, 'Zümrüt Salon', 300),
  ('11111111-aaaa-0000-0000-000000000003', :biz, 'Bahçe', 250),
  ('11111111-aaaa-0000-0000-000000000004', :biz, 'Teras', 150);

\echo '=== 1) Varsayilan sablon ve kurallar yazilmis olmali ==='
select public.seed_message_templates(:biz);
select count(*) as sablon_YEDI_OLMALI from public.message_templates where business_id = :biz;
select count(*) as kural_DORT_OLMALI  from public.reminder_rules   where business_id = :biz;
select count(*) as acik_kural_IKI_OLMALI
  from public.reminder_rules where business_id = :biz and enabled;

\echo '=== 2) Yer tutucular doldurulmali, bilinmeyen olan oldugu gibi kalmali ==='
select public.render_template(
  'Sayın {musteri}, {tarih} tarihinde {salon}. Kalan {kalan} TL. {yok}',
  jsonb_build_object('musteri','Ayşe Yılmaz','tarih','12.06.2027','salon','Kristal Salon','kalan','25.000,00')
) as doldurulmus_metin;

-- Yedi gün sonrası: tarih_hatirlatma kuralı (days_before = 7) tetiklenmeli.
insert into public.reservations
  (id, business_id, hall_id, code, customer_name, customer_phone, date, slot,
   organization_type, guest_count, total_amount, deposit, status)
values
  ('dddddddd-0000-0000-0000-000000000001', :biz, '11111111-aaaa-0000-0000-000000000001',
   'SA-2027-0001', 'Ayşe Yılmaz', '5321112233',
   (current_date + 7), 'Gece', 'Düğün', 300, 210000, 60000, 'Kesin Rezervasyon'),
  -- Yirmi gün sonrası: hiçbir kuralın vadesi gelmemiş olmalı.
  ('dddddddd-0000-0000-0000-000000000002', :biz, '11111111-aaaa-0000-0000-000000000001',
   'SA-2027-0002', 'Uzak Müşteri', '5321112244',
   (current_date + 20), 'Gündüz', 'Nişan', 150, 90000, 0, 'Kesin Rezervasyon'),
  -- Yedi gün sonrası ama iptal: hatırlatma gitmemeli.
  ('dddddddd-0000-0000-0000-000000000003', :biz, '11111111-aaaa-0000-0000-000000000001',
   'SA-2027-0003', 'İptal Müşterisi', '5321112255',
   (current_date + 7), 'Gündüz', 'Kına', 100, 50000, 0, 'İptal');

insert into public.payments (reservation_id, date, amount, method) values
  ('dddddddd-0000-0000-0000-000000000001', current_date, 60000, 'Havale/EFT');

\echo '=== 3) Vadesi gelen hatirlatma kuyruga girmeli ==='
-- Saat kuralı 10:00; sabah 11'de çalıştırıldığı varsayılır.
select reservation_id, key, queued
  from public.enqueue_due_reminders((current_date + interval '11 hours')::timestamptz)
  order by key;

\echo '=== 4) Mesaj govdesi musterinin kendi verisiyle dolmus olmali ==='
select phone, body from public.sms_queue where business_id = :biz order by created_at;

\echo '=== 5) Ikinci calistirmada AYNI hatirlatma TEKRAR gitmemeli (bos donmeli) ==='
select count(*) as ikinci_turda_SIFIR_OLMALI
  from public.enqueue_due_reminders((current_date + interval '11 hours')::timestamptz);

\echo '=== 6) Kuyrukta yalnizca bir mesaj olmali; iptal ve uzak tarih girmemeli ==='
select count(*) as kuyruk_BIR_OLMALI from public.sms_queue where business_id = :biz;
select count(*) as iptal_kaydi_SIFIR_OLMALI
  from public.reminder_log where reservation_id = 'dddddddd-0000-0000-0000-000000000003';
select count(*) as uzak_tarih_SIFIR_OLMALI
  from public.reminder_log where reservation_id = 'dddddddd-0000-0000-0000-000000000002';

\echo '=== 7) Onaysiz numaraya TICARI hatirlatma engellenmeli, kaydi kalmali ==='
-- Teşekkür mesajı ticari iletidir ve İYS onayı ister.
update public.reminder_rules set enabled = true, days_before = 7
  where business_id = :biz and key = 'tesekkur';
-- Kayıt zaten yazıldığı için yeni bir rezervasyon üzerinden denenir.
insert into public.reservations
  (id, business_id, hall_id, code, customer_name, customer_phone, date, slot,
   organization_type, guest_count, total_amount, deposit)
values
  ('dddddddd-0000-0000-0000-000000000004', :biz, '11111111-aaaa-0000-0000-000000000002',
   'SA-2027-0004', 'Onaysız Müşteri', '5321112266',
   (current_date + 7), 'Gece', 'Düğün', 200, 120000, 0);

select key, queued, reason
  from public.enqueue_due_reminders((current_date + interval '11 hours')::timestamptz)
  where reservation_id = 'dddddddd-0000-0000-0000-000000000004'
  order by key;

\echo '=== 8) Engellenen ticari ileti kuyrukta IPTAL olarak durmali (sessizce atilmamali) ==='
select category, status, left(last_error, 40) as gerekce
  from public.sms_queue where category = 'ticari' order by created_at;

\echo '=== 9) Onay verilince ticari hatirlatma kuyruga girmeli ==='
insert into public.sms_consents (business_id, phone, status, source)
  values (:biz, '5321112277', 'ONAY', 'HS_WEB');
insert into public.reservations
  (id, business_id, hall_id, code, customer_name, customer_phone, date, slot,
   organization_type, guest_count, total_amount, deposit)
values
  ('dddddddd-0000-0000-0000-000000000005', :biz, '11111111-aaaa-0000-0000-000000000003',
   'SA-2027-0005', 'Onaylı Müşteri', '5321112277',
   (current_date + 7), 'Gündüz', 'Düğün', 200, 120000, 0);
select key, queued
  from public.enqueue_due_reminders((current_date + interval '11 hours')::timestamptz)
  where reservation_id = 'dddddddd-0000-0000-0000-000000000005' and key = 'tesekkur';

\echo '=== 10) reminder_log yalnizca okunabilir olmali (yazma yetkisi verilmemis) ==='
select has_table_privilege('authenticated', 'public.reminder_log', 'SELECT') as okuma_TRUE_OLMALI,
       has_table_privilege('authenticated', 'public.reminder_log', 'DELETE') as silme_FALSE_OLMALI,
       has_table_privilege('authenticated', 'public.reminder_log', 'UPDATE') as guncelleme_FALSE_OLMALI;

\echo '=== 11) Saat kurali: sabah 08:00de calistirilinca 10:00luk kural TETIKLENMEMELI ==='
insert into public.reservations
  (id, business_id, hall_id, code, customer_name, customer_phone, date, slot,
   organization_type, guest_count, total_amount, deposit)
values
  ('dddddddd-0000-0000-0000-000000000006', :biz, '11111111-aaaa-0000-0000-000000000004',
   'SA-2027-0006', 'Erken Saat', '5321112288',
   (current_date + 7), 'Gece', 'Düğün', 200, 120000, 0);
select count(*) as erken_saatte_SIFIR_OLMALI
  from public.enqueue_due_reminders((current_date + interval '5 hours')::timestamptz)
  where reservation_id = 'dddddddd-0000-0000-0000-000000000006';
