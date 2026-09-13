-- =====================================================================
-- Yetkilerin TÜM alanlara genişletilmesi
--
-- Şimdiye kadar yedi yetki vardı ve panelin çoğu ekranı hiçbirine bağlı
-- değildi: müşteriler, ürün-hizmet, müşteri adayları, hatırlatmalar, SMS
-- kayıtları ve İYS izinleri aynı sahibe bağlı HER personele açıktı.
-- Artık her alanın kendi yetkisi var; görüntüleme ile düzenleme ayrı.
--
-- MEVCUT KULLANICILAR YETKİ KAYBETMEZ. Aşağıdaki güncelleme, her
-- personele bugün fiilen yapabildiği işin karşılığını veriyor:
--   * yetkiye bağlı olmayan ekranlar herkese açıktı -> herkese verildi
--   * 'ayarlar.duzenle' panelin yönetim tarafının tamamıydı -> parçalandı
--   * 'kasa.*' fatura ekranlarını da açıyordu -> 'fatura.*' eklendi
--
-- Aynı eşleme istemci tarafında da var (`yetkileriTasi`, src/types):
-- göçü uygulamamış bir kurulumda da kimse dışarıda kalmasın.
--
-- Göç TEKRAR ÇALIŞTIRILABİLİR: yeni anahtarlardan biri zaten varsa kayıt
-- göç görmüş sayılır ve dokunulmaz.
-- =====================================================================

-- --------------------------------------------------------------------
-- 1) Mevcut personel kayıtlarının yetkilerini çevir
--
-- Taşınıp taşınmadığı SÜRÜM SÜTUNUNDAN anlaşılıyor, listenin içeriğine
-- bakılmıyor: "içinde yeni anahtar var mı" sezgisi, yöneticinin bilerek
-- yalnızca 'kasa.goruntule' verdiği yeni bir kaydı da eski sanıp dokuz
-- yetki daha eklerdi.
-- --------------------------------------------------------------------
alter table public.profiles
  add column if not exists permissions_version smallint not null default 0;

comment on column public.profiles.permissions_version is
  'permissions dizisinin şema sürümü. 0 = 0036 öncesi, 1 = bugünkü liste.';
update public.profiles p
set permissions = (
  select array(
    select distinct y from unnest(
      p.permissions
      -- Eskiden hiçbir yetkiye bağlı olmayan ekranlar
      || array['musteri.goruntule','musteri.duzenle',
               'aday.goruntule','aday.duzenle',
               'stok.goruntule','stok.duzenle',
               'tanim.goruntule',
               'mesaj.goruntule','mesaj.duzenle']::text[]
      -- Sözleşme/makbuz yazdırma rezervasyonu görenin yapabildiği işti
      || case when 'rezervasyon.goruntule' = any (p.permissions)
              then array['rezervasyon.sozlesme']::text[] else '{}'::text[] end
      -- Fatura ekranları kasa yetkisine bağlıydı
      || case when 'kasa.goruntule' = any (p.permissions)
              then array['fatura.goruntule']::text[] else '{}'::text[] end
      || case when 'kasa.duzenle' = any (p.permissions)
              then array['fatura.duzenle']::text[] else '{}'::text[] end
      -- Rapor çıktısı raporu görenin yapabildiği işti
      || case when 'rapor.goruntule' = any (p.permissions)
              then array['rapor.disaAktar']::text[] else '{}'::text[] end
      -- 'ayarlar.duzenle' yönetim tarafının tamamıydı
      || case when 'ayarlar.duzenle' = any (p.permissions)
              then array['tanim.duzenle','denetim.goruntule','sistem.yonet']::text[]
              else '{}'::text[] end
    ) as y
  )
)
where p.owner_id is not null
  and p.permissions_version = 0;

