-- =====================================================================
-- Hava durumu: AccuWeather yerine Meteoroloji Genel Müdürlüğü
--
-- AccuWeather'ın ücretsiz katmanı hem kotalıydı hem de anahtar
-- istiyordu. MGM'nin kendi servisi (servis.mgm.gov.tr) anahtarsız ve
-- ücretsiz; veri de resmî kaynaktan geliyor.
--
-- İKİ DEĞİŞİKLİK:
--
-- 1. KONUM ARTIK ELLE GİRİLMİYOR. Önce işletmeye AccuWeather'ın konum
--    anahtarı elle yazılıyordu; salon sahibinin sağlayıcının sitesine
--    girip anahtar araması gerekiyordu. Artık işletmenin il/ilçesinden
--    MGM istasyonu BULUNUYOR ve `weather_station` alanına yazılıyor.
--    Yeni bir işletme açıldığında alan boş kalır, ilk çekimde dolar.
--
-- 2. SAATLİK TAHMİN EKLENDİ. Günlük tahmin günde bir kez, saatlik
--    tahmin saatte bir çekiliyor: "düğün saatinde yağmur var mı"
--    sorusunun cevabı gün ortalamasında yok.
--
-- `weather_location` DÜŞÜRÜLMÜYOR. İçinde eski AccuWeather anahtarları
-- var; kolonu silmek, geri dönmek gerekirse o anahtarları da silmek
-- olurdu. Kullanılmıyor, boşta duruyor.
-- =====================================================================

/*
  ÜÇ AYRI İSTASYON NUMARASI. MGM günlük tahmin, saatlik tahmin ve anlık
  gözlem için farklı numaralar veriyor: Konya/Meram kaydında günlük
  94201, saatlik ve son durum 17245. Tek numara saklansaydı saatlik
  tahmin boş dönerdi -- gerçek servis yanıtıyla doğrulandı.
*/
alter table public.businesses
  add column if not exists weather_station         text not null default '',
  add column if not exists weather_station_hourly  text not null default '',
  add column if not exists weather_station_current text not null default '';

comment on column public.businesses.weather_station is
  'MGM günlük tahmin istasyonu (gunlukTahminIstNo). Boşsa ilk çekimde il/ilçeden bulunur.';
comment on column public.businesses.weather_station_hourly is
  'MGM saatlik tahmin istasyonu (saatlikTahminIstNo). Günlükten farklı olabilir.';
comment on column public.businesses.weather_station_current is
  'MGM anlık gözlem istasyonu (sondurumIstNo).';
comment on column public.businesses.weather_location is
  'KULLANILMIYOR (0038). Eski AccuWeather konum anahtarı.';

-- --------------------------------------------------------------- nem/rüzgâr
-- Günlük tahmine nem ve rüzgâr eklendi: açık havada 35 derece ile
-- %80 nemli 30 derece, salonun klima planı açısından aynı gün değil.
alter table public.weather_forecasts
  add column if not exists humidity      integer,
  add column if not exists wind_kmh      numeric(5,1),
  /* MGM hadise kodu (A, PB, HY...). Okunur adı istemcide üretiliyor. */
  add column if not exists hadise        text not null default '';

-- --------------------------------------------------------- weather_hourly
create table if not exists public.weather_hourly (
  id          bigserial   primary key,
  business_id uuid        not null references public.businesses (id) on delete cascade,
  /*
    Tahminin ait olduğu saat, YEREL saat olarak metin (yyyy-mm-ddTHH:00).
    timestamptz yazılsaydı sunucunun saat diliminde kayar ve "düğün
    saati 19:00'da yağmur" bilgisi 16:00'ya düşerdi; MGM zaten yerel
    saat veriyor.
  */
  hour        text        not null check (hour ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'),
  temp_c      numeric(5,1),
  feels_c     numeric(5,1),
  humidity    integer,
  wind_kmh    numeric(5,1),
  hadise      text        not null default '',
  fetched_at  timestamptz not null default now(),
  constraint weather_hourly_unique unique (business_id, hour)
);

create index if not exists weather_hourly_idx
  on public.weather_hourly (business_id, hour);

alter table public.weather_hourly enable row level security;

/*
  Okuma tanım yetkisine bağlı (0036 ile aynı desen): hava durumu
  takvimde ve rezervasyon kartında görünüyor, ikisi de tanım
  ekranlarıyla aynı kapsamda.

  YAZMA hiç kimseye açık değil: satırları yalnızca zamanlanmış görev
  yazar (service_role, RLS'i atlar). Personelin hava tahminini elle
  değiştirebilmesinin bir anlamı yok.
*/
drop policy if exists weather_hourly_select on public.weather_hourly;
create policy weather_hourly_select on public.weather_hourly for select
  to authenticated using (
    public.has_permission('tanim.goruntule') and public.owns_business(business_id));

grant select on public.weather_hourly to authenticated;
grant select, insert, update, delete on public.weather_hourly to service_role;

/**
 * Geçmiş saatlik tahminleri siler.
 *
 * Saatlik veri saatte bir yazılıyor; temizlenmeseydi tablo yılda
 * yaklaşık 9 bin satır/işletme büyür ve hiçbir işe yaramayan geçmiş
 * saatleri taşırdı. Dünden öncesi atılıyor: bugünün tamamı dursun ki
 * "sabah ne oldu" da görülebilsin.
 */
create or replace function public.saatlik_havayi_temizle()
returns integer language plpgsql security definer set search_path = public as $$
declare v_sayi integer;
begin
  delete from public.weather_hourly
  where hour < to_char(current_date - 1, 'YYYY-MM-DD') || 'T00:00';
  get diagnostics v_sayi = row_count;
  return v_sayi;
end $$;

revoke all on function public.saatlik_havayi_temizle() from public;
grant execute on function public.saatlik_havayi_temizle() to service_role;
