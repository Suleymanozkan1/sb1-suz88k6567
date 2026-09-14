-- =====================================================================
-- Ulaşım kanalı ve aday kaynağı seçeneklerini arayüzle hizala
--
-- ARAYÜZ İLE VERİTABANI AYRIŞMIŞTI. Rezervasyon formundaki "Bize Nereden
-- Ulaştınız?" kutusu sekiz seçenek sunuyor (Instagram, Facebook,
-- WhatsApp, Web Sitesi, Google, Tavsiye, Telefon, Diğer) ama
-- `public.lead_channel` enum'ında yalnızca beşi vardı. Facebook,
-- WhatsApp, Web Sitesi, Tavsiye ve Telefon seçilip kaydedildiğinde
-- veritabanı "invalid input value for enum" ile reddediyordu.
--
-- HATA TANITIM KİPİNDE HİÇ GÖRÜNMÜYORDU: orada veriler tarayıcıda
-- tutuluyor ve enum kısıtı yok. Ancak gerçek veritabanına geçildiğinde
-- salon sahibi "Facebook" seçtiği her rezervasyonu kaydedemezdi.
--
-- Aynı ayrışma aday kaynağında da vardı: `public.lead_source` enum'ında
-- Facebook, Google ve Tavsiye yok. Görüşme formu ile rezervasyon formu
-- AYNI soruyu soruyor; iki ekranın farklı seçenek sunması hem raporu
-- böler hem kullanıcıyı şaşırtır.
--
-- ESKİ DEĞERLER DURUYOR. `Düğün.com` ve `Referans` listeden kaldırıldı
-- ama enum'dan ATILMIYOR: o kanalla kaydedilmiş geçmiş rezervasyonlar
-- okunamaz olur ve yıl sonu kanal raporunda sessizce kaybolurlardı.
-- Enum değeri silmek zaten PostgreSQL'de geri alınamaz bir iştir.
--
-- `add value if not exists` kullanılıyor: göç yeniden çalıştırılabilir.
-- =====================================================================

-- ------------------------------------------------- rezervasyon kanalı
alter type public.lead_channel add value if not exists 'Facebook';
alter type public.lead_channel add value if not exists 'WhatsApp';
alter type public.lead_channel add value if not exists 'Web Sitesi';
alter type public.lead_channel add value if not exists 'Tavsiye';
alter type public.lead_channel add value if not exists 'Telefon';

-- --------------------------------------------------- aday kaynağı
alter type public.lead_source add value if not exists 'Facebook';
alter type public.lead_source add value if not exists 'Google';
alter type public.lead_source add value if not exists 'Tavsiye';
