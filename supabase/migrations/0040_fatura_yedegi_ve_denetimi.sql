-- =====================================================================
-- Faturayı yedeğe ve denetim ekranına AYRI bir kapıdan bağla
--
-- NEDEN. Fatura kayıtları Vergi Usul Kanunu gereği Türkiye'deki ayrı bir
-- veritabanında tutulabiliyor (supabase/fatura-sunucusu, docs/IKI-SUNUCU.md).
-- Bölme yapıldığında `export_owner_data` ve `audit_log` faturaları
-- GÖREMEZ: onlar diğer veritabanında.
--
-- Çözüm, faturaya iki uç nokta açmak: sunucu bu iki çağrıyı tablo adına
-- bakarak doğru veritabanına yönlendiriyor (sunucu/veri-yonlendirme.ts).
-- Aynı fonksiyonlar BURAYA da kuruluyor ki bölme YAPILMAMIŞ kurulumda
-- çağrı yine karşılık bulsun; tek sunuculu kurulum hiçbir şey
-- kaybetmesin.
--
-- Yan fayda: `export_owner_data` bugüne kadar faturaları hiç
-- yedeklemiyordu. Bölme olmasa bile bu boşluk şimdi kapanıyor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- ÖNCE BİR HATA: fatura denetim kayıtları kapsamsız yazılıyordu
--
-- `write_audit_log` kapsamı (owner_id) tablo adına bakarak çözüyor ve
-- `invoices` için bir dalı YOKTU. 0005 denetim tetikleyicisini faturaya
-- da bağladığı günden beri her fatura kaydı `owner_id = null` ile
-- yazılıyor, denetim ekranının politikası ise `owner_id = owner_scope()`
-- arıyor: kayıtlar yazılıyor ama KİMSE GÖREMİYOR.
--
-- ESKİ KAYITLAR KURTARILAMIYOR. Aynı eksik dal `record_id` ve `summary`
-- alanlarını da boş bırakıyordu; ekleme kayıtlarında `changed` da boş.
-- Yani eski satırda faturaya bağlanacak HİÇBİR alan yok -- geri doldurma
-- denenip test edildi, eşleşecek bir şey bulunamadı. Bu satırlar
-- olduğu gibi bırakılıyor (denetim kaydı silinmez); düzeltme bu göçten
-- SONRAKİ fatura hareketleri için geçerli.
--
-- Fonksiyonun tamamı değil, yalnızca eksik dal ekleniyor; gövdenin geri
-- kalanı 0002'deki hâliyle aynı.
-- ---------------------------------------------------------------------
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
  -- EKLENEN DAL
  elsif TG_TABLE_NAME = 'invoices' then
    select b.owner_id into v_owner from public.businesses b
    where b.id = coalesce((v_new ->> 'business_id')::uuid, (v_old ->> 'business_id')::uuid);
    v_record := coalesce(v_new ->> 'id', v_old ->> 'id');
    v_summary := coalesce(v_new ->> 'invoice_number', v_old ->> 'invoice_number');
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
    (v_owner, v_actor, v_email, TG_OP, TG_TABLE_NAME, v_record, v_summary,
     nullif(v_changed, '{}'::jsonb));

  return coalesce(NEW, OLD);
end;
$$;

/**
 * Bir kapsamın fatura kayıtları (yedek için).
 *
 * Ana yedeğe ayrı bir çağrıyla ekleniyor (api/backup.ts): iki
 * veritabanından toplanan veri TEK dosyada birleşiyor, yoksa fatura
 * yedeği unutulur ve bu ancak geri yükleme gününde fark edilirdi.
 */
create or replace function public.export_invoice_data(p_owner_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_result jsonb;
begin
  -- Yetki: yalnızca kendi kapsamını dışa aktarabilir.
  -- service_role çağrılarında auth.uid() null'dur; o durumda izin verilir.
  if auth.uid() is not null and public.owner_scope() <> p_owner_id then
    raise exception 'Bu kapsam için yetkiniz bulunmuyor.'
      using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'faturalar', coalesce((
      select jsonb_agg(to_jsonb(i))
      from public.invoices i
      join public.businesses b on b.id = i.business_id
      where b.owner_id = p_owner_id), '[]'::jsonb),
    'fatura_satirlari', coalesce((
      select jsonb_agg(to_jsonb(l))
      from public.invoice_lines l
      join public.invoices i on i.id = l.invoice_id
      join public.businesses b on b.id = i.business_id
      where b.owner_id = p_owner_id), '[]'::jsonb),
    'fatura_serileri', coalesce((
      select jsonb_agg(to_jsonb(s))
      from public.invoice_series s
      join public.businesses b on b.id = s.business_id
      where b.owner_id = p_owner_id), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

/**
 * Fatura denetim kayıtları.
 *
 * Denetim ekranı iki çağrı yapıyor: `audit_log` (fatura DIŞINDAKİ
 * tablolar) ve bu fonksiyon. İki sorgu BİRBİRİNİ DIŞLIYOR, bu yüzden
 * bölme yapılmamış kurulumda ikisi aynı veritabanına düşse bile kayıt
 * çift görünmüyor.
 *
 * Kapsam süzgeci fonksiyonun içinde: `security definer` olduğu için RLS
 * atlanıyor ve satırın sahibi elle kontrol ediliyor.
 */
create or replace function public.fatura_denetim_kaydi(p_limit integer default 100)
returns setof public.audit_log
language sql
stable
security definer
set search_path = public
as $$
  select * from public.audit_log
  where table_name in ('invoices', 'invoice_lines')
    and owner_id = public.owner_scope()
  order by created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke all on function public.export_invoice_data(uuid) from public;
revoke all on function public.fatura_denetim_kaydi(integer) from public;
grant execute on function public.export_invoice_data(uuid) to authenticated, service_role;
grant execute on function public.fatura_denetim_kaydi(integer) to authenticated, service_role;
