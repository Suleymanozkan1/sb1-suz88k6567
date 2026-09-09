-- =====================================================================
-- Hatırlatma şablonları ve otomatik hatırlatmalar
--
-- İki ayrı şey tanımlanır:
--   message_templates : gönderilecek mesajın taslak metni (düzenlenebilir)
--   reminder_rules    : bu taslağın kaç gün önce kendiliğinden gideceği
--
-- Sınıflandırma 0003 numaralı göçteki ayrımı sürdürür: rezervasyon onayı,
-- tarih ve ödeme hatırlatması işlem bildirimidir (6563 sayılı Kanun
-- kapsamında onay aranmaz); teşekkür ve kampanya ticari iletidir ve
-- İYS onayı olmadan gönderilemez. Kural burada değil, enqueue_sms
-- içinde uygulanır, tek kapıdan geçmesi denetlenebilirliği korur.
-- =====================================================================

do $$ begin
  create type template_key as enum (
    'rezervasyon_onay',
    'tarih_hatirlatma',
    'odeme_hatirlatma',
    'tahsilat_bildirimi',
    'etkinlik_gunu',
    'tesekkur',
    'kampanya'
  );
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------- şablonlar
create table if not exists public.message_templates (
  id          uuid             primary key default gen_random_uuid(),
  business_id uuid             not null references public.businesses (id) on delete cascade,
  key         template_key     not null,
  title       text             not null,
  body        text             not null check (length(btrim(body)) between 1 and 900),
  kind        sms_kind         not null default 'Bilgilendirme',
  category    message_category not null,
  is_active   boolean          not null default true,
  created_at  timestamptz      not null default now(),
  updated_at  timestamptz      not null default now(),
  constraint message_templates_unique unique (business_id, key)
);

-- --------------------------------------------------------- otomatik kural
create table if not exists public.reminder_rules (
  id          uuid         primary key default gen_random_uuid(),
  business_id uuid         not null references public.businesses (id) on delete cascade,
  key         template_key not null,
  enabled     boolean      not null default false,
  -- Organizasyondan kaç gün önce gönderilecek. 0 = etkinlik günü,
  -- negatif = etkinlikten sonra (teşekkür mesajı için).
  days_before integer      not null default 7 check (days_before between -30 and 365),
  -- Günün hangi saatinde taranacağı. Gece yarısı SMS atmamak için.
  send_hour   integer      not null default 10 check (send_hour between 0 and 23),
  created_at  timestamptz  not null default now(),
  updated_at  timestamptz  not null default now(),
  constraint reminder_rules_unique unique (business_id, key)
);

-- ------------------------------------------------------------------ kayıt
-- Aynı hatırlatmanın iki kez gitmesini engeller. Görev günde birden çok
-- kez çalışsa da (yeniden deneme, elle tetikleme) her kayıt bir kez gider.
create table if not exists public.reminder_log (
  id             bigserial    primary key,
  business_id    uuid         not null references public.businesses (id) on delete cascade,
  reservation_id uuid         not null references public.reservations (id) on delete cascade,
  key            template_key not null,
  sent_on        date         not null default current_date,
  queue_id       uuid,
  created_at     timestamptz  not null default now(),
  constraint reminder_log_unique unique (reservation_id, key)
);
create index if not exists reminder_log_business_idx
  on public.reminder_log (business_id, sent_on desc);

drop trigger if exists touch_message_templates on public.message_templates;
create trigger touch_message_templates before update on public.message_templates
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_reminder_rules on public.reminder_rules;
create trigger touch_reminder_rules before update on public.reminder_rules
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- Taslak metnin doldurulması
--
-- Yer tutucular {süslü parantez} içinde yazılır. Bilinmeyen bir yer
-- tutucu olduğu gibi bırakılır: sessizce boşa çevirmek, müşteriye
-- "Sayın ," diye başlayan bir mesaj gitmesine yol açıyordu.
-- =====================================================================
create or replace function public.render_template(p_body text, p_vars jsonb)
returns text
language plpgsql
immutable
as $$
declare
  v_out text := p_body;
  v_key text;
