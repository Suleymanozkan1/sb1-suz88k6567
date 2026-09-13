/**
 * WhatsApp Web eşleştirme betiği (bir kez çalıştırılır).
 *
 * QR kodunu TERMİNALE basar; operatör ikinci telefondan okutur ve oturum
 * diske yazılır. Sunucu bundan sonra o oturumla bağlanır.
 *
 * QR NEDEN PANELDE DEĞİL. O kare, WhatsApp hesabına cihaz bağlama
 * yetkisi verir: gören herkes hesabı kendi cihazına bağlayabilir.
 * Tarayıcıya açılan bir uç nokta olsaydı, yetkilendirmede yapılacak tek
 * bir hata hesabın devredilmesi demekti. Eşleştirme zaten bir kerelik bir
 * kurulum işi ve kurulumun geri kalanı gibi SSH'den yapılıyor.
 *
 * Kullanım (sunucuda):
 *   node sunucu-dist/sunucu/whatsapp-esle.js
 */
import { baglan, baglantiDurumu, whatsappWebEtkinMi } from '../api/_whatsapp_web.js';

/** QR'ı terminalde kare olarak çizer. */
function qrYaz(metin: string): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const qr = require('qrcode-terminal') as {
    generate(metin: string, secenek: { small: boolean }): void;
  };
  qr.generate(metin, { small: true });
}

async function main(): Promise<void> {
  if (!whatsappWebEtkinMi()) {
    console.error('WHATSAPP_WEB_ETKIN=1 değil. Eşleştirme yapılmadı.');
    process.exit(1);
  }

  console.log('QR üretiliyor. İkinci telefondan WhatsApp > Bağlı cihazlar > Cihaz bağla.');
  console.log('DİKKAT: bu numara Cloud API\'ye KAYITLI OLMAMALI.\n');

  const durum = await baglan((qr) => {
    qrYaz(qr);
    console.log('\nQR yukarıda. Okuttuktan sonra bekleyin...\n');
  });

  if (durum === 'bagli' || baglantiDurumu() === 'bagli') {
    console.log('BAĞLANDI. Oturum diske yazıldı; sunucu bundan sonra kendisi bağlanacak.');
    process.exit(0);
  }

  console.error('Bağlanamadı. QR süresi dolmuş olabilir; betiği yeniden çalıştırın.');
  process.exit(2);
}

void main();
