/**
 * Uç nokta ve zamanlanmış görev listesi.
 *
 * Cloudflare Worker'dan taşındı; içerik değişmedi. Ayrı dosyada
 * durmasının sebebi sunucuyu başlatmadan da okunabilmesi: testler
 * listeyi HTTP dinlemeden içe aktarabiliyor.
 */
import backup from '../api/backup';
import health from '../api/health';
import invoice from '../api/invoice';
import iys from '../api/iys';
import login from '../api/login';
import otp from '../api/otp';
import oturum from '../api/oturum';
import reminders from '../api/reminders';
import smsQueue from '../api/sms-queue';
import sms from '../api/sms';
import sifre from '../api/sifre';
import whatsapp from '../api/whatsapp';
import whatsappGonder from '../api/whatsapp-gonder';

type Isleyici = (request: Request) => Promise<Response>;

export const ROTALAR: Record<string, Isleyici> = {
  '/api/backup': backup,
  '/api/health': health,
  '/api/invoice': invoice,
  '/api/iys': iys,
  '/api/login': login,
  '/api/otp': otp,
  '/api/oturum': oturum,
  '/api/sms': sms,
  '/api/sifre': sifre,
  '/api/sms-queue': smsQueue,
  '/api/reminders': reminders,
  '/api/whatsapp': whatsapp,
  '/api/whatsapp-gonder': whatsappGonder,
};

/**
 * Zamanlanmış görevin cron ifadesi hangi uç noktayı çalıştıracak.
 * Zamanlayıcı bu listeyi olduğu gibi okuyor.
 */
export const CRON_GOREVLERI: Record<string, keyof typeof ROTALAR> = {
  '*/5 * * * *': '/api/sms-queue',
  '*/15 * * * *': '/api/invoice',
  '30 2 * * *': '/api/backup',
  '0 3 * * *': '/api/iys',
  // Hatırlatmalar sabah taranır; kuralın kendi saat alanı gün içinde
  // hangi saatten sonra gönderileceğine karar verir.
  '0 7 * * *': '/api/reminders',
};

/**
 * Zamanlanmış görevler yetkilerini `Authorization: Bearer <CRON_SECRET>`
 * başlığından doğruluyor. Zamanlayıcıdan çağrıldıklarında ortada bir HTTP
 * isteği olmadığı için başlık burada üretilir; sır yalnızca sunucuda kalır.
 */
export function gorevIstegi(yol: string): Request {
  const secret = process.env.CRON_SECRET;
  return new Request(`https://gorev.local${yol}`, {
    method: 'POST',
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}
