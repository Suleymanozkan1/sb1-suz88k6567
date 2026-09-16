/*
  YETKİ BOŞLUKLARINI KAPAT.

  Denetimde çıktı: yalnızca `rezervasyon.goruntule` yetkisi olan bir
  personel, hiç yetkisi olmadığı halde müşteri adayı mesajlarını, aday
  durum geçmişini, SMS kuyruğunu ve izin geçmişini OKUYABİLİYORDU.
  Sızan veri soyut değil: müşteri telefon numarası ve mesaj metni.

  Sebep tutarlı bir örüntü: EBEVEYN tablo yetki kontrolü yapıyor, ona
  bağlı GEÇMİŞ/ÇOCUK tablosu yapmıyordu. `customer_leads` kapalıydı ama
  `customer_lead_messages` açıktı; `sms_log` kapalıydı ama `sms_queue`
  açıktı; `sms_consents` kapalıydı ama `sms_consent_history` açıktı.
  Politikalar yalnızca `owns_business()` ile KİRACI ayrımını yapıyor,
  `has_permission()` ile YETKİ ayrımını yapmıyordu.

  Kiracı ayrımı zaten sağlamdı -- başka bir işletmenin verisi hiçbir
  koşulda görünmüyor. Kırık olan, aynı işletme içindeki yetki sınırıydı.

  Aynı boşluk `invoice_lines` ve `event_tasks` için de vardı: fatura
  başlığı `fatura.goruntule` istiyor ama SATIRLARI istemiyordu; satırda
  tutar ve kalem adı duruyor, yani başlığı gizlemek tek başına bir şey
  ifade etmiyordu.

  KVKK açısından önemli: telefon numarası ve müşteri yazışması kişisel
  veri; "görmesi gerekmeyen çalışan görmemeli" ilkesi teknik tedbirin
  kendisi.
*/

-- ---------------------------------------------------- müşteri adayları
drop policy if exists customer_lead_messages_read on public.customer_lead_messages;
create policy customer_lead_messages_read on public.customer_lead_messages
  for select to authenticated
  using (owns_business(business_id) and has_permission('aday.goruntule'));

drop policy if exists customer_lead_messages_write on public.customer_lead_messages;
create policy customer_lead_messages_write on public.customer_lead_messages
  for insert to authenticated
  with check (owns_business(business_id) and has_permission('aday.duzenle'));

drop policy if exists customer_lead_status_history_read on public.customer_lead_status_history;
create policy customer_lead_status_history_read on public.customer_lead_status_history
  for select to authenticated
  using (owns_business(business_id) and has_permission('aday.goruntule'));

-- ------------------------------------------------------------ mesajlar
drop policy if exists sms_queue_select on public.sms_queue;
create policy sms_queue_select on public.sms_queue
  for select to authenticated
  using (owns_business(business_id) and has_permission('mesaj.goruntule'));

drop policy if exists sms_consent_history_select on public.sms_consent_history;
create policy sms_consent_history_select on public.sms_consent_history
  for select to authenticated
  using (owns_business(business_id) and has_permission('mesaj.goruntule'));

-- ------------------------------------------------------------ faturalar
/*
  ALL politikası okuma ve yazma için AYRILDI: faturayı görmek
  `fatura.goruntule`, satır eklemek `fatura.duzenle` istiyor. Tek
  politikayla ikisi ayrılamıyordu.
*/
drop policy if exists invoice_lines_all on public.invoice_lines;
create policy invoice_lines_read on public.invoice_lines
  for select to authenticated
  using (exists (
    select 1 from public.invoices i
     where i.id = invoice_lines.invoice_id and owns_business(i.business_id))
    and has_permission('fatura.goruntule'));
create policy invoice_lines_write on public.invoice_lines
  for all to authenticated
  using (exists (
    select 1 from public.invoices i
     where i.id = invoice_lines.invoice_id and owns_business(i.business_id))
    and has_permission('fatura.duzenle'))
  with check (exists (
    select 1 from public.invoices i
     where i.id = invoice_lines.invoice_id and owns_business(i.business_id))
    and has_permission('fatura.duzenle'));

-- ------------------------------------------------------------ iş emri
drop policy if exists event_tasks_all on public.event_tasks;
create policy event_tasks_read on public.event_tasks
  for select to authenticated
  using (owns_reservation(reservation_id) and has_permission('rezervasyon.goruntule'));
create policy event_tasks_write on public.event_tasks
  for all to authenticated
  using (owns_reservation(reservation_id) and has_permission('rezervasyon.duzenle'))
  with check (owns_reservation(reservation_id) and has_permission('rezervasyon.duzenle'));

-- ------------------------------------------------- yedek ve hata kaydı
drop policy if exists backup_runs_select on public.backup_runs;
create policy backup_runs_select on public.backup_runs
  for select to authenticated
  using (owner_id = owner_scope() and has_permission('sistem.yonet'));

/*
  Hata bildirimini HERKES yazabilir (yazan zaten kendi sorununu
  bildiriyor), ama LİSTESİNİ görmek denetim yetkisi istiyor: bildirimler
  başka kullanıcıların ekranındaki veriyi ve yaptığı işi açık ediyor.
*/
drop policy if exists error_reports_select on public.error_reports;
create policy error_reports_select on public.error_reports
  for select to authenticated
  using (owner_id = owner_scope() and has_permission('denetim.goruntule'));
