/**
 * Mobil uygulamanın ekran görüntülerini yakalar.
 *
 *   cd mobil && npx expo start --web --port 8081   # ayrı terminalde
 *   node docs/sunum/mobil-ss-yakala.mjs
 *
 * Görüntüler docs/ss-mobil/ altına yazılır ve sunumun kullandığı docs/ss/
 * dizinine "mobil-" önekiyle kopyalanır. Kopyalama elle yapılırken bir
 * yakalama unutuluyor ve sunum eski görüntüyle üretiliyordu.
 *
 * Ölçü iPhone 14 Pro'nun mantıksal genişliği (393×852), ölçek 3× —
 * sunumda büyütüldüğünde bulanıklaşmasın diye.
 */
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const KOK = 'http://127.0.0.1:8081';
const DIZIN = 'docs/ss-mobil';
const SUNUM_DIZIN = 'docs/ss';

const t = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  env: { ...process.env, LANG: 'tr_TR.UTF-8', LC_ALL: 'tr_TR.UTF-8' } });
const ctx = await t.newContext({
  viewport: { width: 393, height: 852 }, deviceScaleFactor: 3,
  isMobile: true, hasTouch: true, locale: 'tr-TR', timezoneId: 'Europe/Istanbul',
});
const s = await ctx.newPage();
const hatalar = [];
s.on('pageerror', (e) => hatalar.push(String(e).slice(0, 160)));

/** Yakalanan görüntüler: sonda ikisinin aynı olup olmadığı denetlenir. */
const yakalananlar = [];

async function cek(ad) {
  await s.waitForTimeout(1200);
  const veri = await s.screenshot({ path: `${DIZIN}/${ad}.png` });
  yakalananlar.push([ad, veri]);
  console.log('  ✓', ad);
}

/**
 * React Native Web'de kaydırma pencerede değil, ScrollView'un kendi
 * div'inde olur; window.scrollTo hiçbir şey yapmıyordu. Tekerlek olayı
 * imlecin altındaki kaydırılabilir kapsayıcıya gider.
 */
async function kaydir(piksel) {
  await s.mouse.move(196, 560);
  await s.mouse.wheel(0, piksel);
  await s.waitForTimeout(600);
}

await s.goto(KOK, { waitUntil: 'domcontentloaded' });
await s.waitForTimeout(5000);
await cek('01-giris');

await s.getByRole('button', { name: 'Giriş Yap' }).click();
await s.waitForTimeout(2500);
await cek('02-bugun');

// Listenin devamı: bugünün altındaki yaklaşan organizasyonlar.
await kaydir(700);
await cek('03-yaklasanlar');
await kaydir(-1200);

await s.getByRole('tab', { name: /Takvim/ }).click();
await s.waitForTimeout(1200);
await cek('04-takvim');

// Kayıt taşıyan ileri tarihli bir gün seçilir: ızgaranın altındaki
// günlük listenin dolu hâli görünsün.
await s.getByRole('button', { name: /kayıt$/ }).last().click();
await cek('05-takvim-gun');

await s.getByRole('tab', { name: /Kasa/ }).click();
await cek('06-kasa');

await s.getByRole('tab', { name: /Bugün/ }).click();
await s.waitForTimeout(800);
await s.getByText('Zeynep & Can Arslan').first().click();
await s.waitForTimeout(1800);
await cek('07-rezervasyon');

// Hızlı tahsilat kartı: tutar yazılmış hâliyle yakalanır, boş bir form
// ne işe yaradığını anlatmıyor.
//
// Kaydırma miktarı ölçülerek seçildi: sayfa 1253, pencere 788 piksel, yani
// en çok 465 kaydırılabiliyor. 600 ve 900 aynı yere, sayfa sonuna
// düşüyordu ve iki ekran görüntüsü birebir aynı çıkıyordu.
await kaydir(250);
await s.getByLabel('Tahsilat tutarı').fill('25.000');
await s.getByLabel('Tahsilat açıklaması').fill('Ara ödeme');
await s.getByLabel('Tahsilat tutarı').blur();
await cek('08-hizli-tahsilat');

// Sayfanın sonu: tahsilat geçmişi ve iş emri.
await kaydir(900);
await cek('09-is-emri');

// Rezervasyon ayrıntısı sekmelerin üstüne yığılan bir ekran; sekme çubuğu
// görünmüyor, önce geri dönmek gerekiyor.
await s.goBack();
await s.waitForTimeout(1200);
// Sekmeye dokunarak geçilir; goto tam sayfa yeniden yükleme yapıyor ve
// tanıtım oturumu bellekte tutulduğu için kullanıcı giriş ekranına
// düşüyordu — hesap ekranı yerine giriş ekranı yakalanmıştı.
await s.getByRole('tab', { name: /Hesap/ }).click();
// Sekme geçiş animasyonu bitmeden yakalanınca sekme çubuğu başlığın
// üstüne biniyordu; geçişin oturması beklenir.
await s.waitForTimeout(2500);
await cek('10-hesap');

// Aynı ekranın iki kez yakalanması sessiz bir hatadır (yanlış gezinme,
// beklenmeyen yönlendirme). Karşılaştırarak erken yakalanır.
const ozetler = new Map();
for (const [ad, veri] of yakalananlar) {
  const ozet = createHash('sha1').update(veri).digest('hex');
  if (ozetler.has(ozet)) {
    console.error(`HATA: ${ad} ile ${ozetler.get(ozet)} birebir aynı.`);
    process.exitCode = 1;
  }
  ozetler.set(ozet, ad);
}

// Eski numaralandırmadan kalan dosyalar sunumda kullanılmaya devam
// etmesin diye önce temizlenir.
for (const d of fs.readdirSync(SUNUM_DIZIN)) {
  if (d.startsWith('mobil-')) fs.rmSync(`${SUNUM_DIZIN}/${d}`);
}
for (const [ad] of yakalananlar) {
  fs.copyFileSync(`${DIZIN}/${ad}.png`, `${SUNUM_DIZIN}/mobil-${ad}.png`);
}
console.log(`${yakalananlar.length} görüntü ${SUNUM_DIZIN}/ dizinine kopyalandı.`);

console.log('sayfa hataları:', hatalar.length ? hatalar.slice(0, 4) : 'yok');
await t.close();
