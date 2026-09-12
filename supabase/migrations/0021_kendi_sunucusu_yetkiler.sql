-- ============================================================
-- 0021 - Kendi sunucusunda çalıştırma: tablo yetkileri
--
-- Kimlik katmanı 0000'da kuruldu; burada yalnızca yetkiler var.
-- Ayrı dosya olmasının sebebi sıra: yetki, tablo açıldıktan sonra
-- verilebilir, bu yüzden bütün göçlerin ARDINDAN çalışmalı.
-- ============================================================

-- ------------------------------------------------------------ tablo yetkileri
/*
  Supabase, `public` şemasında açılan tablolara `anon` ve `authenticated`
  yetkilerini KENDİLİĞİNDEN veriyordu. Çıplak PostgreSQL vermiyor.

  Bu yüzden 0001-0018 arasında açılan 15 tablonun hiçbirinde grant satırı
  yok: Supabase'de çalıştıkları için eksiklik hiç görünmedi. Kendi
  sunucusunda `businesses`, `reservations`, `payments` ve `profiles`
  dahil çekirdek tabloların tamamı "permission denied" verirdi -- yani
  sistem açılmazdı bile.

  Yetkiler politikaların niyetine birebir uyduruluyor: politikası `all`
  olan tabloya tam yetki, `select` olana salt okuma. Toplu bir
  "grant all on all tables" YAZILMIYOR; 0019'un iletişim geçmişini
  düzeltilemez kılan `revoke update, delete` satırını geri alır ve
  silinemez olması gereken geçmiş silinebilir hale gelirdi.

  Satır düzeyindeki ayıklamayı yine RLS yapıyor; grant yalnızca kapıyı
  açar, hangi satırın görüneceğine politika karar verir.
*/
grant select, insert, update, delete on
  public.businesses, public.reservations, public.payments, public.cash_flow,
  public.profiles, public.color_settings, public.invoice_lines,
  public.sms_consents, public.sms_log
  to authenticated;

-- Fatura SILINEMEZ: vergi belgesidir, yanlissa iptal edilir, yok edilmez.
-- 0005 bu yuzden `revoke delete` yaziyor; buraya `delete` eklenseydi o
-- karar sessizce geri alinirdi.
grant select, insert, update on public.invoices to authenticated;

-- Politikası yalnızca `select` olanlar: kayıtları program yazar, kullanıcı okur.
-- Denetim kaydına yazma yetkisi verilseydi, denetim kaydı delil olmaktan çıkardı.
grant select on
  public.audit_log, public.backup_runs, public.invoice_series,
  public.sms_consent_history, public.sms_queue
  to authenticated;

/*
  Giriş denemeleri ve hız sınırı sayaçları tarayıcıya KAPALI kalır.
  İkisinde de RLS açık ve politika yok, yani yetki verilse bile satır
  dönmezdi; yetkinin hiç verilmemesi ikinci bir bariyer: ileride
  yanlışlıkla izin veren bir politika eklenirse grant yokluğu tutar.
*/
revoke all on public.login_attempts, public.rate_limits from anon, authenticated;

-- Dizileri kullanan tablolar için (varsa) sıra numarası üretme yetkisi.
do $$
declare r record;
begin
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'S'
  loop
    execute format('grant usage, select on sequence public.%I to authenticated', r.relname);
  end loop;
end $$;
