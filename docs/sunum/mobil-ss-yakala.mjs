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
 * Ölçü iPhone 14 Pro'nun mantıksal genişliği (393×852), ölçek 3×,
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
  await s.waitForTimeout(1100);
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
  await s.waitForTimeout(500);
}

/**
 * Sekme geçişi. Sekme çubuğu görünmüyorsa (ayrıntı ekranı üste yığılmış)
 * önce sekme köküne dönülür.
 */
async function sekme(ad) {
  const hedef = s.getByRole('tab', { name: new RegExp(ad) });
  const gorundu = await hedef.waitFor({ state: 'visible', timeout: 2500 })
    .then(() => true).catch(() => false);
  if (!gorundu) await ac('/');
  await hedef.click();
  // Geçiş animasyonu bitmeden yakalanınca sekme çubuğu başlığın üstüne biniyor.
  await s.waitForTimeout(1600);
}

/**
 * Bir ekrana doğrudan gider.
 *
 * Önceki sürüm tarayıcı geçmişiyle (goBack) dolaşıyordu; expo-router sekme
 * geçişlerinde geçmişi beklendiği gibi yığmadığı için ayrıntı ekranından
 * geri dönüş bazen giriş ekranına düşüyor ve yakalama yarıda kalıyordu.
 * Tanıtım oturumu artık yeniden yüklemeye dayandığı için adresle gezmek
 * güvenli ve çok daha kararlı.
 */
async function ac(yol) {
  await s.goto(KOK + yol, { waitUntil: 'domcontentloaded' });
  await s.waitForTimeout(3200);
}

/** "Daha" listesindeki bir ekranı açar ve yakalar. */
async function dahaEkrani(yol, ad, kaydirma = 0) {
  await ac(yol);
  if (kaydirma) await kaydir(kaydirma);
  await cek(ad);
}

await s.goto(KOK, { waitUntil: 'domcontentloaded' });
await s.waitForTimeout(9000);
await cek('01-giris');

await s.getByRole('button', { name: 'Giriş Yap' }).click();
await s.waitForTimeout(3000);
await cek('02-bugun');

await sekme('Takvim');
await cek('03-takvim');

await sekme('Kayıtlar');
await cek('04-kayitlar');

await sekme('Kasa');
await cek('05-kasa');

// Rezervasyon ayrıntısı: üst yarı (para durumu ve müşteri).
await ac('/rezervasyon/1');
await cek('06-rezervasyon');

// Hızlı tahsilat kartı tutar yazılmış hâliyle; boş bir form ne işe
// yaradığını anlatmıyor.
await kaydir(260);
await s.getByLabel('Tahsilat tutarı').fill('25.000');
await s.getByLabel('Tahsilat açıklaması').fill('Ara ödeme');
await s.getByLabel('Tahsilat tutarı').blur();
await cek('07-hizli-tahsilat');

// Hatırlatma bölümü: bir taslak seçilip doldurulmuş metin gösterilir.
await kaydir(700);
await s.getByRole('radio', { name: 'Tarih hatırlatması' }).click();
await s.waitForTimeout(700);
await cek('08-hatirlatma-gonder');

await kaydir(900);
await cek('09-is-emri');

// Yeni rezervasyon formu
await ac('/rezervasyon/yeni');
await s.getByLabel('Ad soyad').fill('Elif & Barış Yalçın');
await s.getByLabel('Cep telefonu').fill('5327778899');
await s.getByLabel('Davetli sayısı').fill('280');
await s.getByLabel('Davetli sayısı').blur();
await cek('10-yeni-rezervasyon');

// "Daha" sekmesinin kendisi: bütün ekranların listesi.
await ac('/daha');
await cek('11-daha');
await dahaEkrani('/hatirlatmalar', '12-hatirlatmalar');
await dahaEkrani('/raporlar', '13-raporlar');
await dahaEkrani('/faturalar', '14-faturalar');
await dahaEkrani('/sms', '15-sms');
await dahaEkrani('/izinler', '16-izinler');
await dahaEkrani('/menuler', '17-menuler');
await dahaEkrani('/tedarikciler', '18-tedarikciler');
await dahaEkrani('/musteriler', '19-musteriler');
await dahaEkrani('/talepler', '20-talepler');
await dahaEkrani('/kullanicilar', '21-kullanicilar', 300);
await dahaEkrani('/sistem', '22-sistem');
await dahaEkrani('/denetim', '23-denetim');
await dahaEkrani('/ayarlar', '24-ayarlar');
await dahaEkrani('/hesap', '25-hesap');

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
