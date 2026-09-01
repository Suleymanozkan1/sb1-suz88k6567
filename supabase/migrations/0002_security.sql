-- =====================================================================
-- Güvenlik sertleştirme
--   1) Hız sınırı  — uç noktalara aşırı istek engeli
--   2) Giriş kilidi — art arda başarısız denemede geçici kilit
--   3) Denetim kaydı — kim, neyi, ne zaman değiştirdi
--
-- Bu tabloların tamamına yalnızca sunucu tarafı (service_role) yazar;
-- denetim kaydını ilgili yönetici okuyabilir.
-- =====================================================================

-- ------------------------------------------------------- 1) hız sınırı
create table if not exists public.rate_limits (
  bucket      text        not null,   -- ör. 'sms', 'otp', 'login'
  identifier  text        not null,   -- IP veya e-posta/telefon özeti
  window_start timestamptz not null,
  hits        integer     not null default 0,
  primary key (bucket, identifier, window_start)
);
create index if not exists rate_limits_window_idx on public.rate_limits (window_start);

/**
 * Sabit pencereli hız sınırı.
 * Sınır aşılmadıysa sayacı artırır ve true döner; aşıldıysa false döner.
 */
create or replace function public.check_rate_limit(
  p_bucket text,
  p_identifier text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_hits   integer;
begin
  -- Pencere başlangıcını sabitler (ör. 60 sn'lik dilimler)
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits (bucket, identifier, window_start, hits)
  values (p_bucket, p_identifier, v_window, 1)
  on conflict (bucket, identifier, window_start)
    do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;

  return v_hits <= p_limit;
end;
$$;

/** Eski pencereleri temizler (zamanlanmış görev ya da elle çağrılır). */
create or replace function public.prune_rate_limits()
returns integer
language sql
security definer
set search_path = public
as $$
  with removed as (
    delete from public.rate_limits where window_start < now() - interval '1 day' returning 1
  )
  select count(*)::int from removed;
$$;

-- ----------------------------------------------------- 2) giriş kilidi
create table if not exists public.login_attempts (
  id           bigserial primary key,
  email        text        not null,
  ip           text,
  succeeded    boolean     not null,
  attempted_at timestamptz not null default now()
);
create index if not exists login_attempts_email_idx
  on public.login_attempts (lower(email), attempted_at desc);

-- Kilit eşikleri
--   5 başarısız deneme / 15 dakika  -> 15 dakika kilit
create or replace function public.login_lock_status(p_email text)
returns table (locked boolean, failed_count integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window   interval := interval '15 minutes';
  v_max      integer  := 5;
  v_failed   integer;
  v_last     timestamptz;
begin
  select count(*), max(attempted_at)
    into v_failed, v_last
  from public.login_attempts a
  where lower(a.email) = lower(btrim(p_email))
    and a.succeeded = false
    and a.attempted_at > now() - v_window;

  if v_failed >= v_max then
    return query select
      true,
      v_failed,
      greatest(0, ceil(extract(epoch from (v_last + v_window - now())))::int);
  else
    return query select false, coalesce(v_failed, 0), 0;
  end if;
end;
$$;

/** Giriş denemesini kaydeder; başarılıysa önceki başarısızlıkları temizler. */
create or replace function public.record_login_attempt(
  p_email text, p_ip text, p_succeeded boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.login_attempts (email, ip, succeeded)
  values (btrim(p_email), p_ip, p_succeeded);

  if p_succeeded then
    delete from public.login_attempts
    where lower(email) = lower(btrim(p_email)) and succeeded = false;
  end if;

  -- 30 günden eski kayıtları tut, gerisini temizle
  delete from public.login_attempts where attempted_at < now() - interval '30 days';
end;
$$;

-- ---------------------------------------------------- 3) denetim kaydı
create table if not exists public.audit_log (
  id          bigserial   primary key,
  owner_id    uuid,                       -- kaydın ait olduğu yönetici kapsamı
  actor_id    uuid,                       -- işlemi yapan kullanıcı
  actor_email text,
  action      text        not null check (action in ('INSERT','UPDATE','DELETE')),
  table_name  text        not null,
  record_id   text,
  summary     text,                       -- insanın okuyabileceği özet
  changed     jsonb,                      -- değişen alanlar (eski -> yeni)
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_owner_idx on public.audit_log (owner_id, created_at desc);

/**
 * Denetim tetikleyicisi.
 * Yalnızca gerçekten değişen alanları kaydeder; şifre benzeri hassas
 * alanlar hiçbir zaman yazılmaz.
 */
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

  -- Kapsam: kayıt bir işletmeye bağlıysa işletmenin sahibi
  if TG_TABLE_NAME = 'businesses' then
    v_owner  := coalesce((v_new ->> 'owner_id')::uuid, (v_old ->> 'owner_id')::uuid);
    v_record := coalesce(v_new ->> 'id', v_old ->> 'id');
    v_summary := coalesce(v_new ->> 'name', v_old ->> 'name');
  elsif TG_TABLE_NAME in ('reservations', 'cash_flow') then
    select b.owner_id into v_owner from public.businesses b
    where b.id = coalesce((v_new ->> 'business_id')::uuid, (v_old ->> 'business_id')::uuid);
    v_record := coalesce(v_new ->> 'id', v_old ->> 'id');
    v_summary := coalesce(
      v_new ->> 'customer_name', v_old ->> 'customer_name',
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

  -- Değişen alanları çıkar (hassas alanlar hariç)
  if TG_OP = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key in ('updated_at', 'created_at') then continue; end if;
      if (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_changed := v_changed || jsonb_build_object(
          v_key, jsonb_build_object('eski', v_old -> v_key, 'yeni', v_new -> v_key));
      end if;
    end loop;

    -- Hiçbir anlamlı alan değişmediyse kayıt yazma
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

do $$
declare t text;
begin
  foreach t in array array['businesses','reservations','payments','cash_flow','profiles'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$s', t);
    execute format(
      'create trigger audit_%1$s after insert or update or delete on public.%1$s
       for each row execute function public.write_audit_log()', t);
  end loop;
end $$;

-- =====================================================================
-- Satır bazlı güvenlik
-- =====================================================================
alter table public.rate_limits    enable row level security;
alter table public.login_attempts enable row level security;
alter table public.audit_log      enable row level security;

-- rate_limits ve login_attempts: yalnızca sunucu (service_role) erişir.
-- Hiçbir politika tanımlanmadığı için anon/authenticated erişemez.

-- Denetim kaydı: yalnızca kapsamın sahibi okur, kimse yazamaz/silemez.
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select
  to authenticated
  using (owner_id = public.owner_scope());

revoke insert, update, delete on public.audit_log from anon, authenticated;
revoke all on public.rate_limits, public.login_attempts from anon, authenticated;

-- Postgres, fonksiyonlara varsayılan olarak PUBLIC'e EXECUTE yetkisi verir.
-- Yalnızca anon/authenticated rollerinden geri almak YETMEZ: PUBLIC yetkisi
-- kalırsa istemci `record_login_attempt(kurban, null, true)` çağırarak kendi
-- başarısız denemelerini silebilir ve giriş kilidini tamamen atlatabilir.
-- Bu yüzden önce PUBLIC'ten geri alınır, sonra yalnızca sunucuya verilir.
revoke all on function public.check_rate_limit(text, text, integer, integer) from public;
revoke all on function public.login_lock_status(text) from public;
revoke all on function public.record_login_attempt(text, text, boolean) from public;
revoke all on function public.prune_rate_limits() from public;
revoke all on function public.write_audit_log() from public;

grant execute on function public.check_rate_limit(text, text, integer, integer) to service_role;
grant execute on function public.login_lock_status(text) to service_role;
grant execute on function public.record_login_attempt(text, text, boolean) to service_role;
grant execute on function public.prune_rate_limits() to service_role;
