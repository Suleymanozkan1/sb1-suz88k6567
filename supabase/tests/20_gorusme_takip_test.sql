-- =====================================================================
-- Görüşme alanları, otomatik takip ve dönüşüm raporu testi (0028)
--
-- Sınanan davranışlar:
--   1. Alanlar kuruldu mu, teklif durumlarına 7 gün tohumlandı mı?
--   2. Teklif durumuna geçince takip tarihi kuruluyor mu?
--   3. Elle girilmiş gelecek tarihin üzerine yazılıyor mu? (yazılmamalı)
--   4. Geçmişte kalmış tarih yenileniyor mu?
--   5. Takip günü sıfır olan durumda tarih kuruluyor mu? (kurulmamalı)
--   6. Durum değişmeyen güncelleme tarihi bozuyor mu? (bozmamalı)
--   7. Dönüşüm raporu görüşme ile kaydı ayırıyor mu?
--   8. Teklif sayımı RAKAMA mı bakıyor?
--   9. Salon silinince aday satırı düşüyor mu? (düşmemeli)
--
-- Üçüncü madde önemli: personel elle bir gün belirlediyse onu silmek,
-- üzerinde anlaşılmış bir randevuyu iptal etmek olurdu.
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
  insert into auth.users (id, email) values (v_owner, 'gorusme-test@ornek.com');
  insert into public.businesses (owner_id, name) values (v_owner, 'Gorusme Test Salonu')
    returning id into v_biz;
  insert into public.halls (business_id, name, capacity) values (v_biz, 'Kristal', 400)
    returning id into v_hall;

  perform set_config('test.biz', v_biz::text, false);
  perform set_config('test.hall', v_hall::text, false);
end $$;

\echo '=== 1) Sema ve tohumlama ==='
select
  (select count(*) from information_schema.columns
   where table_schema = 'public' and table_name = 'customer_leads'
     and column_name in ('hall_id','offer_amount','offer_valid_until','option_date','meeting_date')
  ) as yeni_kolon,
  (select count(*) from public.lead_statuses
   where business_id = current_setting('test.biz')::uuid and followup_days = 7) as teklif_kurali;

do $$
declare v_adet integer;
begin
  select count(*) into v_adet from information_schema.columns
  where table_schema = 'public' and table_name = 'customer_leads'
    and column_name in ('hall_id','offer_amount','offer_valid_until','option_date','meeting_date');
  if v_adet <> 5 then
    raise exception 'BASARISIZ: % yeni kolon var, 5 olmaliydi', v_adet;
  end if;

  -- Teklif tonundaki iki varsayilan durum 7 gun tasimali (madde 18).
  select count(*) into v_adet from public.lead_statuses
  where business_id = current_setting('test.biz')::uuid and tone = 'teklif' and followup_days = 7;
  if v_adet < 1 then
    raise exception 'BASARISIZ: teklif durumlarina takip gunu tohumlanmadi';
  end if;
end $$;

\echo '=== 2) Teklif durumunda takip tarihi KURULMALI ==='
do $$
declare
  v_biz  uuid := current_setting('test.biz')::uuid;
  v_id   uuid;
  v_gun  date;
begin
  insert into public.customer_leads (business_id, name, phone, status)
  values (v_biz, 'Teklif Testi', '5330000011', 'yeni')
  returning id into v_id;
  perform set_config('test.lead', v_id::text, false);

  -- Yeni durumda takip gunu yok: tarih bos kalmali.
  select next_followup_at into v_gun from public.customer_leads where id = v_id;
  if v_gun is not null then
    raise exception 'BASARISIZ: takip gunu olmayan durumda tarih kuruldu (%)', v_gun;
  end if;

  update public.customer_leads set status = 'teklif_verildi' where id = v_id;

  select next_followup_at into v_gun from public.customer_leads where id = v_id;
  if v_gun <> current_date + 7 then
    raise exception 'BASARISIZ: takip tarihi % (beklenen %)', v_gun, current_date + 7;
  end if;
end $$;

\echo '=== 3) Elle girilmis GELECEK tarihin uzerine YAZILMAMALI ==='
do $$
declare
  v_biz uuid := current_setting('test.biz')::uuid;
  v_id  uuid;
  v_gun date;
