/**
 * SMS kuyruğu işleyicisi (zamanlanmış görev).
 *
 * Kuyruktaki mesajları sırayla gönderir. Başarısızlıkta üstel geri çekilme
 * ile yeniden denenir; azami deneme sonunda kalıcı başarısız işaretlenir.
 * Bu sayede sağlayıcı kesintisi mesaj kaybına yol açmaz.
 *
 * Zamanlama `wrangler.jsonc` içindeki triggers.crons bölümünde tanımlı,
 * gönderim `worker/index.ts` içindeki scheduled() işleyicisinden yapılır.
 */
import { callRpc, isAuthorizedCron, isDbConfigured } from './_db';
import { json } from './_guard';
import { isProviderConfigured, sendOne } from './sms';
import {
  baglan, baglantiDurumu, gonder as whatsappGonder, whatsappWebEtkinMi,
} from './_whatsapp_web';

interface QueueRow {
  id: string;
  phone: string;
  body: string;
  /** İstenen kanal. 'whatsapp' düşerse aynı satır SMS'e düşer. */
  channel?: 'sms' | 'whatsapp';
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
  /*
    SMS sağlayıcısı yoksa da devam ediliyor: WhatsApp kanalı açıksa
    kuyruk oradan boşalabilir. İkisi de yoksa yapacak iş yok.
  */
  if (!isProviderConfigured() && !whatsappWebEtkinMi()) {
    return json({ processed: 0, reason: 'provider_not_configured' });
  }

  /*
    Oturum sunucu açılışında değil, ilk işte kuruluyor: WhatsApp yolu
    kapalıysa ya da kuyrukta whatsapp satırı yoksa hiç bağlanılmıyor.
    Zaten bağlıysa `baglan` anında dönüyor.
  */
  if (whatsappWebEtkinMi() && baglantiDurumu() !== 'bagli') {
    await baglan().catch(() => undefined);
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

  let whatsappIle = 0;

  for (const row of batch) {
    try {
      /*
        WhatsApp isteniyorsa önce oradan denenir; düşerse AYNI SATIR
        SMS'e düşer. Yeni bir kuyruk satırı açılmıyor: deneme sayacı ve
        geri çekilme tek satırda kalmalı, yoksa bir bildirim iki kez
        gidebilirdi.
      */
      let result = { ok: false } as Awaited<ReturnType<typeof sendOne>>;
      let kanal: 'sms' | 'whatsapp' = 'sms';

      if (row.channel === 'whatsapp' && whatsappWebEtkinMi()) {
        const w = await whatsappGonder(row.phone, row.body);
        if (w.ok) {
          result = { ok: true, reference: w.reference };
          kanal = 'whatsapp';
          whatsappIle += 1;
        }
      }

      if (!result.ok) {
        if (!isProviderConfigured()) {
          // SMS yedeği yoksa satır beklemede kalsın; sağlayıcı
          // tanımlandığında ya da oturum döndüğünde gidecek.
          await callRpc('complete_sms', {
            p_id: row.id, p_success: false,
            p_error: 'WhatsApp gönderilemedi, SMS sağlayıcısı tanımlı değil.',
            p_ref: null, p_channel: null,
          });
          failed += 1;
          continue;
        }
        result = await sendOne(row.phone, row.body);
        kanal = 'sms';
      }

      await callRpc('complete_sms', {
        p_id: row.id,
        p_success: result.ok,
        p_error: result.ok ? null : result.error ?? 'Bilinmeyen sağlayıcı hatası',
        p_ref: result.ok ? result.reference ?? null : null,
        p_channel: result.ok ? kanal : null,
      });
      if (result.ok) sent += 1; else failed += 1;
    } catch (error) {
      // Sonucu yazamazsak mesaj 'gonderiliyor' kalır; requeue_stuck_sms
      // bir sonraki turda kurtarır.
      failed += 1;
      void error;
    }
  }

  return json({ processed: batch.length, sent, failed, whatsapp: whatsappIle });
}
