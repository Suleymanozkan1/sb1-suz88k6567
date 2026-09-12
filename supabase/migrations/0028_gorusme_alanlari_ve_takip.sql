-- =====================================================================
-- Görüşme alanları, otomatik takip ve dönüşüm raporu
--
-- Maddeler 16-19. Müşteri adayı tablosu genişletiliyor; yeni bir
-- "görüşmeler" tablosu AÇILMIYOR. Açılsaydı aynı müşteri hem adaylar
-- hem görüşmeler listesinde durur, hangisinin güncel olduğu belirsiz
-- kalırdı. Bir aday zaten bir görüşmedir.
--
-- Süreç (madde 17) zaten 0023'teki düzenlenebilir durumlarla kurulu;
-- burada yeniden tanımlanmıyor. Eklenen tek şey otomatik takibin hangi
-- durumda kaç gün sonra tetikleneceği.
-- =====================================================================

alter table public.customer_leads
  -- Düşünülen salon. Zorunlu değil: ilk görüşmede henüz belli olmuyor
  -- ve boş bırakmak, uydurma bir salon seçmekten iyidir.
  add column if not exists hall_id uuid references public.halls (id) on delete set null,
  add column if not exists offer_amount numeric(12,2) check (offer_amount is null or offer_amount >= 0),
  add column if not exists offer_valid_until date,
  /*
    Opsiyon tarihi: müşteriye "bu tarihe kadar tutuyoruz" denen gün.
    Geçtiğinde salon başkasına satılabilir; ekranda uyarı buna bakıyor.
  */
  add column if not exists option_date date,
  -- Görüşmenin YAPILDIĞI gün. Kaydın açıldığı günden farklı olabilir:
  -- hafta sonu gelen müşteri pazartesi sisteme girilir.
  add column if not exists meeting_date date;

comment on column public.customer_leads.hall_id is
  'Müşterinin düşündüğü salon. Kesinleşmiş rezervasyon değildir.';
comment on column public.customer_leads.option_date is
  'Salonun müşteri için tutulduğu son gün.';

create index if not exists customer_leads_option_idx
  on public.customer_leads (business_id, option_date)
  where option_date is not null;

-- =====================================================================
-- Otomatik takip (madde 18)
--
-- "Teklif verildikten 7 gün sonra arama hatırlatması" kuralı KODA
-- GÖMÜLMÜYOR: gün sayısı duruma bağlı bir ayar. Salonun teklif takip
-- ritmi değiştiğinde yeni sürüm gerekmesin.
-- =====================================================================
alter table public.lead_statuses
  add column if not exists followup_days integer not null default 0
    check (followup_days between 0 and 365);

comment on column public.lead_statuses.followup_days is
  'Bu duruma geçince kaç gün sonra takip hatırlatması kurulacağı. 0 = kurulmaz.';

-- Mevcut işletmelerde teklif durumlarına varsayılan 7 gün (madde 18).
update public.lead_statuses set followup_days = 7
where tone = 'teklif' and followup_days = 0;

