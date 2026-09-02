/**
 * SMS kuyruğu işleyicisi (Vercel Cron).
 *
 * Kuyruktaki mesajları sırayla gönderir. Başarısızlıkta üstel geri çekilme
 * ile yeniden denenir; azami deneme sonunda kalıcı başarısız işaretlenir.
 * Bu sayede sağlayıcı kesintisi mesaj kaybına yol açmaz.
 *
 * Zamanlama `vercel.json` içindeki crons bölümünde tanımlıdır.
 */
import { callRpc, isAuthorizedCron, isDbConfigured } from './_db';
import { json } from './_guard';
import { isProviderConfigured, sendOne } from './sms';

interface QueueRow {
  id: string;
  phone: string;
  body: string;
}

const BATCH_SIZE = 20;

export default async function handler(request: Request): Promise<Response> {
  // Cron dışı çağrılara kapalı: kuyruk işleme yetkisiz tetiklenmemeli.
  if (!isAuthorizedCron(request)) {
    return json({ error: 'Yetkisiz.' }, 401);
  }
  if (!isDbConfigured()) {
    return json({ error: 'Veritabanı yapılandırması eksik.' }, 500);
  }
  if (!isProviderConfigured()) {
    return json({ processed: 0, reason: 'provider_not_configured' });
  }

  let batch: QueueRow[];
  try {
    // Takılı kalmışları önce kurtar, sonra sıradakileri al
    await callRpc<number>('requeue_stuck_sms', {});
    batch = await callRpc<QueueRow[]>('claim_sms_batch', { p_limit: BATCH_SIZE });
  } catch (error) {
    return json({ error: 'Kuyruk okunamadı.', detail: String(error) }, 502);
  }

  let sent = 0;
  let failed = 0;

  for (const row of batch) {
    try {
      const result = await sendOne(row.phone, row.body);
      await callRpc('complete_sms', {
        p_id: row.id,
        p_success: result.ok,
        p_error: result.ok ? null : result.error ?? 'Bilinmeyen sağlayıcı hatası',
        p_ref: result.ok ? result.reference ?? null : null,
      });
      if (result.ok) sent += 1; else failed += 1;
    } catch (error) {
      // Sonucu yazamazsak mesaj 'gonderiliyor' kalır; requeue_stuck_sms
      // bir sonraki turda kurtarır.
      failed += 1;
      void error;
    }
  }

  return json({ processed: batch.length, sent, failed });
}
