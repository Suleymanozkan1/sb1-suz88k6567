-- =====================================================================
-- İYS uyumu ve SMS gönderim kuyruğu
--
-- YASAL ÇERÇEVE (kaynak: 6563 sayılı Kanun ve İYS uygulaması)
--   Ticari ileti  : kampanya, indirim, tanıtım, pazarlama  -> İYS ONAYI ŞART
--   İşlem bildirimi: rezervasyon onayı, randevu hatırlatma,
--                    doğrulama kodu, borç/ödeme bildirimi  -> MUAF
--
--   Alınan yeni onaylar 3 iş günü içinde İYS'ye aktarılmalıdır.
--   Ret talebi en geç 3 iş günü içinde uygulanmalıdır.
--
-- NOT: Bu ayrım mevzuatın genel uygulamasına dayanır. Kendi mesaj
-- metinlerinizin sınıflandırmasını hukuk danışmanınızla teyit ediniz.
-- =====================================================================

do $$ begin
  create type message_category as enum ('islem', 'ticari');
exception when duplicate_object then null; end $$;

do $$ begin
  create type consent_status as enum ('ONAY', 'RET');
exception when duplicate_object then null; end $$;

do $$ begin
  create type queue_status as enum ('bekliyor', 'gonderiliyor', 'gonderildi', 'basarisiz', 'iptal');
exception when duplicate_object then null; end $$;

-- --------------------------------------------------------- izinler
create table if not exists public.sms_consents (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid           not null references public.businesses (id) on delete cascade,
  phone        text           not null check (phone ~ '^5\d{9}$'),
  status       consent_status not null,
  -- İYS kaynak kodları: HS_WEB, HS_FIZIKSEL_ORTAM, HS_ISLAK_IMZA, HS_MOBIL,
  -- HS_CAGRI_MERKEZI, HS_EPOSTA, HS_SMS
  source       text           not null default 'HS_FIZIKSEL_ORTAM',
  consent_date timestamptz    not null default now(),
  -- İYS'ye aktarım durumu (3 iş günü yükümlülüğünün takibi)
  iys_synced_at timestamptz,
  iys_error    text,
  note         text,
  created_at   timestamptz    not null default now(),
  updated_at   timestamptz    not null default now(),
  constraint sms_consents_unique unique (business_id, phone)
);
create index if not exists sms_consents_phone_idx on public.sms_consents (business_id, phone);
-- İYS'ye henüz aktarılmamış onaylar
create index if not exists sms_consents_pending_sync_idx
  on public.sms_consents (business_id, consent_date)
  where iys_synced_at is null;

-- İzin geçmişi: İYS kayıtlarının ispat yükümlülüğü için değiştirilemez
create table if not exists public.sms_consent_history (
  id          bigserial      primary key,
  business_id uuid           not null,
  phone       text           not null,
  status      consent_status not null,
  source      text           not null,
  changed_by  uuid,
  changed_at  timestamptz    not null default now()
);
create index if not exists sms_consent_history_idx
  on public.sms_consent_history (business_id, phone, changed_at desc);

create or replace function public.log_consent_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'UPDATE' and OLD.status = NEW.status and OLD.source = NEW.source then
    return NEW;
  end if;
  insert into public.sms_consent_history (business_id, phone, status, source, changed_by)
  values (NEW.business_id, NEW.phone, NEW.status, NEW.source, auth.uid());
  return NEW;
end;
$$;

drop trigger if exists log_sms_consent on public.sms_consents;
create trigger log_sms_consent after insert or update on public.sms_consents
  for each row execute function public.log_consent_change();

drop trigger if exists touch_sms_consents on public.sms_consents;
create trigger touch_sms_consents before update on public.sms_consents
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------- kuyruk
create table if not exists public.sms_queue (
  id            uuid             primary key default gen_random_uuid(),
  business_id   uuid             not null references public.businesses (id) on delete cascade,
  phone         text             not null check (phone ~ '^5\d{9}$'),
  body          text             not null check (length(btrim(body)) between 1 and 900),
  kind          sms_kind         not null default 'Bilgilendirme',
  category      message_category not null,
  status        queue_status     not null default 'bekliyor',
  attempts      integer          not null default 0 check (attempts >= 0),
  max_attempts  integer          not null default 5,
  next_attempt_at timestamptz    not null default now(),
  last_error    text,
  provider_ref  text,
  reservation_id uuid            references public.reservations (id) on delete set null,
  created_at    timestamptz      not null default now(),
  sent_at       timestamptz
);
-- İşleyicinin sıradaki işi bulması için
create index if not exists sms_queue_pending_idx
  on public.sms_queue (next_attempt_at)
  where status in ('bekliyor', 'gonderiliyor');
create index if not exists sms_queue_business_idx
  on public.sms_queue (business_id, created_at desc);

-- =====================================================================
-- Kurallar
-- =====================================================================

/**
 * Ticari ileti gönderilebilir mi?
 * Yalnızca geçerli ONAY kaydı varsa true döner.
 * İşlem bildirimleri bu kontrole tabi değildir (muaf).
 */