/*
  Tohumlama 0023'ten geliyor ve yeni alanı bilmiyordu: bu göçten SONRA
  açılan işletmeler takip günü sıfır alıyordu, yani madde 18 yalnızca
  eski salonlarda çalışıyordu. Fonksiyon burada yeniden tanımlanıyor.
*/
create or replace function public.lead_statuses_tohumla(p_business uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.lead_statuses
    (business_id, code, label, sort_order, tone, followup_days, is_initial, is_closed, is_won)
  values
    (p_business, 'yeni',                 'Yeni',                 10, 'bekleyen',  0, true,  false, false),
    (p_business, 'aranacak',             'Aranacak',             20, 'bekleyen',  0, false, false, false),
    (p_business, 'arandi',               'Arandı',               30, 'ilerleyen', 0, false, false, false),
    (p_business, 'ulasilamadi',          'Ulaşılamadı',          40, 'dikkat',    0, false, false, false),
    (p_business, 'tekrar_aranacak',      'Tekrar Aranacak',      50, 'bekleyen',  0, false, false, false),
    (p_business, 'tekrar_arandi',        'Tekrar Arandı',        60, 'ilerleyen', 0, false, false, false),
    (p_business, 'iletisim_kuruldu',     'İletişim Kuruldu',     70, 'olumlu',    0, false, false, false),
    -- Teklif verildikten 7 gün sonra arama hatırlatması (madde 18).
    (p_business, 'teklif_verildi',       'Teklif Verildi',       80, 'teklif',    7, false, false, false),
    (p_business, 'rezervasyon_bekliyor', 'Rezervasyon Bekliyor', 90, 'teklif',    7, false, false, false),
    (p_business, 'rezervasyona_dondu',   'Rezervasyona Döndü',  100, 'olumlu',    0, false, true,  true),
    (p_business, 'olumsuz',              'Olumsuz',             110, 'kapali',    0, false, true,  false),
    (p_business, 'iptal',                'İptal',               120, 'kapali',    0, false, true,  false)
  on conflict (business_id, code) do nothing;
$$;

/**
 * Durum değişince takip tarihini kurar.
 *
 * Var olan tarihin ÜZERİNE YAZMIYOR: personel elle bir gün belirlediyse
 * onu silmek, üzerinde anlaşılmış bir randevuyu iptal etmek olurdu.
 * Yalnızca boşsa ya da geçmişte kalmışsa dolduruluyor.
 */
create or replace function public.lead_takip_kur()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gun integer;
begin
  if TG_OP = 'UPDATE' and NEW.status is not distinct from OLD.status then
    return NEW;
  end if;

  select followup_days into v_gun from public.lead_statuses
  where business_id = NEW.business_id and code = NEW.status;

  if coalesce(v_gun, 0) = 0 then return NEW; end if;

  if NEW.next_followup_at is null or NEW.next_followup_at < current_date then
    NEW.next_followup_at := current_date + v_gun;
  end if;

  return NEW;
end;
$$;

drop trigger if exists customer_leads_takip on public.customer_leads;
create trigger customer_leads_takip
  before insert or update on public.customer_leads
  for each row execute function public.lead_takip_kur();

-- =====================================================================
-- Dönüşüm raporu (madde 19)
--
-- Rapor VERİTABANINDA hesaplanıyor: aynı sayım panel, mobil ve aylık
-- e-posta raporunda üç kez yazılsaydı biri diğerini tutmazdı.
--
-- "Görüşme" ile "gelen kişi" ayrı sayılıyor: her kayıt bir görüşmedir,
-- ama salona GELEN kişi yüz yüze görüşülendir (meeting_date dolu).
-- İkisi tek sayıda toplanınca dönüşüm oranı anlamsız çıkıyordu.
-- =====================================================================
create or replace function public.gorusme_raporu(
  p_business uuid,
  p_from date default null,
  p_to   date default null
) returns table (
  ay            text,
  kayit         integer,
  gelen         integer,
  teklif        integer,
  rezervasyon   integer,
  olumsuz       integer
)
language sql
stable
security definer
set search_path = public
as $$
  with kapsam as (
    select l.*,
           to_char(coalesce(l.meeting_date, l.created_at::date), 'YYYY-MM') as ay_kodu
    from public.customer_leads l
    where l.business_id = p_business
      and (p_from is null or coalesce(l.meeting_date, l.created_at::date) >= p_from)
      and (p_to   is null or coalesce(l.meeting_date, l.created_at::date) <= p_to)
  )
  select
    k.ay_kodu,
    count(*)::integer,
    count(*) filter (where k.meeting_date is not null)::integer,
    -- Teklif verilmiş sayılmanın ölçüsü RAKAM: durumu ilerlemiş ama
    -- fiyat konuşulmamış bir müşteri teklif sayılırsa oran şişerdi.
    count(*) filter (where k.offer_amount is not null and k.offer_amount > 0)::integer,
    count(*) filter (where k.reservation_id is not null)::integer,
    count(*) filter (where exists (
      select 1 from public.lead_statuses s
      where s.business_id = k.business_id and s.code = k.status
        and s.is_closed and not s.is_won
    ))::integer
  from kapsam k
  group by k.ay_kodu
  order by k.ay_kodu;
$$;

comment on function public.gorusme_raporu(uuid, date, date) is
  'Aylık görüşme ve dönüşüm sayıları. Dönüşüm oranı çağıran tarafta hesaplanır.';

revoke all on function public.gorusme_raporu(uuid, date, date) from public;
grant execute on function public.gorusme_raporu(uuid, date, date) to authenticated;
