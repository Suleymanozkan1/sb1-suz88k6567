-- =====================================================================
-- Müşteri adayı durumlarını düzenlenebilir hâle getirir.
--
-- Önce durumlar bir PostgreSQL enum'uydu. Enum'u değiştirmek migration
-- yazmayı gerektiriyor; salon sahibi kendi akışına bir durum ekleyemiyordu.
-- Her salonun takip akışı aynı değil: biri "Yer Gösterildi" ister, biri
-- "Kapora Bekliyor". Durumlar artık işletmeye ait satırlar.
--
-- Değer olarak DEĞİŞMEYEN bir kod (code) tutuluyor, ekranda GÖSTERİLEN
-- ad (label) ayrı. Böylece sahibi "Arandı"yı "Görüşüldü" yapınca binlerce
-- aday satırı yeniden yazılmıyor ve geçmiş bozulmuyor.
--
-- İş kuralları da artık ada değil bayrağa bakıyor:
--   is_initial  yeni aday bu durumla açılır
--   is_closed   iş beklemiyor (takip listelerinden düşer)
--   is_won      rezervasyona döndü sayılır
-- "Rezervasyona Döndü" yazan bir karşılaştırma, sahibi durumu yeniden
-- adlandırdığı anda sessizce yanlış sayardı.
-- =====================================================================

-- ------------------------------------------------------- durum tablosu
create table if not exists public.lead_statuses (
  id          uuid        primary key default gen_random_uuid(),
  business_id uuid        not null references public.businesses (id) on delete cascade,
  -- Kod değişmez: aday satırları ve geçmiş buna bakıyor.
  code        text        not null check (code ~ '^[a-z0-9_]{2,40}$'),
  label       text        not null check (btrim(label) <> ''),
  sort_order  integer     not null default 0,
  -- Ekrandaki renk. Sabit sınıf adı değil, anlam: arayüz karşılığını seçer.
  tone        text        not null default 'notr'
              check (tone in ('bekleyen','ilerleyen','olumlu','teklif','dikkat','kapali','notr')),
  is_initial  boolean     not null default false,
  is_closed   boolean     not null default false,
  is_won      boolean     not null default false,
  -- Kullanımdaki bir durum silinemez; yerine pasife alınır. Eski adaylar
  -- ve geçmiş satırları okunabilir kalsın diye.
  active      boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint lead_statuses_code_unique unique (business_id, code)
);

comment on table public.lead_statuses is
  'İşletmenin müşteri adayı durumları. code değişmez, label düzenlenebilir.';

-- Bir işletmede tek başlangıç ve tek kazanım durumu olur; ikisi de
-- "yeni aday nereye düşer" ve "hangi durum rezervasyon sayılır"
-- sorularının tek cevabı olmalı.
create unique index if not exists lead_statuses_tek_baslangic
  on public.lead_statuses (business_id) where is_initial;
create unique index if not exists lead_statuses_tek_kazanim
  on public.lead_statuses (business_id) where is_won;

create index if not exists lead_statuses_sira_idx
  on public.lead_statuses (business_id, sort_order, label);

drop trigger if exists lead_statuses_stamp on public.lead_statuses;
create trigger lead_statuses_stamp
  before update on public.lead_statuses
  for each row execute function public.stamp_lead_updated();

-- ------------------------------------------------- varsayılan durumlar
/**
 * Yeni işletmeye varsayılan durum akışını kurar.
 *
 * Durumsuz bir işletmede aday hiç açılamaz (status yabancı anahtarlı),
 * o yüzden tohumlama isteğe bağlı değil.
 */
