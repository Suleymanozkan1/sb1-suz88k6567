-- =====================================================================
-- Düğün Takip — veritabanı şeması
--
-- Tek şirket kullanımı için tasarlanmıştır: bir yönetici (owner) ve ona
-- bağlı personel (staff) hesapları. Yine de tüm tablolarda satır bazlı
-- güvenlik (RLS) açıktır; uygulama katmanında hata yapılsa dahi bir hesap
-- başkasının verisine erişemez.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enum'lar
do $$ begin
  create type user_role as enum ('owner', 'staff');
exception when duplicate_object then null; end $$;

do $$ begin
  create type session_slot as enum ('Gündüz', 'Gece');
exception when duplicate_object then null; end $$;

do $$ begin
  create type reservation_status as enum
    ('Ön Rezervasyon', 'Kesin Rezervasyon', 'Tamamlandı', 'İptal');
exception when duplicate_object then null; end $$;

do $$ begin
  create type cash_flow_kind as enum ('Gelir', 'Gider');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_method as enum
    ('Nakit', 'Kredi Kartı', 'Havale/EFT', 'Çek', 'Senet');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sms_kind as enum
    ('Rezervasyon', 'Doğrulama', 'Hatırlatma', 'Bilgilendirme');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------- profiles
-- auth.users kaydını genişletir. id = auth.users.id
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  company_name  text        not null default '',
  full_name     text        not null default '',
  email         text        not null,
  mobile        text        not null default '',
  role          user_role   not null default 'owner',
  owner_id      uuid        references public.profiles (id) on delete cascade,
  permissions   text[]      not null default array[
                              'rezervasyon.goruntule','rezervasyon.duzenle','rezervasyon.sil',
                              'kasa.goruntule','kasa.duzenle','rapor.goruntule','ayarlar.duzenle'
                            ]::text[],
  city          text        not null default '',
  district      text        not null default '',
  category      text        not null default '',
  capacity      integer     not null default 0 check (capacity >= 0),
  currency      text        not null default 'TL' check (currency in ('TL','EUR','USD','GBP')),
  facebook      text,
  instagram     text,
  active_business_id uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Personel her zaman bir yöneticiye bağlı, yönetici hiçbir zaman bağlı değil
  constraint staff_has_owner check (
    (role = 'staff' and owner_id is not null) or
    (role = 'owner' and owner_id is null)
  )
);

-- ----------------------------------------------------------- businesses
create table if not exists public.businesses (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid        not null references public.profiles (id) on delete cascade,
  name        text        not null check (length(btrim(name)) > 0),
  category    text        not null default '',
  city        text        not null default '',
  district    text        not null default '',
  phone       text        not null default '',
  capacity    integer     not null default 0 check (capacity >= 0),
  currency    text        not null default 'TL' check (currency in ('TL','EUR','USD','GBP')),
  address     text,
  facebook    text,
  instagram   text,
  about       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists businesses_owner_idx on public.businesses (owner_id);

alter table public.profiles
  drop constraint if exists profiles_active_business_fk;
alter table public.profiles
  add constraint profiles_active_business_fk
  foreign key (active_business_id) references public.businesses (id) on delete set null;

-- --------------------------------------------------------- reservations
create table if not exists public.reservations (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid   not null references public.businesses (id) on delete cascade,
  code               text   not null,
  customer_name      text   not null check (length(btrim(customer_name)) > 0),
  customer_phone     text   not null,
  customer_email     text,
  second_person_name text,
  date               date   not null,
  slot               session_slot       not null,
  organization_type  text               not null,
  guest_count        integer            not null check (guest_count > 0),
  total_amount       numeric(12,2)      not null check (total_amount >= 0),
  deposit            numeric(12,2)      not null default 0 check (deposit >= 0),
  currency           text               not null default 'TL',
  status             reservation_status not null default 'Kesin Rezervasyon',
  color_key          text               not null default 'diger',
  note               text,
  address            text,
  services           text[]             not null default '{}',
  created_at         timestamptz        not null default now(),
  updated_at         timestamptz        not null default now(),
  -- Kaparo hiçbir zaman toplam tutarı aşamaz
  constraint deposit_within_total check (deposit <= total_amount),
  constraint reservation_code_unique unique (business_id, code)
);
create index if not exists reservations_business_date_idx
  on public.reservations (business_id, date desc);
create index if not exists reservations_code_idx on public.reservations (code);
create index if not exists reservations_phone_idx on public.reservations (customer_phone);

-- Aynı işletmede aynı tarih + seans için tek aktif rezervasyon
create unique index if not exists reservations_slot_unique
  on public.reservations (business_id, date, slot)
  where status <> 'İptal';

-- -------------------------------------------------------------- payments
create table if not exists public.payments (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid          not null references public.reservations (id) on delete cascade,
  date           date          not null,
  amount         numeric(12,2) not null check (amount > 0),
  method         payment_method not null default 'Nakit',
  note           text,
  created_at     timestamptz   not null default now()
);
create index if not exists payments_reservation_idx on public.payments (reservation_id);

-- ------------------------------------------------------------- cash_flow
create table if not exists public.cash_flow (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid           not null references public.businesses (id) on delete cascade,
  kind           cash_flow_kind not null,
  date           date           not null,
  category       text           not null default '',
  amount         numeric(12,2)  not null check (amount > 0),
  description    text,
  reservation_id uuid           references public.reservations (id) on delete set null,
  created_at     timestamptz    not null default now()
);
create index if not exists cash_flow_business_date_idx
  on public.cash_flow (business_id, date desc);

-- -------------------------------------------------------- color_settings
create table if not exists public.color_settings (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  settings    jsonb       not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

-- --------------------------------------------------------------- sms_log
create table if not exists public.sms_log (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid        not null references public.businesses (id) on delete cascade,
  "to"        text        not null,
  body        text        not null,
  kind        sms_kind    not null default 'Bilgilendirme',
  sent_at     timestamptz not null default now()
);
create index if not exists sms_log_business_idx on public.sms_log (business_id, sent_at desc);

-- ------------------------------------------------------- contact_messages
-- Herkese açık formlardan gelen talepler (iletişim, demo, salon teklif formu)
create table if not exists public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) > 0),
  email      text not null,
  phone      text not null default '',
  message    text not null check (length(btrim(message)) > 0),
  kind       text not null default 'iletisim' check (kind in ('iletisim','demo')),
  created_at timestamptz not null default now()
);

