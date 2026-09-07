/**
 * Sunum ekran görüntülerini uygulamadan yakalar.
 *
 *   npm run preview -- --port 4173 --host 127.0.0.1   # ayrı terminalde
 *   node docs/sunum/ss-yakala.mjs
 *
 * Görüntüler docs/ss/ altına yazılır; sunum-uret.js oradan okur.
 * Demo modu uyarı bandı gizlenir: kurulum notudur, ürünün parçası değildir.
 */
import { chromium } from 'playwright';
import { mkdirSync, appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = 'http://127.0.0.1:4173';
/** SS_LOG verilirse ilerleme ayrıca o dosyaya yazılır; uzun koşuları izlemek için. */
const GUNLUK = process.env.SS_LOG;
const not = (s) => { console.log(s); if (GUNLUK) appendFileSync(GUNLUK, s + '\n'); };
const SS = resolve(dirname(fileURLToPath(import.meta.url)), '../ss');
mkdirSync(SS, { recursive: true });

const iki = (n) => String(n).padStart(2, '0');
const bugun = new Date();
/** Bu ay içinde, verilen güne denk gelen ISO tarih. */
const buAy = (gun) => `${bugun.getFullYear()}-${iki(bugun.getMonth() + 1)}-${iki(gun)}`;

/**
 * Demo bandını ve geçiş animasyonlarını kaldırır. Öğe görüntülerinde
 * yapışkan başlık öğenin üstünü kapattığı için o da gizlenebilir.
 */
async function temizle(page, { stickyGizle = false } = {}) {
  await page.addStyleTag({ content: `
    *,*::before,*::after{transition:none!important;animation:none!important}
    main > div[role="status"]{display:none!important}
    ${stickyGizle ? 'header.sticky,header[class*="sticky"]{display:none!important}' : ''}
  ` });
}

async function cek(page, ad, hedef) {
  await page.waitForTimeout(300);
  await temizle(page, { stickyGizle: Boolean(hedef) });
  await page.waitForTimeout(120);
  if (hedef) await page.locator(hedef).first().screenshot({ path: `${SS}/${ad}.png` });
  else await page.screenshot({ path: `${SS}/${ad}.png` });
  not('  ✓ ' + ad);
}

/** Sayfayı aç, yüklenmesini bekle, sonra tam ekran görüntüsü al. */
async function ekran(page, ad, yol) {
  await page.goto(KOK + yol);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(700);
  await page.evaluate(() => window.scrollTo(0, 0));
  await cek(page, ad);
}

async function girisYap(page) {
  await page.goto(`${KOK}/uye-girisi`);
  await page.getByRole('button', { name: 'Demo bilgilerini doldur' }).click();
  await page.getByRole('button', { name: 'Giriş Yap' }).click();
  await page.waitForURL(/\/panel$/);
}

/** Tutarları bilinen bir rezervasyon açar ve kimliğini döndürür. */
async function rezervasyon(page, { ad, tarih, kisi, tutar, kapora, tur }) {
  await page.goto(`${KOK}/panel/rezervasyonlar/yeni`);
  await page.locator('#hallId').selectOption({ index: 1 });
  await page.locator('#customerName').fill(ad);
  await page.locator('#customerPhone').fill('5321234567');
  await page.locator('#date').fill(tarih);
  if (tur) await page.locator('#organizationType').selectOption(tur);
  await page.locator('#guestCount').fill(String(kisi));
  await page.locator('#totalAmount').fill(String(tutar));
  await page.locator('#deposit').fill(String(kapora));
  await page.getByRole('button', { name: /Kaydet/ }).click();
  await page.waitForURL(/\/panel\/rezervasyonlar\/[0-9a-f-]{36}$/);
  not('  · rezervasyon: ' + ad);
  return page.url().split('/').pop();
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2,
  // Tarih ve saat alanları tarayıcı diline göre biçimlenir; ürün Türkçe olduğu
  // için gg.aa.yyyy ve 24 saat gösterimi gerekir.
  locale: 'tr-TR', timezoneId: 'Europe/Istanbul',
});
const page = await ctx.newPage();

not('Giriş yapılıyor…');
await girisYap(page);