create or replace function public.lead_statuses_tohumla(p_business uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.lead_statuses
    (business_id, code, label, sort_order, tone, is_initial, is_closed, is_won)
  values
    (p_business, 'yeni',                 'Yeni',                 10, 'bekleyen',  true,  false, false),
    (p_business, 'aranacak',             'Aranacak',             20, 'bekleyen',  false, false, false),
    (p_business, 'arandi',               'Arandı',               30, 'ilerleyen', false, false, false),
    (p_business, 'ulasilamadi',          'Ulaşılamadı',          40, 'dikkat',    false, false, false),
    (p_business, 'tekrar_aranacak',      'Tekrar Aranacak',      50, 'bekleyen',  false, false, false),
    (p_business, 'tekrar_arandi',        'Tekrar Arandı',        60, 'ilerleyen', false, false, false),
    (p_business, 'iletisim_kuruldu',     'İletişim Kuruldu',     70, 'olumlu',    false, false, false),
    (p_business, 'teklif_verildi',       'Teklif Verildi',       80, 'teklif',    false, false, false),
    (p_business, 'rezervasyon_bekliyor', 'Rezervasyon Bekliyor', 90, 'teklif',    false, false, false),
    (p_business, 'rezervasyona_dondu',   'Rezervasyona Döndü',  100, 'olumlu',    false, true,  true),
    (p_business, 'olumsuz',              'Olumsuz',             110, 'kapali',    false, true,  false),
    (p_business, 'iptal',                'İptal',               120, 'kapali',    false, true,  false)
  on conflict (business_id, code) do nothing;
$$;

create or replace function public.lead_statuses_yeni_isletme()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.lead_statuses_tohumla(NEW.id);
  return null;
end;
$$;

drop trigger if exists businesses_lead_statuses on public.businesses;
create trigger businesses_lead_statuses
  after insert on public.businesses
  for each row execute function public.lead_statuses_yeni_isletme();

-- Mevcut işletmeler için de kur.
do $$
declare r record;
begin
  for r in select id from public.businesses loop
    perform public.lead_statuses_tohumla(r.id);
  end loop;
end $$;

-- ----------------------------------------------- adaydaki talep alanı
-- Şimdiye kadar müşterinin fiyat/talep cümlesi genel notun içinde
-- kayboluyordu. Personel kartı açtığında müşterinin ne SORDUĞUNU ilk
-- bakışta görmeli.
alter table public.customer_leads
  add column if not exists request_text text not null default '';

comment on column public.customer_leads.request_text is
  'Müşterinin talebi / fiyat sorusu. Serbest metin, çözümleyiciden gelir.';

-- ------------------------------------------- enum -> kod dönüşümü
-- Eski enum değerleri yeni kodlara eşleniyor. "WhatsApp''tan İletişim
-- Kuruldu" ve "İletişim Sağlandı" tek koda iniyor: şartnamedeki akışta
-- ikisinin ayrı durum olmasını gerektiren bir adım yok, ayrıca sahibi
-- isterse paneldan yeni bir durum ekleyebiliyor artık.
-- `strict`: NULL girdiye NULL döner. Bu şart -- geçmişteki ilk kayıt
-- satırının from_status'u NULL'dur ("önceki durum yok" demektir) ve
-- `else` dalına düşseydi her ilk kayıt "yeni -> yeni" görünür, ekranda
-- "İlk kayıt" yerine olmayan bir geçiş yazardı.
create or replace function public.lead_status_kodu(p_eski text)
returns text language sql immutable strict as $$
  select case p_eski
    when 'Aranmadı'                      then 'yeni'
    when 'Arandı'                        then 'arandi'
    when 'Ulaşılamadı'                   then 'ulasilamadi'
    when 'Tekrar Aranacak'               then 'tekrar_aranacak'
    when 'Tekrar Arandı'                 then 'tekrar_arandi'
    when 'WhatsApp''tan İletişim Kuruldu' then 'iletisim_kuruldu'
    when 'İletişim Sağlandı'             then 'iletisim_kuruldu'
    when 'Teklif Gönderildi'             then 'teklif_verildi'
    when 'Rezervasyona Döndü'            then 'rezervasyona_dondu'
    when 'Olumsuz'                       then 'olumsuz'
    when 'İptal'                         then 'iptal'
    else 'yeni'
  end;
$$;

-- Tetikleyici dönüşüm sırasında susmalı: aşağıdaki alter'lar durum
-- kolonunu yeniden yazıyor, her satır için sahte bir "durum değişti"
-- kaydı düşmesi geçmişi çöple doldururdu.
alter table public.customer_leads disable trigger customer_leads_status_log;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customer_leads'
      and column_name = 'status' and udt_name = 'lead_status'
  ) then
    alter table public.customer_leads alter column status drop default;
    alter table public.customer_leads
      alter column status type text using public.lead_status_kodu(status::text);
    alter table public.customer_leads alter column status set default 'yeni';

    alter table public.customer_lead_status_history
      alter column from_status type text using public.lead_status_kodu(from_status::text),
      alter column to_status   type text using public.lead_status_kodu(to_status::text);

    drop type if exists public.lead_status;
  end if;
end $$;

alter table public.customer_leads enable trigger customer_leads_status_log;

