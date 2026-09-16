/*
  Bir rezervasyona birden fazla menü / paket bağlanabilsin.

  NEDEN. Sözleşmeye çoğu zaman tek bir menü girmiyor: kına için ayrı,
  düğün için ayrı bir paket anlaşılıyor; üstüne "Kokteyl Menü" gibi bir
  ek satın alınıyor. Tek sütun olduğu için bunlardan yalnızca biri
  kayda giriyor, gerisi not alanına yazılıyordu -- yani fiyat
  önerisine, rapora ve sözleşmeye hiç yansımıyordu.

  DÖNÜŞÜM, YENİ ALAN DEĞİL. `menu_id` silinip yerine `menu_ids`
  geliyor ve mevcut değerler tek elemanlı diziye taşınıyor. İkisi
  birlikte bırakılsaydı hangisinin doğru olduğu -- özellikle biri
  güncellenip öteki unutulduğunda -- bilinemezdi.

  DİZİ, BAĞLANTI TABLOSU DEĞİL. `services` alanı da aynı biçimde
  `text[]`: menü seçiminin sırası ve tekrarı önemli değil, üzerinde
  sorgu yapılmıyor, yalnızca okunup gösteriliyor. Bağlantı tablosu
  aynı işi iki tablo ve bir birleştirmeyle yapardı.
*/

alter table public.reservations
  add column if not exists menu_ids text[] not null default '{}'::text[];

-- Mevcut tek menüler diziye taşınıyor; boş olanlar boş dizi kalıyor.
update public.reservations
   set menu_ids = array[menu_id::text]
 where menu_id is not null
   and menu_ids = '{}'::text[];

alter table public.reservations drop column if exists menu_id;

comment on column public.reservations.menu_ids is
  'Sözleşmeye dahil menü/paket kimlikleri. Tutar önerisi hepsinin toplamı.';
