-- =====================================================================
-- Müşteri adayı takibi, ulaşım kanalı ve WhatsApp bağlantısı
--
-- Bugüne kadar "müşteri" diye bir tablo yoktu: Müşteriler ekranı
-- rezervasyonlardan türetilen bir görünümdü. Rezervasyona dönüşmemiş bir
-- kişi sistemde hiç görünmüyordu; Instagram'dan gelip WhatsApp'a yazan
-- müşteri ancak konuşmanın yanındaki emoji ile takip ediliyordu.
--
-- Bu göç üç şey ekliyor:
--
--   1. reservations.source_channel  -- "bize nereden ulaştı", yıl sonu
--      kanal raporunun kaynağı. Rezervasyonun kendi alanı; aday olarak
--      hiç geçmemiş, kapıdan giren müşteri için de doldurulur.
--
--   2. customer_leads               -- müşteri adayı. Durum, sorumlu
--      personel, sonraki takip tarihi ve rezervasyona dönüşüm bağı burada.
--
--   3. customer_lead_messages + customer_lead_status_history
--      -- iletişim geçmişi ve durum değişikliği kaydı. İkisi de silinmez.
--
-- Ayrı bir "takip" ve "atama" tablosu AÇILMADI: takip tarihi ile sorumlu
-- personel birer alan, değişiklikleri zaten geçmişte duruyor. İki tablo
-- daha açmak aynı bilgiyi iki yerde tutmak olurdu.
--
-- KVKK: customer_leads ve customer_lead_messages ad, telefon, e-posta
-- taşır -- kişisel veridir. Mesajın aslı da saklanıyor, çünkü çözümleme
-- yanlış yaptığında doğrusu ancak aslına bakılarak bulunur. Aydınlatma
-- metnine işlendi.
-- =====================================================================

-- ------------------------------------------- rezervasyonun ulaşım kanalı
do $$ begin
  create type public.lead_channel as enum
    ('Instagram', 'Düğün.com', 'Google', 'Referans', 'Diğer');
exception when duplicate_object then null; end $$;

alter table public.reservations
  add column if not exists source_channel public.lead_channel,
  add column if not exists source_detail  text;

-- "Diğer" tek başına bir şey anlatmıyor: raporda "Diğer 23 kayıt" satırı
-- görüp içine bakamamak, alanı hiç tutmamakla aynı kapıya çıkar.
alter table public.reservations
  drop constraint if exists reservations_source_detail_required;
alter table public.reservations
  add constraint reservations_source_detail_required
  check (source_channel is distinct from 'Diğer'
         or (source_detail is not null and btrim(source_detail) <> ''));

comment on column public.reservations.source_channel is
  'Müşteri işletmeye hangi kanaldan ulaştı. Yıl sonu kanal raporunun kaynağı.';

create index if not exists reservations_source_channel_idx
  on public.reservations (business_id, source_channel);

-- --------------------------------------------------- müşteri adayı
do $$ begin
  create type public.lead_source as enum
    ('Instagram', 'WhatsApp', 'Web Sitesi', 'Telefon', 'Manuel', 'Diğer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.lead_status as enum (
    'Aranmadı', 'Arandı', 'Ulaşılamadı', 'Tekrar Aranacak', 'Tekrar Arandı',
    'WhatsApp''tan İletişim Kuruldu', 'İletişim Sağlandı', 'Teklif Gönderildi',
    'Rezervasyona Döndü', 'Olumsuz', 'İptal');
exception when duplicate_object then null; end $$;

