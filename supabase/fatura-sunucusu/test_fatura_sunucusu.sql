-- =====================================================================
-- Fatura sunucusu (Türkiye) testi
--
-- Bu veritabanında kimlik tablosu (auth.users) YOK ve rezervasyon
-- tablosu YOK. Yetki, ana sunucudan çoğaltılan `profiles` ve
-- `businesses` kopyalarına dayanıyor. Sınanan şey tam olarak bu:
-- kopyalar yerindeyken RLS ana sunucudakiyle AYNI kararı veriyor mu?
--
-- Sınanan davranışlar:
--   1. İşletme sahibi kendi faturasını görüyor mu?
--   2. `fatura.goruntule` yetkisi olmayan personel görüyor mu? (görmemeli)
--   3. Yalnızca görüntüleme yetkisi olan personel yazabiliyor mu? (yazmamalı)
--   4. Başka sahibin personeli faturayı görüyor mu? (görmemeli)
--   5. Fatura SİLİNEBİLİYOR mu? (silinmemeli - vergi belgesi)
--   6. Gönderilmiş fatura değiştirilebiliyor mu? (değiştirilememeli)
--   7. Seri numarası boşluksuz ve atomik ilerliyor mu?
--   8. `reservation_id` yabancı anahtarsız yazılabiliyor mu?
--      (yazılabilmeli - rezervasyon diğer sunucuda)
--   9. Denetim kaydı fatura değişikliğini yazıyor mu?
--  10. Yedek fonksiyonu faturaları döndürüyor mu?
--  11. Yetki kopyaları tarayıcıya KAPALI mı?
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off

\echo '=== 0) Test verisi ==='
do $$
declare
  v_owner    uuid := gen_random_uuid();
  v_okur     uuid := gen_random_uuid();
  v_yetkisiz uuid := gen_random_uuid();
  v_yabanci  uuid := gen_random_uuid();
  v_biz      uuid := gen_random_uuid();
  v_no       text;
  v_fatura   uuid;
begin
  -- Çoğaltmadan gelmiş gibi: bu satırları normalde ana sunucu yazıyor.
  insert into public.profiles (id, email, full_name, role, owner_id, permissions) values
    (v_owner, 'tr-sahip@ornek.com', 'Sahip', 'owner', null,
     array['fatura.goruntule','fatura.duzenle']),
    (v_okur, 'tr-okur@ornek.com', 'Okuyucu', 'staff', v_owner,
     array['fatura.goruntule']),
    (v_yetkisiz, 'tr-yok@ornek.com', 'Yetkisiz', 'staff', v_owner,
     array['rezervasyon.goruntule']),
    (v_yabanci, 'tr-yabanci@ornek.com', 'Yabanci', 'owner', null,
     array['fatura.goruntule','fatura.duzenle']);

  insert into public.businesses (id, owner_id, name) values (v_biz, v_owner, 'TR Test Salonu');

  v_no := public.next_invoice_number(v_biz, 'TST');

  insert into public.invoices
    (business_id, reservation_id, invoice_number, buyer_name, created_by,
     gross_kurus, base_kurus, vat_kurus, total_kurus)
  -- reservation_id DİĞER SUNUCUDAKİ bir kimlik; burada karşılığı yok.
  values (v_biz, gen_random_uuid(), v_no, 'Test Alıcı', v_owner,
          100000, 100000, 20000, 120000)
  returning id into v_fatura;

  insert into public.invoice_lines
    (invoice_id, line_no, description, quantity, unit_price_kurus, vat_rate,
     gross_kurus, base_kurus, vat_kurus, total_kurus)
  values (v_fatura, 1, 'Düğün organizasyonu', 1, 100000, 20,
          100000, 100000, 20000, 120000);

  perform set_config('test.owner', v_owner::text, false);
  perform set_config('test.okur', v_okur::text, false);
  perform set_config('test.yok', v_yetkisiz::text, false);
  perform set_config('test.yabanci', v_yabanci::text, false);
  perform set_config('test.biz', v_biz::text, false);
  perform set_config('test.fatura', v_fatura::text, false);
end $$;

\echo '=== 1) Isletme sahibi kendi faturasini gormeli ==='
do $$
declare v_adet integer;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.owner'))::text, true);
  set local role authenticated;
  select count(*) into v_adet from public.invoices;
  if v_adet <> 1 then
    raise exception 'BASARISIZ: sahip % fatura gordu, 1 gormeliydi', v_adet;
  end if;
  reset role;
end $$;

\echo '=== 2) Yetkisiz personel faturayi GORMEMELI ==='
do $$
declare v_adet integer;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.yok'))::text, true);
  set local role authenticated;
  select count(*) into v_adet from public.invoices;
  if v_adet <> 0 then
    raise exception 'BASARISIZ: yetkisiz personel % fatura gordu', v_adet;
  end if;
  reset role;
end $$;

\echo '=== 3) Yalnizca goruntuleme yetkisi olan YAZAMAMALI ==='
do $$
declare v_adet integer; v_hata boolean := false;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.okur'))::text, true);
  set local role authenticated;

  select count(*) into v_adet from public.invoices;
  if v_adet <> 1 then
    raise exception 'BASARISIZ: okuyucu % fatura gordu, 1 gormeliydi', v_adet;
  end if;

  begin
    update public.invoices set note = 'degistirdim'
    where id = current_setting('test.fatura')::uuid;
    -- RLS yazmayi engellediginde hata degil, SIFIR SATIR etkilenir.
    get diagnostics v_adet = row_count;
    if v_adet > 0 then v_hata := true; end if;
  exception when insufficient_privilege then null;
  end;

  reset role;
  if v_hata then
    raise exception 'BASARISIZ: goruntuleme yetkisi olan personel faturayi degistirdi';
  end if;