-- =====================================================================
-- Yardımcı fonksiyonlar
-- =====================================================================

-- Oturum açan kullanıcının veri sahibi olan yönetici kimliği.
-- Yönetici ise kendi id'si, personel ise bağlı olduğu yöneticinin id'si.
create or replace function public.owner_scope()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p.owner_id, p.id) from public.profiles p where p.id = auth.uid();
$$;

-- Verilen işletme, oturum açan kullanıcının kapsamında mı?
create or replace function public.owns_business(bid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.businesses b
    where b.id = bid and b.owner_id = public.owner_scope()
  );
$$;

-- updated_at otomatik güncelleme
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['profiles','businesses','reservations'] loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s', t);
    execute format(
      'create trigger touch_%1$s before update on public.%1$s
       for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- Yeni auth.users kaydı geldiğinde profil oluştur
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, company_name, full_name, mobile, city, district, category, capacity, currency)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'company_name', ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'mobile', ''),
    coalesce(new.raw_user_meta_data ->> 'city', ''),
    coalesce(new.raw_user_meta_data ->> 'district', ''),
    coalesce(new.raw_user_meta_data ->> 'category', ''),
    coalesce((new.raw_user_meta_data ->> 'capacity')::int, 0),
    coalesce(new.raw_user_meta_data ->> 'currency', 'TL')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- Satır bazlı güvenlik
-- =====================================================================

alter table public.profiles         enable row level security;
alter table public.businesses       enable row level security;
alter table public.reservations     enable row level security;
alter table public.payments         enable row level security;
alter table public.cash_flow        enable row level security;
alter table public.color_settings   enable row level security;
alter table public.sms_log          enable row level security;
alter table public.contact_messages enable row level security;

-- profiles: kendi kaydını gör; yönetici kendi personelini de görür/yönetir
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or owner_id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid() or owner_id = auth.uid())
  with check (id = auth.uid() or owner_id = auth.uid());

drop policy if exists profiles_insert_staff on public.profiles;
create policy profiles_insert_staff on public.profiles for insert
  with check (id = auth.uid() or owner_id = auth.uid());

drop policy if exists profiles_delete_staff on public.profiles;
create policy profiles_delete_staff on public.profiles for delete
  using (owner_id = auth.uid());

-- businesses: yalnızca kendi kapsamındakiler
drop policy if exists businesses_all on public.businesses;
create policy businesses_all on public.businesses for all
  using (owner_id = public.owner_scope())
  with check (owner_id = public.owner_scope());

-- reservations
drop policy if exists reservations_all on public.reservations;
create policy reservations_all on public.reservations for all
  using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

-- payments: bağlı rezervasyonun işletmesi üzerinden
drop policy if exists payments_all on public.payments;
create policy payments_all on public.payments for all
  using (exists (
    select 1 from public.reservations r
    where r.id = payments.reservation_id and public.owns_business(r.business_id)))
  with check (exists (
    select 1 from public.reservations r
    where r.id = payments.reservation_id and public.owns_business(r.business_id)));

-- cash_flow
drop policy if exists cash_flow_all on public.cash_flow;
create policy cash_flow_all on public.cash_flow for all
  using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

-- color_settings
drop policy if exists color_settings_all on public.color_settings;
create policy color_settings_all on public.color_settings for all
  using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

-- sms_log
drop policy if exists sms_log_all on public.sms_log;
create policy sms_log_all on public.sms_log for all
  using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

-- contact_messages: herkes gönderebilir, yalnızca oturum açmış kullanıcı okur
drop policy if exists contact_messages_insert on public.contact_messages;
create policy contact_messages_insert on public.contact_messages for insert
  to anon, authenticated with check (true);

drop policy if exists contact_messages_select on public.contact_messages;
create policy contact_messages_select on public.contact_messages for select
  to authenticated using (true);

-- Rezervasyon kodu doğrulama, herkese açık ve yalnızca tek kayıt döndürür.
-- Tabloya doğrudan erişim vermemek için fonksiyon üzerinden sunulur.
create or replace function public.verify_reservation_code(p_code text)
returns table (
  code text, customer_name text, customer_phone text, date date,
  slot session_slot, organization_type text, guest_count integer,
  total_amount numeric, status reservation_status, business_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select r.code, r.customer_name,
         -- Telefon numarası maskelenir: 0532 *** ** 67
         regexp_replace(r.customer_phone, '^(\d{3})\d{5}(\d{2})$', '\1*****\2'),
         r.date, r.slot, r.organization_type, r.guest_count,
         r.total_amount, r.status, b.name
  from public.reservations r
  join public.businesses b on b.id = r.business_id
  where upper(r.code) = upper(btrim(p_code))
  limit 1;
$$;

revoke all on function public.verify_reservation_code(text) from public;
grant execute on function public.verify_reservation_code(text) to anon, authenticated;
