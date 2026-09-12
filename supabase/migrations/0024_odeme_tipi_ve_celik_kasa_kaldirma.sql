-- =====================================================================
-- Kasayı ödeme tipine göre ayır, çelik kasa defterini kaldır.
--
-- Çelik kasa, paranın FİZİKSEL olarak nerede durduğunu ayrı bir defterde
-- tutuyordu: bir tahsilat elle "kasaya eklendi" işaretleniyordu. Uygulamada
-- bu ikinci bir muhasebe demekti -- her satır iki kez elleniyor, unutulan
-- her işaret kasayı olduğundan farklı gösteriyordu.
--
-- Yerine geçen şey daha basit ve elle bakım istemiyor: para zaten bir
-- ödeme TİPİYLE giriyor (nakit, kart, havale). Kasanın nerede durduğu bu
-- tipten kendiliğinden çıkıyor.
--
-- DİKKAT: bu göç safe_movements tablosunu DÜŞÜRÜR. Çelik kasa hareket
-- geçmişi geri alınamaz biçimde silinir. Uygulamadan önce yedek alın.
--
-- `payments.method` ZATEN vardı ve `payment_method` enum'u da öyle;
-- ikisi de yeniden yaratılmıyor. Eksik olan tek şey gelir/gider
-- satırlarının tipiydi.
-- =====================================================================

-- --------------------------------------------- gelir/gider ödeme tipi
/*
  Kolon NULL kabul ediyor, bilerek. Mevcut satırların tipi BİLİNMİYOR;
  hepsine "Nakit" yazmak uydurma bir veri üretir ve kasa dağılımını
  yanlış gösterirdi. Boş kalanlar ekranda "Belirtilmemiş" olarak
  toplanıyor, sahibi isterse geçmişe dönüp doldurur.
*/
alter table public.cash_flow
  add column if not exists method public.payment_method;

comment on column public.cash_flow.method is
  'Paranın hangi kanaldan girdiği/çıktığı. NULL = eski kayıt, tipi bilinmiyor.';

create index if not exists cash_flow_method_idx
  on public.cash_flow (business_id, method);

-- ------------------------------------------------------- kapora tipi
/*
  Kapora da bir tahsilattır ve kasaya girer, ama rezervasyon satırında
  tek başına duruyordu -- tipi yoktu. Eklenmeseydi kasa dağılımında
  bütün kaporalar "belirtilmemiş" kovasına düşer, dağılım da bu yüzden
  işe yaramazdı: salonların en büyük nakit girişi kaporadır.

  Bu da NULL kabul ediyor; eski kaporaların nasıl alındığı bilinmiyor.
*/
alter table public.reservations
  add column if not exists deposit_method public.payment_method;

comment on column public.reservations.deposit_method is
  'Kaporanın hangi kanaldan alındığı. NULL = eski kayıt, bilinmiyor.';

-- ------------------------------------------------- çelik kasa kaldırma
/*
  Sıra önemli: önce tetikleyici, sonra fonksiyon, sonra tablo, en sonda
  tip. Ters sırada bağımlılık hatası verir.
*/
drop trigger if exists safe_movements_check on public.safe_movements;
drop function if exists public.check_safe_movement();
drop table if exists public.safe_movements;
drop type if exists public.safe_direction;

-- Gelir/gider satırının "çelik kasada mı" bilgisi de anlamsızlaştı.
-- (0015 bu kolonu eklememişti; savunma amaçlı duruyor.)
alter table public.cash_flow drop column if exists in_safe;
