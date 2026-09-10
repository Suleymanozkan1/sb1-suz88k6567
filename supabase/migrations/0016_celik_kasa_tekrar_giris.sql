-- =====================================================================
-- Çelik kasa: aynı satır kasaya tekrar girip çıkabilsin
--
-- 0015'teki kural yanlıştı: bir gelir/gider satırı kasaya "en çok bir kez
-- girer, en çok bir kez çıkar" varsayılmıştı. Gerçekte para kasaya girer,
-- bankaya yatırılınca çıkar, ertesi gün yine kasaya konabilir. Eski
-- benzersizlik kısıtı bu döngüyü ikinci turda kilitliyordu: bir kez ekleyip
-- çıkardıktan sonra aynı satır bir daha kasaya eklenemiyordu.
--
-- Yeni kural satırın YÖNÜNE değil NETİNE bakar:
--   * Giriş, ancak satırın kasadaki neti sıfırken yazılabilir.
--   * Çıkış, ancak net sıfırdan büyükken ve neti aşmayan tutarla yazılabilir.
--
-- Çift sayım koruması kaybolmuyor: iki kez tıklandığında ikinci giriş neti
-- sıfırdan büyük bulur ve reddedilir. Aynı anda gelen iki isteğin ikisi de
-- neti sıfır görebileceği için ayrıca (yön, sıra) benzersizliği duruyor;
-- sıra sunucuda üretiliyor, iki eşzamanlı giriş aynı sırayı ister ve biri
-- düşer.
-- =====================================================================

alter table public.safe_movements
  drop constraint if exists safe_movements_source_direction_unique;

alter table public.safe_movements
  add column if not exists seq integer not null default 0;

comment on column public.safe_movements.seq is
  'Aynı satırın aynı yöndeki kaçıncı hareketi. Sunucuda üretilir; eşzamanlı iki isteğin çift sayılmasını engeller.';

create unique index if not exists safe_movements_source_direction_seq_unique
  on public.safe_movements (business_id, source_kind, source_id, direction, seq);

-- Hareketin sırasını üretir ve net kuralını uygular.
create or replace function public.check_safe_movement()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_net numeric;
begin
  select coalesce(sum(case when direction = 'Giriş' then amount else -amount end), 0)
    into v_net
  from public.safe_movements
  where business_id = NEW.business_id
    and source_kind = NEW.source_kind
    and source_id   = NEW.source_id;

  if NEW.direction = 'Giriş' then
    if v_net > 0 then
      raise exception 'Bu kayıt zaten çelik kasada duruyor; önce kasadan çıkarın.'
        using errcode = 'DT001';
    end if;
  else
    if v_net <= 0 then
      raise exception 'Bu kayıt çelik kasada değil; önce kasaya ekleyin.'
        using errcode = 'DT001';
    end if;
    if NEW.amount > v_net then
      raise exception 'Çelik kasadan, o kayıt için kasaya giren tutardan fazlası çıkarılamaz.'
        using errcode = 'DT001';
    end if;
  end if;

  -- Sayı değil en büyük sıra: aradan bir hareket silinse de eski bir sıra
  -- yeniden üretilmesin.
  select coalesce(max(seq), -1) + 1
    into NEW.seq
  from public.safe_movements
  where business_id = NEW.business_id
    and source_kind = NEW.source_kind
    and source_id   = NEW.source_id
    and direction   = NEW.direction;

  return NEW;
end;
$$;

drop trigger if exists safe_movements_check on public.safe_movements;
create trigger safe_movements_check
  before insert on public.safe_movements
  for each row execute function public.check_safe_movement();
