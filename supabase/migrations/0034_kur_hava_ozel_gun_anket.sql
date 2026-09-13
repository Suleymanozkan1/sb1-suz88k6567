-- =====================================================================
-- Döviz/altın, hava durumu, özel günler ve deneyim anketi
-- (maddeler 28, 29, 30, 31)
--
-- Dört ayrı özellik, tek bir ortak karar: DIŞ SERVİSTEN GELEN HİÇBİR VERİ
-- UYDURULMUYOR. Sağlayıcı tanımlı değilse ya da cevap vermiyorsa ekranda
-- "veri yok" yazıyor; tahmini bir kur ya da hava durumu gösterilmiyor.
-- Salon sahibi o rakama bakıp fiyat belirliyor.
-- =====================================================================

-- =====================================================================
-- Döviz ve altın (madde 28)
--
-- Kur SUNUCUDA çekilip önbelleğe yazılıyor. Tarayıcıdan çekilseydi API
-- anahtarı istemciye inerdi (şartname: "API anahtarlarını frontend'e
-- koyma") ve her açılan sekme sağlayıcıya ayrı istek atardı.
-- =====================================================================
create table if not exists public.exchange_rates (
  code       text        primary key check (code in ('USD', 'EUR', 'GRAM_ALTIN', 'CEYREK_ALTIN')),
  buy        numeric(12,4) not null check (buy >= 0),
  sell       numeric(12,4) not null check (sell >= 0),
  /** Sağlayıcının verdiği zaman; bizim çektiğimiz an değil. */
  quoted_at  timestamptz not null,
  fetched_at timestamptz not null default now()
);

comment on table public.exchange_rates is
  'Döviz ve altın kurları. Sunucu tarafından doldurulur, istemci yalnızca okur.';

alter table public.exchange_rates enable row level security;

drop policy if exists exchange_rates_select on public.exchange_rates;
create policy exchange_rates_select on public.exchange_rates for select
  to authenticated using (true);

/*
  Kur herkese aynı: işletmeye bağlı değil. Yazma yalnızca sunucuda;
  istemci yazabilseydi ekrandaki kur kullanıcıdan kullanıcıya değişirdi.
*/
grant select on public.exchange_rates to authenticated;
revoke insert, update, delete on public.exchange_rates from authenticated;
grant select, insert, update on public.exchange_rates to service_role;

-- =====================================================================
-- Hava durumu (madde 29)
--
-- Organizasyon gününün tahmini. Uzak tarihlerde sağlayıcı tahmin
-- vermiyor; o zaman SATIR HİÇ YAZILMIYOR ve ekran "Tahmin henüz mevcut
-- değil" diyor. Boş bir satır yazılsaydı "0 derece" gibi bir rakam
-- görünürdü.
-- =====================================================================
create table if not exists public.weather_forecasts (
  id          bigserial   primary key,
  business_id uuid        not null references public.businesses (id) on delete cascade,
  /** Tahminin ait olduğu gün. */
  day         date        not null,
  min_c       numeric(5,1),
  max_c       numeric(5,1),
  /*
    O ANKİ sıcaklık. Yalnızca BUGÜNÜN satırında dolu olur: "şu an kaç
    derece" sorusunun yarınki tahminde karşılığı yok. Ayrı bir tabloya
    konmadı, çünkü tek bir satır ve aynı çekimden geliyor.
  */
  current_c   numeric(5,1),
  summary     text        not null default '',
  icon        text        not null default '',
  fetched_at  timestamptz not null default now(),
  constraint weather_forecasts_unique unique (business_id, day)
);

create index if not exists weather_forecasts_day_idx
  on public.weather_forecasts (business_id, day);

alter table public.weather_forecasts enable row level security;

drop policy if exists weather_forecasts_select on public.weather_forecasts;
create policy weather_forecasts_select on public.weather_forecasts for select
  to authenticated using (public.owns_business(business_id));

grant select on public.weather_forecasts to authenticated;
revoke insert, update, delete on public.weather_forecasts from authenticated;
grant select, insert, update, delete on public.weather_forecasts to service_role;

-- İşletmenin konumu: tahmin bunun için çekiliyor.
alter table public.businesses
  add column if not exists weather_location text not null default '';

comment on column public.businesses.weather_location is
  'Hava durumu sağlayıcısındaki konum anahtarı. Boşsa tahmin çekilmez.';

-- =====================================================================
-- Özel günler (madde 30)
--
-- Bayram, arife, resmî tatil, kandil, okul açılış/kapanış.
--
-- SABİT TARİHLİ RESMÎ TATİLLER tohumlanıyor: günleri her yıl aynı ve
-- kesin. DİNİ GÜNLER VE OKUL TARİHLERİ TOHUMLANMIYOR -- ilki Diyanet'in
-- yıllık takvimine, ikincisi MEB'in kararına bağlı. Hesaplanmış bir
-- hicri tarih gerçeğinden bir gün sapabilir; o günü tatil sanıp salonu
-- kapatmak ya da açmak salona zarar verir. Bu satırlar panelden
-- giriliyor.
-- =====================================================================
do $$ begin
  create type special_day_kind as enum (
    'resmi_tatil', 'dini_bayram', 'arife', 'kandil', 'okul', 'ozel'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.special_days (
  id          uuid             primary key default gen_random_uuid(),
  /*
    İşletmeye bağlı DEĞİL (null) olabilir: resmî tatiller herkes için
    aynı. İşletme kendi özel günlerini ekleyebilsin diye alan var.
  */
  business_id uuid             references public.businesses (id) on delete cascade,
  day         date             not null,
  label       text             not null check (btrim(label) <> ''),
  kind        special_day_kind not null default 'ozel',
  created_at  timestamptz      not null default now(),
  /*
    `nulls not distinct` ŞART: ortak günlerde business_id null ve
    PostgreSQL varsayılanı iki null'ı farklı sayar. Varsayılanla
    bırakılsaydı tohumlama her çalıştığında aynı resmî tatil yeniden
    eklenir, takvimde "Cumhuriyet Bayramı" üst üste birkaç kez
    görünürdü -- üstelik `on conflict` sessizce hiçbir şeyi
    engellemeden.
  */
  constraint special_days_unique unique nulls not distinct (business_id, day, label)
);

create index if not exists special_days_day_idx on public.special_days (day);

alter table public.special_days enable row level security;

/*
  Ortak günler (business_id null) herkese görünür; işletmeye ait olanlar
  yalnızca o işletmeye.
*/
drop policy if exists special_days_select on public.special_days;
create policy special_days_select on public.special_days for select
  to authenticated using (business_id is null or public.owns_business(business_id));

drop policy if exists special_days_write on public.special_days;
create policy special_days_write on public.special_days for all
  to authenticated using (
    business_id is not null
    and public.has_permission('ayarlar.duzenle') and public.owns_business(business_id))
  with check (
    business_id is not null
    and public.has_permission('ayarlar.duzenle') and public.owns_business(business_id));

grant select, insert, update, delete on public.special_days to authenticated;
grant select on public.special_days to service_role;

/**
 * Sabit tarihli resmî tatiller.
 *
 * Yalnızca günü her yıl değişmeyenler: 1 Ocak, 23 Nisan, 1 Mayıs,
 * 19 Mayıs, 15 Temmuz, 30 Ağustos, 29 Ekim ve 28 Ekim yarım günü.
 * Dini günler burada YOK -- hicri takvime bağlılar ve hesaplanmış bir
 * tarih gerçeğinden bir gün sapabilir.
 */
create or replace function public.resmi_tatilleri_tohumla(p_yil integer)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.special_days (business_id, day, label, kind)
  values
    (null, make_date(p_yil,  1,  1), 'Yılbaşı',                        'resmi_tatil'),
    (null, make_date(p_yil,  4, 23), 'Ulusal Egemenlik ve Çocuk Bayramı', 'resmi_tatil'),
    (null, make_date(p_yil,  5,  1), 'Emek ve Dayanışma Günü',         'resmi_tatil'),
    (null, make_date(p_yil,  5, 19), 'Atatürk''ü Anma, Gençlik ve Spor Bayramı', 'resmi_tatil'),
    (null, make_date(p_yil,  7, 15), 'Demokrasi ve Millî Birlik Günü', 'resmi_tatil'),
    (null, make_date(p_yil,  8, 30), 'Zafer Bayramı',                  'resmi_tatil'),
    (null, make_date(p_yil, 10, 28), 'Cumhuriyet Bayramı arifesi',     'arife'),
    (null, make_date(p_yil, 10, 29), 'Cumhuriyet Bayramı',             'resmi_tatil')
  on conflict (business_id, day, label) do nothing;
$$;

-- İçinde bulunulan yıl ve sonraki üç yıl.
do $$
declare v_yil integer := extract(year from current_date)::int;
begin
  for i in 0..3 loop
    perform public.resmi_tatilleri_tohumla(v_yil + i);
  end loop;
end $$;

-- =====================================================================
-- Deneyim anketi (madde 31)
--
-- Organizasyondan bir hafta sonra çifte e-posta gidiyor; cevaplar 1-5
-- puanla kaydediliyor.
--
-- Anket bağlantısı ANKET KAYDINA bağlı bir jetonla açılıyor: müşterinin
-- sisteme girişi yok ve rezervasyon kimliğiyle açılan bir bağlantı,
-- kimliği tahmin eden herkese başka çiftin anketini açardı.
-- =====================================================================
create table if not exists public.surveys (
  id             uuid        primary key default gen_random_uuid(),
  business_id    uuid        not null references public.businesses (id) on delete cascade,
  reservation_id uuid        not null references public.reservations (id) on delete cascade,
  /** Bağlantıdaki gizli anahtar. Tahmin edilemez olmalı. */
  token          text        not null unique default encode(gen_random_bytes(24), 'hex'),
  sent_at        timestamptz,
  answered_at    timestamptz,
  /** 1-5 arası puanlar; soru anahtarı -> puan. */
  scores         jsonb,
  comment        text        not null default '',
  created_at     timestamptz not null default now(),
  constraint surveys_reservation_unique unique (reservation_id)
);

create index if not exists surveys_business_idx
  on public.surveys (business_id, created_at desc);

alter table public.surveys enable row level security;

drop policy if exists surveys_select on public.surveys;
create policy surveys_select on public.surveys for select
  to authenticated using (
    public.has_permission('rapor.goruntule') and public.owns_business(business_id));

grant select on public.surveys to authenticated;
revoke insert, update, delete on public.surveys from authenticated;
grant select, insert, update on public.surveys to service_role;

-- Anket sonuçlarının bildirileceği adres (şartname: Ayarlar bölümünden).
alter table public.businesses
  add column if not exists survey_email text not null default '';

comment on column public.businesses.survey_email is
  'Anket sonuçlarının bildirileceği yönetici adresi (madde 31).';
