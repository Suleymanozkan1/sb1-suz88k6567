-- =====================================================================
-- Bildirim kanalı: yönetici uyarıları WhatsApp'tan da gidebilsin
--
-- NEDEN. Yöneticiye giden ödeme uyarıları bugün SMS ile gidiyor. SMS
-- telefonda kalıcı duruyor ama yönetici bu kayıtların WhatsApp'ta
-- birikmesini istiyor: aynı sohbette, aranabilir, masaüstünden de
-- okunabilir.
--
-- İKİNCİ BİR KUYRUK KURULMUYOR. Kanal, mevcut `sms_queue` satırının bir
-- alanı. Böylece yeniden deneme, üstel geri çekilme, günlük tavan ve
-- kuyruk ekranı olduğu gibi çalışmaya devam ediyor. Ayrı bir tablo
-- açılsaydı bunların hepsi ikinci kez yazılırdı ve ikisi zamanla
-- birbirinden ayrışırdı.
--
-- TABLO ADI `sms_queue` KALIYOR. Adı artık dar geliyor ama tabloyu
-- yeniden adlandırmak depo katmanını, sorguları, ekranları ve testleri
-- tek bir kozmetik kazanç için elden geçirmek demekti.
--
-- SMS YEDEKTE. WhatsApp oturumu kapalıysa ya da gönderim düşerse aynı
-- satır SMS'e düşüyor: bildirim kaybolmuyor. Hangi kanaldan gittiği
-- `sent_channel` alanında duruyor, "gitti mi, nereden gitti" sorusu
-- kayıttan cevaplanabiliyor.
-- =====================================================================

do $$ begin
  create type message_channel as enum ('sms', 'whatsapp');
exception when duplicate_object then null; end $$;

alter table public.sms_queue
  add column if not exists channel message_channel not null default 'sms';
alter table public.sms_queue
  add column if not exists sent_channel message_channel;

comment on column public.sms_queue.channel is
  'İstenen kanal. WhatsApp düşerse gönderim SMS''e düşer.';
comment on column public.sms_queue.sent_channel is
  'Gerçekte hangi kanaldan gitti. Yedeğe düşüldüğünde channel ile farklı olur.';

alter table public.payment_alert_recipients
  add column if not exists channel message_channel not null default 'sms';

comment on column public.payment_alert_recipients.channel is
  'Bu alıcıya bildirim hangi kanaldan denenecek.';

-- ---------------------------------------------------------------------
-- enqueue_sms: kanal parametresi
--
-- Eski altı parametreli sürüm DÜŞÜRÜLÜYOR, yanına eklenmiyor. Varsayılan
-- değerli yedinci parametre eklenseydi altı argümanlı bir çağrı iki
-- imzaya birden uyar ve PostgreSQL "function is not unique" derdi.
-- ---------------------------------------------------------------------
drop function if exists public.enqueue_sms(uuid, text, text, sms_kind, message_category, uuid);