end $$;

\echo '=== 4) Baska sahibin personeli GORMEMELI ==='
do $$
declare v_adet integer;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.yabanci'))::text, true);
  set local role authenticated;
  select count(*) into v_adet from public.invoices;
  if v_adet <> 0 then
    raise exception 'BASARISIZ: yabanci sahip % fatura gordu', v_adet;
  end if;
  reset role;
end $$;

\echo '=== 5) Fatura SILINEMEZ (vergi belgesi) ==='
do $$
declare v_yetki boolean;
begin
  select has_table_privilege('authenticated', 'public.invoices', 'DELETE') into v_yetki;
  if v_yetki then
    raise exception 'BASARISIZ: authenticated rolu faturayi silebiliyor';
  end if;
end $$;

\echo '=== 6) Gonderilmis fatura DEGISTIRILEMEZ ==='
do $$
declare v_hata boolean := false;
begin
  update public.invoices set status = 'gonderildi'
  where id = current_setting('test.fatura')::uuid;

  begin
    update public.invoices set total_kurus = 999999
    where id = current_setting('test.fatura')::uuid;
    v_hata := true;
  exception when check_violation then null;
  end;

  if v_hata then
    raise exception 'BASARISIZ: gonderilmis faturanin tutari degistirildi';
  end if;

  -- Satirlari da korunmali
  v_hata := false;
  begin
    update public.invoice_lines set description = 'degisti'
    where invoice_id = current_setting('test.fatura')::uuid;
    v_hata := true;
  exception when check_violation then null;
  end;

  if v_hata then
    raise exception 'BASARISIZ: gonderilmis faturanin satiri degistirildi';
  end if;

  update public.invoices set status = 'taslak'
  where id = current_setting('test.fatura')::uuid;
end $$;

\echo '=== 7) Seri numarasi bosluksuz ilerlemeli ==='
do $$
declare
  v_biz uuid := current_setting('test.biz')::uuid;
  v_a text; v_b text; v_c text;
begin
  v_a := public.next_invoice_number(v_biz, 'SRA');
  v_b := public.next_invoice_number(v_biz, 'SRA');
  v_c := public.next_invoice_number(v_biz, 'SRA');

  if right(v_a, 9)::int + 1 <> right(v_b, 9)::int
     or right(v_b, 9)::int + 1 <> right(v_c, 9)::int then
    raise exception 'BASARISIZ: numara sirasi bosluklu: %, %, %', v_a, v_b, v_c;
  end if;

  -- Bicim ana sunucudakiyle ayni olmali: 3 harf + 4 hane yil + 9 hane sira
  if v_a !~ '^[A-Z0-9]{3}\d{13}$' then
    raise exception 'BASARISIZ: numara bicimi bozuk: %', v_a;
  end if;
end $$;

\echo '=== 8) reservation_id yabanci anahtarsiz yazilabilmeli ==='
do $$
declare v_var boolean;
begin
  -- Bu sunucuda public.reservations OLMAMALI.
  if to_regclass('public.reservations') is not null then
    raise exception 'BASARISIZ: fatura sunucusunda rezervasyon tablosu var';
  end if;

  -- invoices.reservation_id uzerinde yabanci anahtar OLMAMALI.
  select exists (
    select 1 from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = 'public.invoices'::regclass
      and c.contype = 'f' and a.attname = 'reservation_id'
  ) into v_var;
  if v_var then
    raise exception 'BASARISIZ: reservation_id uzerinde yabanci anahtar var';
  end if;
end $$;

\echo '=== 9) Denetim kaydi fatura degisikligini yazmali ==='
do $$
declare v_adet integer;
begin
  select count(*) into v_adet from public.audit_log
  where table_name = 'invoices' and record_id = current_setting('test.fatura');
  if v_adet = 0 then
    raise exception 'BASARISIZ: denetim kaydinda fatura yok';
  end if;

  -- Kapsam dogru cozulmeli, yoksa sahibi kendi kaydini goremez.
  select count(*) into v_adet from public.audit_log
  where table_name = 'invoices' and owner_id = current_setting('test.owner')::uuid;
  if v_adet = 0 then
    raise exception 'BASARISIZ: denetim kaydinda owner_id cozulmedi';
  end if;
end $$;

\echo '=== 10) Yedek fonksiyonu faturalari dondurmeli ==='
do $$
declare v_veri jsonb;
begin
  v_veri := public.export_invoice_data(current_setting('test.owner')::uuid);
  if jsonb_array_length(v_veri -> 'faturalar') = 0 then
    raise exception 'BASARISIZ: yedekte fatura yok';
  end if;
  if jsonb_array_length(v_veri -> 'fatura_satirlari') = 0 then
    raise exception 'BASARISIZ: yedekte fatura satiri yok';
  end if;
  if jsonb_array_length(v_veri -> 'fatura_serileri') = 0 then
    raise exception 'BASARISIZ: yedekte fatura serisi yok';
  end if;
end $$;

\echo '=== 11) Yetki kopyalari tarayiciya KAPALI olmali ==='
do $$
declare r record;
begin
  for r in
    select t, has_table_privilege('authenticated', t, 'SELECT') as yetki
    from unnest(array['public.profiles', 'public.businesses']) t
  loop
    if r.yetki then
      raise exception 'BASARISIZ: % tarayiciya acik', r.t;
    end if;
  end loop;
end $$;

\echo '=== TUM TESTLER BASARILI ==='
