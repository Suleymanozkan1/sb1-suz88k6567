-- =====================================================================
-- Talep kutusu (yönetim)
--
-- Halka açık formlardan (iletişim, demo, salon teklifi) gelen kayıtlar
-- 0001'de yazılıyordu ancak hiçbir yerden okunamıyordu; talepler fiilen
-- kayboluyordu. Bu göç, taleplere durum/atama alanları ekler ve okumayı
-- YALNIZCA yönetici (owner) hesaplarına açar.
-- =====================================================================

-- ---------------------------------------------------- durum alanları
do $$ begin
  create type public.message_status as enum ('yeni', 'islemde', 'kapatildi');
exception when duplicate_object then null;
end $$;

alter table public.contact_messages
  add column if not exists status     public.message_status not null default 'yeni',
  add column if not exists note       text not null default '',
  add column if not exists handled_by uuid references public.profiles (id) on delete set null,
  add column if not exists handled_at timestamptz;

-- Salon teklifi, demo talebinden ayrı sınıflandırılabilmeli.
alter table public.contact_messages drop constraint if exists contact_messages_kind_check;
alter table public.contact_messages
  add constraint contact_messages_kind_check
  check (kind in ('iletisim', 'demo', 'teklif'));

-- Kapatılan talepte işleyen ve zaman damgası bulunmalı; "kim kapattı"
-- sorusunun cevapsız kalmaması denetim açısından şarttır.
alter table public.contact_messages drop constraint if exists contact_messages_handled_complete;
alter table public.contact_messages
  add constraint contact_messages_handled_complete
  check (status = 'yeni' or handled_at is not null);

create index if not exists contact_messages_status_idx
  on public.contact_messages (status, created_at desc);

-- ------------------------------------------------------- durum damgası
create or replace function public.stamp_message_handling()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'yeni' then
      new.handled_at := null;
      new.handled_by := null;
    else
      new.handled_at := now();
      new.handled_by := auth.uid();
    end if;
  end if;
  -- Talep içeriği bir kanıttır; sonradan değiştirilemez.
  new.name       := old.name;
  new.email      := old.email;
  new.phone      := old.phone;
  new.message    := old.message;
  new.kind       := old.kind;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists contact_messages_stamp on public.contact_messages;
create trigger contact_messages_stamp
  before update on public.contact_messages
  for each row execute function public.stamp_message_handling();

-- ------------------------------------------------------------- yetkiler
-- 0001'de okuma "to authenticated using (true)" idi: her personel, tüm
-- talepleri (ad, e-posta, telefon) okuyabiliyordu. Yalnızca yöneticiye
-- kapatılır.
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'owner'
  );
$$;

drop policy if exists contact_messages_select on public.contact_messages;
create policy contact_messages_select on public.contact_messages for select
  to authenticated using (public.is_owner());

drop policy if exists contact_messages_update on public.contact_messages;
create policy contact_messages_update on public.contact_messages for update
  to authenticated using (public.is_owner()) with check (public.is_owner());

-- Tablo düzeyi izinler açıkça verilir. Supabase, public şemadaki tablolara
-- anon/authenticated için varsayılan izinleri kendiliğinden tanımlar; burada
-- yeniden yazmak hem düz Postgres'te şemayı kendi kendine yeterli kılar hem de
-- aşağıdaki revoke'u anlamlı hale getirir. Erişimi RLS politikaları daraltır.
grant usage on schema public to anon, authenticated;
grant insert on public.contact_messages to anon, authenticated;
grant select, update on public.contact_messages to authenticated;

-- Talep kaydı silinemez: gelen taleplerin izi kaybolmamalıdır.
revoke delete on public.contact_messages from anon, authenticated;