create or replace function public.enqueue_sms(
  p_business_id uuid,
  p_phone text,
  p_body text,
  p_kind sms_kind,
  p_category message_category,
  p_reservation_id uuid default null,
  p_channel message_channel default 'sms'
) returns table (queued boolean, reason text, queue_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     uuid;
  v_phone  text := regexp_replace(p_phone, '\D', '', 'g');
  v_daily  integer;
begin
  v_phone := regexp_replace(v_phone, '^90', '');
  v_phone := regexp_replace(v_phone, '^0', '');
  if v_phone !~ '^5\d{9}$' then
    return query select false, 'Geçersiz cep telefonu numarası.'::text, null::uuid;
    return;
  end if;

  /*
    Ticari iletide İYS kuralı KANALDAN BAĞIMSIZ. WhatsApp'tan gitmesi
    mesajı ticari ileti olmaktan çıkarmıyor; onay yoksa yine engelleniyor.
  */
  if p_category = 'ticari' then
    if public.has_opted_out(p_business_id, v_phone) then
      insert into public.sms_queue
        (business_id, phone, body, kind, category, status, last_error, reservation_id, channel)
      values (p_business_id, v_phone, p_body, p_kind, p_category, 'iptal',
              'Alıcı ticari ileti almayı reddetmiş (İYS: RET).', p_reservation_id, p_channel)
      returning id into v_id;
      return query select false, 'Alıcı ticari ileti almayı reddetmiş.'::text, v_id;
      return;
    end if;

    if not public.can_send_commercial(p_business_id, v_phone) then
      insert into public.sms_queue
        (business_id, phone, body, kind, category, status, last_error, reservation_id, channel)
      values (p_business_id, v_phone, p_body, p_kind, p_category, 'iptal',
              'İYS onayı bulunmuyor.', p_reservation_id, p_channel)
      returning id into v_id;
      return query select false, 'Bu numara için İYS onayı bulunmuyor.'::text, v_id;
      return;
    end if;
  end if;

  -- Günlük gönderim tavanı kanaldan bağımsız: hatalı bir döngü
  -- WhatsApp'tan da aynı hızla mesaj yağdırabilir ve o numara banlanır.
  select count(*) into v_daily
  from public.sms_queue q
  where q.business_id = p_business_id
    and q.created_at > now() - interval '1 day'
    and q.status <> 'iptal';

  if v_daily >= 500 then
    insert into public.sms_queue
      (business_id, phone, body, kind, category, status, last_error, reservation_id, channel)
    values (p_business_id, v_phone, p_body, p_kind, p_category, 'iptal',
            'Günlük gönderim sınırına ulaşıldı.', p_reservation_id, p_channel)
    returning id into v_id;
    return query select false, 'Günlük gönderim sınırına ulaşıldı.'::text, v_id;
    return;
  end if;

  insert into public.sms_queue
    (business_id, phone, body, kind, category, reservation_id, channel)
  values (p_business_id, v_phone, p_body, p_kind, p_category, p_reservation_id, p_channel)
  returning id into v_id;

  return query select true, null::text, v_id;
end;
$$;

revoke all on function
  public.enqueue_sms(uuid, text, text, sms_kind, message_category, uuid, message_channel)
  from public;
grant execute on function
  public.enqueue_sms(uuid, text, text, sms_kind, message_category, uuid, message_channel)
  to authenticated, service_role;

-- ---------------------------------------------------------------------
-- complete_sms: hangi kanaldan gittiğini de yaz
-- ---------------------------------------------------------------------
drop function if exists public.complete_sms(uuid, boolean, text, text);

create or replace function public.complete_sms(
  p_id uuid,
  p_success boolean,
  p_error text default null,
  p_ref text default null,
  p_channel message_channel default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempts integer;
  v_max      integer;
  v_delay    interval;
begin
  select attempts, max_attempts into v_attempts, v_max
  from public.sms_queue where id = p_id;

  if p_success then
    update public.sms_queue
       set status = 'gonderildi', sent_at = now(), provider_ref = p_ref,
           last_error = null, sent_channel = coalesce(p_channel, channel)
     where id = p_id;
    return;
  end if;

  if v_attempts >= v_max then
    update public.sms_queue
       set status = 'basarisiz', last_error = p_error
     where id = p_id;
    return;
  end if;

  v_delay := case v_attempts
    when 1 then interval '1 minute'
    when 2 then interval '5 minutes'
    when 3 then interval '15 minutes'
    when 4 then interval '1 hour'
    else interval '4 hours'
  end;

  update public.sms_queue
     set status = 'bekliyor', next_attempt_at = now() + v_delay, last_error = p_error
   where id = p_id;
end;
$$;

revoke all on function public.complete_sms(uuid, boolean, text, text, message_channel) from public;
grant execute on function public.complete_sms(uuid, boolean, text, text, message_channel)
  to service_role;


-- ---------------------------------------------------------------------
-- payment_olay_yaz: alıcının kanalını kuyruğa geçir
--
-- 0026'daki gövdenin aynısı; tek fark alıcı satırından `channel` da
-- okunuyor ve `enqueue_sms`'in yeni parametresine veriliyor. Fonksiyonun
-- yeniden yazılmasının sebebi `enqueue_sms` imzasının değişmesi.
-- ---------------------------------------------------------------------
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
      select phone, channel from public.payment_alert_recipients
      where business_id = v_rez.business_id and enabled
    loop
      /*
        İşlem bildirimi: kendi personeline giden operasyonel uyarı ticari
        ileti değildir, İYS onayı aranmaz. Kuyruk kuralı yine de tek
        kapıdan geçiyor; muafiyeti burada değil enqueue_sms karar veriyor.
      */
      perform public.enqueue_sms(
        v_rez.business_id, v_alici.phone, v_body,
        'Bilgilendirme'::sms_kind, 'islem'::message_category, v_rez.id,
        v_alici.channel);
    end loop;
  end loop;

  return coalesce(NEW, OLD);
end;
$$;
