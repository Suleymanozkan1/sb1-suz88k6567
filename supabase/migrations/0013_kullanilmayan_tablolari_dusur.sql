-- =====================================================================
-- Kullanılmayan tabloları düşür: contact_messages, payment_installments
--
-- İkisinin de arayüzdeki karşılığı kaldırıldı:
--   * Müşteri talepleri ekranı (web paneli, mobil uygulama, sunum)
--   * Vade tarihli taksit planı
-- Tablolar veride yer kaplamaya ve yedeğe girmeye devam ediyordu.
-- contact_messages ayrıca ad, e-posta ve telefon tutuyor: KVKK açısından
-- amacı kalmamış kişisel veriyi saklamak başlı başına bir yükümlülük.
--
-- ---------------------------------------------------------------------
-- BU GÖÇ GERİ ALINAMAZ. Uygulamadan önce yedek alın:
--
--   Panel > Sistem Durumu > "Yedeği indir (JSON)"
--
-- Kayıtları ayrıca saklamak isterseniz, göçten ÖNCE çalıştırın:
--
--   \copy (select * from public.contact_messages)     to 'talepler.csv'  csv header
--   \copy (select * from public.payment_installments) to 'taksitler.csv' csv header
--
-- Denetim kaydı (audit_log) bilerek dokunulmadan bırakılıyor: bu iki
-- tabloya ait geçmiş satırlar "kim neyi ne zaman değiştirdi" sorusunun
-- cevabıdır ve tablo düşse de silinmemelidir. Denetim kaydı ekranı
-- artık var olmayan bir tablonun adını gösterebilir; bu doğru davranıştır.
-- =====================================================================

-- ------------------------------------------------------- ödeme planı
-- Tabloyla birlikte kendi tetikleyicisi, kısıtları ve indeksi de düşer.
-- CASCADE kullanılmıyor: haberdar olmadığımız bir bağımlılık varsa göç
-- sessizce onu da silmek yerine hata versin.
drop table if exists public.payment_installments;

-- Yalnızca yukarıdaki tablonun tetikleyicisi kullanıyordu.
drop function if exists public.check_installment_total();

-- ------------------------------------------------------- talep kutusu
drop table if exists public.contact_messages;

-- Yalnızca contact_messages tetikleyicisi kullanıyordu.
drop function if exists public.stamp_message_handling();

-- Yalnızca contact_messages politikaları kullanıyordu. Genel bir yardımcı
-- gibi duruyor ama başka hiçbir politika ya da fonksiyon çağırmıyor;
-- kullanılmayan SECURITY DEFINER fonksiyon bırakmak gereksiz bir yüzeydir.
drop function if exists public.is_owner();

-- Yalnızca contact_messages.status alanı kullanıyordu.
drop type if exists public.message_status;

-- ------------------------------------------------------- doğrulama
-- Göç yarım uygulanırsa (bir DROP hata alır, sonrakiler çalışır) durum
-- sessiz kalmasın: kalan nesne varsa burada patlar.
do $$
declare
  v_kalan text;
begin
  select string_agg(ad, ', ') into v_kalan from (
    select 'tablo: ' || c.relname as ad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('contact_messages', 'payment_installments')
    union all
    select 'fonksiyon: ' || p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('check_installment_total', 'stamp_message_handling', 'is_owner')
    union all
    select 'tip: ' || t.typname
    from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'message_status'
  ) k;

  if v_kalan is not null then
    raise exception 'Düşürülemeyen nesneler kaldı: %', v_kalan;
  end if;
end $$;