begin
  for v_key in select jsonb_object_keys(p_vars) loop
    v_out := replace(v_out, '{' || v_key || '}', coalesce(p_vars ->> v_key, ''));
  end loop;
  return v_out;
end;
$$;

-- =====================================================================
-- Vadesi gelen hatırlatmaları kuyruğa alır.
--
-- Yalnızca zamanlanmış görev çağırır. Her rezervasyon–şablon çifti için
-- en çok bir kayıt yazılır; ikinci çağrı reminder_log kısıtına takılır ve
-- sessizce atlanır.
-- =====================================================================
create or replace function public.enqueue_due_reminders(p_now timestamptz default now())
returns table (business_id uuid, reservation_id uuid, key template_key, queued boolean, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  r          record;
  v_body     text;
  v_queued   boolean;
  v_reason   text;
  v_queue_id uuid;
begin
  for r in
    select
      res.id            as reservation_id,
      res.business_id,
      res.customer_name,
      res.customer_phone,
      res.date          as event_date,
      res.slot,
      res.code,
      res.total_amount,
      res.organization_type,
      coalesce(h.name, '')       as hall_name,
      coalesce(b.name, '')       as business_name,
      coalesce(p.paid, 0)        as paid,
      t.key, t.body, t.kind, t.category
    from public.reservations res
    join public.reminder_rules  rr on rr.business_id = res.business_id and rr.enabled
    join public.message_templates t
         on t.business_id = res.business_id and t.key = rr.key and t.is_active
    join public.businesses b on b.id = res.business_id
    left join public.halls h on h.id = res.hall_id
    left join lateral (
      select sum(amount) as paid from public.payments pay
      where pay.reservation_id = res.id
    ) p on true
    where res.status not in ('İptal')
      and res.date = (p_now at time zone 'Europe/Istanbul')::date + rr.days_before
      and extract(hour from p_now at time zone 'Europe/Istanbul') >= rr.send_hour
      and not exists (
        select 1 from public.reminder_log l
        where l.reservation_id = res.id and l.key = rr.key
      )
  loop
    v_body := public.render_template(r.body, jsonb_build_object(
      'musteri',  r.customer_name,
      'isletme',  r.business_name,
      'salon',    r.hall_name,
      'tarih',    to_char(r.event_date, 'DD.MM.YYYY'),
      'seans',    r.slot::text,
      'tur',      r.organization_type,
      'kod',      r.code,
      'tutar',    trim(to_char(r.total_amount, 'FM999G999G999D00')),
      'odenen',   trim(to_char(r.paid, 'FM999G999G999D00')),
      'kalan',    trim(to_char(greatest(0, r.total_amount - r.paid), 'FM999G999G999D00'))
    ));

    select q.queued, q.reason, q.queue_id
      into v_queued, v_reason, v_queue_id
      from public.enqueue_sms(
        r.business_id, r.customer_phone, v_body, r.kind, r.category, r.reservation_id
      ) q;

    -- Kuyruğa girmemiş olsa bile kaydı yazılır: gönderilmeme sebebi
    -- (İYS onayı yok, numara geçersiz) her gece yeniden denenip
    -- müşteriye tekrar tekrar aynı hatayı üretmesin.
    -- Çakışma hedefi sütun adıyla değil kısıt adıyla verilir: fonksiyonun
    -- RETURNS TABLE çıktı adları (reservation_id, key) sütun adlarıyla
    -- aynı ve PL/pgSQL "column reference is ambiguous" ile durduruyordu.
    insert into public.reminder_log (business_id, reservation_id, key, queue_id)
    values (r.business_id, r.reservation_id, r.key, v_queue_id)
    on conflict on constraint reminder_log_unique do nothing;

    business_id    := r.business_id;
    reservation_id := r.reservation_id;
    key            := r.key;
    queued         := v_queued;
    reason         := v_reason;
    return next;
  end loop;
end;
$$;

-- =====================================================================
-- Yeni işletmeye varsayılan şablon ve kuralları yazar.
-- =====================================================================
create or replace function public.seed_message_templates(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.message_templates (business_id, key, title, body, kind, category)
  values
    (p_business_id, 'rezervasyon_onay', 'Rezervasyon onayı',
     'Sayın {musteri}, {tarih} {seans} seansı için {salon} rezervasyonunuz alınmıştır. Sorgu kodunuz: {kod}. {isletme}',
     'Rezervasyon', 'islem'),
    (p_business_id, 'tarih_hatirlatma', 'Tarih hatırlatması',
     'Sayın {musteri}, {tarih} tarihli organizasyonunuz yaklaşıyor. {salon} - {seans} seansı. {isletme}',
     'Hatırlatma', 'islem'),
    (p_business_id, 'odeme_hatirlatma', 'Ödeme hatırlatması',
     'Sayın {musteri}, {tarih} tarihli organizasyonunuz için kalan tutar {kalan} TL''dir. Bilginize. {isletme}',
     'Hatırlatma', 'islem'),
    (p_business_id, 'tahsilat_bildirimi', 'Tahsilat bildirimi',
     'Sayın {musteri}, {odenen} TL tutarındaki ödemeniz alınmıştır. Kalan tutar {kalan} TL. {isletme}',
     'Bilgilendirme', 'islem'),
    (p_business_id, 'etkinlik_gunu', 'Etkinlik günü',
     'Sayın {musteri}, bugün {seans} seansında {salon} sizi bekliyor. İyi eğlenceler dileriz. {isletme}',
     'Hatırlatma', 'islem'),
    (p_business_id, 'tesekkur', 'Teşekkür',
     'Sayın {musteri}, bizi tercih ettiğiniz için teşekkür ederiz. Görüşlerinizi bizimle paylaşabilirsiniz. {isletme}',
     'Bilgilendirme', 'ticari'),
    (p_business_id, 'kampanya', 'Kampanya duyurusu',
     'Sayın {musteri}, sezon fiyatlarımız hakkında bilgi almak için bizi arayabilirsiniz. {isletme}',
     'Bilgilendirme', 'ticari')
  on conflict (business_id, key) do nothing;

  insert into public.reminder_rules (business_id, key, enabled, days_before, send_hour)
  values
    (p_business_id, 'tarih_hatirlatma',  true,  7, 10),
    (p_business_id, 'odeme_hatirlatma',  true,  3, 10),
    (p_business_id, 'etkinlik_gunu',     false, 0,  9),
    (p_business_id, 'tesekkur',          false, -1, 12)
  on conflict (business_id, key) do nothing;
end;
$$;

-- Mevcut işletmeler için de bir kez çalıştırılır.
do $$
declare b record;
begin
  for b in select id from public.businesses loop
    perform public.seed_message_templates(b.id);
  end loop;
end $$;

-- ------------------------------------------------------------- güvenlik
alter table public.message_templates enable row level security;
alter table public.reminder_rules    enable row level security;
alter table public.reminder_log      enable row level security;

drop policy if exists message_templates_all on public.message_templates;
create policy message_templates_all on public.message_templates for all
  to authenticated using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

drop policy if exists reminder_rules_all on public.reminder_rules;
create policy reminder_rules_all on public.reminder_rules for all
  to authenticated using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

-- Kayıt yalnızca okunur: hangi hatırlatmanın gittiği sonradan
-- değiştirilememeli, aksi hâlde "gönderildi" kaydı silinip mesaj
-- ikinci kez gönderilebilirdi.
drop policy if exists reminder_log_read on public.reminder_log;
create policy reminder_log_read on public.reminder_log for select
  to authenticated using (public.owns_business(business_id));

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.message_templates to authenticated;
grant select, insert, update, delete on public.reminder_rules to authenticated;
grant select on public.reminder_log to authenticated;

revoke all on function public.enqueue_due_reminders(timestamptz) from public;
revoke all on function public.seed_message_templates(uuid) from public;
grant execute on function public.seed_message_templates(uuid) to authenticated;

-- ------------------------------------------------------------ denetim izi
drop trigger if exists audit_message_templates on public.message_templates;
create trigger audit_message_templates
  after insert or update or delete on public.message_templates
  for each row execute function public.write_audit_log();

drop trigger if exists audit_reminder_rules on public.reminder_rules;
create trigger audit_reminder_rules
  after insert or update or delete on public.reminder_rules
  for each row execute function public.write_audit_log();
