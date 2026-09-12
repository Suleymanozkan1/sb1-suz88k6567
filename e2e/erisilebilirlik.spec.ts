import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Erişilebilirlik denetimi (WCAG 2.2 AA).
 *
 * Denetim ilk çalıştırıldığında 29 sayfada 667 ihlal düğümü bulundu; neredeyse
 * hepsi tek bir kökten geliyordu: açık mavi vurgu rengi (#47b2e4) beyaz zeminde
 * 2,40 kontrast veriyordu, oysa normal metin için 4,5 gerekiyor. Palet
 * ayrıştırıldıktan sonra sıfıra indi. Bu test o durumu koruyor.
 *
 * Harici yazı tipleri engellenir: test ortamında erişilemedikleri için
 * yüklenmemiş bir yazı tipi kontrast ölçümünü bozabilir.
 */

// Tanıtım sayfaları ve üyelik akışı kaldırıldı; herkese açık yüzey giriş,
// müşterinin rezervasyon sorgusu ve yasal metinlerden ibaret.
const HERKESE_ACIK = [
  '/', '/kod-dogrulama',
  '/gizlilik-politikasi', '/kvkk-aydinlatma-metni',
];

const PANEL = [
  '/panel', '/panel/takvim', '/panel/rezervasyonlar', '/panel/kasa',
  '/panel/faturalar', '/panel/raporlar', '/panel/salonlar', '/panel/menuler',
  '/panel/hatirlatmalar', '/panel/odeme-bildirimleri', '/panel/izinler', '/panel/sms', '/panel/kullanicilar', '/panel/musteriler', '/panel/urun-hizmet',
  '/panel/isletmeler', '/panel/renk-ayarlari', '/panel/denetim',
  '/panel/ayarlar', '/panel/sistem',
  '/panel/musteri-adaylari', '/panel/musteri-adaylari/yeni', '/panel/whatsapp-ayarlari',
];

/** WCAG 2.0/2.1/2.2 A ve AA ölçütleri. */
const OLCUTLER = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function disKaynaklariEngelle(page: Page) {
  await page.route('**://fonts.googleapis.com/**', (r) => r.abort());
  await page.route('**://fonts.gstatic.com/**', (r) => r.abort());
}

async function denetle(page: Page, yol: string) {
  await page.goto(yol, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  const sonuc = await new AxeBuilder({ page }).withTags(OLCUTLER).analyze();
  const ozet = sonuc.violations.map(
    (v) => `${v.id} (${v.impact}) ×${v.nodes.length}: ${v.nodes[0]?.html.slice(0, 120)}`,
  );
  expect(ozet, `${yol} erişilebilirlik ihlali`).toEqual([]);
}

test.describe('Erişilebilirlik, herkese açık sayfalar', () => {
  for (const yol of HERKESE_ACIK) {
    test(`${yol} WCAG 2.2 AA ihlali içermiyor`, async ({ page }) => {
      await disKaynaklariEngelle(page);
      await denetle(page, yol);
    });
  }
});

test.describe('Erişilebilirlik, üye paneli', () => {
  test.beforeEach(async ({ page }) => {
    await disKaynaklariEngelle(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Demo bilgilerini doldur' }).click();
    await page.getByRole('button', { name: 'Giriş Yap' }).click();
    await page.waitForURL(/\/panel$/);
  });

  for (const yol of PANEL) {
    test(`${yol} WCAG 2.2 AA ihlali içermiyor`, async ({ page }) => {
      await denetle(page, yol);
    });
  }
});