create table if not exists public.customer_leads (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses (id) on delete cascade,
  name             text not null default '',
  -- Telefon 10 haneye indirgenmiş durur (5332642537). Aynı kişinin
  -- "+90...", "0...", "..." yazımları tek kayda düşsün diye.
  phone            text not null default '',
  email            text not null default '',
  guest_count      integer check (guest_count is null or guest_count > 0),
  event_date       date,
  -- "Mayısın ilk haftası" gibi gün taşımayan ifadeler tarihe çevrilmiyor;
  -- uydurulan bir gün salonun o gün dolu sanılmasına yol açardı. İfade
  -- olduğu gibi burada duruyor.
  event_date_text  text not null default '',
  organization_type text not null default '',
  source           public.lead_source not null default 'Manuel',
  source_detail    text not null default '',
  status           public.lead_status not null default 'Aranmadı',
  assigned_to      uuid references public.profiles (id) on delete set null,
  next_followup_at date,
  last_contact_at  timestamptz,
  reservation_id   uuid references public.reservations (id) on delete set null,
  note             text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.customer_leads is
  'Müşteri adayı. Rezervasyona dönüşmemiş kişiler de takip edilebilsin diye.';
comment on column public.customer_leads.phone is
  'On haneye indirgenmiş numara. Aynı kişinin iki kayda düşmemesi buna bağlı.';
comment on column public.customer_leads.event_date_text is
  'Çözülemeyen tarih ifadesi ("Mayıs ilk hafta"). Uydurulmuş bir güne yeğdir.';

-- Aynı numaradan ikinci mesaj yeni bir aday AÇMAMALI. Kısıt veritabanında:
-- iki mesaj aynı anda gelirse istemci tarafı bir kontrol yetmezdi.
create unique index if not exists customer_leads_phone_unique
  on public.customer_leads (business_id, phone) where btrim(phone) <> '';

create index if not exists customer_leads_status_idx
  on public.customer_leads (business_id, status);
create index if not exists customer_leads_followup_idx
  on public.customer_leads (business_id, next_followup_at)
  where next_followup_at is not null;
create index if not exists customer_leads_assigned_idx
  on public.customer_leads (business_id, assigned_to);

-- ------------------------------------------------- iletişim geçmişi
do $$ begin
  create type public.lead_message_direction as enum ('gelen', 'giden', 'olay');
exception when duplicate_object then null; end $$;

create table if not exists public.customer_lead_messages (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses (id) on delete cascade,
  lead_id       uuid not null references public.customer_leads (id) on delete cascade,
  direction     public.lead_message_direction not null,
  channel       text not null default 'whatsapp'
                  check (channel in ('whatsapp', 'telefon', 'eposta', 'sistem')),
  body          text not null default '',
  -- Meta'nın mesaj kimliği. Webhook aynı mesajı yeniden gönderebilir
  -- (yanıt gecikirse); aynı mesaj geçmişte iki kez görünmemeli.
  wa_message_id text,
  actor_id      uuid references public.profiles (id) on delete set null,
  actor_email   text not null default '',
  created_at    timestamptz not null default now()
);

comment on table public.customer_lead_messages is
  'Müşteri adayının iletişim geçmişi. Mesajlar ve sistem olayları birlikte; silinmez.';

create unique index if not exists customer_lead_messages_wa_unique
  on public.customer_lead_messages (business_id, wa_message_id)
  where wa_message_id is not null;

create index if not exists customer_lead_messages_lead_idx
  on public.customer_lead_messages (lead_id, created_at);

-- ------------------------------------------- durum değişiklik kaydı
create table if not exists public.customer_lead_status_history (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  lead_id     uuid not null references public.customer_leads (id) on delete cascade,
  from_status public.lead_status,
  to_status   public.lead_status not null,
  actor_id    uuid references public.profiles (id) on delete set null,
  actor_email text not null default '',
  created_at  timestamptz not null default now()
);

comment on table public.customer_lead_status_history is
  'Durum değişiklikleri. Tetikleyici yazar; istemci atlayamaz.';

create index if not exists customer_lead_status_history_lead_idx
  on public.customer_lead_status_history (lead_id, created_at desc);

/** Her yazmada damgayı tazeler. */
create or replace function public.stamp_lead_updated()
returns trigger language plpgsql as $$
begin
  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists customer_leads_stamp on public.customer_leads;
create trigger customer_leads_stamp
  before update on public.customer_leads
  for each row execute function public.stamp_lead_updated();

/**
 * Durum değiştiğinde geçmişe satır yazar.
 *
 * AFTER çalışıyor: geçmiş satırı adayın kendisine yabancı anahtarla bağlı,
 * BEFORE INSERT sırasında aday henüz yazılmamış olurdu.
 *
 * İstemcinin yazmasına bırakılsaydı "kim değiştirdi" sorusu, kaydı yazmayı
 * unutan ya da atlayan her yolda cevapsız kalırdı.
 */
create or replace function public.log_lead_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if TG_OP = 'UPDATE' and NEW.status is not distinct from OLD.status then
    return null;
  end if;

  select email into v_email from public.profiles where id = auth.uid();

  insert into public.customer_lead_status_history
    (business_id, lead_id, from_status, to_status, actor_id, actor_email)
  values (NEW.business_id, NEW.id,
          case when TG_OP = 'INSERT' then null else OLD.status end,
          NEW.status, auth.uid(), coalesce(v_email, ''));

  return null;
end;
$$;

drop trigger if exists customer_leads_status_log on public.customer_leads;
create trigger customer_leads_status_log
  after insert or update on public.customer_leads
  for each row execute function public.log_lead_status_change();

-- ------------------------------------------------- WhatsApp numarası
-- Meta webhook'u işletme kimliğini bilmez; mesajın hangi numaraya geldiğini
-- (phone_number_id) söyler. Eşleme burada durur.
create table if not exists public.whatsapp_accounts (
  phone_number_id text        primary key,
  business_id     uuid        not null references public.businesses (id) on delete cascade,
  display_phone   text        not null default '',
  created_at      timestamptz not null default now()
);

comment on table public.whatsapp_accounts is
  'WhatsApp Business numarası -> işletme eşlemesi. Webhook bu tabloyla işletmeyi bulur.';

-- ------------------------------------------------------------ RLS
alter table public.customer_leads               enable row level security;
alter table public.customer_lead_messages       enable row level security;
alter table public.customer_lead_status_history enable row level security;
alter table public.whatsapp_accounts            enable row level security;

drop policy if exists customer_leads_all on public.customer_leads;
create policy customer_leads_all on public.customer_leads for all
  to authenticated using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

drop policy if exists customer_lead_messages_read on public.customer_lead_messages;
create policy customer_lead_messages_read on public.customer_lead_messages for select
  to authenticated using (public.owns_business(business_id));

drop policy if exists customer_lead_messages_write on public.customer_lead_messages;
create policy customer_lead_messages_write on public.customer_lead_messages for insert
  to authenticated with check (public.owns_business(business_id));

drop policy if exists customer_lead_status_history_read on public.customer_lead_status_history;
create policy customer_lead_status_history_read on public.customer_lead_status_history for select
  to authenticated using (public.owns_business(business_id));

drop policy if exists whatsapp_accounts_all on public.whatsapp_accounts;
create policy whatsapp_accounts_all on public.whatsapp_accounts for all
  to authenticated using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

grant select, insert, update, delete on public.customer_leads to authenticated;
grant select, insert on public.customer_lead_messages to authenticated;
-- Geçmiş düzeltilemez: düzeltilebilen bir geçmiş, geçmiş değildir.
revoke update, delete on public.customer_lead_messages from anon, authenticated;
grant select on public.customer_lead_status_history to authenticated;
revoke insert, update, delete on public.customer_lead_status_history from anon, authenticated;
grant select, insert, update, delete on public.whatsapp_accounts to authenticated;
