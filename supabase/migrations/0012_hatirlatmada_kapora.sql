-- =====================================================================
-- Hatırlatma metinlerinde kaporanın atlanması
--
-- 0010'daki enqueue_due_reminders, tahsil edilen tutarı yalnızca
-- payments tablosundan topluyordu. Oysa kapora (reservations.deposit)
-- da bir tahsilattır ve panel toplamı böyle hesaplıyor:
--   toplam tahsilat = deposit + payments
--
-- Sonuç: kaporası alınmış ama başka tahsilat kaydı olmayan bir
-- rezervasyonda müşteriye giden mesajda kalan tutar, panelde görünenden
-- kaporanın tamamı kadar YÜKSEK yazılıyordu. Örnek: 185.000 toplam,
-- 55.500 kapora, ekranda 129.500 kalan; SMS'te 185.000.
--
-- Bu göç {odenen} ve {kalan} yer tutucularını panelin hesabıyla
-- eşitler. Aynı düzeltme istemci tarafında src/lib/sablon.ts içinde de
-- yapıldı; üç taraf da aynı "kapora + tahsilatlar" mantığını uygular.
--
-- İkinci uyuşmazlık: tutarlar `to_char(..., 'FM999G999G999D00')` ile
-- biçimlendiriliyordu. G ve D kalıpları sunucunun lc_numeric ayarına
-- bakar; İngilizce yerelde "129,500.00" üretiyor, panel ise "129.500,00"
-- gösteriyordu. Türkçede "129,500.00" yüz yirmi dokuz virgül beş gibi
-- okunuyor. Ayraçlar artık yerelden bağımsız sabitleniyor.
-- =====================================================================

/**
 * Tutarı Türkçe yazımla biçimlendirir: 129500 -> "129.500,00"
 *
 * Şablondaki "," ve "." karakterleri (G ve D'nin aksine) yerelden
 * bağımsız olarak aynen basılır; sonra ikisi yer değiştirilir.
 */
create or replace function public.tr_tutar(p_tutar numeric)
returns text
language sql
immutable
as $$
  select translate(to_char(coalesce(p_tutar, 0), 'FM999,999,999,999.00'), ',.', '.,');
$$;

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
      -- Kapora da tahsilattır; panelin toplamı da böyle hesaplanıyor.
      res.deposit + coalesce(p.paid, 0) as paid,
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
      'tutar',    public.tr_tutar(r.total_amount),
      'odenen',   public.tr_tutar(r.paid),
      'kalan',    public.tr_tutar(greatest(0, r.total_amount - r.paid))
    ));

    select q.queued, q.reason, q.queue_id
      into v_queued, v_reason, v_queue_id
      from public.enqueue_sms(
        r.business_id, r.customer_phone, v_body, r.kind, r.category, r.reservation_id
      ) q;

    -- Kuyruğa girmemiş olsa bile kaydı yazılır: gönderilmeme sebebi
    -- (İYS onayı yok, numara geçersiz) her gece yeniden denenip
    -- müşteriye tekrar tekrar aynı hatayı üretmesin.
    --
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

revoke all on function public.enqueue_due_reminders(timestamptz) from public;
