-- =====================================================================
-- Sözleşme numarası düğünün yapılacağı yıla göre (madde 13)
--
-- Şimdiye kadar numara SÖZLEŞMENİN AÇILDIĞI yıla göre veriliyordu: 2026
-- Eylül'ünde satılan bir 2027 düğünü "2026-41" oluyordu. Salon o dosyayı
-- 2027 klasöründe arıyor ve bulamıyordu.
--
-- Artık esas alınan tarih ORGANİZASYON GÜNÜ: 2027'de yapılacak ilk düğün
-- 2027-1, ikincisi 2027-2.
--
-- MEVCUT NUMARALAR DEĞİŞMİYOR. Yeniden numaralandırmak, imzalanmış
-- sözleşmelerdeki numarayı sistemdekinden farklı hâle getirirdi; o kâğıt
-- artık hiçbir kayda karşılık gelmezdi.
-- =====================================================================

/**
 * Sıradaki sözleşme numarası.
 *
 * Yıl parametreden geliyor, current_date'ten değil: numarayı belirleyen
 * şey düğünün günü. Tarih verilmezse (eski çağrılar) bugüne düşüyor.
 */
create or replace function public.assign_contract_number(
  p_business_id uuid,
  p_date        date default current_date
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer := extract(year from coalesce(p_date, current_date))::int;
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

create or replace function public.fill_reservation_code()
returns trigger
language plpgsql
as $$
begin
  /*
    Güncellemede numara HİÇ DEĞİŞMİYOR; tarih değişse bile. İmzalanmış
    sözleşmenin numarası, tarihi bir gün kaydırıldığı için değişemez.
  */
  if TG_OP = 'UPDATE' then
    if NEW.code is null or btrim(NEW.code) = '' then
      NEW.code := OLD.code;
    end if;
    return NEW;
  end if;

  if NEW.code is null or btrim(NEW.code) = '' then
    NEW.code := public.assign_contract_number(NEW.business_id, NEW.date);
  end if;
  return NEW;
end;
$$;

drop trigger if exists reservations_fill_code on public.reservations;
create trigger reservations_fill_code
  before insert or update on public.reservations
  for each row execute function public.fill_reservation_code();

-- Eski tek parametreli sürüm düşüyor: iki imza yan yana dururken hangisinin
-- çağrıldığı okunmuyor ve tarih sessizce bugüne düşerdi.
drop function if exists public.assign_contract_number(uuid);

revoke all on function public.assign_contract_number(uuid, date) from public;
grant execute on function public.assign_contract_number(uuid, date)
  to authenticated, service_role;
