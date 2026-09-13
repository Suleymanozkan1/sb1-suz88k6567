-- =====================================================================
-- Özel günler artık SAĞLAYICIDAN çekiliyor
--
-- 0034 yalnızca sabit tarihli resmî tatilleri tohumluyordu; bayram,
-- arife ve kandil tarihleri panelden elle giriliyordu. Elle giriş her
-- yıl tekrarlanan bir iş ve unutulduğunda takvim sessizce eksik kalıyor.
--
-- Artık bunları sunucudaki zamanlanmış görev çekiyor (api/ozel-gunler.ts).
-- Bu göç, o görevin yazabilmesi için gereken iki şeyi ekliyor:
--
--   1. Satırın NEREDEN geldiği (`source`) ve tarihin KESİNLEŞİP
--      kesinleşmediği (`tentative`).
--   2. Bir yılın ortak günlerini tek işlemde değiştiren fonksiyon.
--
-- İkincisi önemli: sağlayıcıdan gelen liste "o yılın tamamı" demek.
-- Satırlar tek tek eklenseydi, sağlayıcı bir tatili kaldırdığında ya da
-- adını değiştirdiğinde eski satır takvimde asılı kalırdı.
-- =====================================================================

-- ------------------------------------------------------ kaynak alanı
do $$ begin
  create type special_day_source as enum (
    /** Göç sırasında tohumlanan sabit tarihli tatiller (yedek). */
    'tohum',
    /** Zamanlanmış görevin sağlayıcıdan çektiği satır. */
    'saglayici',
    /** İşletmenin panelden girdiği gün. */
    'isletme'
  );
exception when duplicate_object then null; end $$;

alter table public.special_days
  add column if not exists source special_day_source not null default 'isletme';

/*
  Var olan ortak günler tohumdan geldi; işletmeye ait olanlar panelden.
  Varsayılan 'isletme' olduğu için ortak satırlar burada düzeltiliyor --
  düzeltilmezse sağlayıcı ilk çalıştığında onları silmez ve 1 Mayıs
  takvimde iki kez görünürdü ("Emek ve Dayanışma Günü" + "İşçi Bayramı").
*/
update public.special_days set source = 'tohum' where business_id is null;

comment on column public.special_days.source is
  'Satırın kaynağı. Ortak günleri (business_id null) yalnızca sunucu yazar.';

-- ------------------------------------------- tarih kesinleşti mi
/*
  Sağlayıcı uzak yılların dini bayram tarihlerini "kesinleşmemiş" olarak
  işaretliyor: hicri takvim ay gözlemine bağlı ve resmî ilan sonradan
  yapılıyor. Bu bilgi SAKLANMAZSA ekran, üç yıl sonraki bir bayramı bu
  yılınki kadar kesin gösterirdi ve o tarihe göre rezervasyon kapatılırdı.
*/
alter table public.special_days
  add column if not exists tentative boolean not null default false;

comment on column public.special_days.tentative is
  'Tarih henüz kesinleşmedi (uzak yıllardaki dini günler). Ekranda belirtilir.';

-- ------------------------------------------------------------ yazma
/*
  Sunucu ortak günleri yazabilmeli; istemci YAZAMAMALI. 0034 istemciye
  yalnızca kendi işletmesinin günlerini açıyordu, o kural duruyor.
*/
grant insert, update, delete on public.special_days to service_role;

/**
 * Bir yılın ORTAK günlerini tek işlemde değiştirir.
 *
 * Önce o yılın sunucu kaynaklı ortak satırları siliniyor, sonra yenisi
 * yazılıyor. İkisi aynı işlemde: sağlayıcı yarısına kadar okunup
 * hata verirse yıl yarım kalmaz, hiç değişmez.
 *
 * İŞLETMENİN KENDİ GÜNLERİNE DOKUNULMUYOR (`business_id is null`
 * koşulu) -- salonun elle girdiği "Ahmet Bey'in nişanı" kaydı bir kur
 * güncellemesinde silinemez.
 *
 * Boş liste gelirse HİÇBİR ŞEY YAPILMIYOR. Sağlayıcı boş cevap
 * döndürdüğünde (kesinti, kota) o yılın takvimi silinip boş kalırdı.
 */
create or replace function public.ozel_gunleri_yaz(p_yil integer, p_gunler jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_sayi integer;
begin
  if p_gunler is null or jsonb_array_length(p_gunler) = 0 then
    return 0;
  end if;

  delete from public.special_days
   where business_id is null
     and source in ('tohum', 'saglayici')
     and extract(year from day) = p_yil;

  insert into public.special_days (business_id, day, label, kind, source, tentative)
  select
    null,
    (g ->> 'day')::date,
    btrim(g ->> 'label'),
    (g ->> 'kind')::special_day_kind,
    'saglayici',
    coalesce((g ->> 'tentative')::boolean, false)
  from jsonb_array_elements(p_gunler) as g
  -- Aynı gün ve isim iki kez gelirse ikincisi atlanıyor; sağlayıcı
  -- listesinde tekrar olması bütün yazmayı düşürmemeli.
  on conflict (business_id, day, label) do nothing;

  get diagnostics v_sayi = row_count;
  return v_sayi;
end $$;

revoke all on function public.ozel_gunleri_yaz(integer, jsonb) from public;
grant execute on function public.ozel_gunleri_yaz(integer, jsonb) to service_role;
