-- =====================================================================
-- e-Arşiv fatura testleri
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off

\set a_id '''11111111-1111-1111-1111-111111111111'''
\set b_id '''22222222-2222-2222-2222-222222222222'''
\set biz '''aaaaaaaa-0000-0000-0000-000000000001'''

insert into auth.users (id, email, raw_user_meta_data) values
  (:a_id, 'a@ornek.com', '{"company_name":"A Salonu","full_name":"A Yetkili"}'),
  (:b_id, 'b@ornek.com', '{"company_name":"B Salonu","full_name":"B Yetkili"}');
insert into public.businesses (id, owner_id, name) values
  (:biz, :a_id, 'A Düğün Salonu'),
  ('bbbbbbbb-0000-0000-0000-000000000001', :b_id, 'B Salonu');

\echo ''
\echo '=== 1) Fatura numarasi 16 haneli ve sirali olmali ==='
select
  public.next_invoice_number(:biz, 'DGT') as birinci,
  public.next_invoice_number(:biz, 'DGT') as ikinci,
  public.next_invoice_number(:biz, 'DGT') as ucuncu;

\echo '=== 2) Farkli seri ayri sayac kullanmali ==='
select public.next_invoice_number(:biz, 'ABC') as farkli_seri_birden_baslar;

\echo '=== 3) Kisa/gecersiz on ek duzeltilmeli ==='
select public.next_invoice_number(:biz, 'x-') as on_ek_duzeltildi;

\echo ''
\echo '=== 4) Fatura ve satirlari olusturulabilmeli ==='
insert into public.invoices
  (id, business_id, invoice_number, buyer_name, buyer_kind, service_date)
values
  ('11111111-aaaa-0000-0000-000000000001', :biz, 'DGT2026000000010', 'Ahmet Yılmaz', 'bireysel', '2026-09-01');

insert into public.invoice_lines
  (invoice_id, line_no, description, quantity, unit, unit_price_kurus, vat_rate,
   gross_kurus, discount_kurus, base_kurus, vat_kurus, total_kurus)
values
  ('11111111-aaaa-0000-0000-000000000001', 1, 'Salon kiralama', 1, 'Adet', 10000000, 20,
   10000000, 0, 10000000, 2000000, 12000000),
  ('11111111-aaaa-0000-0000-000000000001', 2, 'Yemek', 250, 'Kişi', 40000, 10,
   10000000, 0, 10000000, 1000000, 11000000);

select public.recalculate_invoice('11111111-aaaa-0000-0000-000000000001');
select base_kurus, vat_kurus, total_kurus,
       (base_kurus + vat_kurus = total_kurus) as toplam_tutarli
from public.invoices where id = '11111111-aaaa-0000-0000-000000000001';

\echo '=== 5) Tutarsiz toplam REDDEDILMELI ==='
do $$
begin
  insert into public.invoices (business_id, invoice_number, buyer_name,
    gross_kurus, discount_kurus, base_kurus, vat_kurus, total_kurus)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'DGT2026000000099', 'Tutarsız',
          10000, 0, 10000, 2000, 99999);
  raise exception 'HATA: tutarsiz toplam kabul edildi!';
exception when check_violation then
  raise notice 'BEKLENEN: tutarsiz toplam reddedildi';
end $$;

\echo '=== 6) Gecersiz KDV orani REDDEDILMELI ==='
do $$
begin
  insert into public.invoice_lines (invoice_id, line_no, description, quantity, unit,
    unit_price_kurus, vat_rate, gross_kurus, base_kurus, vat_kurus, total_kurus)
  values ('11111111-aaaa-0000-0000-000000000001', 9, 'Hatali', 1, 'Adet', 1000, 18,
          1000, 1000, 180, 1180);
  raise exception 'HATA: gecersiz KDV orani kabul edildi!';
exception when check_violation then
  raise notice 'BEKLENEN: gecersiz KDV orani reddedildi';
end $$;

