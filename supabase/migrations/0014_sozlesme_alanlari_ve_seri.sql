-- =====================================================================
-- Sözleşme çıktısının gerektirdiği alanlar ve sıralı sözleşme numarası
--
-- Basılı sözleşmede yer alan ama veritabanında karşılığı olmayan dört
-- bilgi eklenir:
--   * start_time / end_time : "Saat : 19:00-23:00" satırı. Program
--     raporunda aynı gün aynı salonda iki organizasyon olduğunda
--     bunları ayıran bilgi de budur.
--   * identity_no           : sözleşmedeki "TC" satırı
--   * second_phone          : sözleşmedeki "Gelin Cep" satırı
--
-- Dördü de isteğe bağlıdır: mevcut kayıtlar boş kalır ve hiçbir ekran
-- bu alanları zorunlu tutmaz.
--
-- KVKK: identity_no kimlik numarasıdır. Yalnızca sözleşme düzenlemek
-- için tutulur, herkese açık kod doğrulama ekranına hiçbir koşulda
-- çıkmaz (verify_reservation_code bu alanı seçmez) ve aydınlatma
-- metnine işlenmiştir.
--
-- Ayrıca sözleşme numarası rastgele (SA-2026-4821) yerine yıl + sıra
-- (20261, 20262, ...) biçimine geçer. Sıra veritabanında üretilir;
-- iki kullanıcı aynı anda kayıt açtığında numara tekrar etmez.
-- Mevcut kayıtların kodu DEĞİŞTİRİLMEZ: basılmış sözleşmelerin üstünde
-- duran numara ile kayıt arasındaki bağ kopmamalıdır.
-- =====================================================================

-- ------------------------------------------------- sözleşme alanları
alter table public.reservations
  add column if not exists start_time   time,
  add column if not exists end_time     time,
  add column if not exists identity_no  text,
  add column if not exists second_phone text;

-- TC kimlik numarası 11 hanedir. Boş bırakılabilir; girildiyse biçimi
-- tutmalı, aksi hâlde sözleşmeye hatalı numara basılır.
alter table public.reservations
  drop constraint if exists reservations_identity_no_format;
alter table public.reservations
  add constraint reservations_identity_no_format
  check (identity_no is null or identity_no ~ '^[0-9]{11}$');

comment on column public.reservations.start_time is
  'Organizasyon başlangıç saati; sözleşmedeki "Saat" satırı.';
comment on column public.reservations.end_time is
  'Organizasyon bitiş saati. Gece yarısını aşan törenlerde başlangıçtan küçük olabilir.';
comment on column public.reservations.identity_no is
  'Sözleşmeyi imzalayanın TC kimlik numarası. KVKK: yalnızca sözleşme için tutulur.';
comment on column public.reservations.second_phone is
  'İkinci kişinin telefonu; sözleşmedeki "Gelin Cep" satırı.';

-- ------------------------------------------------- sözleşme numarası
-- Fatura serisiyle aynı desen: işletme + yıl başına tek sayaç satırı,
-- artırma tek bir UPDATE ... RETURNING içinde yapılır.
create table if not exists public.contract_series (
  business_id uuid    not null references public.businesses (id) on delete cascade,
  year        integer not null,
  last_number integer not null default 0 check (last_number >= 0),
  primary key (business_id, year)
);

comment on table public.contract_series is
  'Sözleşme numarası sayacı. Numara biçimi: yıl || sıra (2026 + 1 = 20261).';

/**
 * Sıradaki sözleşme numarasını üretir ve sayacı ilerletir.
 *
 * Yıl değişince sıra 1''den başlar; numaranın kendisi yılı taşıdığı için
 * 20261 ile 20271 çakışmaz. Sayaç, o işletmede zaten kullanılmış en büyük
 * numaranın altında kalamaz: eski kayıtlar elle taşınmış olsa bile üretilen
 * numara mevcut bir koda çarpmaz.
 */
