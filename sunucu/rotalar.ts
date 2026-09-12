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
import monthlyReport from '../api/monthly-report';
import smsQueue from '../api/sms-queue';
import sms from '../api/sms';
import sifre from '../api/sifre';
import whatsapp from '../api/whatsapp';
import whatsappGonder from '../api/whatsapp-gonder';
import whatsappTest from '../api/whatsapp-test';

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
  '/api/monthly-report': monthlyReport,
  '/api/whatsapp': whatsapp,
  /*
    Meta panelinde webhook adresi olarak daha çok bu yol yazılıyor; iki
    adres de AYNI işleyiciye gidiyor. Eski adres kaldırılmadı: kurulumu
    yapılmış bir sistemde adresi değiştirmek, Meta panelinde de elle
    güncellenene kadar gelen bütün mesajların düşmesi demek.
  */
  '/api/webhooks/whatsapp': whatsapp,
  '/api/whatsapp-gonder': whatsappGonder,
  '/api/whatsapp-test': whatsappTest,
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
  /*
    Aylık rapor ayın ilk günü çıkar (madde 24) ve BİTEN ayın özetini
    verir. Saat 6: hatırlatmalardan önce, günün ilk işi olsun ve rapor
    yöneticinin sabah kutusunda dursun.
  */
  '0 6 1 * *': '/api/monthly-report',
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
