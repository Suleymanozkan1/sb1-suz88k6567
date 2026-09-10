-- =====================================================================
-- Düşürülen tablolar testi (0013)
--
-- Göç geri alınamaz olduğu için iki yönü de sınanır:
--   1. Düşmesi gereken her nesne gerçekten düştü mü?
--   2. Düşmemesi gereken hiçbir şeye dokunuldu mu?
--
-- İkincisi asıl risk: CASCADE ile yazılmış bir göç, farkında olmadan
-- rezervasyonları ya da denetim kaydını da alıp götürebilirdi.
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off

\echo '=== 1) contact_messages ve payment_installments DUSMUS OLMALI ==='
select
  to_regclass('public.contact_messages')     is null as talep_tablosu_YOK,
  to_regclass('public.payment_installments') is null as taksit_tablosu_YOK;

do $$ begin
  if to_regclass('public.contact_messages') is not null
     or to_regclass('public.payment_installments') is not null then
    raise exception 'BASARISIZ: tablo hala duruyor';
  end if;
end $$;

\echo '=== 2) Yalnizca bu tablolara ait fonksiyonlar DUSMUS OLMALI ==='
select
  to_regproc('public.check_installment_total') is null as taksit_kontrolu_YOK,
  to_regproc('public.stamp_message_handling') is null as talep_damgasi_YOK,
  to_regproc('public.is_owner')               is null as is_owner_YOK;

do $$ begin
  if to_regproc('public.check_installment_total') is not null
     or to_regproc('public.stamp_message_handling') is not null
     or to_regproc('public.is_owner') is not null then
    raise exception 'BASARISIZ: fonksiyon hala duruyor';
  end if;
end $$;

\echo '=== 3) message_status tipi DUSMUS OLMALI ==='
select to_regtype('public.message_status') is null as tip_YOK;

do $$ begin
  if to_regtype('public.message_status') is not null then
    raise exception 'BASARISIZ: tip hala duruyor';
  end if;
end $$;

\echo '=== 4) Kullanilan tablolarin HICBIRI silinmemis olmali ==='
-- Bir CASCADE kazasi en kolay burada yakalanir.
select ad, to_regclass('public.' || ad) is not null as var_OLMALI
from unnest(array[
  'profiles', 'businesses', 'reservations', 'payments', 'cash_flow',
  'sms_log', 'sms_queue', 'sms_consents', 'invoices', 'invoice_lines',
  'halls', 'menus', 'seating_tables', 'event_tasks', 'vendors',
  'reservation_vendors', 'message_templates', 'reminder_rules',
  'reminder_log', 'audit_log', 'backup_runs'
]) as ad
order by ad;

do $$
declare
  v_eksik text;
begin
  select string_agg(ad, ', ') into v_eksik
  from unnest(array[
    'profiles', 'businesses', 'reservations', 'payments', 'cash_flow',
    'sms_log', 'sms_queue', 'sms_consents', 'invoices', 'invoice_lines',
    'halls', 'menus', 'seating_tables', 'event_tasks', 'vendors',
    'reservation_vendors', 'message_templates', 'reminder_rules',
    'reminder_log', 'audit_log', 'backup_runs'
  ]) as ad
  where to_regclass('public.' || ad) is null;

  if v_eksik is not null then
    raise exception 'BASARISIZ: kullanilan tablo(lar) silinmis: %', v_eksik;
  end if;
end $$;

\echo '=== 5) Rezervasyon ve tahsilat akisi calismaya devam etmeli ==='
-- Taksit tablosu düştü; kapora ve tahsilat hesabı bundan etkilenmemeli.
\set a_id '''11111111-1111-1111-1111-111111111111'''
insert into auth.users (id, email, raw_user_meta_data) values
  (:a_id, 'a@ornek.com', '{"company_name":"A","full_name":"A"}');
insert into public.businesses (id, owner_id, name, capacity) values
  ('aaaaaaaa-0000-0000-0000-000000000001', :a_id, 'A Salonu', 400);
insert into public.halls (id, business_id, name, capacity) values
  ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Ana Salon',400);

insert into public.reservations
  (id, business_id, hall_id, code, customer_name, customer_phone, date, slot,
   organization_type, guest_count, total_amount, deposit)
values
  ('dddddddd-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000001','SA-A-0001','A Müşterisi','5321110001',
   '2027-06-12','Gece','Düğün',300,250000.00,60000.00);

insert into public.payments (reservation_id, date, amount, method) values
  ('dddddddd-0000-0000-0000-000000000001','2027-01-15',60500.00,'Nakit');

-- Kapora bir tahsilattır: 250.000 - (60.000 + 60.500) = 129.500
select
  r.total_amount                                          as toplam_250000,
  r.deposit + coalesce(sum(p.amount), 0)                  as tahsilat_120500,
  r.total_amount - r.deposit - coalesce(sum(p.amount), 0) as kalan_129500
from public.reservations r
left join public.payments p on p.reservation_id = r.id
where r.id = 'dddddddd-0000-0000-0000-000000000001'
group by r.id, r.total_amount, r.deposit;

do $$
declare
  v_kalan numeric;
begin
  select r.total_amount - r.deposit - coalesce(sum(p.amount), 0) into v_kalan
  from public.reservations r
  left join public.payments p on p.reservation_id = r.id
  where r.id = 'dddddddd-0000-0000-0000-000000000001'
  group by r.id, r.total_amount, r.deposit;

  if v_kalan <> 129500.00 then
    raise exception 'BASARISIZ: kalan alacak % (129500 olmaliydi)', v_kalan;
  end if;
end $$;

\echo '=== 6) Denetim kaydi geriye donuk KORUNMALI ==='
-- Düşen tabloya ait geçmiş satırlar "kim neyi ne zaman değiştirdi"
-- sorusunun cevabıdır; tablo düştü diye silinmemeli.
insert into public.audit_log (actor_email, action, table_name, record_id, summary)
values ('eski@ornek.com', 'DELETE', 'payment_installments',
        'ffffffff-0000-0000-0000-000000000001', 'Gecmis taksit kaydi');

select count(*) as gecmis_denetim_satiri_BIR_OLMALI
from public.audit_log where table_name = 'payment_installments';

do $$ begin
  if (select count(*) from public.audit_log
      where table_name = 'payment_installments') <> 1 then
    raise exception 'BASARISIZ: gecmis denetim satiri korunmadi';
  end if;
end $$;

\echo '=== 7) Yedek disa aktarimi dusen tablolari ISTEMEMELI ==='
-- export_owner_data düşen bir tabloyu okumaya kalkarsa gecelik yedek
-- her gece sessizce başarısız olurdu.
select public.export_owner_data(:a_id) is not null as disa_aktarim_CALISIYOR;

\echo '=== 8) Sistem sagligi sorgusu CALISMAYA DEVAM ETMELI ==='
select public.system_health(:a_id) is not null as saglik_CALISIYOR;

\echo '=== TAMAM: 0013 gocu dogrulandi ==='
