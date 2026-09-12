-- =====================================================================
-- Kullanıcılara aylık rapor (madde 24)
--
-- Ayın ilk günü, biten ay için özet çıkarılıp e-postayla gönderilir.
--
-- İki ayrı ayar var ve ayrı durmaları gerekiyor:
--   profiles.monthly_report  : hangi KULLANICI için rapor üretilecek
--   businesses.report_email  : raporun gideceği adres
--
-- Tek alanda birleştirilselerdi, raporu kapatmak adresi de silmek
-- olurdu; sahibi bir ay kapattığında adresi yeniden yazmak zorunda
-- kalırdı.
--
-- GÖNDERİM KAYDI zorunlu (şartname): kayıt olmadan "rapor gitti mi"
-- sorusunun cevabı yok ve aynı ayın raporu iki kez gönderilebilirdi.
-- =====================================================================

alter table public.profiles
  add column if not exists monthly_report boolean not null default false;

comment on column public.profiles.monthly_report is
  'Bu kullanıcı için ay sonu raporu üretilsin mi (madde 24).';

alter table public.businesses
  add column if not exists report_email text not null default '';

comment on column public.businesses.report_email is
  'Aylık raporun gönderileceği adres. Boşsa rapor üretilir ama gönderilmez.';

-- ------------------------------------------------------- gönderim kaydı
create table if not exists public.monthly_report_log (
  id          bigserial   primary key,
  business_id uuid        not null references public.businesses (id) on delete cascade,
  /** Raporun ait olduğu ay: 'YYYY-MM'. */
  period      text        not null check (period ~ '^\d{4}-\d{2}$'),
  recipient   text        not null default '',
  status      text        not null default 'beklemede'
    check (status in ('beklemede', 'gonderildi', 'hata')),
  detail      text        not null default '',
  /** Raporun kendisi: gönderilemese de panelden okunabilsin. */
  payload     jsonb,
  created_at  timestamptz not null default now(),
  /*
    Aynı ayın raporu bir kez üretilir. Kısıt olmasaydı görev günde birkaç
    kez çalıştığında yöneticiye aynı rapor defalarca giderdi.
  */
  constraint monthly_report_log_unique unique (business_id, period)
);

create index if not exists monthly_report_log_business_idx
  on public.monthly_report_log (business_id, period desc);

-- =====================================================================
-- Ayın özeti
--
-- Hesap VERİTABANINDA: aynı sayım panelde, mobilde ve e-postada üç kez
-- yazılsaydı biri diğerini tutmazdı.
-- =====================================================================
create or replace function public.aylik_ozet(p_business uuid, p_period text)
returns table (
  rezervasyon integer,
  davetli     integer,
  ciro        numeric,
  tahsilat    numeric,
  kalan       numeric,
  gider       numeric,
  aday        integer,
  donusen     integer
)
language sql
stable
security definer
set search_path = public
as $$
  with
  ay as (
    select (p_period || '-01')::date as bas,
           ((p_period || '-01')::date + interval '1 month - 1 day')::date as son
  ),
  rez as (
    select r.*
    from public.reservations r, ay
    where r.business_id = p_business
      and r.status <> 'İptal'
      and r.date between ay.bas and ay.son
  ),
  odeme as (
    select coalesce(sum(p.amount), 0) as tutar
    from public.payments p join rez on rez.id = p.reservation_id
  ),
  gider as (
    select coalesce(sum(e.unit_count * e.unit_price), 0) as tutar
    from public.reservation_expenses e join rez on rez.id = e.reservation_id
  ),
  adaylar as (
    select l.*
    from public.customer_leads l, ay
    where l.business_id = p_business
      and coalesce(l.meeting_date, l.created_at::date) between ay.bas and ay.son
  )
  select
    (select count(*) from rez)::integer,
    (select coalesce(sum(guest_count), 0) from rez)::integer,
    (select coalesce(sum(total_amount), 0) from rez),
    -- Kapora rezervasyon satırında durur, ödemeler listesinde değil;
    -- katılmazsa "tahsil edilen" salonun en büyük girişini atlar.
    (select coalesce(sum(deposit), 0) from rez) + (select tutar from odeme),
    greatest(
      (select coalesce(sum(total_amount), 0) from rez)
      - (select coalesce(sum(deposit), 0) from rez) - (select tutar from odeme), 0),
    (select tutar from gider),
    (select count(*) from adaylar)::integer,
    (select count(*) from adaylar where reservation_id is not null)::integer;
$$;

comment on function public.aylik_ozet(uuid, text) is
  'Bir ayın rezervasyon, tahsilat, gider ve dönüşüm özeti (madde 24).';

revoke all on function public.aylik_ozet(uuid, text) from public;
grant execute on function public.aylik_ozet(uuid, text) to authenticated, service_role;

-- ------------------------------------------------------------ RLS
alter table public.monthly_report_log enable row level security;

drop policy if exists monthly_report_log_select on public.monthly_report_log;
create policy monthly_report_log_select on public.monthly_report_log for select
  to authenticated using (public.owns_business(business_id));

/*
  Kayıt yalnızca okunur: gönderim kaydının düzeltilebilmesi, "rapor gitti
  mi" sorusunun cevabının da değiştirilebilmesi demekti. Satırları
  zamanlanmış görev (service_role) yazıyor.
*/
grant select on public.monthly_report_log to authenticated;
revoke insert, update, delete on public.monthly_report_log from authenticated;
grant select, insert, update on public.monthly_report_log to service_role;
