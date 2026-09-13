-- =====================================================================
-- Ödeme değişiklikleri: geçmiş kaydı ve yönetici bildirimi
--
-- Maddeler 9-10. İki ayrı ihtiyaç, tek bir kaynaktan besleniyor:
--
--   payment_events            bir tahsilatta NE değişti, KİM değiştirdi
--   payment_alerts            hangi olayda mesaj gider, metni ne
--   payment_alert_recipients  mesaj kime gider
--
-- Olay kaydı UYGULAMADA DEĞİL TETİKLEYİCİDE yazılıyor. Uygulamaya
-- bırakılsaydı mobil, panel ve ileride eklenecek her istemci aynı kaydı
-- ayrı ayrı yazmak zorunda kalır, birinin unutması kaydı sessizce eksik
-- bırakırdı. Tetikleyici tahsilat tablosunun kendisine bağlı: satır hangi
-- yoldan değişirse değişsin olay yazılır.
--
-- SMS de aynı tetikleyiciden KUYRUĞA giriyor, doğrudan gönderilmiyor.
-- Gönderim sağlayıcıya bağlı ve başarısız olabilir; veritabanı işlemi
-- içinde denenirse ya tahsilat kaydı SMS yüzünden geri alınır ya da
-- mesaj sessizce kaybolur. Kuyruk ikisini de yapmıyor: kayıt hemen
-- düşüyor, gönderimi mevcut kuyruk işleyicisi üstleniyor.
--
-- Mesaj metinleri HARD-CODE DEĞİL: her olayın metni işletme bazında
-- düzenlenebiliyor (madde 10, "daha sonra birlikte seçilecek").
-- =====================================================================

-- ------------------------------------------------------- olay türleri
do $$ begin
  create type payment_event_kind as enum (
    'tahsilat_eklendi',
    'tutar_degisti',
    'tip_degisti',
    'tarih_degisti',
    'tahsilat_silindi',
    -- Çek ve senet kasaya girmez: tahsil edilmemiş bir vaattir. Bu olay
    -- "para henüz kasada değil" demektir, madde 9'daki uyarının dayanağı.
    'kasaya_girmedi'
  );
exception when duplicate_object then null; end $$;

-- --------------------------------------------------------- olay kaydı
create table if not exists public.payment_events (
  id             bigserial          primary key,
  business_id    uuid               not null references public.businesses (id) on delete cascade,
  reservation_id uuid               not null references public.reservations (id) on delete cascade,
  /*
    Ödemeye YABANCI ANAHTAR YOK. Bir tahsilat silindiğinde onu silen
    olayın da silinmesi, "bu para neden kayboldu" sorusunu cevapsız
    bırakırdı; geçmiş, sildiği kaydı hatırlamak zorunda.
  */
  payment_id     uuid,
  event          payment_event_kind not null,
  amount         numeric(12,2),
  old_amount     numeric(12,2),
  method         public.payment_method,
  old_method     public.payment_method,
  actor_email    text               not null default '',
  created_at     timestamptz        not null default now()
);

comment on table public.payment_events is
  'Tahsilatlarda rakam içeren değişikliklerin geçmişi. Tetikleyici yazar.';

create index if not exists payment_events_reservation_idx
  on public.payment_events (reservation_id, created_at desc);
create index if not exists payment_events_business_idx
  on public.payment_events (business_id, created_at desc);

-- ------------------------------------------------------- bildirim kuralı
create table if not exists public.payment_alerts (
  id          uuid               primary key default gen_random_uuid(),
  business_id uuid               not null references public.businesses (id) on delete cascade,
  event       payment_event_kind not null,
  enabled     boolean            not null default false,
  body        text               not null check (length(btrim(body)) between 1 and 400),
  created_at  timestamptz        not null default now(),
  updated_at  timestamptz        not null default now(),
  constraint payment_alerts_unique unique (business_id, event)
);

comment on table public.payment_alerts is
  'Hangi ödeme olayında yöneticiye mesaj gideceği ve metni. Metin düzenlenebilir.';

-- ------------------------------------------------------------- alıcılar
create table if not exists public.payment_alert_recipients (
  id          uuid        primary key default gen_random_uuid(),
  business_id uuid        not null references public.businesses (id) on delete cascade,
  name        text        not null check (btrim(name) <> ''),
  /*
    Numara serbest metin, kullanıcı hesabına bağlı DEĞİL. Bildirimi alacak
    kişi her zaman sistemde hesabı olan biri olmuyor: salon sahibinin
    ikinci hattı ya da dışarıdan çalışan muhasebeci de bu listeye girer.
  */
  phone       text        not null check (phone ~ '^5\d{9}$'),
  enabled     boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint payment_alert_recipients_unique unique (business_id, phone)
);

comment on column public.payment_alert_recipients.phone is
  'Normalize edilmiş cep numarası: 5XXXXXXXXX.';