-- İşletme sahiplerinde yetki listesi zaten okunmuyor (has_permission
-- sahipte her zaman true döner) ama tutarlı dursun: tam liste yazılıyor.
update public.profiles
set permissions = array[
  'rezervasyon.goruntule','rezervasyon.duzenle','rezervasyon.sil','rezervasyon.sozlesme',
  'musteri.goruntule','musteri.duzenle','aday.goruntule','aday.duzenle',
  'kasa.goruntule','kasa.duzenle','fatura.goruntule','fatura.duzenle',
  'stok.goruntule','stok.duzenle',
  'rapor.goruntule','rapor.disaAktar',
  'tanim.goruntule','tanim.duzenle',
  'mesaj.goruntule','mesaj.duzenle',
  'kullanici.goruntule','kullanici.duzenle','ayarlar.duzenle',
  'denetim.goruntule','sistem.yonet'
]::text[]
where owner_id is null;

-- Taşınan kayıtlar damgalanıyor: göç yeniden çalıştırılırsa yetki
-- listesini ikinci kez genişletmesin.
update public.profiles set permissions_version = 1 where permissions_version = 0;

-- Yeni personel kaydının varsayılanı: yalnızca görüntüleme.
-- Eskiden varsayılan TAM YETKİYDİ; elle daraltılmadıkça yeni açılan
-- her hesap kasayı da silmeyi de yapabiliyordu.
alter table public.profiles
  alter column permissions set default array[
    'rezervasyon.goruntule','musteri.goruntule','tanim.goruntule'
  ]::text[];

alter table public.profiles alter column permissions_version set default 1;

-- --------------------------------------------------------------------
-- 2) Yeni yetkilerin RLS karşılıkları
--
-- 0032 finansal tabloları kapatmıştı. Kalan tablolar aynı desende
-- kapatılıyor: okuma ve yazma ayrı yetkiye bağlı, işletme sahibi her
-- zaman yetkili (has_permission sahipte true döner).
-- --------------------------------------------------------------------

/**
 * Bir tabloyu "görüntüle / düzenle" yetkisi çiftine bağlar.
 *
 * Politika metni her tablo için elle yazılsaydı yirmi tabloda yirmi kez
 * aynı hatayı yapma şansı olurdu. Tablo yoksa sessizce atlanıyor:
 * kurulumların hepsinde her tablo bulunmuyor.
 */
create or replace function public.yetki_politikasi(
  p_tablo text, p_oku text, p_yaz text
) returns void language plpgsql as $$
begin
  if to_regclass('public.' || p_tablo) is null then return; end if;

  execute format('drop policy if exists %I on public.%I', p_tablo || '_all', p_tablo);
  execute format('drop policy if exists %I on public.%I', p_tablo || '_yetki_select', p_tablo);
  execute format('drop policy if exists %I on public.%I', p_tablo || '_yetki_write', p_tablo);

  execute format(
    'create policy %I on public.%I for select to authenticated
       using (public.has_permission(%L) and public.owns_business(business_id))',
    p_tablo || '_yetki_select', p_tablo, p_oku);

  execute format(
    'create policy %I on public.%I for all to authenticated
       using (public.has_permission(%L) and public.owns_business(business_id))
       with check (public.has_permission(%L) and public.owns_business(business_id))',
    p_tablo || '_yetki_write', p_tablo, p_yaz, p_yaz);
end $$;

select public.yetki_politikasi('customer_leads', 'aday.goruntule', 'aday.duzenle');
select public.yetki_politikasi('lead_statuses', 'aday.goruntule', 'aday.duzenle');
select public.yetki_politikasi('whatsapp_accounts', 'aday.goruntule', 'aday.duzenle');

select public.yetki_politikasi('halls', 'tanim.goruntule', 'tanim.duzenle');
select public.yetki_politikasi('menus', 'tanim.goruntule', 'tanim.duzenle');
select public.yetki_politikasi('color_settings', 'tanim.goruntule', 'tanim.duzenle');

select public.yetki_politikasi('vendors', 'stok.goruntule', 'stok.duzenle');

select public.yetki_politikasi('message_templates', 'mesaj.goruntule', 'mesaj.duzenle');
select public.yetki_politikasi('reminder_rules', 'mesaj.goruntule', 'mesaj.duzenle');
select public.yetki_politikasi('quick_replies', 'mesaj.goruntule', 'mesaj.duzenle');
select public.yetki_politikasi('sms_consents', 'mesaj.goruntule', 'mesaj.duzenle');

