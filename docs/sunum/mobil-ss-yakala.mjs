/**
 * Mobil uygulamanın ekran görüntülerini yakalar.
 *
 *   cd mobil && npx expo start --web --port 8081   # ayrı terminalde
 *   node docs/sunum/mobil-ss-yakala.mjs
 *
 * Görüntüler docs/ss-mobil/ altına yazılır; sunumun mobil slaydı için
 * docs/ss/ altına "mobil-" önekiyle kopyalanır.
 *
 * Ölçü iPhone 14 Pro'nun mantıksal genişliği (393×852), ölçek 3× —
 * sunumda büyütüldüğünde bulanıklaşmasın diye.
 */
import { chromium } from 'playwright';
const KOK = 'http://127.0.0.1:8081';
const DIZIN = 'docs/ss-mobil';
const t = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  env: { ...process.env, LANG: 'tr_TR.UTF-8', LC_ALL: 'tr_TR.UTF-8' } });
const ctx = await t.newContext({
  viewport: { width: 393, height: 852 }, deviceScaleFactor: 3,
  isMobile: true, hasTouch: true, locale: 'tr-TR', timezoneId: 'Europe/Istanbul',
});
const s = await ctx.newPage();
const hatalar = [];
s.on('pageerror', (e) => hatalar.push(String(e).slice(0, 160)));

async function cek(ad) {
  await s.waitForTimeout(1200);
  await s.screenshot({ path: `${DIZIN}/${ad}.png` });
  console.log('  ✓', ad);
}

await s.goto(KOK, { waitUntil: 'domcontentloaded' });
await s.waitForTimeout(5000);
await cek('01-giris');

await s.getByRole('button', { name: 'Giriş Yap' }).click();
await s.waitForTimeout(2500);
await cek('02-bugun');

await s.getByRole('tab', { name: /Takvim/ }).click();
await cek('03-takvim');

await s.getByRole('tab', { name: /Kasa/ }).click();
await cek('04-kasa');

await s.getByRole('tab', { name: /Bugün/ }).click();
await s.waitForTimeout(800);
await s.getByText('Zeynep & Can Arslan').first().click();
await s.waitForTimeout(1800);
await cek('05-rezervasyon');
// Sayfanın alt yarısı: iş emri.
// React Native Web'de kaydırma pencerede değil, ScrollView'un kendi
// div'inde olur; window.scrollTo hiçbir şey yapmıyordu.
await s.mouse.move(196, 500);
await s.mouse.wheel(0, 1500);
await cek('06-is-emri');

await s.goto(`${KOK}/hesap`, { waitUntil: 'domcontentloaded' });
await s.waitForTimeout(2500);
await cek('07-hesap');

console.log('sayfa hataları:', hatalar.length ? hatalar.slice(0, 4) : 'yok');
await t.close();
