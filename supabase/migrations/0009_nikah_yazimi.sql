-- =====================================================================
-- 0009, "Nikah" yazımının "Nikâh" olarak düzeltilmesi
--
-- TDK yazımı "nikâh" olduğu için arayüzdeki tüm etiketler düzeltildi.
-- Bu değer yalnızca ekranda görünmüyor; rezervasyonun organizasyon türü,
-- hizmet listesi ve işletme kategorisi olarak veritabanında da saklanıyor.
-- Kod tarafı yeni yazıma geçtiği için mevcut satırların da taşınması
-- gerekir; aksi hâlde eski kayıtlar tür filtresine ve renk eşleşmesine
-- takılmaz.
--
-- Göç yalnızca metin düzeltmesi yapar: hiçbir satır silinmez, eklenmez,
-- tutar veya tarih değişmez. Birden çok kez çalıştırılabilir.
-- =====================================================================

begin;

-- Denetim tetikleyicileri bu toplu düzeltme için susturulur. Aksi hâlde
-- her satır için "kullanıcısı belli olmayan" bir değişiklik kaydı yazılır
-- ve Denetim Kaydı ekranı yanıltıcı hâle gelir. Göçün kendisi kayıttır.
alter table public.reservations disable trigger audit_reservations;
alter table public.profiles     disable trigger audit_profiles;
alter table public.businesses   disable trigger audit_businesses;

-- ------------------------------------------------- organizasyon türü
update public.reservations
   set organization_type = 'Nikâh'
 where organization_type = 'Nikah';

-- ------------------------------------------------------ hizmet listesi
-- services text[] olduğu için her öge ayrı ayrı değiştirilir.
update public.reservations
   set services = array_replace(
                    array_replace(services, 'Nikah Masası', 'Nikâh Masası'),
                    'Nikah Şekeri', 'Nikâh Şekeri')
 where services && array['Nikah Masası', 'Nikah Şekeri'];

-- -------------------------------------------------- işletme kategorisi
-- 'Belediye Nikah Salonu' ve 'Nikah Şekeri' kategorileri etkilenir.
update public.profiles
   set category = replace(category, 'Nikah', 'Nikâh')
 where category like '%Nikah%';

update public.businesses
   set category = replace(category, 'Nikah', 'Nikâh')
 where category like '%Nikah%';

alter table public.reservations enable trigger audit_reservations;
alter table public.profiles     enable trigger audit_profiles;
alter table public.businesses   enable trigger audit_businesses;

-- ------------------------------------------------------- renk ayarları
-- settings jsonb: [{ key, label, color }]. Renk eşleşmesi ASCII "nikah"
-- anahtarı üzerinden yapıldığı için yalnızca görünen etiket düzeltilir;
-- anahtar değişmediğinden kayıtlı renkler korunur.
update public.color_settings
   set settings = replace(settings::text, '"label": "Nikah"', '"label": "Nikâh"')::jsonb
 where settings::text like '%"label": "Nikah"%';

-- jsonb anahtar sırası ve boşluk kullanımı sürüme göre değişebildiği için
-- boşluksuz biçim de ayrıca karşılanır.
update public.color_settings
   set settings = replace(settings::text, '"label":"Nikah"', '"label":"Nikâh"')::jsonb
 where settings::text like '%"label":"Nikah"%';

commit;

-- =====================================================================
-- Doğrulama, göçten sonra çalıştırın, sekiz sütun da 0 dönmelidir.
-- =====================================================================
-- select
--   (select count(*) from public.reservations where organization_type = 'Nikah')      as kalan_tur,
--   (select count(*) from public.reservations where services && array['Nikah Masası','Nikah Şekeri']) as kalan_hizmet,
--   (select count(*) from public.profiles     where category like '%Nikah%')          as kalan_profil,
--   (select count(*) from public.businesses   where category like '%Nikah%')          as kalan_isletme,
--   (select count(*) from public.color_settings where settings::text like '%"Nikah"%') as kalan_renk,
--   (select count(*) from public.reservations where organization_type = 'Nikâh')      as yeni_tur,
--   (select count(*) from public.profiles     where category like '%Nikâh%')          as yeni_profil,
--   (select count(*) from public.businesses   where category like '%Nikâh%')          as yeni_isletme;
