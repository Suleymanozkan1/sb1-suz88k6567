-- =====================================================================
-- Hazır mesajlar ve hızlı yanıtlar (madde 14)
--
-- İki ayrı şey, iki ayrı yerde duruyor ve karıştırılmamalı:
--
--   message_templates : MÜŞTERİYE giden, yer tutuculu SMS taslakları.
--                       Her tür için tek tane; hangi olayda gideceği belli.
--   quick_replies     : PERSONELİN yazarken kullandığı kısa metinler.
--                       Sayısı sınırsız, olaya bağlı değil, yer tutucu
--                       gerektirmiyor.
--
-- Hızlı yanıtlar şablon tablosuna sığmıyordu: o tablo tür başına tek
-- satır tutuyor (business_id + key benzersiz) ve "üç ayrı fiyat cümlesi"
-- gibi bir liste oraya yazılamıyordu.
-- =====================================================================

-- Şartnamedeki yeni mesaj türleri. Enum'a değer eklemek geri alınamaz;
-- var olanı yeniden eklemek hata verdiği için tek tek kontrol ediliyor.
do $$ begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                 where t.typname = 'template_key' and e.enumlabel = 'prova') then
    alter type template_key add value 'prova';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                 where t.typname = 'template_key' and e.enumlabel = 'foto_secim') then
    alter type template_key add value 'foto_secim';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                 where t.typname = 'template_key' and e.enumlabel = 'foto_hazir') then
    alter type template_key add value 'foto_hazir';
  end if;
end $$;

-- ------------------------------------------------------- hızlı yanıtlar
create table if not exists public.quick_replies (
  id          uuid        primary key default gen_random_uuid(),
  business_id uuid        not null references public.businesses (id) on delete cascade,
  /*
    Başlık: listede hangi metin olduğunu anlamak için. Metnin ilk
    kelimeleri kullanılsaydı birbirine benzeyen iki yanıt ayırt
    edilemezdi.
  */
  title       text        not null check (btrim(title) <> ''),
  body        text        not null check (length(btrim(body)) between 1 and 900),
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint quick_replies_title_unique unique (business_id, title)
);

comment on table public.quick_replies is
  'Personelin yazarken kullandığı kısa hazır metinler. Şablondan farkı: olaya bağlı değil, sayısı sınırsız.';

create index if not exists quick_replies_business_idx
  on public.quick_replies (business_id, sort_order, title);

drop trigger if exists quick_replies_stamp on public.quick_replies;
create trigger quick_replies_stamp
  before update on public.quick_replies
  for each row execute function public.stamp_lead_updated();

alter table public.quick_replies enable row level security;

drop policy if exists quick_replies_all on public.quick_replies;
create policy quick_replies_all on public.quick_replies for all
  to authenticated using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

grant select, insert, update, delete on public.quick_replies to authenticated;
grant select on public.quick_replies to service_role;

