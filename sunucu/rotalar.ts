/**
 * Uç nokta ve zamanlanmış görev listesi.
 *
 * Cloudflare Worker'dan taşındı; içerik değişmedi. Ayrı dosyada
 * durmasının sebebi sunucuyu başlatmadan da okunabilmesi: testler
 * listeyi HTTP dinlemeden içe aktarabiliyor.
 */
import anket from '../api/anket';
import anketYanit from '../api/anket-yanit';
import backup from '../api/backup';
import hava from '../api/hava';
import havaSaatlik from '../api/hava-saatlik';
import health from '../api/health';
import gibOnizle from '../api/gib-onizle';
import kurlar from '../api/kurlar';
import invoice from '../api/invoice';
import iys from '../api/iys';
import login from '../api/login';
import otp from '../api/otp';
import mebTakvim from '../api/meb-takvim';
import ozelGunler from '../api/ozel-gunler';
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
  /*
    Anketin İKİ ucu var: `/api/anket` zamanlanmış görev (posta gönderir,
    cron sırrı ister), `/api/anket-yanit` müşteriye açık olan (jetonla
    okur ve yazar). Tek uçta toplanmadılar; yetki kuralları ters.
  */
  '/api/anket': anket,
  '/api/anket-yanit': anketYanit,
  '/api/backup': backup,
  '/api/hava': hava,
  '/api/hava-saatlik': havaSaatlik,
  '/api/health': health,
  '/api/gib-onizle': gibOnizle,
  '/api/kurlar': kurlar,
  '/api/invoice': invoice,
  '/api/iys': iys,
  '/api/login': login,
  '/api/otp': otp,
  '/api/meb-takvim': mebTakvim,
  '/api/ozel-gunler': ozelGunler,
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
  /*
    Kur saat başı. Daha sık sorulsaydı sağlayıcının günlük kotası
    öğleden önce biterdi; daha seyrek sorulsaydı ekrandaki kur gün
    içindeki hareketi kaçırırdı.
  */
  '0 * * * *': '/api/kurlar',
  /*
    Günlük tahmin GÜNDE BİR KEZ, sabah 05:15'te: MGM gecelik modelini
    sabaha karşı yayımlıyor, o saatten önce çekilen tahmin bir önceki
    günün verisi olurdu. Sağlayıcının kotası yok ama günde beş günlük
    tahmin saat başı değişmiyor; boşuna istek atmanın anlamı da yok.
  */
  '15 5 * * *': '/api/hava',
  /*
    Saatlik tahmin SAATTE BİR. Günlük tahminden ayrı, çünkü "düğün
    saatinde yağmur var mı" sorusunun cevabı gün ortalamasında yok:
    30 derece sıcak bir günün 19:00'unda sağanak olabilir. Dakika 20:
    saat başındaki diğer görevlerle (kur) aynı anda çalışmasın.
  */
  '20 * * * *': '/api/hava-saatlik',
  /*
    Anket sabah 9'da: organizasyondan bir hafta sonra, çiftin
    uyanık olduğu bir saatte. Gece gönderilen posta sabah gelen
    yığının altında kalıyor.
  */
  '0 9 * * *': '/api/anket',
  /*
    Özel günler ayda bir, ayın 2'sinde. Yılda bir yetmez: sağlayıcı uzak
    yılların dini bayram tarihlerini "kesinleşmedi" olarak veriyor ve
    resmî ilan yapıldığında güncelliyor; aylık tarama o düzeltmeyi
    kendiliğinden alıyor. Gece 4: kimse ekranda değilken.
  */
  '0 4 2 * *': '/api/ozel-gunler',
  /*
    MEB okul takvimi ayda bir, ayın 3'ünde. Duyuru mayıs-haziranda
    çıkıyor ama tarihi yıldan yıla kayıyor (2024'te 28 mayıs, 2025'te 15
    mayıs, 2026'da 13 haziran); "haziranda bir kez çek" deseydik, mayısta
    çıkan bir takvim bir ay boyunca görünmezdi. Aylık tarama ayrıca
    ERTELEMELERİ de yakalıyor: MEB bir tatili kaydırdığında duyuru
    güncelleniyor.
  */
  '0 4 3 * *': '/api/meb-takvim',
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
