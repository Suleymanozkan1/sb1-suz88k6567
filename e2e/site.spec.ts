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

// Tanıtım sayfaları ve üyelik akışı kaldırıldı: sistem bir tanıtım sitesi
// değil, işletmenin kendi paneli. Açılış doğrudan giriş ekranı; hesaplar
// panelden tanımlanır, siteden üye olunmaz.
const PUBLIC_ROUTES = [
  { path: '/', heading: 'Giriş' },
  { path: '/kod-dogrulama', heading: 'Rezervasyon Kod Doğrulama' },
  { path: '/gizlilik-politikasi', heading: 'Gizlilik Politikası' },
  { path: '/kvkk-aydinlatma-metni', heading: 'KVKK Aydınlatma Metni' },
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
  test('açılış doğrudan giriş ekranıdır', async ({ page }) => {
    // Tanıtım sayfası yok; kök adres giriş formunu göstermeli.
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Giriş', level: 1 })).toBeVisible();
    await expect(page.getByLabel('E-Posta')).toBeVisible();
  });

  test('eski /uye-girisi adresi köke yönlendirir', async ({ page }) => {
    await page.goto('/uye-girisi');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Giriş', level: 1 })).toBeVisible();
  });

  test('footer bağlantıları çalışır', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'KVKK Aydınlatma Metni' }).click();
    await expect(page.getByRole('heading', { name: 'KVKK Aydınlatma Metni', level: 1 })).toBeVisible();
  });

  test('kaldırılan tanıtım ve üyelik adresleri 404 verir', async ({ page }) => {
    for (const yol of ['/nedir', '/ekranlar', '/uyeler', '/sss', '/iletisim', '/haberler',
      '/uye-ol', '/uyelik-sozlesmesi']) {
      await page.goto(yol);
      await expect(page.getByRole('heading', { level: 1 })).toContainText('bulunamadı');
    }
  });
});

test.describe('SEO ve erişilebilirlik', () => {
  test('sayfa başlığı ve meta açıklaması sayfaya göre değişir', async ({ page }) => {
    await page.goto('/');
    const homeTitle = await page.title();
    expect(homeTitle).toContain('Sahra Takip');

    await page.goto('/kod-dogrulama');
    expect(await page.title()).toContain('Kod Doğrulama');
    const desc = await page.locator('meta[name="description"]').getAttribute('content');
    expect(desc).toBeTruthy();
  });

  test('panel sayfaları arama motorlarına kapalıdır', async ({ page }) => {
    await page.goto('/');
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
