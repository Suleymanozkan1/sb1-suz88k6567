-- =====================================================================
-- Salonlar, menü/paket tanımları ve masa oturma düzeni
--
-- Rakip yazılımların ortak eksiğimiz olan üç özelliği:
--   * Bir işletmede birden çok salon ("sınırsız salon tanımlama")
--   * Kişi başı veya sabit fiyatlı menü/paket tanımları
--   * Rezervasyon başına masa oturma planı
-- =====================================================================

-- ------------------------------------------------------------- salonlar
create table if not exists public.halls (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid    not null references public.businesses (id) on delete cascade,
  name        text    not null check (length(btrim(name)) > 0),
  capacity    integer not null default 0 check (capacity >= 0),
  note        text    not null default '',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint halls_name_unique unique (business_id, name)
);
create index if not exists halls_business_idx on public.halls (business_id);

-- Mevcut her işletme için varsayılan bir salon; eski rezervasyonlar buraya bağlanır.
insert into public.halls (business_id, name, capacity)
select b.id, 'Ana Salon', coalesce(b.capacity, 0)
from public.businesses b
where not exists (select 1 from public.halls h where h.business_id = b.id);

-- Yeni açılan her işletme kullanılabilir durumda olmalı: rezervasyon için
-- en az bir salon şarttır, bu yüzden varsayılanı veritabanı oluşturur.
create or replace function public.create_default_hall()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.halls (business_id, name, capacity)
  values (new.id, 'Ana Salon', coalesce(new.capacity, 0))
  on conflict (business_id, name) do nothing;
  return new;
end;
$$;

drop trigger if exists businesses_default_hall on public.businesses;
create trigger businesses_default_hall
  after insert on public.businesses
  for each row execute function public.create_default_hall();

-- --------------------------------------------------------------- menüler
do $$ begin
  create type public.menu_pricing as enum ('kisi_basi', 'sabit');
exception when duplicate_object then null;
end $$;

create table if not exists public.menus (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid    not null references public.businesses (id) on delete cascade,
  name         text    not null check (length(btrim(name)) > 0),
  pricing      public.menu_pricing not null default 'kisi_basi',
  -- Para her yerde kuruş cinsinden tamsayıdır; ondalık aritmetik kuruş kaydırır.
  price_kurus  bigint  not null check (price_kurus >= 0),
  description  text    not null default '',
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  constraint menus_name_unique unique (business_id, name)
);
create index if not exists menus_business_idx on public.menus (business_id);

-- ------------------------------------------------- rezervasyon bağlantıları
alter table public.reservations
  add column if not exists hall_id uuid references public.halls (id) on delete restrict,
  add column if not exists menu_id uuid references public.menus (id) on delete set null;

update public.reservations r
set hall_id = h.id
from public.halls h
where r.hall_id is null and h.business_id = r.business_id;

alter table public.reservations alter column hall_id set not null;

-- Çakışma kuralı artık SALON bazındadır: aynı gün ve seansta farklı
-- salonlara rezervasyon açılabilir, aynı salona açılamaz.
drop index if exists public.reservations_slot_unique;
create unique index if not exists reservations_hall_slot_unique
  on public.reservations (hall_id, date, slot)
  where status <> 'İptal';

-- Salon ve menü, rezervasyonun işletmesiyle aynı kapsamda olmalıdır;
-- aksi hâlde başka bir işletmenin salonuna rezervasyon yazılabilirdi.
create or replace function public.check_reservation_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_only uuid;
  v_count integer;
begin
  -- Salon verilmediyse: işletmenin tek salonu varsa o seçilir. Birden çok
  -- salonda hangisine yazılacağı belirsizdir; tahmin etmek yerine reddedilir.
  if new.hall_id is null then
    select count(*) into v_count from public.halls where business_id = new.business_id;
    select id into v_only from public.halls
      where business_id = new.business_id order by created_at limit 1;

    if v_count = 1 then
      new.hall_id := v_only;
    else
      raise exception 'Rezervasyon için salon seçilmelidir.' using errcode = 'check_violation';
    end if;
  end if;

  if not exists (
    select 1 from public.halls h
    where h.id = new.hall_id and h.business_id = new.business_id
  ) then
    raise exception 'Salon bu işletmeye ait değil.' using errcode = 'check_violation';
  end if;

  if new.menu_id is not null and not exists (
    select 1 from public.menus m
    where m.id = new.menu_id and m.business_id = new.business_id
  ) then
    raise exception 'Menü bu işletmeye ait değil.' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists reservations_scope on public.reservations;
create trigger reservations_scope
  before insert or update of hall_id, menu_id, business_id on public.reservations
  for each row execute function public.check_reservation_scope();

-- ---------------------------------------------------------- masa düzeni
create table if not exists public.seating_tables (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid    not null references public.reservations (id) on delete cascade,
  table_no       integer not null check (table_no > 0),
  seats          integer not null check (seats > 0 and seats <= 50),
  label          text    not null default '',
  created_at     timestamptz not null default now(),
  constraint seating_tables_no_unique unique (reservation_id, table_no)
);
create index if not exists seating_tables_reservation_idx
  on public.seating_tables (reservation_id);

-- ------------------------------------------------------------- güvenlik
alter table public.halls enable row level security;
alter table public.menus enable row level security;
alter table public.seating_tables enable row level security;

drop policy if exists halls_all on public.halls;
create policy halls_all on public.halls for all
  to authenticated using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

drop policy if exists menus_all on public.menus;
create policy menus_all on public.menus for all
  to authenticated using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

-- Masa düzeni, bağlı olduğu rezervasyonun kapsamından türetilir.
-- Kontrol SECURITY DEFINER fonksiyonda yapılır: politika, çağıranın
-- reservations tablosu üzerindeki tablo yetkisine bağlı kalmasın.
create or replace function public.owns_reservation(rid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.reservations r
    where r.id = rid and public.owns_business(r.business_id)
  );
$$;

drop policy if exists seating_tables_all on public.seating_tables;
create policy seating_tables_all on public.seating_tables for all
  to authenticated using (public.owns_reservation(reservation_id))
  with check (public.owns_reservation(reservation_id));

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.halls to authenticated;
grant select, insert, update, delete on public.menus to authenticated;
grant select, insert, update, delete on public.seating_tables to authenticated;

-- ------------------------------------------------------------ denetim izi
drop trigger if exists audit_halls on public.halls;
create trigger audit_halls after insert or update or delete on public.halls
  for each row execute function public.write_audit_log();

drop trigger if exists audit_menus on public.menus;
create trigger audit_menus after insert or update or delete on public.menus
  for each row execute function public.write_audit_log();