begin
  insert into public.customer_leads (business_id, name, phone, status, next_followup_at)
  values (v_biz, 'Elle Randevu', '5330000012', 'yeni', current_date + 30)
  returning id into v_id;

  update public.customer_leads set status = 'teklif_verildi' where id = v_id;

  select next_followup_at into v_gun from public.customer_leads where id = v_id;
  -- Uzerinde anlasilmis bir randevuyu iptal etmek olurdu.
  if v_gun <> current_date + 30 then
    raise exception 'BASARISIZ: elle girilen randevu ezildi (%)', v_gun;
  end if;
end $$;

\echo '=== 4) Gecmiste kalmis tarih YENILENMELI ==='
do $$
declare
  v_biz uuid := current_setting('test.biz')::uuid;
  v_id  uuid;
  v_gun date;
begin
  insert into public.customer_leads (business_id, name, phone, status, next_followup_at)
  values (v_biz, 'Eski Randevu', '5330000013', 'yeni', current_date - 10)
  returning id into v_id;

  update public.customer_leads set status = 'teklif_verildi' where id = v_id;

  select next_followup_at into v_gun from public.customer_leads where id = v_id;
  if v_gun <> current_date + 7 then
    raise exception 'BASARISIZ: gecmis tarih yenilenmedi (%)', v_gun;
  end if;
end $$;

\echo '=== 5) Durum degismeyen guncelleme tarihi BOZMAMALI ==='
do $$
declare
  v_id  uuid := current_setting('test.lead')::uuid;
  v_once date;
  v_sonra date;
begin
  select next_followup_at into v_once from public.customer_leads where id = v_id;
  update public.customer_leads set note = 'not guncellendi' where id = v_id;
  select next_followup_at into v_sonra from public.customer_leads where id = v_id;
  if v_once is distinct from v_sonra then
    raise exception 'BASARISIZ: durum degismeden tarih degisti (% -> %)', v_once, v_sonra;
  end if;
end $$;

\echo '=== 6) Donusum raporu: gorusme ile kayit AYRI sayilmali ==='
do $$
declare
  v_biz  uuid := current_setting('test.biz')::uuid;
  v_rapor record;
begin
  -- Iki kayit: biri yuz yuze gorusulmus, biri yalnizca telefonla acilmis.
  insert into public.customer_leads (business_id, name, phone, status, meeting_date, offer_amount)
  values (v_biz, 'Gelen Musteri', '5330000014', 'yeni', current_date, 150000);
  insert into public.customer_leads (business_id, name, phone, status)
  values (v_biz, 'Telefon Musterisi', '5330000015', 'yeni');

  select * into v_rapor from public.gorusme_raporu(v_biz)
  where ay = to_char(current_date, 'YYYY-MM');

  if v_rapor.gelen < 1 then
    raise exception 'BASARISIZ: salona gelen sayilmadi';
  end if;
  if v_rapor.kayit <= v_rapor.gelen then
    raise exception 'BASARISIZ: kayit (%) ile gelen (%) ayrismadi', v_rapor.kayit, v_rapor.gelen;
  end if;
  -- Teklif sayimi RAKAMA bakiyor: fiyat konusulmamis gorusme teklif degil.
  if v_rapor.teklif <> 1 then
    raise exception 'BASARISIZ: teklif sayisi % (beklenen 1)', v_rapor.teklif;
  end if;
end $$;

\echo '=== 7) Salon silinince aday satiri DUSMEMELI ==='
do $$
declare
  v_biz  uuid := current_setting('test.biz')::uuid;
  v_hall uuid := current_setting('test.hall')::uuid;
  v_id   uuid;
  v_kalan integer;
begin
  insert into public.customer_leads (business_id, name, phone, status, hall_id)
  values (v_biz, 'Salonlu Aday', '5330000016', 'yeni', v_hall)
  returning id into v_id;

  delete from public.halls where id = v_hall;

  -- Aday duruyor, yalnizca salon bagi kopuyor: musteri kaydinin silinmesi
  -- salon silmenin yan etkisi olamaz.
  select count(*) into v_kalan from public.customer_leads where id = v_id;
  if v_kalan <> 1 then
    raise exception 'BASARISIZ: salon silininde aday da silindi';
  end if;
  if (select hall_id from public.customer_leads where id = v_id) is not null then
    raise exception 'BASARISIZ: silinen salonun kimligi adayda kaldi';
  end if;
end $$;

\echo '=== TEMIZLIK ==='
do $$ begin
  delete from public.businesses where id = current_setting('test.biz')::uuid;
  delete from auth.users where email = 'gorusme-test@ornek.com';
end $$;

\echo '=== 20_gorusme_takip_test: TUM KONTROLLER GECTI ==='
