/*
  Rezervasyon formunu sözleşmenin gerçek taraflarına göre yeniden kur.

  ÜÇ AYRI KİŞİ VAR, İKİ DEĞİL.

  Bugüne kadar kayıtta iki isim tutuluyordu: `customer_name` ve
  `second_person_name`. Bunlar "çiftin iki yarısı" varsayılıyordu.
  Gerçekte sözleşmeyi imzalayan çoğu zaman üçüncü bir kişi -- gelinin
  babası, damadın amcası, bir şirket yetkilisi. Salon parayı ondan
  alıyor, sözleşmeyi onunla yapıyor; ama düğün damat ve gelinin.

  İki isim tutulduğunda bu üçüncü kişi ya damadın yerine yazılıyor
  (o zaman damadın adı hiç kayda girmiyor) ya da hiç yazılmıyor
  (o zaman sözleşmede imzası olan kişi belirsiz kalıyor). İkisi de
  sonradan telafi edilemiyor: kimin kim olduğu kayıtta yok.

  DÖNÜŞÜM, KOPYA DEĞİL. Mevcut sütunlar SİLİNMİYOR, yeniden
  adlandırılıyor: `second_person_name` zaten çiftin öteki yarısıydı,
  artık adı `bride_name`. Yeni sütun açılıp eskisi bırakılsaydı aynı
  kişi iki yerde durur, biri güncellenip öteki unutulurdu.

  MEMLEKET İL LİSTESİNDEN. Serbest metin bırakılsaydı "Kahramanmaraş",
  "K.maraş" ve "Maraş" üç ayrı memleket sayılırdı; il bazlı bir sayım
  hiç yapılamazdı. Köy/ilçe serbest kalıyor: listesi yok ve olmamalı.

  FİYAT ALANLARI. Kişi başı fiyat, iskonto ve KDV oranı SAKLANIYOR;
  bunlardan hesaplanan kişibaşı toplam ve KDV tutarı SAKLANMIYOR.
  Hesaplanan değer saklansaydı fiyat sonradan düzeltildiğinde üç sayı
  birbirini tutmaz, hangisinin doğru olduğu bilinemezdi.
*/

-- Çiftin öteki yarısı zaten vardı; adı gerçeği söylesin.
alter table public.reservations rename column second_person_name      to bride_name;
alter table public.reservations rename column second_phone            to bride_phone;
alter table public.reservations rename column customer_hometown       to groom_hometown;
alter table public.reservations rename column second_person_hometown  to bride_hometown;

alter table public.reservations
  -- Sözleşme, rezervasyon tarihinden farklı bir gün imzalanıyor.
  add column if not exists contract_date  date,
  -- Sözleşmeyi yapan personel. Kimin sattığı, prim ve sorumluluk için.
  add column if not exists staff_id       uuid references public.profiles (id) on delete set null,
  add column if not exists staff_email    text,
  -- Cebe ulaşılamadığında aranan sabit hat.
  add column if not exists home_phone     text,

  add column if not exists groom_name     text,
  add column if not exists groom_phone    text,
  add column if not exists groom_district text,
  add column if not exists groom_email    text,

  add column if not exists bride_district text,
  add column if not exists bride_email    text,

  /*
    Serbest metin menü. `menu_id` tanımlı paketi gösteriyor; burası
    "paket dışında ne konuşuldu" için. İkisi ayrı: paket fiyatı
    besliyor, not beslemiyor.
  */
  add column if not exists menu_note      text,

  add column if not exists price_per_person numeric(12,2) not null default 0
    check (price_per_person >= 0),
  add column if not exists discount         numeric(12,2) not null default 0
    check (discount >= 0),
  -- İskonto tutar mı yüzde mi? Ekrandaki kutucuğun karşılığı.
  add column if not exists discount_is_percent boolean not null default false,
  /*
    KDV oranı yüzde olarak. 0 geçerli bir orandır (istisna kapsamı),
    bu yüzden "girilmemiş" ile "sıfır" ayrımı yapılmıyor: ikisi de 0.
  */
  add column if not exists vat_rate integer not null default 0
    check (vat_rate between 0 and 100);

comment on column public.reservations.customer_name is
  'Sözleşmeyi imzalayan kişi. Damat ya da gelin olmak zorunda değil.';
comment on column public.reservations.groom_hometown is
  'Damadın memleketi (il). Yaşadığı yer için city/district sütunları var.';
comment on column public.reservations.bride_hometown is
  'Gelinin memleketi (il).';
comment on column public.reservations.price_per_person is
  'Kişi başı fiyat. Kişibaşı toplam bundan hesaplanır, saklanmaz.';
comment on column public.reservations.vat_rate is
  'KDV oranı (yüzde). KDV tutarı bundan hesaplanır, saklanmaz.';
