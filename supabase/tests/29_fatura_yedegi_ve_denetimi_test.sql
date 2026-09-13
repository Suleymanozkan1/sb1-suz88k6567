-- =====================================================================
-- Fatura yedeği ve denetim kaydı testi (0040)
--
-- 0040, faturaya iki ayrı kapı açıyor: `export_invoice_data` (yedek) ve
-- `fatura_denetim_kaydi` (denetim ekranı). İkisinin varlık sebebi,
-- faturaların Türkiye'deki ayrı bir veritabanında durabilmesi; sunucu bu
-- çağrıları oraya yönlendiriyor. Fonksiyonlar ANA veritabanında da
-- tanımlı ki bölme yapılmamış kurulum aynı şekilde çalışsın -- bu paket
-- işte o hâli sınıyor.
--
-- Sınanan davranışlar:
--   1. Yedek fonksiyonu faturayı, satırını ve serisini döndürüyor mu?
--   2. Başka kapsamın verisi yedeğe SIZIYOR mu? (sızmamalı)
--   3. Başkasının kapsamı elle istenirse ne oluyor? (reddedilmeli)
--   4. Denetim fonksiyonu fatura kayıtlarını döndürüyor mu?
--   5. Denetim fonksiyonu fatura DIŞI kaydı döndürüyor mu? (döndürmemeli
--      -- ekran `audit_log`'u ayrıca okuyor, çift görünürdü)
--   6. Başka kapsamın denetim kaydı görünüyor mu? (görünmemeli)
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off

\echo '=== 0) Test verisi ==='
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_baska uuid := gen_random_uuid();
  v_biz   uuid;
  v_biz2  uuid;
  v_hall  uuid;
  v_rez   uuid;
  v_no    text;
  v_fat   uuid;
begin
  insert into auth.users (id, email) values
    (v_owner, 'yedek-sahip@ornek.com'),
    (v_baska, 'yedek-baska@ornek.com');

  update public.profiles set role = 'owner', owner_id = null,
    permissions = array['fatura.goruntule','fatura.duzenle']
  where id in (v_owner, v_baska);

  insert into public.businesses (owner_id, name) values (v_owner, 'Yedek Salonu')
    returning id into v_biz;
  insert into public.businesses (owner_id, name) values (v_baska, 'Baska Salon')
    returning id into v_biz2;

  insert into public.halls (business_id, name, capacity) values (v_biz, 'Kristal', 400)
    returning id into v_hall;
  insert into public.reservations
    (business_id, hall_id, customer_name, customer_phone, date, slot,
     organization_type, guest_count, total_amount, deposit)
  values (v_biz, v_hall, 'Yedek Testi', '5330000099', '2030-06-06', 'Gece',
          'Düğün', 200, 100000, 20000)
  returning id into v_rez;

  -- Kendi kapsamı
  v_no := public.next_invoice_number(v_biz, 'YDK');
  insert into public.invoices
    (business_id, reservation_id, invoice_number, buyer_name,
     gross_kurus, base_kurus, vat_kurus, total_kurus)
  values (v_biz, v_rez, v_no, 'Yedek Alıcı', 100000, 100000, 20000, 120000)
  returning id into v_fat;

  insert into public.invoice_lines
    (invoice_id, line_no, description, quantity, unit_price_kurus, vat_rate,
     gross_kurus, base_kurus, vat_kurus, total_kurus)
  values (v_fat, 1, 'Organizasyon', 1, 100000, 20, 100000, 100000, 20000, 120000);

  -- Başka kapsam: yedekte ve denetimde GÖRÜNMEMELİ
  v_no := public.next_invoice_number(v_biz2, 'BSK');
  insert into public.invoices
    (business_id, invoice_number, buyer_name,
     gross_kurus, base_kurus, vat_kurus, total_kurus)
  values (v_biz2, v_no, 'Baska Alıcı', 50000, 50000, 10000, 60000);

  perform set_config('test.owner', v_owner::text, false);
  perform set_config('test.baska', v_baska::text, false);
  perform set_config('test.fat', v_fat::text, false);
end $$;

\echo '=== 1) Yedek fatura, satir ve seriyi dondurmeli ==='
do $$
declare v_veri jsonb;
begin
  v_veri := public.export_invoice_data(current_setting('test.owner')::uuid);
  if jsonb_array_length(v_veri -> 'faturalar') <> 1 then
    raise exception 'BASARISIZ: yedekte % fatura var, 1 olmaliydi',
      jsonb_array_length(v_veri -> 'faturalar');
  end if;
  if jsonb_array_length(v_veri -> 'fatura_satirlari') <> 1 then
    raise exception 'BASARISIZ: yedekte fatura satiri yok';
  end if;
  if jsonb_array_length(v_veri -> 'fatura_serileri') <> 1 then
    raise exception 'BASARISIZ: yedekte fatura serisi yok';
  end if;
end $$;

\echo '=== 2) Baska kapsamin faturasi yedege SIZMAMALI ==='
do $$
declare v_veri jsonb;
begin
  v_veri := public.export_invoice_data(current_setting('test.owner')::uuid);
  if v_veri::text like '%Baska Alıcı%' then
    raise exception 'BASARISIZ: baska kapsamin faturasi yedege sizdi';
  end if;
end $$;

\echo '=== 3) Baskasinin kapsami elle istenirse REDDEDILMELI ==='
do $$
declare v_hata boolean := false;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.owner'))::text, true);
  set local role authenticated;
  begin
    perform public.export_invoice_data(current_setting('test.baska')::uuid);
    v_hata := true;
  exception when insufficient_privilege then null;
  end;
  reset role;
  if v_hata then
    raise exception 'BASARISIZ: baskasinin fatura yedegi alinabildi';
  end if;
end $$;

\echo '=== 4) Denetim fonksiyonu fatura kaydini dondurmeli ==='
do $$
declare v_adet integer;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.owner'))::text, true);
  set local role authenticated;
  select count(*) into v_adet from public.fatura_denetim_kaydi(100);
  reset role;
  if v_adet = 0 then
    raise exception 'BASARISIZ: denetim fonksiyonu fatura kaydi dondurmedi';
  end if;
end $$;

\echo '=== 5) Denetim fonksiyonu fatura DISI kaydi dondurmemeli ==='
do $$
declare v_adet integer; v_hepsi integer;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.owner'))::text, true);
  set local role authenticated;

  select count(*) into v_adet from public.fatura_denetim_kaydi(500)
  where table_name not in ('invoices', 'invoice_lines');

  -- Rezervasyon kaydi audit_log'da VAR; fonksiyon onu ayiklamali.
  select count(*) into v_hepsi from public.audit_log
  where table_name = 'reservations';

  reset role;

  if v_hepsi = 0 then
    raise exception 'BASARISIZ: test kurulumu bozuk, denetimde rezervasyon yok';
  end if;
  if v_adet <> 0 then
    raise exception 'BASARISIZ: denetim fonksiyonu % fatura disi kayit dondurdu', v_adet;
  end if;
end $$;

\echo '=== 6) Baska kapsamin denetim kaydi GORUNMEMELI ==='
do $$
declare v_adet integer;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.baska'))::text, true);
  set local role authenticated;
  select count(*) into v_adet from public.fatura_denetim_kaydi(500)
  where record_id = current_setting('test.fat');
  reset role;
  if v_adet <> 0 then
    raise exception 'BASARISIZ: baska sahip bizim fatura denetim kaydimizi gordu';
  end if;
end $$;

\echo '=== TUM TESTLER BASARILI ==='