create or replace function public.can_send_commercial(p_business_id uuid, p_phone text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.sms_consents c
    where c.business_id = p_business_id
      and c.phone = p_phone
      and c.status = 'ONAY'
  );
$$;

/** Bir numaranın ret kaydı var mı? */
create or replace function public.has_opted_out(p_business_id uuid, p_phone text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.sms_consents c
    where c.business_id = p_business_id and c.phone = p_phone and c.status = 'RET'
  );
$$;

/**
 * Mesajı kuyruğa alır.
 *
 * Ticari iletide İYS onayı yoksa kayıt 'iptal' olarak yazılır — sessizce
 * atılmaz, böylece neden gönderilmediği denetlenebilir kalır.
 * İşlem bildirimleri muaftır ve her zaman kuyruğa girer.
 */
create or replace function public.enqueue_sms(
  p_business_id uuid,
  p_phone text,
  p_body text,
  p_kind sms_kind,
  p_category message_category,
  p_reservation_id uuid default null
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
  -- Numarayı normalize et (90/0 ön ekleri temizlenir)
  v_phone := regexp_replace(v_phone, '^90', '');
  v_phone := regexp_replace(v_phone, '^0', '');
  if v_phone !~ '^5\d{9}$' then
    return query select false, 'Geçersiz cep telefonu numarası.'::text, null::uuid;
    return;
  end if;

  -- Ret kaydı her tür mesajı engellemez: işlem bildirimleri yasal olarak
  -- muaftır. Ancak ticari iletide ret mutlak engeldir.
  if p_category = 'ticari' then
    if public.has_opted_out(p_business_id, v_phone) then
      insert into public.sms_queue
        (business_id, phone, body, kind, category, status, last_error, reservation_id)
      values (p_business_id, v_phone, p_body, p_kind, p_category, 'iptal',
              'Alıcı ticari ileti almayı reddetmiş (İYS: RET).', p_reservation_id)
      returning id into v_id;
      return query select false, 'Alıcı ticari ileti almayı reddetmiş.'::text, v_id;
      return;
    end if;

    if not public.can_send_commercial(p_business_id, v_phone) then
      insert into public.sms_queue
        (business_id, phone, body, kind, category, status, last_error, reservation_id)
      values (p_business_id, v_phone, p_body, p_kind, p_category, 'iptal',
              'İYS onayı bulunmuyor.', p_reservation_id)
      returning id into v_id;
      return query select false, 'Bu numara için İYS onayı bulunmuyor.'::text, v_id;
      return;
    end if;
  end if;

  -- Günlük gönderim tavanı: hatalı döngülerin faturayı şişirmesini önler
  select count(*) into v_daily
  from public.sms_queue q
  where q.business_id = p_business_id
    and q.created_at > now() - interval '1 day'
    and q.status <> 'iptal';

  if v_daily >= 500 then
    return query select false, 'Günlük SMS gönderim sınırına ulaşıldı.'::text, null::uuid;
    return;
  end if;

  insert into public.sms_queue
    (business_id, phone, body, kind, category, reservation_id)
  values (p_business_id, v_phone, p_body, p_kind, p_category, p_reservation_id)
  returning id into v_id;

  return query select true, null::text, v_id;
end;
$$;

/**
 * İşleyicinin alacağı sıradaki mesajları kilitleyerek döndürür.
 * FOR UPDATE SKIP LOCKED sayesinde birden fazla işleyici çakışmaz.
 */
create or replace function public.claim_sms_batch(p_limit integer default 20)
returns setof public.sms_queue
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select q.id from public.sms_queue q
    where q.status = 'bekliyor' and q.next_attempt_at <= now()
    order by q.next_attempt_at
    limit p_limit
    for update skip locked
  )
  update public.sms_queue q
     set status = 'gonderiliyor', attempts = q.attempts + 1
   where q.id in (select id from picked)
  returning q.*;
end;
$$;

/**
 * Gönderim sonucunu işler.
 * Başarısızlıkta üstel geri çekilme ile yeniden denenir:
 * 1dk, 5dk, 15dk, 1sa, 4sa — ardından kalıcı başarısız.
 */
