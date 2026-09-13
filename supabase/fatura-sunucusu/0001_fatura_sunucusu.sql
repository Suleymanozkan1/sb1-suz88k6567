-- =====================================================================
-- FATURA SUNUCUSU (Türkiye) - şema
--
-- NEDEN AYRI BİR VERİTABANI. Vergi Usul Kanunu, e-belgelerin ve fatura
-- kayıtlarının Türkiye sınırları içinde muhafaza edilmesini istiyor.
-- Sistemin geri kalanı (rezervasyon, müşteri, kasa, SMS) yurt dışındaki
-- sunucuda duruyor; YALNIZCA fatura tabloları bu veritabanında.
--
-- Bu dosya ana göçlerin (supabase/migrations) yerine geçmez, onların
-- fatura bölümünün kopyasıdır. Ana sunucuda `0005_invoices.sql` ile
-- açılan tablolar burada birebir aynı sütunlarla açılıyor ki aynı
-- PostgREST istemcisi ikisiyle de konuşabilsin.
--
-- BURADA OLMAYAN ŞEYLER
--   * auth.users / auth.sessions - giriş yurt dışı sunucusunda yapılıyor.
--     Bu veritabanı yalnızca orada imzalanmış jetonu DOĞRULUYOR, bu yüzden
--     JWT_SECRET iki tarafta AYNI olmalı.
--   * reservations - bu yüzden `invoices.reservation_id` üzerinde yabancı
--     anahtar YOK; sade uuid olarak duruyor (aşağıda açıklaması var).
--
-- BURADA OLMAK ZORUNDA OLAN ŞEYLER
--   * profiles ve businesses'in KOPYASI. RLS politikaları
--     `owns_business()` ve `has_permission()` üzerinden çalışıyor; o iki
--     fonksiyon bu tablolara bakıyor. Kopya olmasaydı RLS'i kapatmak ya da
--     yetkiyi uygulama katmanına indirmek gerekirdi; ikisi de güvenlik
--     sınırını kaldırırdı. Kopyalar mantıksal çoğaltma ile besleniyor
--     (docs/IKI-SUNUCU.md), bu sunucudan YAZILMAZ.
--
-- Yeniden çalıştırılabilir: her adım varlık kontrolünden geçiyor.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------ roller
-- Ana sunucudaki 0000 göçüyle aynı; PostgREST isteği "authenticator"
-- rolüyle karşılar, sonra jetondaki role geçer.
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
do $$ begin create role authenticator noinherit login; exception when duplicate_object then null; end $$;
grant anon, authenticated, service_role to authenticator;

create schema if not exists auth;

/*
  Oturumdaki kullanıcının kimliği.

  Ana sunucudaki tanımın BİREBİR aynısı. İki taraf aynı jetonu farklı
  okursa aynı kullanıcı bir tarafta yetkili, diğerinde yetkisiz olurdu:
  fatura ekranı boş gelir, sebebi de görünmezdi.
*/
create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub'
  )::uuid;
$$;

grant usage on schema public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- =====================================================================
-- Yetki kopyaları
--
-- Bu iki tablo bu sunucunun VERİSİ DEĞİL, yetki sözlüğü. Ana sunucudan
-- mantıksal çoğaltma ile geliyor ve buradan yazılmıyor; yalnızca
-- `owns_business()` ile `has_permission()` okuyor.
--
-- Sütunlar ana şemanın yalnızca yetkiye giren kısmı: müşteri adı,
-- telefon, adres gibi kişisel veriler buraya KOPYALANMIYOR. Çoğaltma
-- yayını da bu sütunlarla sınırlanıyor (docs/IKI-SUNUCU.md).
-- =====================================================================

