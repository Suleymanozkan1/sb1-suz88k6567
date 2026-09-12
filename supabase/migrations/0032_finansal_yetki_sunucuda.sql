-- =====================================================================
-- Finansal yetkilerin SUNUCUDA uygulanması (madde 33)
--
-- Şimdiye kadar personel yetkileri yalnızca ARAYÜZDE kontrol ediliyordu:
-- düğmeler gizleniyor, ekranlar kapanıyordu. Veritabanı katmanında ise
-- aynı sahibe bağlı her personel her satırı okuyup yazabiliyordu. Tarayıcı
-- konsolundan ya da doğrudan PostgREST'e atılan bir istekle kasa
-- görülebilir, tahsilat silinebilirdi.
--
-- Artık kural veritabanında: satırı kimin görebileceğine ve
-- değiştirebileceğine `profiles.permissions` karar veriyor. Arayüzdeki
-- kontroller kaldırılmadı -- ikisi birlikte çalışıyor; arayüz kullanıcıyı
-- yormamak, veritabanı ise gerçekten engellemek için.
--
-- İŞLETME SAHİBİ her zaman yetkili: yetkileri boş bırakılmış bir sahip
-- kendi kasasını göremez hâle gelirdi.
-- =====================================================================

/**
 * Oturum açan kullanıcının verilen yetkisi var mı?
 *
 * Sahipte her zaman true. Personelde `permissions` dizisine bakılıyor.
 * service_role (zamanlanmış görevler) auth.uid() taşımadığı için burada
 * false döner; o rol RLS'i zaten atlıyor.
 */
create or replace function public.has_permission(p_perm text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.owner_id is null or p_perm = any (p.permissions))
  );
$$;

comment on function public.has_permission(text) is
  'Personel yetkisi kontrolü. İşletme sahibinde her zaman true (madde 33).';

revoke all on function public.has_permission(text) from public;
grant execute on function public.has_permission(text) to authenticated;

-- =====================================================================
-- Finansal tablolar
--
-- Okuma ile yazma AYRI yetkiye bağlı: muhasebeye bakan personelin
-- rakamları görmesi gerekiyor ama değiştirmesi gerekmiyor.
-- =====================================================================

-- ------------------------------------------------------------ payments
drop policy if exists payments_all on public.payments;

create policy payments_select on public.payments for select
  to authenticated using (
    public.has_permission('kasa.goruntule')
    and exists (
      select 1 from public.reservations r
      where r.id = payments.reservation_id and public.owns_business(r.business_id)
    )
  );

create policy payments_write on public.payments for all
  to authenticated using (
    public.has_permission('kasa.duzenle')
    and exists (
      select 1 from public.reservations r
      where r.id = payments.reservation_id and public.owns_business(r.business_id)
    )
  )
  with check (
    public.has_permission('kasa.duzenle')
    and exists (
      select 1 from public.reservations r
      where r.id = payments.reservation_id and public.owns_business(r.business_id)
    )
  );

-- ----------------------------------------------------------- cash_flow
drop policy if exists cash_flow_all on public.cash_flow;

create policy cash_flow_select on public.cash_flow for select
  to authenticated using (
    public.has_permission('kasa.goruntule') and public.owns_business(business_id));

create policy cash_flow_write on public.cash_flow for all
  to authenticated using (
    public.has_permission('kasa.duzenle') and public.owns_business(business_id))
  with check (
    public.has_permission('kasa.duzenle') and public.owns_business(business_id));

-- ------------------------------------------------- reservation_expenses
drop policy if exists reservation_expenses_all on public.reservation_expenses;

create policy reservation_expenses_select on public.reservation_expenses for select
  to authenticated using (
    public.has_permission('kasa.goruntule') and public.owns_business(business_id));

create policy reservation_expenses_write on public.reservation_expenses for all
  to authenticated using (
    public.has_permission('kasa.duzenle') and public.owns_business(business_id))
  with check (
    public.has_permission('kasa.duzenle') and public.owns_business(business_id));

-- ------------------------------------------------------------ invoices
do $$ begin
  if to_regclass('public.invoices') is not null then
    execute 'drop policy if exists invoices_all on public.invoices';
    execute $p$
      create policy invoices_select on public.invoices for select
        to authenticated using (
          public.has_permission('kasa.goruntule') and public.owns_business(business_id))
    $p$;
    execute $p$
      create policy invoices_write on public.invoices for all
        to authenticated using (
          public.has_permission('kasa.duzenle') and public.owns_business(business_id))
        with check (
          public.has_permission('kasa.duzenle') and public.owns_business(business_id))
    $p$;
  end if;
end $$;

-- ------------------------------------------------------- ödeme olayları
drop policy if exists payment_events_select on public.payment_events;
create policy payment_events_select on public.payment_events for select
  to authenticated using (
    public.has_permission('kasa.goruntule') and public.owns_business(business_id));

-- Bildirim kuralları ve alıcıları bir AYAR; finansal yetki değil,
-- ayar yetkisi istiyor.
drop policy if exists payment_alerts_all on public.payment_alerts;
create policy payment_alerts_all on public.payment_alerts for all
  to authenticated using (
    public.has_permission('ayarlar.duzenle') and public.owns_business(business_id))
  with check (
    public.has_permission('ayarlar.duzenle') and public.owns_business(business_id));

drop policy if exists payment_alert_recipients_all on public.payment_alert_recipients;
create policy payment_alert_recipients_all on public.payment_alert_recipients for all
  to authenticated using (
    public.has_permission('ayarlar.duzenle') and public.owns_business(business_id))
  with check (
    public.has_permission('ayarlar.duzenle') and public.owns_business(business_id));

-- ------------------------------------------------------ aylık rapor kaydı
drop policy if exists monthly_report_log_select on public.monthly_report_log;
create policy monthly_report_log_select on public.monthly_report_log for select
  to authenticated using (
    public.has_permission('rapor.goruntule') and public.owns_business(business_id));

/*
  Rezervasyon silme ayrı bir yetki: silinen kayıt geri gelmiyor ve
  arayüzdeki düğmeyi gizlemek, doğrudan atılan bir DELETE isteğini
  engellemiyordu.
*/
drop policy if exists reservations_all on public.reservations;

create policy reservations_select on public.reservations for select
  to authenticated using (
    public.has_permission('rezervasyon.goruntule') and public.owns_business(business_id));

create policy reservations_write on public.reservations for insert
  to authenticated with check (
    public.has_permission('rezervasyon.duzenle') and public.owns_business(business_id));

create policy reservations_update on public.reservations for update
  to authenticated using (
    public.has_permission('rezervasyon.duzenle') and public.owns_business(business_id))
  with check (
    public.has_permission('rezervasyon.duzenle') and public.owns_business(business_id));

create policy reservations_delete on public.reservations for delete
  to authenticated using (
    public.has_permission('rezervasyon.sil') and public.owns_business(business_id));
