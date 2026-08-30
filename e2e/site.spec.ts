import { expect, test, type Page } from '@playwright/test';

/**
 * Google Fonts gibi harici kaynaklar test ortamında erişilemeyebilir. Uygulama
 * bu durumda sistem yazı tiplerine düşerek çalışmaya devam eder; bu yüzden
 * harici istekler engellenir ve yalnızca uygulamanın kendi hataları ölçülür.
 */
async function blockExternalRequests(page: Page) {
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('http://127.0.0.1:4173') || url.startsWith('data:') || url.startsWith('blob:')) {
      return route.continue();
    }
    return route.abort();
  });
}

/** Sayfanın kendi JavaScript hatalarını toplar (harici kaynak hataları hariç). */
function collectAppErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    // Engellenen harici istekler uygulama hatası değildir.
    if (/ERR_(FAILED|CONNECTION_RESET|BLOCKED_BY_CLIENT|NAME_NOT_RESOLVED)/.test(text)) return;
    if (/Failed to load resource/.test(text)) return;
    errors.push(text);
  });
  return errors;
}

const PUBLIC_ROUTES = [
  { path: '/', heading: 'Düğün Takip' },
  { path: '/nedir', heading: 'Düğün Takip Salon Takip Programı Nedir?' },
  { path: '/haberler', heading: 'Haberler' },
  { path: '/ekranlar', heading: 'Ekranlar' },
  { path: '/uyeler', heading: 'Referanslarımız / Üyeler / İşletmeler' },
  { path: '/dusunceler', heading: 'Üyelerimizin Düşünceleri' },
  { path: '/sss', heading: 'Sık Sorulan Sorular' },
  { path: '/iletisim', heading: 'Düğün Takip Salon Takip Programı İletişim' },
  { path: '/demo-talebi', heading: 'Demo Talebi' },
  { path: '/kod-dogrulama', heading: 'Rezervasyon Kod Doğrulama' },
  { path: '/uye-ol', heading: 'Üye Ol' },
  { path: '/uye-girisi', heading: 'Üye Girişi' },
  { path: '/dugun-salonlari', heading: 'Düğün Salonları' },
  { path: '/kina-salonlari', heading: 'Kına Salonları' },
  { path: '/dugun-otelleri', heading: 'Düğün Otelleri' },
  { path: '/kir-dugunu-mekanlari', heading: 'Kır Düğünü Mekanları' },
  { path: '/gizlilik-politikasi', heading: 'Gizlilik Politikası' },
  { path: '/iade-proseduru', heading: 'İade/İptal Prosedürü' },
  { path: '/mesafeli-hizmet-sozlesmesi', heading: 'Mesafeli Hizmet Sözleşmesi' },
  { path: '/uyelik-sozlesmesi', heading: 'Üyelik Sözleşmesi' },
  { path: '/haberler/basari', heading: 'BAŞARI' },
];

test.describe('Herkese açık sayfalar', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route.path} açılır ve konsol hatası vermez`, async ({ page }) => {
      await blockExternalRequests(page);
      const errors = collectAppErrors(page);

      const response = await page.goto(route.path);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole('heading', { name: route.heading, level: 1 })).toBeVisible();
      expect(errors, `Konsol hataları: ${errors.join(' | ')}`).toEqual([]);
    });
  }

  test('bilinmeyen adres 404 sayfası gösterir', async ({ page }) => {
    await page.goto('/boyle-bir-sayfa-yok');
    await expect(page.getByRole('heading', { name: 'Aradığınız sayfa bulunamadı' })).toBeVisible();
  });

  test('her sayfanın benzersiz bir h1 başlığı vardır', async ({ page }) => {
    await blockExternalRequests(page);
    for (const route of PUBLIC_ROUTES) {
      await page.goto(route.path);
      await expect(page.locator('h1')).toHaveCount(1);
    }
  });

  test('sayfa yatay taşma yapmaz (mobil genişlik)', async ({ page }) => {
    await blockExternalRequests(page);
    await page.setViewportSize({ width: 375, height: 800 });
    for (const route of PUBLIC_ROUTES.slice(0, 8)) {
      await page.goto(route.path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${route.path} yatay taşma yapıyor`).toBeLessThanOrEqual(1);
    }
  });
});

test.describe('Gezinme', () => {
  test('ana menüden sayfalar arasında geçiş yapılır', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Nedir', exact: true }).click();
    await expect(page).toHaveURL(/\/nedir$/);
    await page.getByRole('link', { name: 'Ekranlar', exact: true }).click();
    await expect(page).toHaveURL(/\/ekranlar$/);
  });

  test('İçerik açılır menüsü Kod Doğrulama sayfasına götürür', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'İçerik' }).click();
    await page.getByRole('link', { name: 'Kod Doğrulama' }).first().click();
    await expect(page).toHaveURL(/\/kod-dogrulama$/);
  });

  test('mobil menü açılıp kapanır', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/');
    const toggle = page.getByRole('button', { name: 'Menüyü aç' });
    await toggle.click();
    await expect(page.getByRole('navigation', { name: 'Mobil menü' })).toBeVisible();
    await page.getByRole('button', { name: 'Menüyü kapat' }).click();
    await expect(page.getByRole('navigation', { name: 'Mobil menü' })).toBeHidden();
  });

  test('footer bağlantıları çalışır', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'İade/İptal Prosedürü' }).click();
    await expect(page.getByRole('heading', { name: 'İade/İptal Prosedürü', level: 1 })).toBeVisible();
  });
});

test.describe('SEO ve erişilebilirlik', () => {
  test('sayfa başlığı ve meta açıklaması sayfaya göre değişir', async ({ page }) => {
    await page.goto('/');
    const homeTitle = await page.title();
    expect(homeTitle).toContain('Düğün Takip');

    await page.goto('/sss');
    expect(await page.title()).toContain('Sık Sorulan Sorular');
    const desc = await page.locator('meta[name="description"]').getAttribute('content');
    expect(desc).toBeTruthy();
  });

  test('panel sayfaları arama motorlarına kapalıdır', async ({ page }) => {
    await page.goto('/uye-girisi');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  });

  test('html dili Türkçe olarak tanımlıdır', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
  });

  test('tüm görsellerin alternatif metni veya aria etiketi vardır', async ({ page }) => {
    await page.goto('/');
    const imgs = await page.locator('img').all();
    for (const img of imgs) {
      const alt = await img.getAttribute('alt');
      expect(alt).not.toBeNull();
    }
  });

  test('içeriğe geç bağlantısı klavye ile erişilebilir', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'İçeriğe geç' })).toBeFocused();
  });
});