do $$ begin
  create type user_role as enum ('owner', 'staff');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  -- auth.users'a yabancı anahtar YOK: kimlik tablosu diğer sunucuda.
  id                  uuid primary key,
  email               text        not null default '',
  full_name           text        not null default '',
  role                user_role   not null default 'owner',
  owner_id            uuid,
  permissions         text[]      not null default '{}'::text[],
  permissions_version smallint    not null default 1,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.businesses (
  id         uuid primary key,
  owner_id   uuid        not null,
  name       text        not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists businesses_owner_idx on public.businesses (owner_id);

comment on table public.profiles is
  'Ana sunucudan çoğaltılan yetki kopyası. Buradan yazılmaz.';
comment on table public.businesses is
  'Ana sunucudan çoğaltılan yetki kopyası. Buradan yazılmaz.';

-- Kopya tablolar tarayıcıya AÇILMIYOR: RLS fonksiyonları `security
-- definer` olduğu için okuma yetkisine gerek yok. Açılsaydı personel
-- listesi fatura sunucusundan da okunabilirdi.
alter table public.profiles   enable row level security;
alter table public.businesses enable row level security;
revoke all on public.profiles   from anon, authenticated;
revoke all on public.businesses from anon, authenticated;

-- =====================================================================
-- Yetki fonksiyonları (ana sunucudaki tanımların aynısı)
-- =====================================================================

create or replace function public.owner_scope()
returns uuid
language sql stable security definer set search_path = public
as $$
  select coalesce(p.owner_id, p.id) from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.owns_business(bid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.businesses b
    where b.id = bid and b.owner_id = public.owner_scope()
  );
$$;

create or replace function public.has_permission(p_perm text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.owner_id is null or p_perm = any (p.permissions))
  );
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.has_permission(text) from public;
grant execute on function public.has_permission(text) to authenticated;

-- =====================================================================
-- Denetim kaydı
--
-- Fatura değişiklikleri de VUK kapsamında: hangi kaydın ne zaman
-- değiştiği bilgisi faturanın yanında, aynı ülkede durmalı. Bu yüzden
-- ana sunucudaki `audit_log` buraya da kuruluyor ve YALNIZCA fatura
-- satırlarını taşıyor. Denetim ekranı iki tarafı birleştirerek
-- gösteriyor (src/lib/repo/supabase.ts, listAuditLog).
-- =====================================================================
create table if not exists public.audit_log (
  id          bigserial   primary key,
  owner_id    uuid,
  actor_id    uuid,
  actor_email text,
  action      text        not null check (action in ('INSERT','UPDATE','DELETE')),
  table_name  text        not null,
  record_id   text,
  summary     text,
  changed     jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_owner_idx on public.audit_log (owner_id, created_at desc);

create or replace function public.write_audit_log()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_owner   uuid;
  v_actor   uuid := auth.uid();
  v_email   text;
  v_changed jsonb := '{}'::jsonb;
  v_old     jsonb;
  v_new     jsonb;
  v_key     text;
begin
  v_old := case when TG_OP = 'INSERT' then '{}'::jsonb else to_jsonb(OLD) end;
  v_new := case when TG_OP = 'DELETE' then '{}'::jsonb else to_jsonb(NEW) end;

  select b.owner_id into v_owner from public.businesses b
  where b.id = coalesce((v_new ->> 'business_id')::uuid, (v_old ->> 'business_id')::uuid);

  select p.email into v_email from public.profiles p where p.id = v_actor;

  -- Yalnızca gerçekten değişen alanlar yazılır; tüm satırı yazmak
  -- denetim kaydını okunmaz hâle getirir.
  for v_key in select jsonb_object_keys(v_new) loop
    if v_old -> v_key is distinct from v_new -> v_key then
      v_changed := v_changed || jsonb_build_object(
        v_key, jsonb_build_object('eski', v_old -> v_key, 'yeni', v_new -> v_key));
    end if;
  end loop;

  insert into public.audit_log (
    owner_id, actor_id, actor_email, action, table_name, record_id, summary, changed
  ) values (
    v_owner, v_actor, v_email, TG_OP, TG_TABLE_NAME,
    coalesce(v_new ->> 'id', v_old ->> 'id'),
    coalesce(v_new ->> 'invoice_number', v_old ->> 'invoice_number'),
    nullif(v_changed, '{}'::jsonb)
  );
  return coalesce(NEW, OLD);
end;
$$;

alter table public.audit_log enable row level security;

drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select
  to authenticated using (owner_id = public.owner_scope());

revoke insert, update, delete on public.audit_log from anon, authenticated;

-- =====================================================================
-- Fatura tabloları
--
-- Ana sunucudaki `0005_invoices.sql` ile AYNI sütunlar. Tek fark
-- `reservation_id`: rezervasyon tablosu diğer sunucuda olduğu için
-- yabancı anahtar kurulamıyor. Alan sade uuid olarak duruyor; hangi
-- rezervasyona ait olduğu bilgisi korunuyor ama veritabanı bunu
-- doğrulayamıyor. Faturayı yazan uygulama katmanı (src/lib/repo) kimliği
-- zaten var olan bir rezervasyondan alıyor.
--
-- Rezervasyon SİLİNİRSE ana sunucuda `on delete set null` çalışırdı;
-- burada çalışmayacak ve fatura, artık var olmayan bir rezervasyona
-- işaret edecek. Bu KASITLI: vergi belgesi, kaynağı silindi diye
-- değiştirilmemeli.
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
  -- Yabancı anahtar YOK: public.reservations diğer sunucuda.
  reservation_id  uuid,

  invoice_number  text           not null check (invoice_number ~ '^[A-Z0-9]{3}\d{13}$'),
  uuid_ettn       uuid           not null default gen_random_uuid(),
  kind            invoice_kind   not null default 'e-Arsiv',
  status          invoice_status not null default 'taslak',
  issue_date      date           not null default current_date,
  service_date    date,

  buyer_kind      buyer_kind     not null default 'bireysel',
  buyer_name      text           not null check (length(btrim(buyer_name)) > 0),
  buyer_tax_id    text,
  buyer_tax_office text,
  buyer_address   text,
  buyer_city      text,
  buyer_district  text,
  buyer_email     text,
  buyer_phone     text,

  gross_kurus     bigint         not null default 0 check (gross_kurus >= 0),
  discount_kurus  bigint         not null default 0 check (discount_kurus >= 0),
  base_kurus      bigint         not null default 0 check (base_kurus >= 0),
  vat_kurus       bigint         not null default 0 check (vat_kurus >= 0),
  total_kurus     bigint         not null default 0 check (total_kurus >= 0),
  currency        text           not null default 'TRY',

  provider_ref    text,
  provider_error  text,
  sent_at         timestamptz,
  cancelled_at    timestamptz,
  cancel_reason   text,

  note            text,
  -- Yabancı anahtar var: profiles kopyası bu sunucuda.
  created_by      uuid           references public.profiles (id) on delete set null,
  created_at      timestamptz    not null default now(),
  updated_at      timestamptz    not null default now(),

  constraint invoices_number_unique unique (business_id, invoice_number),
  constraint invoices_totals_consistent
    check (base_kurus = gross_kurus - discount_kurus
           and total_kurus = base_kurus + vat_kurus),
  constraint invoices_corporate_needs_tax_id
    check (buyer_kind = 'bireysel' or buyer_tax_id is not null)
);
create index if not exists invoices_business_idx on public.invoices (business_id, issue_date desc);
create index if not exists invoices_reservation_idx on public.invoices (reservation_id);
create index if not exists invoices_status_idx on public.invoices (status)
  where status in ('taslak', 'gonderiliyor');