-- Durum, o işletmenin tanımlı durumlarından biri olmalı. Serbest metin
-- bırakılsaydı yazım hatası yeni bir durum icat eder, listeler ikiye
-- bölünürdü.
alter table public.customer_leads
  drop constraint if exists customer_leads_status_fk;
alter table public.customer_leads
  add constraint customer_leads_status_fk
  foreign key (business_id, status)
  references public.lead_statuses (business_id, code)
  on update cascade on delete restrict;

-- Geçmişte YABANCI ANAHTAR YOK, bilerek: silinen bir durumun geçmişteki
-- izi de silinseydi "bu müşteri neden kaybedildi" sorusu cevapsız kalırdı.
comment on column public.customer_lead_status_history.to_status is
  'Durum kodu. Yabancı anahtar yok: durum silinse de geçmiş okunabilir kalmalı.';

-- --------------------------------------------- başlangıç durumu silinemez
/**
 * Başlangıç durumunu silmeyi engeller.
 *
 * Silinirse yeni aday açılamaz hâle gelir: kolonun varsayılanı ve
 * webhook'un kullandığı durum odur.
 *
 * Ama yalnızca DOĞRUDAN silmede. İşletmenin kendisi silindiğinde
 * durumları da cascade ile düşüyor; koruma orada da çalışsaydı hiçbir
 * işletme silinemezdi -- durumu silinemeyen bir işletme, silinemeyen bir
 * işletmedir. Ayrım üst satırın hâlâ görünüp görünmediğinden anlaşılıyor:
 * cascade sırasında işletme satırı çoktan gitmiş oluyor.
 */
create or replace function public.lead_status_silme_kontrol()
returns trigger
language plpgsql as $$
begin
  if OLD.is_initial
     and exists (select 1 from public.businesses where id = OLD.business_id) then
    raise exception 'Başlangıç durumu silinemez. Önce başka bir durumu başlangıç yapın.'
      using errcode = 'DT002';
  end if;
  return OLD;
end;
$$;

drop trigger if exists lead_statuses_silme on public.lead_statuses;
create trigger lead_statuses_silme
  before delete on public.lead_statuses
  for each row execute function public.lead_status_silme_kontrol();

-- ------------------------------------------------------------ RLS
alter table public.lead_statuses enable row level security;

drop policy if exists lead_statuses_all on public.lead_statuses;
create policy lead_statuses_all on public.lead_statuses for all
  to authenticated using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

grant select, insert, update, delete on public.lead_statuses to authenticated;
grant execute on function public.lead_statuses_tohumla(uuid) to authenticated;

-- ==================================================== service_role yetkileri
/*
  `service_role` BYPASSRLS taşıyor ama TABLO YETKİSİ taşımıyordu; ikisi
  ayrı şey. BYPASSRLS yalnızca satır güvenliğini atlar, `grant select`
  yerine geçmez. Sonuç: sunucunun PostgREST üzerinden yaptığı her düz
  tablo okuması/yazması çıplak PostgreSQL'de "permission denied for
  table ..." veriyordu.

  Supabase'de görünmüyordu, çünkü orada service_role'a bu yetkiler
  kurulumla birlikte geliyor. 0021 aynı boşluğu `authenticated` için
  kapatmıştı; `service_role` gözden kaçmış.

  Yetki, sunucunun gerçekten dokunduğu tablolarla sınırlı. Toplu bir
  "grant all on all tables" yazılmıyor: sunucunun silmesi gereken hiçbir
  şey yok ve gereksiz bir delete yetkisi, ele geçen bir JWT_SECRET'in
  zararını büyütürdü.
*/
grant select, insert, update on
  public.customer_leads, public.sms_log, public.sms_consents,
  public.backup_runs
  to service_role;

-- Geçmiş yalnızca yazılır, düzeltilmez: kural service_role için de geçerli.
grant select, insert on public.customer_lead_messages to service_role;

-- Yalnızca okunanlar.
grant select on
  public.profiles, public.reservations, public.invoice_lines,
  public.whatsapp_accounts, public.lead_statuses, public.businesses
  to service_role;

-- Fatura durumu güncelleniyor (gönderildi/hata), satırları değil.
grant select, update on public.invoices to service_role;

-- Kuyruk: sıradaki mesaj alınır, sonucu yazılır.
grant select, update on public.sms_queue to service_role;

-- Diziler: insert yapan tablolar sıra numarası üretebilmeli.
do $$
declare r record;
begin
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'S'
  loop
    execute format('grant usage, select on sequence public.%I to service_role', r.relname);
  end loop;
end $$;
