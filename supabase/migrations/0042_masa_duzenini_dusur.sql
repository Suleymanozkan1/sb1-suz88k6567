-- =====================================================================
-- Masa oturma düzenini düşür: seating_tables
--
-- Arayüzdeki karşılığı kaldırıldı: panel ekranı, mobil bölüm, depo
-- yöntemleri, sorgu kancaları, tipler ve tanıtım verisi söküldü. Tablo
-- veride yer kaplamaya ve gecelik yedeğe girmeye devam ediyordu.
--
-- ---------------------------------------------------------------------
-- BU GÖÇ GERİ ALINAMAZ. Uygulamadan önce yedek alın:
--
--   Panel > Sistem Durumu > "Yedeği indir (JSON)"
--
-- Masa planlarını ayrıca saklamak isterseniz, göçten ÖNCE çalıştırın:
--
--   \copy (select * from public.seating_tables) to 'masa-duzeni.csv' csv header
--
-- ---------------------------------------------------------------------
-- NE DÜŞMÜYOR ve neden
--
--   public.owns_reservation()  -- DOKUNULMUYOR.
--     0013 göçünde `is_owner` düşürülmüştü çünkü onu YALNIZCA düşen
--     tablonun politikası çağırıyordu. Burada durum tersi; şu üç politika
--     da bu fonksiyona bağlı:
--
--       event_tasks_all             (event_tasks, 0008)
--       reservation_vendors_select  (reservation_vendors, 0036)
--       reservation_vendors_write   (reservation_vendors, 0036)
--
--     Düşürülseydi iş emri ve tedarikçi tablolarının RLS politikaları
--     çalışamaz, salon sahibi kendi kayıtlarını göremezdi.
--
--   public.audit_log            -- DOKUNULMUYOR.
--     Masa düzenine ait geçmiş satırlar "kim neyi ne zaman değiştirdi"
--     sorusunun cevabıdır; tablo düştü diye silinmemeli. Denetim ekranı
--     artık var olmayan bir tablonun adını gösterebilir, bu doğrudur.
--
--   public.reservations         -- DOKUNULMUYOR.
--     Bağ tek yönlü: seating_tables -> reservations. Rezervasyon tarafında
--     masa düzenine bakan hiçbir alan, kısıt ya da tetikleyici yok.
-- =====================================================================

-- ----------------------------------------------------------- masa düzeni
-- Tabloyla birlikte kendi indeksi (seating_tables_reservation_idx),
-- benzersizlik kısıtı (seating_tables_no_unique) ve RLS politikası
-- (seating_tables_all) da düşer; ayrıca yazılmalarına gerek yok.
--
-- CASCADE KULLANILMIYOR. Haberdar olmadığımız bir bağımlılık (bir görünüm,
-- bir yabancı anahtar) varsa göç onu sessizce silmek yerine hata versin.
-- 0013'te de aynı tercih yapılmıştı.
drop table if exists public.seating_tables;

-- ------------------------------------------------------------ doğrulama
-- Göç yarım uygulanırsa durum sessiz kalmasın.
--
-- İki yön de sınanıyor: düşmesi gereken düştü mü, düşmemesi gereken
-- duruyor mu. İkincisi asıl risk -- bir CASCADE kazası fark edilmeden
-- rezervasyonları ya da iş emirlerini de alıp götürebilirdi.
do $$
declare
  v_kalan  text;
  v_eksik  text;
begin
  if to_regclass('public.seating_tables') is not null then
    raise exception 'BASARISIZ: seating_tables hala duruyor';
  end if;

  -- Politika tabloyla birlikte düşmüş olmalı.
  select string_agg(polname, ', ') into v_kalan
  from pg_policy
  where polname = 'seating_tables_all';

  if v_kalan is not null then
    raise exception 'BASARISIZ: politika hala duruyor: %', v_kalan;
  end if;

  -- owns_reservation ve ona bağlı tablolar YERİNDE olmalı.
  if to_regproc('public.owns_reservation') is null then
    raise exception 'BASARISIZ: owns_reservation dusurulmus; dort tablonun RLS politikasi bozulur';
  end if;

  select string_agg(ad, ', ') into v_eksik
  from unnest(array[
    'reservations', 'payments', 'event_tasks', 'vendors',
    'reservation_vendors', 'reservation_expenses',
    'halls', 'menus', 'audit_log'
  ]) as ad
  where to_regclass('public.' || ad) is null;

  if v_eksik is not null then
    raise exception 'BASARISIZ: kullanilan tablo(lar) silinmis: %', v_eksik;
  end if;
end $$;
