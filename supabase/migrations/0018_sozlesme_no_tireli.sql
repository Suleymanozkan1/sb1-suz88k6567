-- =====================================================================
-- Sözleşme numarası: yıl-sıra (2026-1)
--
-- 0014 numarayı tiresiz üretiyordu: 20261, 20262 ... 202610. Yıl ile sıra
-- bitişik olduğu için numara telefonda okunurken karışıyordu; 20261 ile
-- 202610 bir bakışta ayırt edilmiyor. Tire ikisini ayırıyor.
--
-- Mevcut kayıtların kodu DEĞİŞTİRİLMEZ: basılmış sözleşmelerin üstünde
-- duran numara ile kayıt arasındaki bağ kopmamalıdır. Bunun yerine sayaç
-- her iki yazımı da tanıyor -- tiresiz eski numaralar da bu yılın dizisine
-- ait sayılıyor. Tanımasaydı sıra 1'den başlar ve aynı yıl içinde hem
-- "20261" hem "2026-1" diye iki ayrı birinci sözleşme olurdu.
-- =====================================================================

comment on table public.contract_series is
  'Sözleşme numarası sayacı. Numara biçimi: yıl-sıra (2026 + 1 = 2026-1).';

/**
 * Sıradaki sözleşme numarasını üretir ve sayacı ilerletir.
 *
 * İstemciye açık olduğu için sahiplik kontrolü yapar.
 */
create or replace function public.next_contract_number(p_business_id uuid)
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
  if not public.owns_business(p_business_id) then
    raise exception 'Bu işletme için sözleşme numarası üretme yetkiniz bulunmuyor.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Bu yıla ait kodların en büyük sırası. Tire isteğe bağlı okunuyor;
  -- 0014 ile üretilmiş tiresiz numaralar da diziye dahil.
  select coalesce(max(substring(r.code from '^' || v_year::text || '-?([0-9]{1,9})$')::int), 0)
    into v_used
  from public.reservations r
  where r.business_id = p_business_id
    and r.code ~ ('^' || v_year::text || '-?[0-9]{1,9}$');

  insert into public.contract_series (business_id, year, last_number)
  values (p_business_id, v_year, greatest(1, v_used + 1))
  on conflict (business_id, year)
    do update set last_number =
      greatest(public.contract_series.last_number + 1, excluded.last_number)
  returning last_number into v_next;

  return v_year::text || '-' || v_next::text;
end;
$$;

/**
 * Tetikleyicinin çağırdığı iç üretici; sahiplik kontrolü yapmaz.
 *
 * Satır zaten reservations RLS kontrolünden geçtikten sonra çalışır; ikinci
 * bir kontrol sunucu tarafı görevlerin (yedekten geri yükleme gibi) kayıt
 * açmasını gereksiz yere engellerdi.
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
  select coalesce(max(substring(r.code from '^' || v_year::text || '-?([0-9]{1,9})$')::int), 0)
    into v_used
  from public.reservations r
  where r.business_id = p_business_id
    and r.code ~ ('^' || v_year::text || '-?[0-9]{1,9}$');

  insert into public.contract_series (business_id, year, last_number)
  values (p_business_id, v_year, greatest(1, v_used + 1))
  on conflict (business_id, year)
    do update set last_number =
      greatest(public.contract_series.last_number + 1, excluded.last_number)
  returning last_number into v_next;

  return v_year::text || '-' || v_next::text;
end;
$$;

revoke all on function public.next_contract_number(uuid) from public;
grant execute on function public.next_contract_number(uuid) to authenticated, service_role;
revoke all on function public.assign_contract_number(uuid) from public;
