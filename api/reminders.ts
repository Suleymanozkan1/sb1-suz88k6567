/**
 * Otomatik hatırlatmalar (zamanlanmış görev).
 *
 * Vadesi gelen hatırlatmaları SMS kuyruğuna alır; gönderimi kuyruk işleyicisi
 * (`/api/sms-queue`) yapar. İki adımın ayrı olmasının sebebi, sağlayıcı
 * kesintisinde hatırlatmanın kaybolmaması: kuyruğa girmiş mesaj yeniden
 * denenir, doğrudan gönderilmeye çalışılan mesaj kaybolur.
 *
 * Hangi rezervasyonun hangi şablonla ve kaç gün önce hatırlatılacağına
 * veritabanındaki `reminder_rules` karar verir; kural işletme başına
 * panelden düzenlenir. Aynı hatırlatmanın ikinci kez gitmesini
 * `reminder_log` üzerindeki tekillik kısıtı engeller, bu yüzden görev
 * günde birden çok kez çalışsa da mesaj tekrarlanmaz.
 *
 * Ticari ileti sınıfındaki şablonlar (teşekkür, kampanya) İYS onayı
 * olmadan kuyruğa girmez; engellenen kayıt sessizce atılmaz, gerekçesiyle
 * birlikte 'iptal' olarak yazılır ve panelden denetlenebilir.
 */
import { callRpc, isAuthorizedCron, isDbConfigured } from './_db';
import { json } from './_guard';

interface ReminderRow {
  business_id: string;
  reservation_id: string;
  key: string;
  queued: boolean;
  reason: string | null;
}

export default async function handler(request: Request): Promise<Response> {
  // Cron dışı çağrılara kapalı: hatırlatma yetkisiz tetiklenmemeli, aksi
  // hâlde müşterilere istenmeyen mesaj gönderilebilirdi.
  if (!isAuthorizedCron(request)) {
    return json({ error: 'Yetkisiz.' }, 401);
  }
  if (!isDbConfigured()) {
    return json({ error: 'Veritabanı yapılandırması eksik.' }, 500);
  }

  let rows: ReminderRow[];
  try {
    rows = await callRpc<ReminderRow[]>('enqueue_due_reminders', {});
  } catch (error) {
    return json({ error: 'Hatırlatmalar okunamadı.', detail: String(error) }, 502);
  }

  const queued = rows.filter((r) => r.queued).length;
  const blocked = rows.filter((r) => !r.queued);

  return json({
    scanned: rows.length,
    queued,
    blocked: blocked.length,
    // Engellenenlerin gerekçesi türüne göre özetlenir; numaraların
    // kendisi yanıta konmaz, görev günlüğü kişisel veri taşımamalı.
    reasons: [...new Set(blocked.map((r) => r.reason ?? 'bilinmiyor'))],
  });
}