-- =====================================================================
-- Yeni şablon metinleri
--
-- Enum değeri eklendikten SONRA ayrı bir ifade olarak yazılıyor: aynı
-- işlemde eklenip kullanılan bir enum değeri PostgreSQL'de hata verir.
--
-- Metinler GSM-7 alfabesinde (Türkçe harf yok): şartnamedeki mevcut
-- şablonlar da öyle. Tek bir "ç" bütün mesajı Unicode'a düşürüyor ve
-- karakter sınırı 160'tan 70'e iniyor, yani ücret iki katına çıkıyor.
-- =====================================================================
create or replace function public.seed_message_templates(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.message_templates (business_id, key, title, body, kind, category)
  values
    (p_business_id, 'rezervasyon_onay', 'Rezervasyon onayı',
     'Sayin {musteri}, {tarih} {seans} rezervasyonunuz alinmistir. Sorgu kodu: {kod}',
     'Rezervasyon', 'islem'),
    (p_business_id, 'tarih_hatirlatma', 'Tarih hatırlatması',
     'Sayin {musteri}, {tarih} tarihli organizasyonunuz yaklasiyor. {salon}',
     'Hatırlatma', 'islem'),
    (p_business_id, 'odeme_hatirlatma', 'Ödeme hatırlatması',
     'Sayin {musteri}, {tarih} organizasyonunuz icin kalan tutar {kalan} TL',
     'Hatırlatma', 'islem'),
    (p_business_id, 'tahsilat_bildirimi', 'Tahsilat bildirimi',
     'Sayin {musteri}, {odenen} TL odemeniz alinmistir. Kalan {kalan} TL',
     'Bilgilendirme', 'islem'),
    (p_business_id, 'etkinlik_gunu', 'Etkinlik günü',
     'Sayin {musteri}, bugun {seans} seansinda {salon} sizi bekliyor',
     'Hatırlatma', 'islem'),
    -- Madde 14'teki yeni türler.
    (p_business_id, 'prova', 'Prova',
     'Sayin {musteri}, {tarih} organizasyonunuz icin prova randevunuzu belirleyelim. Bizi arayabilirsiniz.',
     'Hatırlatma', 'islem'),
    (p_business_id, 'foto_secim', 'Fotoğraf / video seçimi',
     'Sayin {musteri}, dugun fotograf ve video seciminiz icin bizi bekliyoruz. Uygun gununuzu bildiriniz.',
     'Bilgilendirme', 'islem'),
    (p_business_id, 'foto_hazir', 'Fotoğraflar hazır',
     'Sayin {musteri}, {tarih} organizasyonunuzun fotograf ve videolari hazir. Teslim icin bizi arayiniz.',
     'Bilgilendirme', 'islem'),
    (p_business_id, 'tesekkur', 'Teşekkür',
     'Sayin {musteri}, bizi tercih ettiginiz icin tesekkur ederiz',
     'Bilgilendirme', 'ticari'),
    (p_business_id, 'kampanya', 'Kampanya duyurusu',
     'Sayin {musteri}, sezon fiyatlarimiz icin bizi arayabilirsiniz',
     'Bilgilendirme', 'ticari')
  on conflict (business_id, key) do nothing;

  /*
    Prova, fotoğraf seçimi ve fotoğraf teslimi OTOMATİK KURALA
    BAĞLANMIYOR: üçü de takvime değil bir olaya bağlı (prova randevusu
    alındığında, albüm hazır olduğunda). Tarihe bağlı kendiliğinden
    gönderim, hazır olmayan bir albümü "hazır" diye duyururdu.
  */
  insert into public.reminder_rules (business_id, key, enabled, days_before, send_hour)
  values
    (p_business_id, 'tarih_hatirlatma',  true,  7, 10),
    (p_business_id, 'odeme_hatirlatma',  true,  3, 10),
    (p_business_id, 'etkinlik_gunu',     false, 0,  9),
    (p_business_id, 'tesekkur',          false, -1, 12)
  on conflict (business_id, key) do nothing;
end;
$$;

-- Mevcut işletmelere yeni şablonları ekle (eskiler korunur).
do $$
declare r record;
begin
  for r in select id from public.businesses loop
    perform public.seed_message_templates(r.id);
  end loop;
end $$;

/*
  Şablon tohumlama şimdiye kadar HİÇ TETİKLENMİYORDU: fonksiyon 0011'de
  tanımlanmış ama çağıran yoktu. Kendi sunucusunda açılan yeni bir
  işletme Hatırlatmalar ekranını bomboş görüyordu; tanıtım kipinde
  varsayılanlar koddan geldiği için hata fark edilmemişti.

  Aday durumlarındaki ile aynı desen: işletme açılınca tohumlanıyor.
*/
create or replace function public.message_templates_yeni_isletme()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_message_templates(NEW.id);
  return null;
end;
$$;

drop trigger if exists businesses_message_templates on public.businesses;
create trigger businesses_message_templates
  after insert on public.businesses
  for each row execute function public.message_templates_yeni_isletme();
