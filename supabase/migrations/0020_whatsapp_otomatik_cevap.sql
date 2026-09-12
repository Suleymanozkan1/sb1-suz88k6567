-- ============================================================
-- 0020 - WhatsApp otomatik cevap: karşılama ve mesai dışı bilgilendirmesi
--
-- Kapsam BİLEREK dar: sistem yalnızca "mesajınız alındı" ve "şu saatte
-- döneceğiz" der. Fiyat, tarih ve doluluk sorusuna otomatik cevap
-- vermez; müşteri tarafında salon adına verilmiş bir taahhüt gibi
-- okunur ve dolu bir günü sattırır.
--
-- Ayarlar yeni bir tabloya değil, mevcut whatsapp_accounts satırına
-- yazılıyor: ayar zaten numaraya ait ve numara başına tek satır var.
-- ============================================================

-- ------------------------------------------------------------ ayarlar
alter table public.whatsapp_accounts
  add column if not exists auto_reply_enabled  boolean not null default false,
  add column if not exists welcome_message     text    not null default
    'Mesajınız bize ulaştı. En kısa sürede size döneceğiz.',
  add column if not exists after_hours_enabled boolean not null default false,
  add column if not exists after_hours_message text    not null default
    'Mesajınız bize ulaştı. Şu an çalışma saatlerimiz dışındayız, ilk iş günü size döneceğiz.',
  -- Saatler işletmenin YEREL saatidir (Türkiye, UTC+3; 2016'dan beri yaz
  -- saati uygulaması yok). Sunucu UTC çalıştığı için çevrim kodda yapılır.
  add column if not exists work_start          time    not null default '09:00',
  add column if not exists work_end            time    not null default '19:00',
  -- ISO gün numaraları: 1 pazartesi ... 7 pazar. Salonların cumartesi ve
  -- pazarı en yoğun günleri; varsayılan yedi gün açık.
  add column if not exists work_days           int[]   not null default '{1,2,3,4,5,6,7}';

alter table public.whatsapp_accounts
  drop constraint if exists whatsapp_accounts_work_days_check;
alter table public.whatsapp_accounts
  add constraint whatsapp_accounts_work_days_check
  check (work_days <@ array[1,2,3,4,5,6,7] and array_length(work_days, 1) is not null);

comment on column public.whatsapp_accounts.auto_reply_enabled is
  'Yeni bir müşteri adayı açıldığında karşılama mesajı gönderilsin mi.';
comment on column public.whatsapp_accounts.after_hours_enabled is
  'Çalışma saatleri dışında gelen mesaja bilgilendirme gönderilsin mi.';

-- ------------------------------------------------------------ işaret
-- Otomatik gönderilen mesaj, personelin elle yazdığından ayırt edilebilmeli:
-- "bu müşteriye karşılama gitti mi" sorusunun cevabı buradan okunuyor ve
-- aynı adaya ikinci bir karşılama gönderilmesi böyle engelleniyor.
alter table public.customer_lead_messages
  add column if not exists auto_kind text
    check (auto_kind is null or auto_kind in ('karsilama', 'mesai_disi'));

comment on column public.customer_lead_messages.auto_kind is
  'Dolu ise mesajı program gönderdi. Boş ise personel yazdı.';

create index if not exists customer_lead_messages_auto_idx
  on public.customer_lead_messages (lead_id, auto_kind, created_at)
  where auto_kind is not null;
