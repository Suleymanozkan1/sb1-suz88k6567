/*
  Bir rezervasyona birden fazla menü / paket bağlanabilsin.

  NEDEN. Sözleşmeye çoğu zaman tek bir menü girmiyor: kına için ayrı,
  düğün için ayrı bir paket anlaşılıyor; üstüne "Kokteyl Menü" gibi bir
  ek satın alınıyor. Tek sütun olduğu için bunlardan yalnızca biri
  kayda giriyor, gerisi not alanına yazılıyordu -- yani fiyat
  önerisine, rapora ve sözleşmeye hiç yansımıyordu.

  DÖNÜŞÜM, YENİ ALAN DEĞİL. `menu_id` silinip yerine `menu_ids`
  geliyor ve mevcut değerler tek elemanlı diziye taşınıyor. İkisi
  birlikte bırakılsaydı hangisinin doğru olduğu -- özellikle biri
  güncellenip öteki unutulduğunda -- bilinemezdi.

  DİZİ, BAĞLANTI TABLOSU DEĞİL. `services` alanı da aynı biçimde
  `text[]`: menü seçiminin sırası ve tekrarı önemli değil, üzerinde
  sorgu yapılmıyor, yalnızca okunup gösteriliyor. Bağlantı tablosu
  aynı işi iki tablo ve bir birleştirmeyle yapardı.
*/

alter table public.reservations
  add column if not exists menu_ids text[] not null default '{}'::text[];

-- Mevcut tek menüler diziye taşınıyor; boş olanlar boş dizi kalıyor.
update public.reservations
   set menu_ids = array[menu_id::text]
 where menu_id is not null
   and menu_ids = '{}'::text[];


comment on column public.reservations.menu_ids is
  'Sözleşmeye dahil menü/paket kimlikleri. Tutar önerisi hepsinin toplamı.';

/*
  TETİKLEYİCİ ÖNCE DÖNÜŞTÜRÜLÜYOR.

  `reservations_scope` tetikleyicisi `update of ... menu_id ...` diye
  sütuna ADIYLA bağlı; PostgreSQL bu bağımlılığı takip ediyor ve sütunu
  düşürmeye çalışmak "cannot drop column menu_id because other objects
  depend on it" hatası veriyor. Yani tetikleyici burada yenilenmezse
  yukarıdaki `drop column` göçü tamamen durduruyor.

  Fonksiyon gövdesi de `new.menu_id` okuyordu. Gövdeler bağımlılık
  olarak izlenmediği için bu hata vermez, ÇALIŞMA ANINDA patlardı --
  yani ilk rezervasyon kaydında.

  Denetim korunuyor, kapsamı genişliyor: artık dizideki menülerin
  HEPSİ işletmeye ait olmalı. Yalnızca ilki denetlenseydi ikinci
  sıraya konan yabancı paket veritabanına sızardı.
*/
create or replace function public.check_reservation_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_only uuid;
  v_count integer;
begin
  -- Salon verilmediyse: işletmenin tek salonu varsa o seçilir. Birden çok
  -- salonda hangisine yazılacağı belirsizdir; tahmin etmek yerine reddedilir.
  if new.hall_id is null then
    select count(*) into v_count from public.halls where business_id = new.business_id;
    select id into v_only from public.halls
      where business_id = new.business_id order by created_at limit 1;

    if v_count = 1 then
      new.hall_id := v_only;
    else
      raise exception 'Rezervasyon için salon seçilmelidir.' using errcode = 'check_violation';
    end if;
  end if;

  if not exists (
    select 1 from public.halls h
    where h.id = new.hall_id and h.business_id = new.business_id
  ) then
    raise exception 'Salon bu işletmeye ait değil.' using errcode = 'check_violation';
  end if;

  /*
    Dizideki her kimlik bu işletmenin menüsü olmalı. `except` ile
    yazıldı: tek bir sorgu, dizide kaç eleman olursa olsun.
  */
  if new.menu_ids is not null and array_length(new.menu_ids, 1) > 0 and exists (
    select 1
      from unnest(new.menu_ids) as istenen(id)
     where not exists (
       select 1 from public.menus m
        where m.id::text = istenen.id and m.business_id = new.business_id
     )
  ) then
    raise exception 'Menü bu işletmeye ait değil.' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists reservations_scope on public.reservations;
create trigger reservations_scope
  before insert or update of hall_id, menu_ids, business_id on public.reservations
  for each row execute function public.check_reservation_scope();

/*
  SÜTUN EN SON DÜŞÜYOR. Tetikleyici artık `menu_ids`'e bağlı olduğuna
  göre `menu_id` üzerinde bağımlılık kalmadı ve düşürülebilir. Sıra
  ters olsaydı bu göç hiç tamamlanmazdı.
*/
alter table public.reservations drop column if exists menu_id;