not('Örnek veriler hazırlanıyor…');
// Takvimin dolu görünmesi için bu ay içine birkaç kayıt açılır.
await rezervasyon(page, { ad: 'Zeynep & Can Arslan', tarih: buAy(11), kisi: 320, tutar: 210000, kapora: 60000, tur: 'Düğün' });
await rezervasyon(page, { ad: 'Deniz & Kaan Şen',    tarih: buAy(19), kisi: 150, tutar: 95000,  kapora: 25000, tur: 'Nikâh' });
await rezervasyon(page, { ad: 'Melis Ailesi',        tarih: buAy(24), kisi: 200, tutar: 120000, kapora: 30000, tur: 'Kına' });
// Ayrıntı, ödeme planı, sözleşme, makbuz ve masa düzeni bu kayıt üzerinden gösterilir.
const rid = await rezervasyon(page, { ad: 'Ayşe & Mert Yıldız', tarih: buAy(26), kisi: 280, tutar: 180000, kapora: 45000, tur: 'Düğün' });
// Masa düzeni slaytı 80 davetlilik planı anlatıyor; 280 kişilik kaydın
// 28 satırlık tablosu slayta sığmıyor.
const ridMasa = await rezervasyon(page, { ad: 'Ece & Kerem Aydın', tarih: buAy(28), kisi: 80, tutar: 55000, kapora: 15000, tur: 'Nişan' });

// Talepler ekranı için siteden gerçek talepler gönderilir.
for (const [ad, tel, mesaj] of [
  ['Elif Demir',  '5321110011', '14 Haziran 2027 için 250 kişilik düğün organizasyonu düşünüyoruz. Fiyat bilgisi alabilir miyiz?'],
  ['Burak Aslan', '5321110022', 'Nikâh sonrası kokteyl için salon müsaitliğinizi öğrenmek istiyorum.'],
  ['Selin Kaya',  '5321110033', 'Kına gecesi için 120 kişilik menü seçeneklerinizi paylaşabilir misiniz?'],
]) {
  await page.goto(`${KOK}/iletisim`);
  await page.getByLabel('Adınız Soyadınız').fill(ad);
  await page.getByLabel('Telefon').fill(tel);
  await page.getByLabel('E-posta').fill(`${tel}@ornek.com`);
  await page.getByLabel('Mesajınız').fill(mesaj);
  await page.getByRole('button', { name: /Mesajımı gönder/ }).click();
  not('  · talep: ' + ad);
  await page.waitForTimeout(250);
}

// Ödeme planı, iş emri, tedarikçi ve masa düzeni bölümleri boş görünmesin
// diye örnek kayıt üzerinde gerçekten doldurulur.
not('Örnek rezervasyon dolduruluyor…');
await page.goto(`${KOK}/panel/rezervasyonlar/${rid}`);
await page.waitForLoadState('domcontentloaded');
await page.waitForTimeout(900);

await page.locator('#plan-count').fill('3');
await page.getByRole('button', { name: 'Kalan tutarı böl' }).click();
await page.getByRole('button', { name: 'Ödeme planını kaydet' }).click();
await page.waitForTimeout(600);
not('  · ödeme planı');

await page.getByRole('button', { name: 'Örnek akışla başla' }).click();
for (const [sira, sorumlu] of [[1, 'Temizlik'], [2, 'Servis'], [3, 'Operasyon'],
                               [4, 'Karşılama'], [5, 'Mutfak'], [6, 'Servis']]) {
  await page.getByLabel(`${sira}. iş sorumlusu`).fill(sorumlu);
}
await page.getByRole('button', { name: 'İş emrini kaydet' }).click();
await page.waitForTimeout(600);
not('  · iş emri');

for (const [sira, saat, ucret, aciklama] of [[1, '17:00', '18000', 'Fotoğraf ve video çekimi'],
                                             [2, '14:00', '12000', 'Sahne ve masa süslemesi'],
                                             [3, '20:00', '25000', 'Canlı müzik, 4 saat']]) {
  await page.getByRole('button', { name: 'Tedarikçi ekle' }).click();
  await page.getByLabel(`${sira}. tedarikçi`, { exact: true }).selectOption({ index: sira });
  await page.getByLabel(`${sira}. tedarikçi geliş saati`).fill(saat);
  await page.getByLabel(`${sira}. tedarikçi ücreti`).fill(ucret);
  await page.getByLabel(`${sira}. tedarikçi notu`).fill(aciklama);
}
await page.getByRole('button', { name: 'Tedarikçileri kaydet' }).click();
await page.waitForTimeout(600);
not('  · tedarikçi ataması');