create or replace function public.complete_sms(
  p_id uuid, p_success boolean, p_error text default null, p_ref text default null
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
       set status = 'gonderildi', sent_at = now(), provider_ref = p_ref, last_error = null
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

/** Takılı kalmış ('gonderiliyor' durumunda unutulmuş) kayıtları kurtarır. */
create or replace function public.requeue_stuck_sms()
returns integer
language sql
security definer
set search_path = public
as $$
  with fixed as (
    update public.sms_queue
       set status = 'bekliyor', next_attempt_at = now()
     where status = 'gonderiliyor' and created_at < now() - interval '15 minutes'
    returning 1
  )
  select count(*)::int from fixed;
$$;

-- =====================================================================
-- Satır bazlı güvenlik
-- =====================================================================
alter table public.sms_consents        enable row level security;
alter table public.sms_consent_history enable row level security;
alter table public.sms_queue           enable row level security;

drop policy if exists sms_consents_all on public.sms_consents;
create policy sms_consents_all on public.sms_consents for all
  to authenticated
  using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

drop policy if exists sms_consent_history_select on public.sms_consent_history;
create policy sms_consent_history_select on public.sms_consent_history for select
  to authenticated
  using (public.owns_business(business_id));

drop policy if exists sms_queue_select on public.sms_queue;
create policy sms_queue_select on public.sms_queue for select
  to authenticated
  using (public.owns_business(business_id));

-- Kuyruğa yazma yalnızca enqueue_sms üzerinden yapılır; doğrudan
-- INSERT/UPDATE istemciye kapalıdır (kural atlatılamasın diye).
revoke insert, update, delete on public.sms_queue from anon, authenticated;
revoke insert, update, delete on public.sms_consent_history from anon, authenticated;

-- İşleyici fonksiyonları yalnızca sunucu tarafında çalışır.
revoke all on function public.claim_sms_batch(integer) from public;
revoke all on function public.complete_sms(uuid, boolean, text, text) from public;
revoke all on function public.requeue_stuck_sms() from public;
grant execute on function public.claim_sms_batch(integer) to service_role;
grant execute on function public.complete_sms(uuid, boolean, text, text) to service_role;
grant execute on function public.requeue_stuck_sms() to service_role;

-- Kuyruğa alma hem panelden hem sunucudan çağrılır.
revoke all on function public.enqueue_sms(uuid, text, text, sms_kind, message_category, uuid) from public;
grant execute on function public.enqueue_sms(uuid, text, text, sms_kind, message_category, uuid)
  to authenticated, service_role;

revoke all on function public.can_send_commercial(uuid, text) from public;
revoke all on function public.has_opted_out(uuid, text) from public;
grant execute on function public.can_send_commercial(uuid, text) to authenticated, service_role;
grant execute on function public.has_opted_out(uuid, text) to authenticated, service_role;

-- Denetim kaydı izin tablosunu da tanımalı: kapsam çözümüne sms_consents eklenir.
create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner    uuid;
  v_actor    uuid := auth.uid();
  v_email    text;
  v_changed  jsonb := '{}'::jsonb;
  v_summary  text;
  v_record   text;
  v_old      jsonb;
  v_new      jsonb;
  v_key      text;
begin
  v_old := case when TG_OP = 'INSERT' then '{}'::jsonb else to_jsonb(OLD) end;
  v_new := case when TG_OP = 'DELETE' then '{}'::jsonb else to_jsonb(NEW) end;

  if TG_TABLE_NAME = 'businesses' then
    v_owner  := coalesce((v_new ->> 'owner_id')::uuid, (v_old ->> 'owner_id')::uuid);
    v_record := coalesce(v_new ->> 'id', v_old ->> 'id');
    v_summary := coalesce(v_new ->> 'name', v_old ->> 'name');
  elsif TG_TABLE_NAME in ('reservations', 'cash_flow', 'sms_consents') then
    select b.owner_id into v_owner from public.businesses b
    where b.id = coalesce((v_new ->> 'business_id')::uuid, (v_old ->> 'business_id')::uuid);
    v_record := coalesce(v_new ->> 'id', v_old ->> 'id');
    v_summary := coalesce(
      v_new ->> 'customer_name', v_old ->> 'customer_name',
      v_new ->> 'phone', v_old ->> 'phone',
      v_new ->> 'category', v_old ->> 'category');
  elsif TG_TABLE_NAME = 'payments' then
    select b.owner_id into v_owner
    from public.reservations r join public.businesses b on b.id = r.business_id
    where r.id = coalesce((v_new ->> 'reservation_id')::uuid, (v_old ->> 'reservation_id')::uuid);
    v_record := coalesce(v_new ->> 'id', v_old ->> 'id');
    v_summary := coalesce(v_new ->> 'amount', v_old ->> 'amount') || ' tahsilat';
  elsif TG_TABLE_NAME = 'profiles' then
    v_owner  := coalesce((v_new ->> 'owner_id')::uuid, (v_old ->> 'owner_id')::uuid,
                         (v_new ->> 'id')::uuid, (v_old ->> 'id')::uuid);
    v_record := coalesce(v_new ->> 'id', v_old ->> 'id');
    v_summary := coalesce(v_new ->> 'full_name', v_old ->> 'full_name');
  end if;

  if TG_OP = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key in ('updated_at', 'created_at') then continue; end if;
      if (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_changed := v_changed || jsonb_build_object(
          v_key, jsonb_build_object('eski', v_old -> v_key, 'yeni', v_new -> v_key));
      end if;
    end loop;
    if v_changed = '{}'::jsonb then return coalesce(NEW, OLD); end if;
  end if;

  select p.email into v_email from public.profiles p where p.id = v_actor;

  insert into public.audit_log
    (owner_id, actor_id, actor_email, action, table_name, record_id, summary, changed)
  values
    (v_owner, v_actor, v_email, TG_OP, TG_TABLE_NAME, v_record, v_summary, nullif(v_changed, '{}'::jsonb));

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists audit_sms_consents on public.sms_consents;
create trigger audit_sms_consents after insert or update or delete on public.sms_consents
  for each row execute function public.write_audit_log();
