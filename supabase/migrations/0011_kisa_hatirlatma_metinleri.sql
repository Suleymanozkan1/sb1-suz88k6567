-- =====================================================================
-- Hatırlatma metinlerini tek SMS'e sığdır
--
-- 0010'daki varsayılan metinler 2–3 SMS uzunluğundaydı. İki sebep vardı:
--
--   1) Metinler uzundu ve sonlarında {isletme} tekrar ediyordu. İşletme
--      adı zaten gönderen alanında (Netgsm marka başlığı) görünüyor;
--      gövdede tekrarlamak otuz küsur karakter yiyordu.
--   2) ş, ğ, ı, İ, ç harfleri GSM-7 alfabesinde yok. Biri bile geçtiğinde
--      mesaj UCS-2'ye düşüyor ve tek parça 160 yerine 70 karakter oluyor.
--      Bu harfler çoğunlukla müşterinin KENDİ ADINDAN geliyor, yani
--      şablon ne kadar kısaltılırsa kısaltılsın "Ayşe Yıldız" adı tek
--      başına mesajı ikiye bölüyordu.
--
-- Bu göç ikisini de düzeltiyor: metinler kısaltıldı ve gönderim anında
-- GSM-7 dışındaki harfler karşılıklarına indirgeniyor. ö, ü, Ö, Ü ve Ç
-- zaten GSM-7 içinde olduğu için dokunulmuyor.
--
-- Kullanıcının elle düzenlediği metinlere DOKUNULMUYOR: yalnızca gövdesi
-- hâlâ 0010'daki varsayılana eşit olan satırlar güncelleniyor.
-- =====================================================================

/**
 * GSM-7 dışındaki Türkçe harfleri indirger.
 *
 * Aynı dönüşüm istemci tarafında da (src/lib/sablon.ts ve
 * mobil/src/sablon.ts) uygulanıyor: kullanıcının önizlemede gördüğü metin
 * ile gecelik görevin gönderdiği metin birebir aynı olmak zorunda.
 */
create or replace function public.gsm7_sadelestir(p_metin text)
returns text
language sql
immutable
as $$
  select translate(p_metin, 'şŞğĞıİç', 'sSgGiIc');
$$;

-- --------------------------------------------------- varsayılan metinler
do $$
declare
  v record;
begin
  for v in
    select * from (values
      ('rezervasyon_onay'::template_key,
       'Sayın {musteri}, {tarih} {seans} seansı için {salon} rezervasyonunuz alınmıştır. Sorgu kodunuz: {kod}. {isletme}',
       'Sayin {musteri}, {tarih} {seans} rezervasyonunuz alinmistir. Sorgu kodu: {kod}'),
      ('tarih_hatirlatma',
       'Sayın {musteri}, {tarih} tarihli organizasyonunuz yaklaşıyor. {salon} - {seans} seansı. {isletme}',
       'Sayin {musteri}, {tarih} tarihli organizasyonunuz yaklasiyor. {salon}'),
      ('odeme_hatirlatma',
       'Sayın {musteri}, {tarih} tarihli organizasyonunuz için kalan tutar {kalan} TL''dir. Bilginize. {isletme}',
       'Sayin {musteri}, {tarih} organizasyonunuz icin kalan tutar {kalan} TL'),
      ('tahsilat_bildirimi',
       'Sayın {musteri}, {odenen} TL tutarındaki ödemeniz alınmıştır. Kalan tutar {kalan} TL. {isletme}',
       'Sayin {musteri}, {odenen} TL odemeniz alinmistir. Kalan {kalan} TL'),
      ('etkinlik_gunu',
       'Sayın {musteri}, bugün {seans} seansında {salon} sizi bekliyor. İyi eğlenceler dileriz. {isletme}',
       'Sayin {musteri}, bugun {seans} seansinda {salon} sizi bekliyor'),
      ('tesekkur',
       'Sayın {musteri}, bizi tercih ettiğiniz için teşekkür ederiz. Görüşlerinizi bizimle paylaşabilirsiniz. {isletme}',
       'Sayin {musteri}, bizi tercih ettiginiz icin tesekkur ederiz'),
      ('kampanya',
       'Sayın {musteri}, sezon fiyatlarımız hakkında bilgi almak için bizi arayabilirsiniz. {isletme}',
       'Sayin {musteri}, sezon fiyatlarimiz icin bizi arayabilirsiniz')
    ) as t(anahtar, eski, yeni)
  loop
    -- Yalnızca dokunulmamış metinler; kullanıcının kendi yazdığı
    -- metni değiştirmek, üzerinde çalıştığı işi silmek olurdu.
    update public.message_templates
       set body = v.yeni
     where key = v.anahtar and body = v.eski;
  end loop;
end $$;

-- Bundan sonra açılan işletmeler de kısa metinlerle başlasın.
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
     'Sayin {musteri}, {tarih} {seans} rezervasyonunuz alinmistir. Sorgu kodu: {kod}',
     'Rezervasyon', 'islem'),
    (p_business_id, 'tarih_hatirlatma', 'Tarih hatırlatması',
     'Sayin {musteri}, {tarih} tarihli organizasyonunuz yaklasiyor. {salon}',
     'Hatırlatma', 'islem'),
    (p_business_id, 'odeme_hatirlatma', 'Ödeme hatırlatması',
     'Sayin {musteri}, {tarih} organizasyonunuz icin kalan tutar {kalan} TL',
     'Hatırlatma', 'islem'),
    (p_business_id, 'tahsilat_bildirimi', 'Tahsilat bildirimi',
     'Sayin {musteri}, {odenen} TL odemeniz alinmistir. Kalan {kalan} TL',
     'Bilgilendirme', 'islem'),
    (p_business_id, 'etkinlik_gunu', 'Etkinlik günü',
     'Sayin {musteri}, bugun {seans} seansinda {salon} sizi bekliyor',
     'Hatırlatma', 'islem'),
    (p_business_id, 'tesekkur', 'Teşekkür',
     'Sayin {musteri}, bizi tercih ettiginiz icin tesekkur ederiz',
     'Bilgilendirme', 'ticari'),
    (p_business_id, 'kampanya', 'Kampanya duyurusu',
     'Sayin {musteri}, sezon fiyatlarimiz icin bizi arayabilirsiniz',
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

-- Gecelik görev de sadeleştirilmiş metni kuyruğa alsın: kullanıcının
-- önizlemede gördüğü metin ile gerçekten gidenin aynı olması şart.
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
  -- Sadeleştirme doldurmadan SONRA: müşterinin adındaki harfleri de
  -- kapsaması gerekiyor, yalnızca şablonu sadeleştirmek yetmiyordu.
  return public.gsm7_sadelestir(v_out);
end;
$$;

revoke all on function public.seed_message_templates(uuid) from public;
grant execute on function public.seed_message_templates(uuid) to authenticated;
