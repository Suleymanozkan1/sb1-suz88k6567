-- =====================================================================
-- Yedekleme ve sistem izleme
--
-- Supabase'in kendi otomatik yedeği vardır; buradaki bağımsız dışa aktarım
-- onun yerine değil, YANINA konur. Sağlayıcı hesabına erişimin kaybı ya da
-- yanlışlıkla silme gibi durumlarda tek yedek kaynağına bağlı kalmamak için.
-- =====================================================================

-- --------------------------------------------------------- yedek kayıtları
create table if not exists public.backup_runs (
  id           uuid        primary key default gen_random_uuid(),
  owner_id     uuid        references public.profiles (id) on delete cascade,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text        not null default 'calisiyor'
                 check (status in ('calisiyor', 'basarili', 'basarisiz')),
  row_counts   jsonb,
  size_bytes   bigint,
  storage_path text,
  error        text
);
create index if not exists backup_runs_owner_idx
  on public.backup_runs (owner_id, started_at desc);

/**
 * Bir yöneticinin tüm verisini tek JSON belgesi olarak döndürür.
 *
 * SECURITY DEFINER'dır ancak yalnızca p_owner_id kapsamındaki satırları
 * toplar; çağıran kendi kapsamı dışını isteyemez (yetki kontrolü aşağıda).
 */
create or replace function public.export_owner_data(p_owner_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  -- Yetki: yalnızca kendi kapsamını dışa aktarabilir.
  -- service_role çağrılarında auth.uid() null'dur; o durumda izin verilir.
  if auth.uid() is not null and public.owner_scope() <> p_owner_id then
    raise exception 'Bu kapsam için yetkiniz bulunmuyor.'
      using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'surum', 1,
    'olusturma', now(),
    'owner_id', p_owner_id,
    'profiller', coalesce((
      select jsonb_agg(to_jsonb(p) - 'id' || jsonb_build_object('id', p.id))
      from public.profiles p where p.id = p_owner_id or p.owner_id = p_owner_id), '[]'::jsonb),
    'isletmeler', coalesce((
      select jsonb_agg(to_jsonb(b))
      from public.businesses b where b.owner_id = p_owner_id), '[]'::jsonb),
    'rezervasyonlar', coalesce((
      select jsonb_agg(to_jsonb(r))
      from public.reservations r
      join public.businesses b on b.id = r.business_id
      where b.owner_id = p_owner_id), '[]'::jsonb),
    'tahsilatlar', coalesce((
      select jsonb_agg(to_jsonb(pay))
      from public.payments pay
      join public.reservations r on r.id = pay.reservation_id
      join public.businesses b on b.id = r.business_id
      where b.owner_id = p_owner_id), '[]'::jsonb),
    'kasa', coalesce((
      select jsonb_agg(to_jsonb(c))
      from public.cash_flow c
      join public.businesses b on b.id = c.business_id
      where b.owner_id = p_owner_id), '[]'::jsonb),
    'renk_ayarlari', coalesce((
      select jsonb_agg(to_jsonb(cs))
      from public.color_settings cs
      join public.businesses b on b.id = cs.business_id
      where b.owner_id = p_owner_id), '[]'::jsonb),
    'sms_izinleri', coalesce((
      select jsonb_agg(to_jsonb(sc))
      from public.sms_consents sc
      join public.businesses b on b.id = sc.business_id
      where b.owner_id = p_owner_id), '[]'::jsonb),
    'sms_kayitlari', coalesce((
      select jsonb_agg(to_jsonb(sl))
      from public.sms_log sl
      join public.businesses b on b.id = sl.business_id
      where b.owner_id = p_owner_id), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

/** Yedeğin içerdiği satır sayıları — bütünlük doğrulaması için */
create or replace function public.backup_row_counts(p_owner_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'isletmeler',    (select count(*) from public.businesses b where b.owner_id = p_owner_id),
    'rezervasyonlar',(select count(*) from public.reservations r
                        join public.businesses b on b.id = r.business_id
                       where b.owner_id = p_owner_id),
    'tahsilatlar',   (select count(*) from public.payments pay
                        join public.reservations r on r.id = pay.reservation_id
                        join public.businesses b on b.id = r.business_id
                       where b.owner_id = p_owner_id),
    'kasa',          (select count(*) from public.cash_flow c
                        join public.businesses b on b.id = c.business_id
                       where b.owner_id = p_owner_id),
    'sms_izinleri',  (select count(*) from public.sms_consents sc
                        join public.businesses b on b.id = sc.business_id
                       where b.owner_id = p_owner_id)
  );
$$;

-- ---------------------------------------------------------- sistem durumu
/**
 * İzleme özeti.
 * Uptime izleyicileri ve panel bu tek çağrıyı kullanır.
 */
create or replace function public.system_health(p_owner_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'kuyruk_bekleyen', (
      select count(*) from public.sms_queue q
      join public.businesses b on b.id = q.business_id
      where b.owner_id = p_owner_id and q.status in ('bekliyor', 'gonderiliyor')),
    'kuyruk_basarisiz', (
      select count(*) from public.sms_queue q
      join public.businesses b on b.id = q.business_id
      where b.owner_id = p_owner_id and q.status = 'basarisiz'),
    'kuyruk_engellenen', (
      select count(*) from public.sms_queue q
      join public.businesses b on b.id = q.business_id
      where b.owner_id = p_owner_id and q.status = 'iptal'),
    -- En eski bekleyen mesajın yaşı: kuyruk işleyici durmuşsa büyür
    'kuyruk_en_eski_dakika', coalesce((
      select floor(extract(epoch from (now() - min(q.created_at))) / 60)::int
      from public.sms_queue q
      join public.businesses b on b.id = q.business_id
      where b.owner_id = p_owner_id and q.status = 'bekliyor'), 0),
    'iys_aktarilmamis', (
      select count(*) from public.sms_consents sc
      join public.businesses b on b.id = sc.business_id
      where b.owner_id = p_owner_id and sc.iys_synced_at is null),
    'son_yedek', (
      select jsonb_build_object(
        'zaman', br.finished_at,
        'durum', br.status,
        -- floor kullanılır: az önce alınan yedek "1 saat" görünmemeli
        'yas_saat', floor(extract(epoch from (now() - br.finished_at)) / 3600)::int,
        'yas_dakika', floor(extract(epoch from (now() - br.finished_at)) / 60)::int)
      from public.backup_runs br
      where br.owner_id = p_owner_id and br.status = 'basarili'
      order by br.finished_at desc limit 1),
    'basarisiz_giris_24s', (
      select count(*) from public.login_attempts la
      where la.succeeded = false and la.attempted_at > now() - interval '24 hours')
  );
$$;

-- =====================================================================
-- Satır bazlı güvenlik
-- =====================================================================
alter table public.backup_runs enable row level security;

drop policy if exists backup_runs_select on public.backup_runs;
create policy backup_runs_select on public.backup_runs for select
  to authenticated using (owner_id = public.owner_scope());

revoke insert, update, delete on public.backup_runs from anon, authenticated;

-- Dışa aktarım ve durum sorgusu panelden de çağrılır (kendi kapsamı için).
revoke all on function public.export_owner_data(uuid) from public;
revoke all on function public.backup_row_counts(uuid) from public;
revoke all on function public.system_health(uuid) from public;
grant execute on function public.export_owner_data(uuid) to authenticated, service_role;
grant execute on function public.backup_row_counts(uuid) to authenticated, service_role;
grant execute on function public.system_health(uuid) to authenticated, service_role;