comment on column public.invoices.reservation_id is
  'Diğer sunucudaki public.reservations.id. Yabancı anahtar kurulamıyor.';

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
-- Kurallar (ana sunucudaki 0005 ile birebir aynı)
-- =====================================================================

create or replace function public.next_invoice_number(
  p_business_id uuid, p_prefix text default 'DGT'
) returns text
language plpgsql security definer set search_path = public
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

create or replace function public.protect_sent_invoice()
returns trigger language plpgsql as $$
begin
  if OLD.status in ('gonderildi', 'onaylandi') then
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

create or replace function public.protect_sent_invoice_lines()
returns trigger language plpgsql as $$
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

create or replace function public.recalculate_invoice(p_invoice_id uuid)
returns void
language sql security definer set search_path = public
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

drop trigger if exists audit_invoices on public.invoices;
create trigger audit_invoices after insert or update on public.invoices
  for each row execute function public.write_audit_log();

-- =====================================================================
-- Satır bazlı güvenlik
--
-- Ana sunucuda 0036 `yetki_politikasi()` ile üretiyor; burada tek tablo
-- olduğu için doğrudan yazılıyor. Kurallar birebir aynı: okuma
-- `fatura.goruntule`, yazma `fatura.duzenle` yetkisine bağlı.
-- =====================================================================
alter table public.invoices       enable row level security;
alter table public.invoice_lines  enable row level security;
alter table public.invoice_series enable row level security;

drop policy if exists invoices_all on public.invoices;
drop policy if exists invoices_select on public.invoices;
drop policy if exists invoices_write on public.invoices;
drop policy if exists invoices_yetki_select on public.invoices;
create policy invoices_yetki_select on public.invoices for select
  to authenticated using (
    public.has_permission('fatura.goruntule') and public.owns_business(business_id));

drop policy if exists invoices_yetki_write on public.invoices;
create policy invoices_yetki_write on public.invoices for all
  to authenticated
  using (public.has_permission('fatura.duzenle') and public.owns_business(business_id))
  with check (public.has_permission('fatura.duzenle') and public.owns_business(business_id));