create or replace function public.next_contract_number(p_business_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year  integer := extract(year from current_date)::int;
  v_used  integer;
  v_next  integer;
begin
  if not public.owns_business(p_business_id) then
    raise exception 'Bu işletme için sözleşme numarası üretme yetkiniz bulunmuyor.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Bu yıla ait, biçime uyan kodların en büyüğü. Kod metin olduğu için
  -- yıl ön eki kırpılıp sayıya çevrilir; uymayan eski kodlar elenir.
  select coalesce(max(substring(r.code from length(v_year::text) + 1)::int), 0)
    into v_used
  from public.reservations r
  where r.business_id = p_business_id
    and r.code ~ ('^' || v_year::text || '[0-9]{1,9}$');

  insert into public.contract_series (business_id, year, last_number)
  values (p_business_id, v_year, greatest(1, v_used + 1))
  on conflict (business_id, year)
    do update set last_number =
      greatest(public.contract_series.last_number + 1, excluded.last_number)
  returning last_number into v_next;

  return v_year::text || v_next::text;
end;
$$;

alter table public.contract_series enable row level security;

drop policy if exists contract_series_select on public.contract_series;
create policy contract_series_select on public.contract_series for select
  to authenticated using (public.owns_business(business_id));

-- Sayaç yalnızca fonksiyon üzerinden ilerler; elle yazılırsa numaralar
-- tekrar eder.
grant select on public.contract_series to authenticated;
revoke insert, update, delete on public.contract_series from anon, authenticated;

revoke all on function public.next_contract_number(uuid) from public;
grant execute on function public.next_contract_number(uuid) to authenticated, service_role;

-- ----------------------------------------- numarayı veritabanı doldurur
/**
 * Tetikleyicinin çağırdığı iç üretici.
 *
 * `next_contract_number` istemciye açıktır ve bu yüzden sahiplik kontrolü
 * yapar. Tetikleyici ise satırın kendisi zaten reservations RLS kontrolünden
 * geçtikten sonra çalışır; ikinci bir kontrol, sunucu tarafı görevlerin
 * (yedekten geri yükleme gibi) kayıt açmasını gereksiz yere engellerdi.
 */
create or replace function public.assign_contract_number(p_business_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer := extract(year from current_date)::int;
  v_used integer;
  v_next integer;
begin
  select coalesce(max(substring(r.code from length(v_year::text) + 1)::int), 0)
    into v_used
  from public.reservations r
  where r.business_id = p_business_id
    and r.code ~ ('^' || v_year::text || '[0-9]{1,9}$');

  insert into public.contract_series (business_id, year, last_number)
  values (p_business_id, v_year, greatest(1, v_used + 1))
  on conflict (business_id, year)
    do update set last_number =
      greatest(public.contract_series.last_number + 1, excluded.last_number)
  returning last_number into v_next;

  return v_year::text || v_next::text;
end;
$$;

/**
 * Sözleşme numarasını istemci değil veritabanı atar.
 *
 * Mobil uygulama ve panel aynı numarayı iki ayrı yerde üretmek zorunda
 * kalmaz; iki kayıt aynı anda açıldığında da numara tekrar etmez.
 * Güncellemede numara boş gelirse eski numara korunur: bir kayıt bir kez
 * numara alır, sonradan değişmez.
 */
create or replace function public.fill_reservation_code()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'UPDATE' then
    if NEW.code is null or btrim(NEW.code) = '' then
      NEW.code := OLD.code;
    end if;
    return NEW;
  end if;

  if NEW.code is null or btrim(NEW.code) = '' then
    NEW.code := public.assign_contract_number(NEW.business_id);
  end if;
  return NEW;
end;
$$;

drop trigger if exists reservations_fill_code on public.reservations;
create trigger reservations_fill_code
  before insert or update on public.reservations
  for each row execute function public.fill_reservation_code();

revoke all on function public.assign_contract_number(uuid) from public;
