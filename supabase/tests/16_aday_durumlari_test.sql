-- =====================================================================
-- Düzenlenebilir müşteri adayı durumları testi (0023)
--
-- Sınanan davranışlar:
--   1. Tablo, indeksler ve kısıtlar kuruldu mu?
--   2. Yeni işletmeye 12 varsayılan durum tohumlanıyor mu?
--   3. Tanımsız bir durum kodu yazılabiliyor mu? (yazılmamalı)
--   4. Başlangıç durumu silinebiliyor mu? (silinmemeli)
--   5. Kullanımdaki durum silinebiliyor mu? (silinmemeli)
--   6. Kullanılmayan durum silinebiliyor mu? (silinmeli)
--   7. İki başlangıç / iki kazanım durumu olabiliyor mu? (olmamalı)
--   8. Durum ADI değişince aday satırları bozuluyor mu? (bozulmamalı)
--   9. Yeni durum eklenip kullanılabiliyor mu?
--  10. Geçmiş, durum silinse bile okunabilir kalıyor mu?
--  11. service_role tablolara erişebiliyor mu?
--
-- Sekizinci madde bu göçün asıl sebebi: kod ile ad ayrılmasaydı bir
-- salonun "Arandı"yı "Görüşüldü" yapması binlerce aday satırını yeniden
-- yazmak demekti. Onuncu madde de öyle: geçmişte yabancı anahtar YOK,
-- çünkü silinen bir durumun geçmişteki izi de silinseydi "bu müşteri
-- neden kaybedildi" sorusu cevapsız kalırdı.
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off

\echo '=== 0) Test verisi ==='
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_biz   uuid;
begin
  insert into auth.users (id, email) values (v_owner, 'durum-test@ornek.com');
  insert into public.businesses (owner_id, name) values (v_owner, 'Durum Test Salonu')
    returning id into v_biz;

  perform set_config('test.biz', v_biz::text, false);
end $$;

\echo '=== 1) Sema KURULMUS olmali ==='
select
  to_regclass('public.lead_statuses') is not null as durum_tablosu,
  -- Enum KALDIRILMIS olmali: iki kaynak bir arada dursaydi hangisinin
  -- gecerli oldugu belirsiz kalirdi.
  to_regtype('public.lead_status')    is null     as enum_kaldirildi;

do $$ begin
  if to_regclass('public.lead_statuses') is null then
    raise exception 'BASARISIZ: lead_statuses tablosu yok';
  end if;
  if to_regtype('public.lead_status') is not null then
    raise exception 'BASARISIZ: lead_status enum''u hala duruyor';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'customer_leads_status_fk' and contype = 'f'
  ) then
    raise exception 'BASARISIZ: durum yabanci anahtari yok';
  end if;
end $$;

\echo '=== 2) Yeni isletmeye varsayilan durumlar tohumlanmali ==='
do $$
declare v_adet integer;
begin
  select count(*) into v_adet from public.lead_statuses
  where business_id = current_setting('test.biz')::uuid;
  if v_adet <> 12 then
    raise exception 'BASARISIZ: 12 varsayilan durum bekleniyordu, % var', v_adet;
  end if;

  if not exists (
    select 1 from public.lead_statuses
    where business_id = current_setting('test.biz')::uuid
      and code = 'yeni' and is_initial
  ) then
    raise exception 'BASARISIZ: baslangic durumu isaretlenmemis';
  end if;

  if not exists (
    select 1 from public.lead_statuses
    where business_id = current_setting('test.biz')::uuid
      and code = 'rezervasyona_dondu' and is_won and is_closed
  ) then
    raise exception 'BASARISIZ: kazanim durumu isaretlenmemis';
  end if;
end $$;

\echo '=== 3) Tanimsiz durum kodu REDDEDILMELI ==='
do $$
declare v_hata boolean := false;
begin
  begin
    insert into public.customer_leads (business_id, name, phone, status)
    values (current_setting('test.biz')::uuid, 'Uydurma', '5330000001', 'uydurma_durum');
  exception when foreign_key_violation then
    v_hata := true;
  end;

  if not v_hata then
    raise exception 'BASARISIZ: tanimsiz durum kodu kabul edildi';
  end if;
end $$;

\echo '=== 4) Baslangic durumu SILINEMEMELI ==='
do $$
declare v_hata boolean := false;
begin
  begin
    delete from public.lead_statuses
    where business_id = current_setting('test.biz')::uuid and code = 'yeni';
  exception when others then
    v_hata := true;
  end;

  if not v_hata then
    raise exception 'BASARISIZ: baslangic durumu silindi';
  end if;
end $$;

\echo '=== 5) Kullanimdaki durum SILINEMEMELI ==='
do $$
declare
  v_lead uuid;
  v_hata boolean := false;
begin
  insert into public.customer_leads (business_id, name, phone, status)
  values (current_setting('test.biz')::uuid, 'Omer Ay', '5332642537', 'arandi')
  returning id into v_lead;
  perform set_config('test.lead', v_lead::text, false);

  begin
    delete from public.lead_statuses
    where business_id = current_setting('test.biz')::uuid and code = 'arandi';
  exception when foreign_key_violation then
    v_hata := true;
  end;

  if not v_hata then
    raise exception 'BASARISIZ: kullanimdaki durum silindi';
  end if;
end $$;

