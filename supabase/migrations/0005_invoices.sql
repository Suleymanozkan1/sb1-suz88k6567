-- =====================================================================
-- e-Arşiv Fatura
--
-- Düğün salonu müşterilerinin çoğu e-Fatura mükellefi olmayan bireylerdir;
-- onlara e-ARŞİV FATURA düzenlenir. Alıcı e-Fatura mükellefiyse e-Fatura
-- düzenlenmelidir (alici_tipi alanı bunu ayırt eder).
--
-- Tutarlar KURUŞ cinsinden tamsayı saklanır. Ondalıklı tip kullanmak fatura
-- toplamlarında kuruş sapmasına yol açar; vergi belgesinde kabul edilemez.
--
-- NOT: Zorunluluk hadleri ve KDV oranları değişebilir. Kendi durumunuzu
-- mali müşavirinizle teyit ediniz.
-- =====================================================================

do $$ begin
  create type invoice_kind as enum ('e-Arsiv', 'e-Fatura');
exception when duplicate_object then null; end $$;

do $$ begin
  create type invoice_status as enum
    ('taslak', 'gonderiliyor', 'gonderildi', 'onaylandi', 'reddedildi', 'iptal');
exception when duplicate_object then null; end $$;

do $$ begin
  create type buyer_kind as enum ('bireysel', 'kurumsal');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------ seriler
-- Fatura numarası boşluksuz ve sıralı olmalıdır; sıra numarası burada
-- atomik olarak üretilir.
create table if not exists public.invoice_series (
  business_id uuid    not null references public.businesses (id) on delete cascade,
  prefix      text    not null check (prefix ~ '^[A-Z0-9]{3}$'),
  year        integer not null check (year between 2000 and 2999),
  last_number integer not null default 0 check (last_number >= 0),
  primary key (business_id, prefix, year)
);

-- ----------------------------------------------------------- faturalar
create table if not exists public.invoices (
  id              uuid           primary key default gen_random_uuid(),
  business_id     uuid           not null references public.businesses (id) on delete restrict,
  reservation_id  uuid           references public.reservations (id) on delete set null,

  -- Belge bilgileri
  invoice_number  text           not null check (invoice_number ~ '^[A-Z0-9]{3}\d{13}$'),
  uuid_ettn       uuid           not null default gen_random_uuid(),
  kind            invoice_kind   not null default 'e-Arsiv',
  status          invoice_status not null default 'taslak',
  issue_date      date           not null default current_date,
  service_date    date,

  -- Alıcı
  buyer_kind      buyer_kind     not null default 'bireysel',
  buyer_name      text           not null check (length(btrim(buyer_name)) > 0),
  buyer_tax_id    text,
  buyer_tax_office text,
  buyer_address   text,
  buyer_city      text,
  buyer_district  text,
  buyer_email     text,
  buyer_phone     text,

  -- Tutarlar (kuruş)
  gross_kurus     bigint         not null default 0 check (gross_kurus >= 0),
  discount_kurus  bigint         not null default 0 check (discount_kurus >= 0),
  base_kurus      bigint         not null default 0 check (base_kurus >= 0),
  vat_kurus       bigint         not null default 0 check (vat_kurus >= 0),
  total_kurus     bigint         not null default 0 check (total_kurus >= 0),
  currency        text           not null default 'TRY',

  -- Entegratör
  provider_ref    text,
  provider_error  text,
  sent_at         timestamptz,
  cancelled_at    timestamptz,
  cancel_reason   text,

  note            text,
  created_by      uuid           references public.profiles (id) on delete set null,
  created_at      timestamptz    not null default now(),
  updated_at      timestamptz    not null default now(),

  -- Fatura numarası işletme içinde benzersiz olmalıdır
  constraint invoices_number_unique unique (business_id, invoice_number),
  -- Toplam tutarlar kendi içinde tutarlı olmalı
  constraint invoices_totals_consistent
    check (base_kurus = gross_kurus - discount_kurus
           and total_kurus = base_kurus + vat_kurus),
  -- Kurumsal alıcıda vergi kimlik numarası zorunludur
  constraint invoices_corporate_needs_tax_id
    check (buyer_kind = 'bireysel' or buyer_tax_id is not null)
);
create index if not exists invoices_business_idx on public.invoices (business_id, issue_date desc);
create index if not exists invoices_reservation_idx on public.invoices (reservation_id);
create index if not exists invoices_status_idx on public.invoices (status)
  where status in ('taslak', 'gonderiliyor');

-- ------------------------------------------------------- fatura satırları
create table if not exists public.invoice_lines (
  id             uuid    primary key default gen_random_uuid(),
  invoice_id     uuid    not null references public.invoices (id) on delete cascade,
  line_no        integer not null check (line_no > 0),
  description    text    not null check (length(btrim(description)) > 0),
  quantity       numeric(12,3) not null check (quantity > 0),
  unit           text    not null default 'Adet',
  unit_price_kurus bigint not null check (unit_price_kurus >= 0),
  discount_rate  numeric(5,2) not null default 0 check (discount_rate between 0 and 100),
  vat_rate       integer not null check (vat_rate in (0, 1, 10, 20)),
  gross_kurus    bigint  not null check (gross_kurus >= 0),
  discount_kurus bigint  not null default 0 check (discount_kurus >= 0),
  base_kurus     bigint  not null check (base_kurus >= 0),
  vat_kurus      bigint  not null check (vat_kurus >= 0),
  total_kurus    bigint  not null check (total_kurus >= 0),
  constraint invoice_lines_unique unique (invoice_id, line_no),
  constraint invoice_lines_totals_consistent
    check (base_kurus = gross_kurus - discount_kurus
           and total_kurus = base_kurus + vat_kurus)
);
create index if not exists invoice_lines_invoice_idx on public.invoice_lines (invoice_id, line_no);

