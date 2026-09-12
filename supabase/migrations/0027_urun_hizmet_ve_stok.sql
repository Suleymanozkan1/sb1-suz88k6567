-- =====================================================================
-- Ürün ve Hizmet (eski adıyla Tedarikçiler) + stok takibi
--
-- Maddeler 25-26. Tedarikçi tablosu YENİDEN YARATILMIYOR: aynı tablo
-- genişletiliyor. Ayrı bir "ürünler" tablosu açılsaydı garson, DJ ve vale
-- gibi kalemler iki yerde birden tanımlanabilir, hangisinin doğru olduğu
-- belirsiz kalırdı. Tanım tek yerde; ürün mü hizmet mi olduğu `kind`
-- alanından çıkıyor.
--
-- STOK yalnızca üründe anlamlı: DJ'in kolisi olmaz. Kısıt bunu zorluyor.
--
-- TOPLAM ADET KOLON DEĞİL, hesap: koli x koli içi + tek adet. Ayrı bir
-- kolon olsaydı sayım sonrası üç sayı birbirini tutmadığında hangisinin
-- doğru olduğu bilinemezdi -- düğün içi giderlerde olduğu gibi.
-- =====================================================================

do $$ begin
  create type vendor_kind as enum ('hizmet', 'urun');
exception when duplicate_object then null; end $$;

alter table public.vendors
  add column if not exists kind public.vendor_kind not null default 'hizmet';

comment on column public.vendors.kind is
  'hizmet: garson, DJ, vale, fotoğraf. urun: su, kola, tuvalet kağıdı.';

/*
  Birim fiyat hem hizmette hem üründe anlamlı: düğün içi gider satırı
  buradan doldurulabilsin diye duruyor (madde 12). Sıfır kabul ediliyor:
  fiyatı henüz belirlenmemiş bir kalem de tanımlanabilmeli.
*/
alter table public.vendors
  add column if not exists unit_price numeric(12,2) not null default 0
    check (unit_price >= 0);

-- ------------------------------------------------------------ stok
alter table public.vendors
  add column if not exists box_count    numeric(10,2) not null default 0 check (box_count >= 0),
  add column if not exists units_per_box integer      not null default 0 check (units_per_box >= 0),
  -- Koliden bozulmuş, tek tek duran adet. Koli hesabına girmez.
  add column if not exists loose_count  numeric(10,2) not null default 0 check (loose_count >= 0),
  /*
    Kritik seviye. Sıfır = takip edilmiyor. Eşik olmadan farklı ürünlerin
    mutlak sayıları yan yana bir şey anlatmıyor: 12 tuvalet kağıdı az,
    12 pasta çok olabilir.
  */
  add column if not exists min_count    numeric(10,2) not null default 0 check (min_count >= 0);

comment on column public.vendors.loose_count is
  'Koliden bozulmuş tek adet. Toplam = box_count * units_per_box + loose_count.';

/*
  Stok alanları yalnızca üründe dolabilir. Hizmete koli yazılabilseydi
  stok ekranı "3 koli DJ" gibi anlamsız satırlar gösterirdi.
*/
alter table public.vendors drop constraint if exists vendors_stok_yalniz_urunde;
alter table public.vendors add constraint vendors_stok_yalniz_urunde check (
  kind = 'urun'
  or (box_count = 0 and units_per_box = 0 and loose_count = 0 and min_count = 0)
);

create index if not exists vendors_kind_idx on public.vendors (business_id, kind);

-- Hesaplanan toplam: ekranlar ve raporlar aynı yerden okusun.
create or replace function public.stok_toplami(
  p_box numeric, p_per integer, p_loose numeric
) returns numeric
language sql immutable
as $$ select coalesce(p_box, 0) * coalesce(p_per, 0) + coalesce(p_loose, 0); $$;

comment on function public.stok_toplami(numeric, integer, numeric) is
  'Toplam adet: koli x koli içi + tek adet. Kolon değil hesap.';
