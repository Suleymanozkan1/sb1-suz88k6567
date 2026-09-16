/*
  Rezervasyon taraflarının memleketi.

  NEDEN. Salon, düğünün hangi memleketten geldiğini biliyor -- masa
  düzeni, karşılama, ikram ve müzik seçimi buna göre değişiyor. Bugüne
  kadar bu bilgi `note` alanına serbest metin olarak yazılıyordu:
  aranamıyor, raporlanamıyor, sözleşmeye basılamıyordu.

  İKİ AYRI SÜTUN. Damat ve gelin çoğu zaman farklı memleketten geliyor;
  tek alanda "Konya / Kayseri" diye tutulsaydı hangisinin kime ait
  olduğu kaybolur, il bazlı bir sayım da yapılamazdı.

  `city` / `district` İLE KARIŞTIRILMAMALI. Onlar müşterinin ŞU AN
  yaşadığı yer ve il bazlı rapor oradan besleniyor. Memleket nereli
  olduğu; İstanbul'da oturan bir Sivaslı için ikisi farklı.

  Serbest metin ve boş geçilebilir: eski kayıtların hepsi boş kalacak ve
  bu bir eksiklik değil, o bilgi hiç sorulmamıştı.
*/

alter table public.reservations
  add column if not exists customer_hometown      text,
  add column if not exists second_person_hometown text;

comment on column public.reservations.customer_hometown is
  'Birinci tarafın (düğünde damat) memleketi. Yaşadığı yer değil.';
comment on column public.reservations.second_person_hometown is
  'İkinci tarafın (düğünde gelin) memleketi. Yaşadığı yer değil.';
