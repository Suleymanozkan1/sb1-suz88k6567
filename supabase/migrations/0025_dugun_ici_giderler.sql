-- =====================================================================
-- Düğün içi giderler.
--
-- Bir organizasyonun kendi içinde harcanan paralar: garson, DJ, vale,
-- fotoğrafçı. Bugüne kadar gelir/gider defterine elle "Personel Maaş"
-- gibi genel bir kategoriyle yazılıyordu; hangi düğünün ne kadara mal
-- olduğu hiçbir yerde görünmüyordu.
--
-- Satır rezervasyona bağlı. Böylece "GRANDSAHRA 135 no'lu sözleşmenin
-- giderleri" sorusunun tek bir cevabı oluyor ve düğünün net kazancı
-- hesaplanabiliyor.
--
-- Toplam KOLON DEĞİL, hesaplanıyor: birim x birim fiyat. Ayrı bir kolon
-- olsaydı üç sayı birbirini tutmadığında hangisinin doğru olduğu
-- bilinemezdi.
-- =====================================================================

create table if not exists public.reservation_expenses (
  id             uuid          primary key default gen_random_uuid(),
  business_id    uuid          not null references public.businesses (id) on delete cascade,
  -- Rezervasyon silinince giderleri de düşer: sahipsiz bir gider satırı,
  -- hangi düğüne ait olduğu bilinmeyen bir tutardır.
  reservation_id uuid          not null references public.reservations (id) on delete cascade,
  /*
    Tür serbest metin, sabit liste DEĞİL. Her salonun gider kalemleri
    farklı; sabit liste, listede olmayan her gideri "Diğer" altında
    toplayıp raporu işe yaramaz hâle getirirdi. Ürün ve Hizmet
    tanımlarından seçilebilir ama oraya bağlı zorunlu değil.
  */
  kind           text          not null check (btrim(kind) <> ''),
  unit_count     numeric(10,2) not null default 1 check (unit_count > 0),
  unit_price     numeric(12,2) not null check (unit_price >= 0),
  note           text          not null default '',
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now()
);

comment on table public.reservation_expenses is
  'Bir organizasyonun kendi içinde harcananlar. Toplam = unit_count * unit_price.';

create index if not exists reservation_expenses_reservation_idx
  on public.reservation_expenses (reservation_id);
create index if not exists reservation_expenses_business_idx
  on public.reservation_expenses (business_id, created_at desc);

drop trigger if exists reservation_expenses_stamp on public.reservation_expenses;
create trigger reservation_expenses_stamp
  before update on public.reservation_expenses
  for each row execute function public.stamp_lead_updated();

-- ------------------------------------------------------------ RLS
alter table public.reservation_expenses enable row level security;

drop policy if exists reservation_expenses_all on public.reservation_expenses;
create policy reservation_expenses_all on public.reservation_expenses for all
  to authenticated using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

grant select, insert, update, delete on public.reservation_expenses to authenticated;
grant select on public.reservation_expenses to service_role;
