-- =====================================================================
-- Ödeme planı, etkinlik iş emri ve tedarikçiler
--
-- Rakip ürünlerde standart olup bizde bulunmayan üç eksik:
--   * Vade tarihli taksit planı (payment schedule)
--   * Etkinlik günü iş emri / gün planı (BEO — banquet event order)
--   * Tedarikçi defteri ve rezervasyona atama
--
-- Para birimi, ilişkili olduğu payments tablosuyla aynı tipte tutulur
-- (numeric(12,2), TL). Kuruş/TL karışımı sessiz tutar kaymasına yol açar.
-- =====================================================================

-- ------------------------------------------------------- ödeme planı
create table if not exists public.payment_installments (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid          not null references public.reservations (id) on delete cascade,
  seq            integer       not null check (seq > 0),
  due_date       date          not null,
  amount         numeric(12,2) not null check (amount > 0),
  note           text          not null default '',
  created_at     timestamptz   not null default now(),
  constraint payment_installments_seq_unique unique (reservation_id, seq)
);
create index if not exists payment_installments_reservation_idx
  on public.payment_installments (reservation_id, due_date);

-- Taksit toplamı rezervasyon tutarını aşamaz; aşarsa müşteriden fazla
-- para isteniyor demektir ve bu sessizce geçmemelidir.
create or replace function public.check_installment_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total   numeric(12,2);
  v_planned numeric(12,2);
begin
  select total_amount into v_total
  from public.reservations where id = new.reservation_id;

  select coalesce(sum(amount), 0) into v_planned
  from public.payment_installments
  where reservation_id = new.reservation_id and id <> new.id;

  if v_planned + new.amount > v_total then
    raise exception 'Taksit toplamı (%) rezervasyon tutarını (%) aşamaz.',
      v_planned + new.amount, v_total using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists payment_installments_total on public.payment_installments;
create trigger payment_installments_total
  before insert or update on public.payment_installments
  for each row execute function public.check_installment_total();

-- ---------------------------------------------------------- iş emri
create table if not exists public.event_tasks (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid    not null references public.reservations (id) on delete cascade,
  at_time        time    not null,
  title          text    not null check (length(btrim(title)) > 0),
  responsible    text    not null default '',
  done           boolean not null default false,
  created_at     timestamptz not null default now()
);
create index if not exists event_tasks_reservation_idx
  on public.event_tasks (reservation_id, at_time);

-- -------------------------------------------------------- tedarikçiler
create table if not exists public.vendors (
  id          uuid    primary key default gen_random_uuid(),
  business_id uuid    not null references public.businesses (id) on delete cascade,
  name        text    not null check (length(btrim(name)) > 0),
  category    text    not null default '',
  phone       text    not null default '',
  note        text    not null default '',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint vendors_name_unique unique (business_id, name)
);
create index if not exists vendors_business_idx on public.vendors (business_id);

create table if not exists public.reservation_vendors (
  id             uuid          primary key default gen_random_uuid(),
  reservation_id uuid          not null references public.reservations (id) on delete cascade,
  vendor_id      uuid          not null references public.vendors (id) on delete restrict,
  arrive_at      time,
  cost           numeric(12,2) not null default 0 check (cost >= 0),
  note           text          not null default '',
  created_at     timestamptz   not null default now(),
  constraint reservation_vendors_unique unique (reservation_id, vendor_id)
);
create index if not exists reservation_vendors_reservation_idx
  on public.reservation_vendors (reservation_id);

-- Tedarikçi, rezervasyonun işletmesine ait olmalıdır; aksi hâlde başka bir
-- işletmenin tedarikçisi bir organizasyona bağlanabilirdi.
create or replace function public.check_vendor_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.reservations r
    join public.vendors v on v.id = new.vendor_id
    where r.id = new.reservation_id and v.business_id = r.business_id
  ) then
    raise exception 'Tedarikçi bu işletmeye ait değil.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists reservation_vendors_scope on public.reservation_vendors;
create trigger reservation_vendors_scope
  before insert or update on public.reservation_vendors
  for each row execute function public.check_vendor_scope();

-- ------------------------------------------------------------- güvenlik
alter table public.payment_installments enable row level security;
alter table public.event_tasks          enable row level security;
alter table public.vendors              enable row level security;
alter table public.reservation_vendors  enable row level security;

drop policy if exists payment_installments_all on public.payment_installments;
create policy payment_installments_all on public.payment_installments for all
  to authenticated using (public.owns_reservation(reservation_id))
  with check (public.owns_reservation(reservation_id));

drop policy if exists event_tasks_all on public.event_tasks;
create policy event_tasks_all on public.event_tasks for all
  to authenticated using (public.owns_reservation(reservation_id))
  with check (public.owns_reservation(reservation_id));

drop policy if exists vendors_all on public.vendors;
create policy vendors_all on public.vendors for all
  to authenticated using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

drop policy if exists reservation_vendors_all on public.reservation_vendors;
create policy reservation_vendors_all on public.reservation_vendors for all
  to authenticated using (public.owns_reservation(reservation_id))
  with check (public.owns_reservation(reservation_id));

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.payment_installments to authenticated;
grant select, insert, update, delete on public.event_tasks          to authenticated;
grant select, insert, update, delete on public.vendors              to authenticated;
grant select, insert, update, delete on public.reservation_vendors  to authenticated;

-- ------------------------------------------------------------ denetim izi
drop trigger if exists audit_vendors on public.vendors;
create trigger audit_vendors after insert or update or delete on public.vendors
  for each row execute function public.write_audit_log();

drop trigger if exists audit_payment_installments on public.payment_installments;
create trigger audit_payment_installments
  after insert or update or delete on public.payment_installments
  for each row execute function public.write_audit_log();
