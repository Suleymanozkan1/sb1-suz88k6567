-- =====================================================================
-- Çelik kasa: giderin yönü kasadan ÇIKIŞ olmalı
--
-- 0016 yönü tamamen kullanıcının seçimine bırakıyordu. Bunun sonucu şuydu:
-- nakit ödenen 7.500 TL'lik bir maaş gideri "kasaya ekle" ile işlendiğinde
-- kasa 7.500 TL ARTIYORDU. Aynı satırı kasadan düşmek ise mümkün değildi;
-- ilk hareket olarak yalnızca giriş kabul ediliyordu.
--
-- Doğrusu, yönün satırın türünden gelmesi:
--   * Gelir  -> doğal yön GİRİŞ  (nakit tahsilat kasaya girer)
--   * Gider  -> doğal yön ÇIKIŞ  (nakit ödeme kasadan çıkar)
--
-- Ters yön hâlâ yazılabilir ama artık bir düzeltme/karşı hareket olarak:
-- kasadaki tahsilat bankaya yatırılır, kasadan ödenen gider iade alınır.
-- Her iki durumda da satırın kasadaki neti sıfıra döner ve satır yeniden
-- işlenebilir hâle gelir.
--
-- Tür, hareketin kaynağından okunuyor: rezervasyondan türeyen satırlar
-- (kapora / tahsilat) her zaman gelirdir; elle girilen satırların türü
-- cash_flow tablosunda yazılıdır. Kaynak bulunamazsa eski varsayım
-- (giriş) sürer; bu durumda satır zaten kasaya işlenemeyecek bir kayıttır
-- ve tutar/kaynak kısıtları devreye girer.
-- =====================================================================

create or replace function public.check_safe_movement()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_net   numeric;
  v_kind  public.cash_flow_kind;
  v_dogal public.safe_direction;
begin
  -- 1) Satırın doğal yönü
  if NEW.source_kind = 'reservation' then
    v_dogal := 'Giriş';
  else
    -- source_id metin tutulur; uuid olmayan bir değerde cast patlamasın.
    if NEW.source_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      select kind into v_kind from public.cash_flow where id = NEW.source_id::uuid;
    end if;
    v_dogal := case when v_kind = 'Gider' then 'Çıkış' else 'Giriş' end;
  end if;

  -- 2) Satırın kasadaki şu anki etkisi
  select coalesce(sum(case when direction = 'Giriş' then amount else -amount end), 0)
    into v_net
  from public.safe_movements
  where business_id = NEW.business_id
    and source_kind = NEW.source_kind
    and source_id   = NEW.source_id;

  -- 3) Net kuralı
  if NEW.direction = v_dogal then
    if v_net <> 0 then
      if v_dogal = 'Çıkış' then
        raise exception 'Bu gider çelik kasadan zaten düşülmüş; önce geri alın.'
          using errcode = 'DT001';
      else
        raise exception 'Bu kayıt zaten çelik kasada duruyor; önce kasadan çıkarın.'
          using errcode = 'DT001';
      end if;
    end if;
  else
    if (v_dogal = 'Giriş' and v_net <= 0) or (v_dogal = 'Çıkış' and v_net >= 0) then
      if v_dogal = 'Çıkış' then
        raise exception 'Bu gider çelik kasadan düşülmemiş; geri alınacak bir şey yok.'
          using errcode = 'DT001';
      else
        raise exception 'Bu kayıt çelik kasada değil; önce kasaya ekleyin.'
          using errcode = 'DT001';
      end if;
    end if;
    if NEW.amount > abs(v_net) then
      raise exception 'Çelik kasada o kayıt için duran tutardan fazlası işlenemez.'
        using errcode = 'DT001';
    end if;
  end if;

  -- 4) Sıra: sayı değil en büyük değer, aradan bir hareket silinse de eski
  -- bir sıra yeniden doğmasın.
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
