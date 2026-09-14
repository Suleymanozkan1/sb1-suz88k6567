-- =====================================================================
-- 0044 doğrulaması
--
-- AYRI DOSYA, çünkü `alter type ... add value` ile eklenen bir değer
-- AYNI İŞLEM İÇİNDE kullanılamaz (PostgreSQL kısıtı). 0044 ile
-- doğrulamayı tek dosyaya koymak "unsafe use of new value" hatası
-- verirdi.
-- =====================================================================
do $$
declare
  v_eksik text;
begin
  select string_agg(d.ad, ', ') into v_eksik
  from unnest(array['Instagram','Facebook','WhatsApp','Web Sitesi',
                    'Google','Tavsiye','Telefon','Diğer']) as d(ad)
  where not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'lead_channel' and e.enumlabel = d.ad
  );
  if v_eksik is not null then
    raise exception 'BASARISIZ: lead_channel eksik deger(ler): %', v_eksik;
  end if;

  select string_agg(d.ad, ', ') into v_eksik
  from unnest(array['Instagram','Facebook','WhatsApp','Web Sitesi',
                    'Google','Tavsiye','Telefon','Manuel','Diğer']) as d(ad)
  where not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'lead_source' and e.enumlabel = d.ad
  );
  if v_eksik is not null then
    raise exception 'BASARISIZ: lead_source eksik deger(ler): %', v_eksik;
  end if;
end $$;
