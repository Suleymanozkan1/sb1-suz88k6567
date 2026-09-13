-- =====================================================================
-- Hata bildirimi (madde 32)
--
-- Kullanıcı ekranın sağ alt köşesindeki düğmeye basıp ne olduğunu
-- yazıyor; kim, ne zaman ve HANGİ SAYFADA olduğu kendiliğinden
-- kaydediliyor. Bunlar elle sorulsaydı çoğu bildirim "çalışmıyor" diye
-- gelir ve hiçbiri incelenemezdi.
--
-- Kayıt DÜZELTİLEMEZ ve SİLİNEMEZ: bildirimi alan kişi, canını sıkan bir
-- kaydı kaldırabilseydi bildirim sistemi kimseyi korumazdı.
-- =====================================================================

/**
 * Oturum açan kullanıcının e-postası.
 *
 * Kolon varsayılanında alt sorgu kullanılamıyor; sarmalayıcı fonksiyon
 * aynı işi görüyor ve değerin istemciden gelmemesini sağlıyor.
 */
create or replace function public.oturum_epostasi()
returns text
language sql
stable
security definer
set search_path = public
as $$ select coalesce((select p.email from public.profiles p where p.id = auth.uid()), ''); $$;

revoke all on function public.oturum_epostasi() from public;
grant execute on function public.oturum_epostasi() to authenticated;

create table if not exists public.error_reports (
  id          bigserial   primary key,
  /*
    İşletmeye bağlı ama ZORUNLU DEĞİL: hata işletme seçilemeden de
    olabilir (giriş sonrası boş ekran gibi) ve tam o durumda bildirim
    daha da gerekli.
  */
  business_id uuid        references public.businesses (id) on delete set null,
  /*
    Kapsam ve kullanıcı İSTEMCİDEN GELMİYOR, varsayılanla sunucuda
    doldruluyor: formdan gönderilebilseydi bildirim başkasının adına
    yazılabilirdi.
  */
  owner_id    uuid        not null default public.owner_scope()
                          references public.profiles (id) on delete cascade,
  actor_email text        not null default public.oturum_epostasi(),
  /** Kullanıcının bulunduğu sayfa: "/panel/kasa". */
  path        text        not null default '',
  message     text        not null check (length(btrim(message)) between 1 and 2000),
  /** Tarayıcı bilgisi; aynı hatanın tek bir cihazda olup olmadığını ayırır. */
  user_agent  text        not null default '',
  created_at  timestamptz not null default now()
);

comment on table public.error_reports is
  'Kullanıcının bildirdiği hatalar. Kullanıcı, sayfa ve zaman otomatik yazılır.';

create index if not exists error_reports_owner_idx
  on public.error_reports (owner_id, created_at desc);

alter table public.error_reports enable row level security;

/*
  Herkes kendi kapsamındaki bildirimleri OKUYABİLİR ve yeni bildirim
  yazabilir; düzeltemez, silemez.
*/
drop policy if exists error_reports_select on public.error_reports;
create policy error_reports_select on public.error_reports for select
  to authenticated using (owner_id = public.owner_scope());

drop policy if exists error_reports_insert on public.error_reports;
create policy error_reports_insert on public.error_reports for insert
  to authenticated with check (owner_id = public.owner_scope());

grant select, insert on public.error_reports to authenticated;
grant usage, select on sequence public.error_reports_id_seq to authenticated;
revoke update, delete on public.error_reports from authenticated;
grant select on public.error_reports to service_role;

-- =====================================================================
-- Ekran kilidi süresi (madde 27)
--
-- İşletme başına ayar: aynı salonun bütün ekranları aynı sürede
-- kilitlenmeli. Kullanıcı başına olsaydı, ortak kullanılan resepsiyon
-- bilgisayarında kimin oturumu açıksa o sürenin geçerli olması gerekirdi.
--
-- 0 = kilit kapalı.
-- =====================================================================
alter table public.businesses
  add column if not exists lock_seconds integer not null default 120
    check (lock_seconds = 0 or lock_seconds between 30 and 3600);

comment on column public.businesses.lock_seconds is
  'İşlem yapılmadığında ekranın kilitleneceği saniye. 0 = kapalı (madde 27).';
