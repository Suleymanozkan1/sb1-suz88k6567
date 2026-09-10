-- =====================================================================
-- Çelik kasa hareketleri
--
-- İşletmenin bir de fiziksel kasası var ve içindeki para, gelir/gider
-- kayıtlarından çıkan muhasebe bakiyesiyle aynı değil: havaleyle gelen
-- tahsilat kasaya girmez, kasadan alınıp bankaya yatırılan para kasadan
-- çıkar ama gelir kaydı yerinde durur.
--
-- Bu yüzden çelik kasa ayrı bir hareket defteridir. Kasa bakiyesi
-- (gelir - gider) hesabına karışmaz; iki bakiye ekranda yan yana durur.
--
-- Her hareket, hangi gelir/gider satırından doğduğunu söyler:
--   * cash_flow    : elle girilen kayıt, source_id = cash_flow.id
--   * reservation  : rezervasyondan türeyen tahsilat satırı,
--                    source_id = "kapora:<rezervasyon>" ya da
--                    "tahsilat:<odeme>"
--
-- İkinci tür kasa tablosunda satır olarak durmadığı için source_id metin
-- tutulur; yabancı anahtar verilemez.
-- =====================================================================

do $$ begin
  create type public.safe_direction as enum ('Giriş', 'Çıkış');
exception when duplicate_object then null; end $$;

create table if not exists public.safe_movements (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid                   not null references public.businesses (id) on delete cascade,
  date        date                   not null,
  direction   public.safe_direction  not null,
  amount      numeric(12,2)          not null check (amount > 0),
  description text                   not null default '',
  source_kind text                   not null check (source_kind in ('cash_flow', 'reservation')),
  source_id   text                   not null check (length(btrim(source_id)) > 0),
  created_at  timestamptz            not null default now(),
  -- Bir gelir/gider satırı kasaya en çok bir kez girer ve en çok bir kez
  -- çıkar. Aynı yönde ikinci kayıt, hemen her zaman iki kez tıklamaktan
  -- doğan bir çift sayımdır.
  constraint safe_movements_source_direction_unique unique (business_id, source_kind, source_id, direction)
);

create index if not exists safe_movements_business_date_idx
  on public.safe_movements (business_id, date desc);
create index if not exists safe_movements_source_idx
  on public.safe_movements (business_id, source_kind, source_id);

comment on table public.safe_movements is
  'Çelik kasa hareket defteri. Gelir/gider bakiyesinden ayrı tutulur.';
comment on column public.safe_movements.source_id is
  'Hareketi doğuran satır. cash_flow.id ya da "kapora:<id>" / "tahsilat:<id>".';

alter table public.safe_movements enable row level security;

drop policy if exists safe_movements_all on public.safe_movements;
create policy safe_movements_all on public.safe_movements for all
  to authenticated using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

grant select, insert, delete on public.safe_movements to authenticated;
-- Güncelleme yok: yanlış girilen hareket silinip yeniden eklenir, böylece
-- defterde düzeltmenin kendisi de bir kayıt bırakır.
revoke update on public.safe_movements from anon, authenticated;