drop trigger if exists touch_invoices on public.invoices;
create trigger touch_invoices before update on public.invoices
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- Kurallar
-- =====================================================================

/**
 * Sıradaki fatura numarasını atomik olarak üretir.
 * Biçim: 3 karakter ön ek + 4 haneli yıl + 9 haneli sıra (16 karakter)
 */
create or replace function public.next_invoice_number(
  p_business_id uuid, p_prefix text default 'DGT'
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year   integer := extract(year from current_date)::int;
  v_prefix text := upper(regexp_replace(coalesce(p_prefix, 'DGT'), '[^A-Za-z0-9]', '', 'g'));
  v_next   integer;
begin
  v_prefix := rpad(left(v_prefix, 3), 3, 'X');

  insert into public.invoice_series (business_id, prefix, year, last_number)
  values (p_business_id, v_prefix, v_year, 1)
  on conflict (business_id, prefix, year)
    do update set last_number = public.invoice_series.last_number + 1
  returning last_number into v_next;

  if v_next > 999999999 then
    raise exception 'Bu seri için numara aralığı doldu.';
  end if;

  return v_prefix || v_year::text || lpad(v_next::text, 9, '0');
end;
$$;

/**
 * Gönderilmiş faturayı değiştirmeyi engeller.
 * Vergi belgesi düzenlendikten sonra içeriği değiştirilemez; yalnızca
 * iptal edilebilir.
 */
create or replace function public.protect_sent_invoice()
returns trigger
language plpgsql
as $$
begin
  if OLD.status in ('gonderildi', 'onaylandi') then
    -- Yalnızca durum/iptal/entegratör alanlarının değişmesine izin verilir
    if NEW.invoice_number is distinct from OLD.invoice_number
       or NEW.total_kurus is distinct from OLD.total_kurus
       or NEW.base_kurus  is distinct from OLD.base_kurus
       or NEW.vat_kurus   is distinct from OLD.vat_kurus
       or NEW.buyer_name  is distinct from OLD.buyer_name
       or NEW.buyer_tax_id is distinct from OLD.buyer_tax_id
       or NEW.issue_date  is distinct from OLD.issue_date then
      raise exception 'Gönderilmiş fatura değiştirilemez; iptal edip yeniden düzenleyiniz.'
        using errcode = 'check_violation';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists protect_invoice on public.invoices;
create trigger protect_invoice before update on public.invoices
  for each row execute function public.protect_sent_invoice();

/** Gönderilmiş faturanın satırları da değiştirilemez. */
create or replace function public.protect_sent_invoice_lines()
returns trigger
language plpgsql
as $$
declare v_status invoice_status;
begin
  select i.status into v_status from public.invoices i
  where i.id = coalesce(NEW.invoice_id, OLD.invoice_id);

  if v_status in ('gonderildi', 'onaylandi') then
    raise exception 'Gönderilmiş faturanın satırları değiştirilemez.'
      using errcode = 'check_violation';
  end if;
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists protect_invoice_lines on public.invoice_lines;
create trigger protect_invoice_lines before insert or update or delete on public.invoice_lines
  for each row execute function public.protect_sent_invoice_lines();

/** Fatura satırlarından toplamları yeniden hesaplayıp başlığa yazar. */
create or replace function public.recalculate_invoice(p_invoice_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.invoices i set
    gross_kurus    = coalesce(t.gross, 0),
    discount_kurus = coalesce(t.discount, 0),
    base_kurus     = coalesce(t.base, 0),
    vat_kurus      = coalesce(t.vat, 0),
    total_kurus    = coalesce(t.total, 0)
  from (
    select
      sum(gross_kurus)    as gross,
      sum(discount_kurus) as discount,
      sum(base_kurus)     as base,
      sum(vat_kurus)      as vat,
      sum(total_kurus)    as total
    from public.invoice_lines where invoice_id = p_invoice_id
  ) t
  where i.id = p_invoice_id;
$$;

-- =====================================================================
-- Satır bazlı güvenlik
-- =====================================================================
alter table public.invoices       enable row level security;
alter table public.invoice_lines  enable row level security;
alter table public.invoice_series enable row level security;

drop policy if exists invoices_all on public.invoices;
create policy invoices_all on public.invoices for all
  to authenticated
  using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

drop policy if exists invoice_lines_all on public.invoice_lines;
create policy invoice_lines_all on public.invoice_lines for all
  to authenticated
  using (exists (select 1 from public.invoices i
                 where i.id = invoice_lines.invoice_id and public.owns_business(i.business_id)))
  with check (exists (select 1 from public.invoices i
                      where i.id = invoice_lines.invoice_id and public.owns_business(i.business_id)));

drop policy if exists invoice_series_select on public.invoice_series;
create policy invoice_series_select on public.invoice_series for select
  to authenticated using (public.owns_business(business_id));

-- Seri sayacı yalnızca fonksiyon üzerinden ilerletilir; elle değiştirilemez.
revoke insert, update, delete on public.invoice_series from anon, authenticated;

-- Fatura silme yasak: vergi belgesi silinmez, iptal edilir.
revoke delete on public.invoices from anon, authenticated;

revoke all on function public.next_invoice_number(uuid, text) from public;
revoke all on function public.recalculate_invoice(uuid) from public;
grant execute on function public.next_invoice_number(uuid, text) to authenticated, service_role;
grant execute on function public.recalculate_invoice(uuid) to authenticated, service_role;

-- Denetim kaydına faturaları da dahil et
drop trigger if exists audit_invoices on public.invoices;
create trigger audit_invoices after insert or update on public.invoices
  for each row execute function public.write_audit_log();