\echo '=== 7) Kurumsal alicida vergi no ZORUNLU olmali ==='
do $$
begin
  insert into public.invoices (business_id, invoice_number, buyer_name, buyer_kind)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'DGT2026000000098', 'X Ltd', 'kurumsal');
  raise exception 'HATA: vergi nosuz kurumsal fatura kabul edildi!';
exception when check_violation then
  raise notice 'BEKLENEN: kurumsal alicida vergi no zorunlu';
end $$;

\echo '=== 8) Ayni isletmede mukerrer fatura no REDDEDILMELI ==='
do $$
begin
  insert into public.invoices (business_id, invoice_number, buyer_name)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'DGT2026000000010', 'Mükerrer');
  raise exception 'HATA: mukerrer fatura numarasi kabul edildi!';
exception when unique_violation then
  raise notice 'BEKLENEN: mukerrer fatura numarasi reddedildi';
end $$;

\echo '=== 9) Gecersiz fatura no bicimi REDDEDILMELI ==='
do $$
begin
  insert into public.invoices (business_id, invoice_number, buyer_name)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'kisa123', 'Hatalı');
  raise exception 'HATA: gecersiz fatura numarasi kabul edildi!';
exception when check_violation then
  raise notice 'BEKLENEN: gecersiz fatura numarasi reddedildi';
end $$;

\echo ''
\echo '=== 10) GONDERILMIS fatura DEGISTIRILEMEMELI ==='
update public.invoices set status = 'gonderildi', sent_at = now()
where id = '11111111-aaaa-0000-0000-000000000001';

do $$
begin
  update public.invoices set total_kurus = 1
  where id = '11111111-aaaa-0000-0000-000000000001';
  raise exception 'HATA: gonderilmis faturanin tutari degistirildi!';
exception when check_violation then
  raise notice 'BEKLENEN: gonderilmis fatura tutari degistirilemedi';
end $$;

do $$
begin
  update public.invoices set buyer_name = 'Baskasi'
  where id = '11111111-aaaa-0000-0000-000000000001';
  raise exception 'HATA: gonderilmis faturanin alicisi degistirildi!';
exception when check_violation then
  raise notice 'BEKLENEN: gonderilmis fatura alicisi degistirilemedi';
end $$;

\echo '=== 11) Gonderilmis faturanin SATIRLARI degistirilememeli ==='
do $$
begin
  update public.invoice_lines set quantity = 999
  where invoice_id = '11111111-aaaa-0000-0000-000000000001';
  raise exception 'HATA: gonderilmis fatura satiri degistirildi!';
exception when check_violation then
  raise notice 'BEKLENEN: gonderilmis fatura satirlari degistirilemedi';
end $$;

\echo '=== 12) IPTAL edilebilmeli (durum degisikligine izin var) ==='
update public.invoices
   set status = 'iptal', cancelled_at = now(), cancel_reason = 'Müşteri talebi'
 where id = '11111111-aaaa-0000-0000-000000000001';
select status, cancel_reason from public.invoices
where id = '11111111-aaaa-0000-0000-000000000001';

\echo ''
\echo '=== 13) Fatura BASKA isletmeden gorulememeli ==='
grant usage on schema public to authenticated;
grant select, insert, update on public.invoices, public.invoice_lines to authenticated;
grant select on public.invoice_series to authenticated;
set role authenticated;

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select count(*) as "A_gordugu_fatura" from public.invoices;

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select count(*) as "B_gordugu_fatura_SIFIR_OLMALI" from public.invoices;

\echo '=== 14) Fatura SILINEMEMELI (vergi belgesi) ==='
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$
begin
  delete from public.invoices where true;
  raise exception 'HATA: fatura silinebildi!';
exception when insufficient_privilege then
  raise notice 'BEKLENEN: fatura silinemedi';
end $$;

\echo '=== 15) Seri sayaci elle degistirilememeli ==='
do $$
begin
  update public.invoice_series set last_number = 0 where true;
  raise exception 'HATA: seri sayaci geri alindi!';
exception when insufficient_privilege then
  raise notice 'BEKLENEN: seri sayaci degistirilemedi';
end $$;

reset role;
