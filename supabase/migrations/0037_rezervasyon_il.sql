-- =====================================================================
-- Rezervasyona il ve ilçe (il bazlı rapor)
--
-- Müşterinin nereli olduğu şimdiye kadar yalnızca serbest metin
-- `address` alanında duruyordu. "Müşterilerim hangi ilden geliyor"
-- sorusu, serbest metni ayrıştırmadan yanıtlanamıyordu; ayrıştırma da
-- "Merkez/Konya" ile "Konya Merkez"i ayrı il sayardı.
--
-- Alanlar İSTEĞE BAĞLI ve eski kayıtlarda BOŞ kalır. Boş kalanı
-- işletmenin iliyle doldurmak, gerçekte başka ilden gelen müşterileri
-- yanlış ile yazmak olurdu; rapor onları "Belirtilmemiş" satırında
-- topluyor.
-- =====================================================================

alter table public.reservations
  add column if not exists city     text not null default '',
  add column if not exists district text not null default '';

comment on column public.reservations.city is
  'Müşterinin ili. Boş = girilmemiş; il bazlı raporda "Belirtilmemiş".';
comment on column public.reservations.district is
  'Müşterinin ilçesi. Boş = girilmemiş.';

create index if not exists reservations_city_idx
  on public.reservations (business_id, city)
  where city <> '';
