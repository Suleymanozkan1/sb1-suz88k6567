-- =====================================================================
-- MEB okul takvimi (otomatik)
--
-- Okul tatilleri salon için gerçek bir talep göstergesi: yarıyıl
-- tatilinde aileler seyahat eder, ara tatilde sünnet ve nişan
-- yoğunlaşır. Şimdiye kadar bu tarihler PANELDEN ELLE giriliyordu ve
-- 0035 açıklamasında "MEB makine okunur kaynak yayımlamıyor" diye
-- gerekçelendirilmişti.
--
-- Gerekçe artık geçerli değil: MEB'in haber arşivi tek istekle tamamen
-- alınabiliyor ve takvim duyurusu metninden tarihler çözülebiliyor
-- (bkz. api/_meb.ts, üç yılın gerçek duyurusuyla sınandı).
--
-- Günler PAYLAŞILAN kayıt olarak yazılıyor (business_id null): okul
-- takvimi ülke geneli, her işletmeye ayrı yazmanın anlamı yok.
-- =====================================================================

/**
 * MEB'den çekilen okul günlerini yazar.
 *
 * `ozel_gunleri_yaz` ile aynı desende: önce o kaynaktan gelen eski
 * satırlar siliniyor, sonra yenisi yazılıyor. MEB bir tatili
 * ERTELEDİĞİNDE (deprem, hava koşulu) eski tarih ortada kalmasın.
 *
 * BOŞ GİRDİDE HİÇBİR ŞEY YAPILMIYOR. Silip yerine bir şey koymamak,
 * MEB'in bir sayfa değişikliğinde takvimi boşaltmak demekti.
 *
 * Yalnızca 'saglayici' kaynaklı okul günlerine dokunuyor: işletmenin
 * kendi eklediği okul günü (yerel bir tatil, özel okulun takvimi)
 * silinmiyor.
 */
create or replace function public.okul_gunlerini_yaz(p_gunler jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_sayi integer;
  v_yillar integer[];
begin
  if p_gunler is null or jsonb_array_length(p_gunler) = 0 then return 0; end if;

  -- Yalnızca girdideki yılların satırları tazeleniyor; başka yılların
  -- verisi bu çağrıyla silinmemeli.
  select array_agg(distinct extract(year from (g->>'day')::date)::integer)
    into v_yillar
  from jsonb_array_elements(p_gunler) as g;

  delete from public.special_days
   where business_id is null
     and kind = 'okul'
     and source = 'saglayici'
     and extract(year from day) = any (v_yillar);

  insert into public.special_days (business_id, day, label, kind, source, tentative)
  select null, (g->>'day')::date, btrim(g->>'label'), 'okul', 'saglayici', false
  from jsonb_array_elements(p_gunler) as g
  on conflict (business_id, day, label) do nothing;

  get diagnostics v_sayi = row_count;
  return v_sayi;
end $$;

revoke all on function public.okul_gunlerini_yaz(jsonb) from public;
grant execute on function public.okul_gunlerini_yaz(jsonb) to service_role;

comment on function public.okul_gunlerini_yaz(jsonb) is
  'MEB çalışma takviminden çekilen okul günlerini yazar (0039).';