create index if not exists payment_alert_recipients_business_idx
  on public.payment_alert_recipients (business_id);

drop trigger if exists payment_alerts_stamp on public.payment_alerts;
create trigger payment_alerts_stamp
  before update on public.payment_alerts
  for each row execute function public.stamp_lead_updated();

drop trigger if exists payment_alert_recipients_stamp on public.payment_alert_recipients;
create trigger payment_alert_recipients_stamp
  before update on public.payment_alert_recipients
  for each row execute function public.stamp_lead_updated();

-- =====================================================================
-- Varsayılan metinler
--
-- Hepsi KAPALI geliyor. Açık gelseydi sistemi yeni kuran bir salonun
-- yöneticisine, daha metni okumadan SMS gitmeye başlardı; SMS ücretli.
-- =====================================================================
create or replace function public.payment_alerts_tohumla(p_business uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.payment_alerts (business_id, event, enabled, body)
  values
    (p_business, 'tahsilat_eklendi',
     false, '{isletme}: {kod} sozlesmesine {tutar} tahsilat girildi ({tip}). Kalan: {kalan}. Islem: {kullanici}'),
    (p_business, 'tutar_degisti',
     false, '{isletme}: {kod} sozlesmesinde tahsilat {eski_tutar} -> {tutar} olarak degistirildi. Kalan: {kalan}. Islem: {kullanici}'),
    (p_business, 'tip_degisti',
     false, '{isletme}: {kod} sozlesmesinde {tutar} tahsilatin odeme tipi {eski_tip} -> {tip} oldu. Islem: {kullanici}'),
    (p_business, 'tarih_degisti',
     false, '{isletme}: {kod} sozlesmesinde {tutar} tahsilatin tarihi degistirildi. Islem: {kullanici}'),
    (p_business, 'tahsilat_silindi',
     false, '{isletme}: {kod} sozlesmesinden {tutar} tahsilat SILINDI. Kalan: {kalan}. Islem: {kullanici}'),
    (p_business, 'kasaya_girmedi',
     false, '{isletme}: {kod} sozlesmesinde {tutar} tahsilat {tip} olarak alindi, kasaya girmedi. Islem: {kullanici}')
  on conflict (business_id, event) do nothing;
$$;

create or replace function public.payment_alerts_yeni_isletme()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.payment_alerts_tohumla(NEW.id);
  return null;
end;
$$;

drop trigger if exists businesses_payment_alerts on public.businesses;
create trigger businesses_payment_alerts
  after insert on public.businesses
  for each row execute function public.payment_alerts_yeni_isletme();

-- Mevcut işletmeler için de kur.
do $$
declare r record;
begin
  for r in select id from public.businesses loop
    perform public.payment_alerts_tohumla(r.id);
  end loop;
end $$;

-- =====================================================================
-- Tahsilat tetikleyicisi: olayı yaz, gerekiyorsa mesajı kuyruğa al
-- =====================================================================
create or replace function public.payment_olay_yaz()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rez        record;
  v_actor      text := '';
  v_olaylar    payment_event_kind[] := '{}';
  v_olay       payment_event_kind;
  v_kural      record;
  v_alici      record;
  v_odenen     numeric(12,2);
  v_kalan      numeric(12,2);
  v_body       text;
  v_pid        uuid := coalesce((to_jsonb(NEW) ->> 'id')::uuid, (to_jsonb(OLD) ->> 'id')::uuid);
begin
  select r.id, r.business_id, r.code, r.total_amount, r.deposit, b.name as business_name
    into v_rez
  from public.reservations r
  join public.businesses b on b.id = r.business_id
  where r.id = coalesce(NEW.reservation_id, OLD.reservation_id);

  -- Rezervasyon zaten silinmişse (kaskad) olay yazacak bir bağlam yok.
  if v_rez.id is null then return coalesce(NEW, OLD); end if;

  select p.email into v_actor from public.profiles p where p.id = auth.uid();
  v_actor := coalesce(v_actor, '');

  /*
    Hangi olaylar oldu? Bir güncelleme birden çok olay üretebilir: tutar
    ve tip aynı anda değişmişse ikisi de yazılır. Tek bir "güncellendi"
    olayı yazmak, "neyin değiştiği" sorusunu cevapsız bırakırdı.
  */
  if TG_OP = 'INSERT' then
    v_olaylar := array['tahsilat_eklendi'::payment_event_kind];
    if NEW.method in ('Çek', 'Senet') then
      v_olaylar := v_olaylar || 'kasaya_girmedi'::payment_event_kind;
    end if;
  elsif TG_OP = 'UPDATE' then
    if NEW.amount is distinct from OLD.amount then
      v_olaylar := v_olaylar || 'tutar_degisti'::payment_event_kind;
    end if;
    if NEW.method is distinct from OLD.method then
      v_olaylar := v_olaylar || 'tip_degisti'::payment_event_kind;
      if NEW.method in ('Çek', 'Senet') then
        v_olaylar := v_olaylar || 'kasaya_girmedi'::payment_event_kind;
      end if;
    end if;
    if NEW.date is distinct from OLD.date then
      v_olaylar := v_olaylar || 'tarih_degisti'::payment_event_kind;
    end if;
  else
    v_olaylar := array['tahsilat_silindi'::payment_event_kind];
  end if;

  if array_length(v_olaylar, 1) is null then return coalesce(NEW, OLD); end if;

  -- Kalan bakiye olay ANINDAKİ hâliyle yazılıyor; mesaj gittiğinde
  -- yöneticinin göreceği rakam bu.
  select coalesce(sum(p.amount), 0) into v_odenen
  from public.payments p where p.reservation_id = v_rez.id;
  v_kalan := greatest(v_rez.total_amount - v_rez.deposit - v_odenen, 0);

  foreach v_olay in array v_olaylar loop
    insert into public.payment_events
      (business_id, reservation_id, payment_id, event,
       amount, old_amount, method, old_method, actor_email)
    values
      (v_rez.business_id, v_rez.id, v_pid, v_olay,
       case when TG_OP = 'DELETE' then OLD.amount else NEW.amount end,
       case when TG_OP = 'UPDATE' then OLD.amount else null end,
       case when TG_OP = 'DELETE' then OLD.method else NEW.method end,
       case when TG_OP = 'UPDATE' then OLD.method else null end,
       v_actor);

    select * into v_kural from public.payment_alerts
    where business_id = v_rez.business_id and event = v_olay and enabled;
    if not found then continue; end if;

    v_body := public.render_template(v_kural.body, jsonb_build_object(
      'isletme',    v_rez.business_name,
      'kod',        v_rez.code,
      -- Tutarlar 0012'deki tr_tutar ile yazılıyor: to_char'ın G ve D
      -- karakterleri veritabanı yereline bağlı ve sunucu yereli tr_TR
      -- olmayabilir; "15,000.00 TL" biçiminde bir mesaj okunmaz.
      'tutar',      public.tr_tutar(case when TG_OP = 'DELETE' then OLD.amount else NEW.amount end) || ' TL',
      'eski_tutar', case when TG_OP = 'UPDATE' then public.tr_tutar(OLD.amount) || ' TL' else '-' end,
      'tip',        coalesce((case when TG_OP = 'DELETE' then OLD.method else NEW.method end)::text, '-'),
      'eski_tip',   coalesce(OLD.method::text, '-'),
      'kalan',      public.tr_tutar(v_kalan) || ' TL',
      'kullanici',  coalesce(nullif(v_actor, ''), 'bilinmiyor')
    ));

    for v_alici in
      select phone from public.payment_alert_recipients
      where business_id = v_rez.business_id and enabled
    loop
      /*
        İşlem bildirimi: kendi personeline giden operasyonel uyarı ticari
        ileti değildir, İYS onayı aranmaz. Kuyruk kuralı yine de tek
        kapıdan geçiyor; muafiyeti burada değil enqueue_sms karar veriyor.
      */
      perform public.enqueue_sms(
        v_rez.business_id, v_alici.phone, v_body,
        'Bilgilendirme'::sms_kind, 'islem'::message_category, v_rez.id);
    end loop;
  end loop;

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists payments_olay on public.payments;
create trigger payments_olay
  after insert or update or delete on public.payments
  for each row execute function public.payment_olay_yaz();

-- ------------------------------------------------------------ RLS
alter table public.payment_events           enable row level security;
alter table public.payment_alerts           enable row level security;
alter table public.payment_alert_recipients enable row level security;

drop policy if exists payment_events_select on public.payment_events;
create policy payment_events_select on public.payment_events for select
  to authenticated using (public.owns_business(business_id));

drop policy if exists payment_alerts_all on public.payment_alerts;
create policy payment_alerts_all on public.payment_alerts for all
  to authenticated using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

drop policy if exists payment_alert_recipients_all on public.payment_alert_recipients;
create policy payment_alert_recipients_all on public.payment_alert_recipients for all
  to authenticated using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

/*
  Geçmiş DÜZELTİLEMEZ: yalnızca okuma yetkisi var. Yazma hakkı verilseydi
  "bu parayı kim değiştirdi" sorusunun cevabı da değiştirilebilirdi ve
  kayıt hiçbir işe yaramazdı. Satırları yalnızca tetikleyici yazıyor.
*/
grant select on public.payment_events to authenticated;
revoke insert, update, delete on public.payment_events from authenticated;

grant select, insert, update, delete on public.payment_alerts           to authenticated;
grant select, insert, update, delete on public.payment_alert_recipients to authenticated;

grant select on public.payment_events           to service_role;
grant select on public.payment_alerts           to service_role;
grant select on public.payment_alert_recipients to service_role;