await page.goto(`${KOK}/panel/rezervasyonlar/${ridMasa}`);
await page.waitForLoadState('domcontentloaded');
await page.waitForTimeout(900);
await page.getByRole('button', { name: 'Davetliye göre plan öner' }).click();
await page.getByRole('button', { name: 'Masa düzenini kaydet' }).click();
await page.waitForTimeout(600);
not('  · masa düzeni');

// Fatura listesi boş görünmesin diye örnek bir e-Arşiv faturası kesilir.
not('Örnek fatura kesiliyor…');
await page.goto(`${KOK}/panel/faturalar`);
await page.waitForLoadState('domcontentloaded');
await page.waitForTimeout(700);
await page.getByRole('button', { name: 'Yeni Fatura' }).click();
await page.locator('#fb-name').fill('Ayşe Yıldız');
await page.locator('#fb-address').fill('Bahçelievler Mah. Gül Sok. No:12, Çankaya / Ankara');
await page.locator('#ln-desc-0').fill('Salon kiralama ve ikram hizmeti');
await page.locator('#ln-qty-0').fill('1');
await page.locator('#ln-price-0').fill('180000');
await page.getByRole('button', { name: 'Faturayı oluştur ve gönder' }).click();
await page.waitForTimeout(1000);
not('  · fatura');

not('Tam ekranlar yakalanıyor…');
for (const [ad, yol] of [
  ['panel-takvim',      '/panel/takvim'],
  ['panel-salonlar',    '/panel/salonlar'],
  ['panel-menuler',     '/panel/menuler'],
  ['panel-tedarikciler','/panel/tedarikciler'],
  ['panel-raporlar',    '/panel/raporlar'],
  ['panel-kasa',        '/panel/kasa'],
  ['panel-talepler',    '/panel/talepler'],
  ['panel-faturalar',   '/panel/faturalar'],
  ['panel-rezervasyon-detay', `/panel/rezervasyonlar/${rid}`],
]) await ekran(page, ad, yol);

not('Bölüm görüntüleri yakalanıyor…');
await page.goto(`${KOK}/panel/rezervasyonlar/${rid}`);
await page.waitForLoadState('domcontentloaded');
await page.waitForTimeout(900);
for (const [ad, baslik] of [
  ['panel-odeme-plani',      'Ödeme Planı'],
  ['panel-is-emri',          'Etkinlik İş Emri'],
  ['panel-tedarikci-atama',  'Tedarikçiler'],
]) {
  const bolum = page.locator('section.card').filter({ has: page.getByRole('heading', { name: baslik, exact: true }) });
  await bolum.first().scrollIntoViewIfNeeded();
  await cek(page, ad, `section.card:has(h2:text-is("${baslik}"))`);
}

await page.goto(`${KOK}/panel/rezervasyonlar/${ridMasa}`);
await page.waitForLoadState('domcontentloaded');
await page.waitForTimeout(900);
{
  const bolum = page.locator('section.card:has(h2:text-is("Masa Oturma Düzeni"))');
  await bolum.first().scrollIntoViewIfNeeded();
  await cek(page, 'panel-masa-duzeni', 'section.card:has(h2:text-is("Masa Oturma Düzeni"))');
}

not('Belge ekranları yakalanıyor…');
await ekran(page, 'panel-sozlesme', `/panel/rezervasyonlar/${rid}/sozlesme`);
await ekran(page, 'panel-makbuz',   `/panel/rezervasyonlar/${rid}/makbuz`);

not('Site ekranı yakalanıyor…');
await page.goto(`${KOK}/panel/rezervasyonlar/${rid}`);
const kod = (await page.getByText(/DT-\d{4}-\d+/).first().textContent()).match(/DT-\d{4}-\d+/)[0];
await page.goto(`${KOK}/kod-dogrulama`);
await page.getByLabel(/[Kk]od/).first().fill(kod);
await page.getByRole('button', { name: /Kodu Kontrol Et|Doğrula/ }).click();
await page.waitForTimeout(600);
await cek(page, 'site-kod-dogrulama', 'main');

await browser.close();
not('Bitti → ' + SS);