drop policy if exists invoice_lines_all on public.invoice_lines;
create policy invoice_lines_all on public.invoice_lines for all
  to authenticated
  using (exists (select 1 from public.invoices i
                 where i.id = invoice_lines.invoice_id and public.owns_business(i.business_id)))
  with check (exists (select 1 from public.invoices i
                      where i.id = invoice_lines.invoice_id and public.owns_business(i.business_id)));

drop policy if exists invoice_series_select on public.invoice_series;
drop policy if exists invoice_series_yetki_select on public.invoice_series;
create policy invoice_series_yetki_select on public.invoice_series for select
  to authenticated using (
    public.has_permission('fatura.goruntule') and public.owns_business(business_id));

-- =====================================================================
-- Tablo yetkileri (ana sunucudaki 0021 ve 0023 ile aynı)
-- =====================================================================
grant select, insert, update, delete on public.invoice_lines to authenticated;

-- Fatura SİLİNEMEZ: vergi belgesidir, yanlışsa iptal edilir, yok edilmez.
grant select, insert, update on public.invoices to authenticated;

-- Seri sayacı yalnızca fonksiyon üzerinden ilerletilir.
grant select on public.invoice_series, public.audit_log to authenticated;
revoke insert, update, delete on public.invoice_series from anon, authenticated;
revoke delete on public.invoices from anon, authenticated;

grant select, insert, update, delete on public.invoice_lines to service_role;
grant select, insert, update on public.invoices to service_role;
grant select, insert on public.audit_log to service_role;
grant select, insert, update on public.invoice_series to service_role;
grant select, insert, update, delete on public.profiles, public.businesses to service_role;

revoke all on function public.next_invoice_number(uuid, text) from public;
revoke all on function public.recalculate_invoice(uuid) from public;
grant execute on function public.next_invoice_number(uuid, text) to authenticated, service_role;
grant execute on function public.recalculate_invoice(uuid) to authenticated, service_role;

-- Diziler (audit_log.id bigserial): insert yapan roller ilerletebilmeli.
do $$
declare r record;
begin
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'S'
  loop
    execute format('grant usage, select on sequence public.%I to authenticated, service_role', r.relname);
  end loop;
end $$;

-- =====================================================================
-- Yedeğe fatura eklemek için
--
-- Ana sunucudaki `export_owner_data` bu tabloları göremiyor; yedek alan
-- görev (api/backup.ts) bu fonksiyonu AYRICA çağırıp sonucu aynı JSON'a
-- ekliyor. İki taraf ayrı yedeklenirse biri eksik kalırsa fark edilmez.
-- =====================================================================
create or replace function public.export_invoice_data(p_owner_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_result jsonb;
begin
  -- Yetki: yalnızca kendi kapsamını dışa aktarabilir.
  -- service_role çağrılarında auth.uid() null'dur; o durumda izin verilir.
  if auth.uid() is not null and public.owner_scope() <> p_owner_id then
    raise exception 'Bu kapsam için yetkiniz bulunmuyor.'
      using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'faturalar', coalesce((
      select jsonb_agg(to_jsonb(i))
      from public.invoices i
      join public.businesses b on b.id = i.business_id
      where b.owner_id = p_owner_id), '[]'::jsonb),
    'fatura_satirlari', coalesce((
      select jsonb_agg(to_jsonb(l))
      from public.invoice_lines l
      join public.invoices i on i.id = l.invoice_id
      join public.businesses b on b.id = i.business_id
      where b.owner_id = p_owner_id), '[]'::jsonb),
    'fatura_serileri', coalesce((
      select jsonb_agg(to_jsonb(s))
      from public.invoice_series s
      join public.businesses b on b.id = s.business_id
      where b.owner_id = p_owner_id), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

/**
 * Fatura denetim kayıtları (ana sunucudaki 0040 ile aynı).
 *
 * Denetim ekranı `audit_log`'u ana sunucudan, bu fonksiyonu buradan
 * okuyup birleştiriyor. İki sorgu birbirini dışlıyor: orada fatura
 * satırları hariç tutuluyor, burada yalnızca onlar dönüyor.
 */
create or replace function public.fatura_denetim_kaydi(p_limit integer default 100)
returns setof public.audit_log
language sql stable security definer set search_path = public
as $$
  select * from public.audit_log
  where table_name in ('invoices', 'invoice_lines')
    and owner_id = public.owner_scope()
  order by created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke all on function public.export_invoice_data(uuid) from public;
revoke all on function public.fatura_denetim_kaydi(integer) from public;
grant execute on function public.export_invoice_data(uuid) to authenticated, service_role;
grant execute on function public.fatura_denetim_kaydi(integer) to authenticated, service_role;