select public.yetki_politikasi('invoices', 'fatura.goruntule', 'fatura.duzenle');
select public.yetki_politikasi('invoice_series', 'fatura.goruntule', 'fatura.duzenle');

drop function public.yetki_politikasi(text, text, text);

-- --------------------------------------------------------------------
-- Kalıba uymayan üç tablo
-- --------------------------------------------------------------------

/*
  special_days: business_id NULL olan satırlar PAYLAŞILAN günler (resmî
  tatil, bayram, kandil). Genel kalıp `owns_business(null)` üzerinden
  false döndürüp bayramların tamamını takvimden silerdi.
*/
drop policy if exists special_days_select on public.special_days;
create policy special_days_select on public.special_days for select
  to authenticated using (
    public.has_permission('tanim.goruntule')
    and (business_id is null or public.owns_business(business_id)));

drop policy if exists special_days_write on public.special_days;
create policy special_days_write on public.special_days for all
  to authenticated using (
    business_id is not null
    and public.has_permission('tanim.duzenle') and public.owns_business(business_id))
  with check (
    business_id is not null
    and public.has_permission('tanim.duzenle') and public.owns_business(business_id));

/*
  reservation_vendors'da business_id yok; kapsam rezervasyon üzerinden
  kuruluyor (`owns_reservation`).
*/
drop policy if exists reservation_vendors_all on public.reservation_vendors;
/*
  Yeni politikalar da önce DÜŞÜRÜLÜYOR. Kurulum belgesi göçleri bir
  döngüyle uyguluyor ve operatörün döngüyü yeniden çalıştırması olağan;
  düşürülmeseydi ikinci koşu "policy already exists" ile durur ve
  yükseltme yarıda kalırdı.
*/
drop policy if exists reservation_vendors_select on public.reservation_vendors;
drop policy if exists reservation_vendors_write on public.reservation_vendors;
create policy reservation_vendors_select on public.reservation_vendors for select
  to authenticated using (
    public.has_permission('stok.goruntule') and public.owns_reservation(reservation_id));
create policy reservation_vendors_write on public.reservation_vendors for all
  to authenticated using (
    public.has_permission('stok.duzenle') and public.owns_reservation(reservation_id))
  with check (
    public.has_permission('stok.duzenle') and public.owns_reservation(reservation_id));

-- --------------------------------------------------------------------
-- 3) Yalnızca okunan kayıt defterleri
--
-- SMS kayıtları, hatırlatma günlüğü ve denetim kaydı personel tarafından
-- YAZILMAZ; yazan taraf zamanlanmış görevler (service_role, RLS'i atlar).
-- Burada sadece okuma yetkisi bağlanıyor.
-- --------------------------------------------------------------------
do $$
begin
  if to_regclass('public.sms_log') is not null then
    drop policy if exists sms_log_all on public.sms_log;
    drop policy if exists sms_log_select on public.sms_log;
    create policy sms_log_select on public.sms_log for select to authenticated
      using (public.has_permission('mesaj.goruntule') and public.owns_business(business_id));
  end if;

  if to_regclass('public.reminder_log') is not null then
    drop policy if exists reminder_log_all on public.reminder_log;
    drop policy if exists reminder_log_select on public.reminder_log;
    create policy reminder_log_select on public.reminder_log for select to authenticated
      using (public.has_permission('mesaj.goruntule') and public.owns_business(business_id));
  end if;

  /*
    audit_log işletmeye değil SAHİBE bağlı (owner_scope): kaydın kendisi
    hesap düzeyinde tutuluyor, işletme kolonu yok.
  */
  if to_regclass('public.audit_log') is not null then
    drop policy if exists audit_log_select on public.audit_log;
    create policy audit_log_select on public.audit_log for select to authenticated
      using (public.has_permission('denetim.goruntule') and owner_id = public.owner_scope());
  end if;
end $$;

comment on column public.profiles.permissions is
  'Panel yetkileri (0036). Anahtarlar src/types/index.ts ALL_PERMISSIONS ile aynı.';