\echo '=== 6) Kullanilmayan durum SILINEBILMELI ==='
do $$
declare v_adet integer;
begin
  delete from public.lead_statuses
  where business_id = current_setting('test.biz')::uuid and code = 'iptal';

  select count(*) into v_adet from public.lead_statuses
  where business_id = current_setting('test.biz')::uuid and code = 'iptal';
  if v_adet <> 0 then
    raise exception 'BASARISIZ: kullanilmayan durum silinemedi';
  end if;
end $$;

\echo '=== 7) Iki baslangic / iki kazanim durumu OLMAMALI ==='
do $$
declare v_hata boolean := false;
begin
  begin
    update public.lead_statuses set is_initial = true
    where business_id = current_setting('test.biz')::uuid and code = 'arandi';
  exception when unique_violation then
    v_hata := true;
  end;
  if not v_hata then
    raise exception 'BASARISIZ: ikinci baslangic durumu kabul edildi';
  end if;

  v_hata := false;
  begin
    update public.lead_statuses set is_won = true
    where business_id = current_setting('test.biz')::uuid and code = 'olumsuz';
  exception when unique_violation then
    v_hata := true;
  end;
  if not v_hata then
    raise exception 'BASARISIZ: ikinci kazanim durumu kabul edildi';
  end if;
end $$;

\echo '=== 8) Durum ADI degisince aday satiri BOZULMAMALI ==='
do $$
declare v_durum text;
begin
  update public.lead_statuses set label = 'Gorusuldu'
  where business_id = current_setting('test.biz')::uuid and code = 'arandi';

  select status into v_durum from public.customer_leads
  where id = current_setting('test.lead')::uuid;

  -- Aday KODU tasiyor; ad degisse de satir ayni kaliyor.
  if v_durum <> 'arandi' then
    raise exception 'BASARISIZ: ad degisince aday durumu degisti (%)', v_durum;
  end if;
end $$;

\echo '=== 9) Yeni durum eklenip KULLANILABILMELI ==='
do $$
declare v_durum text;
begin
  insert into public.lead_statuses
    (business_id, code, label, sort_order, tone)
  values
    (current_setting('test.biz')::uuid, 'yer_gosterildi', 'Yer Gosterildi', 55, 'ilerleyen');

  update public.customer_leads set status = 'yer_gosterildi'
  where id = current_setting('test.lead')::uuid;

  select status into v_durum from public.customer_leads
  where id = current_setting('test.lead')::uuid;
  if v_durum <> 'yer_gosterildi' then
    raise exception 'BASARISIZ: yeni durum kullanilamadi';
  end if;
end $$;

\echo '=== 10) Gecmis, durum silinse bile OKUNABILIR kalmali ==='
do $$
declare
  v_adet   integer;
  v_bulunan integer;
begin
  select count(*) into v_adet from public.customer_lead_status_history
  where lead_id = current_setting('test.lead')::uuid;
  if v_adet < 2 then
    raise exception 'BASARISIZ: durum gecmisi yazilmamis (% satir)', v_adet;
  end if;

  -- Adayi bu durumdan cikarip durumu siliyoruz.
  update public.customer_leads set status = 'yeni'
  where id = current_setting('test.lead')::uuid;
  delete from public.lead_statuses
  where business_id = current_setting('test.biz')::uuid and code = 'yer_gosterildi';

  -- Gecmiste o duruma ait satir HALA durmali: yabanci anahtar yok.
  select count(*) into v_bulunan from public.customer_lead_status_history
  where lead_id = current_setting('test.lead')::uuid
    and to_status = 'yer_gosterildi';
  if v_bulunan = 0 then
    raise exception 'BASARISIZ: durum silininde gecmis satiri da silindi';
  end if;
end $$;

\echo '=== 11) Yetkiler ==='
select
  has_table_privilege('authenticated', 'public.lead_statuses', 'SELECT') as kullanici_okur,
  has_table_privilege('authenticated', 'public.lead_statuses', 'UPDATE') as kullanici_yazar,
  -- service_role BYPASSRLS tasir ama tablo yetkisi AYRI bir sey; bu
  -- eksik oldugunda sunucunun butun duz tablo erisimleri
  -- "permission denied" verir ve webhook hic calismaz.
  has_table_privilege('service_role', 'public.customer_leads', 'INSERT') as sunucu_yazar,
  has_table_privilege('service_role', 'public.lead_statuses', 'SELECT')  as sunucu_durum_okur;

do $$ begin
  if not has_table_privilege('authenticated', 'public.lead_statuses', 'UPDATE') then
    raise exception 'BASARISIZ: kullanici durumlari duzenleyemiyor';
  end if;
  if not has_table_privilege('service_role', 'public.customer_leads', 'INSERT') then
    raise exception 'BASARISIZ: service_role aday yazamiyor';
  end if;
  if not has_table_privilege('service_role', 'public.lead_statuses', 'SELECT') then
    raise exception 'BASARISIZ: service_role durumlari okuyamiyor';
  end if;
  -- Gecmis service_role icin de duzeltilemez olmali.
  if has_table_privilege('service_role', 'public.customer_lead_messages', 'DELETE') then
    raise exception 'BASARISIZ: service_role iletisim gecmisini silebiliyor';
  end if;
end $$;

\echo '=== TEMIZLIK ==='
do $$ begin
  delete from public.businesses where id = current_setting('test.biz')::uuid;
  delete from auth.users where email = 'durum-test@ornek.com';
end $$;

\echo '=== 16_aday_durumlari_test: TUM KONTROLLER GECTI ==='
