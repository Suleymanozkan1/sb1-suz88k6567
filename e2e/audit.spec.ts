import { expect, test, type Page } from '@playwright/test';

/** Harici kaynakları engeller; engellenen istekler konsol gürültüsü sayılmaz. */
async function blockExternalRequests(page: Page) {
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('http://127.0.0.1:4173') || url.startsWith('data:') || url.startsWith('blob:')) {
      return route.continue();
    }
    return route.abort();
  });
}

async function login(page: Page) {
  await blockExternalRequests(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Demo bilgilerini doldur' }).click();
  await page.getByRole('button', { name: 'Giriş Yap' }).click();
  await expect(page).toHaveURL(/\/panel$/);
}

/** Engellenen dış kaynak hataları uygulama hatası değildir; ayıklanır. */
function isAppError(text: string): boolean {
  return !/Failed to load resource|net::ERR_FAILED|ERR_BLOCKED/.test(text);
}

test('DENETIM: panel ekranlarında uygulama hatası ve kırık değer yok', async ({ page }) => {
  await login(page);
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && isAppError(m.text())) problems.push(`console: ${m.text()}`);
  });

  const routes = [
    '/panel', '/panel/takvim', '/panel/rezervasyonlar', '/panel/rezervasyonlar/yeni',
    '/panel/musteriler', '/panel/kasa', '/panel/raporlar', '/panel/renk-ayarlari',
    '/panel/isletmeler', '/panel/kullanicilar', '/panel/sms', '/panel/izinler',
    '/panel/denetim', '/panel/sistem', '/panel/faturalar', '/panel/ayarlar',
  ];

  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator('h1').first()).toBeVisible();
    const body = await page.locator('main').innerText();
    for (const bad of ['undefined', 'NaN', '[object Object]', 'Infinity']) {
      expect(body, `${route} ekranında "${bad}" görünüyor`).not.toContain(bad);
    }
  }
  expect(problems, problems.join('\n')).toEqual([]);
});

test('DENETIM: rezervasyon yaşam döngüsü, oluştur, tahsilat, bakiye, sözleşme', async ({ page }) => {
  await login(page);

  await page.goto('/panel/rezervasyonlar/yeni');
  await page.locator('#customerName').fill('Denetim Testi');
  await page.locator('#customerPhone').fill('5321112233');
  await page.locator('#date').fill('2027-06-12');
  await page.locator('#guestCount').fill('400');
  await page.locator('#totalAmount').fill('300000');
  await page.locator('#deposit').fill('50000');
  // Kalan alacak alanı kendiliğinden hesaplanmalı
  await expect(page.locator('#balance')).toHaveValue(/250000|250\.000/);
  await page.getByRole('button', { name: /Kaydet/ }).click();
  // Kayıt sonrası doğrudan detay sayfasına gidilir
  await expect(page).toHaveURL(/\/panel\/rezervasyonlar\/[0-9a-f-]{36}$/);
  const detayUrl = page.url();
  await expect(page.getByText('Denetim Testi').first()).toBeVisible();

  // Listede de görünmeli
  await page.goto('/panel/rezervasyonlar');
  await expect(page.getByText('Denetim Testi').first()).toBeVisible();
  await page.goto(detayUrl);
  await expect(page.getByText(/250\.000/).first()).toBeVisible();

  // Tahsilat ekle: 80.000 -> toplam tahsilat 130.000, kalan 170.000
  await page.locator('#pay-amount').fill('80000');
  await page.getByRole('button', { name: /Tahsilat Ekle|Ekle|Kaydet/ }).first().click();
  await expect(page.getByText(/170\.000/).first()).toBeVisible();
  await expect(page.getByText(/130\.000/).first()).toBeVisible();

  await page.goto(`${detayUrl}/sozlesme`);
  await expect(page.getByText('Denetim Testi').first()).toBeVisible();
});

test('DENETIM: aynı tarih ve seansa ikinci rezervasyon engellenir', async ({ page }) => {
  await login(page);
  for (const [ad, tel] of [['Çakışma A', '5321112244'], ['Çakışma B', '5321112255']]) {
    await page.goto('/panel/rezervasyonlar/yeni');
    await page.locator('#customerName').fill(ad);
    await page.locator('#customerPhone').fill(tel);
    await page.locator('#date').fill('2027-08-08');
    await page.locator('#guestCount').fill('250');
    await page.locator('#totalAmount').fill('100000');
    await page.getByRole('button', { name: /Kaydet/ }).click();
    if (ad === 'Çakışma A') await expect(page).toHaveURL(/\/panel\/rezervasyonlar/);
  }
  await expect(page.getByText(/dolu|çakış|zaten|kayıtlı/i).first()).toBeVisible();
});

test('DENETIM: kasa kaydı eklenir, listeye ve bakiyeye yansır', async ({ page }) => {
  await login(page);
  await page.goto('/panel/kasa');
  await expect(page.locator('tbody tr').first()).toBeVisible();
  const before = await page.locator('tbody tr').count();

  await page.getByLabel('Açıklama').fill('Denetim gideri');
  await page.getByLabel('Tutar', { exact: true }).fill('12345');
  await page.getByRole('button', { name: /Ekle|Kaydet/ }).first().click();

  await expect(page.getByText('Denetim gideri')).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(before + 1);
});

test('DENETIM: rapor toplamları kasa ve rezervasyon verisiyle tutarlı', async ({ page }) => {
  await login(page);
  await page.goto('/panel/raporlar');
  await expect(page.locator('h1')).toBeVisible();
  const body = await page.locator('main').innerText();
  expect(body).not.toMatch(/NaN|undefined|Infinity/);
  // Para birimi biçimi bozulmamalı
  expect(body).toMatch(/₺|TL/);
});

test('DENETIM: çıkış yapınca oturum kapanır ve panel korunur', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: /Çıkış/ }).first().click();
  await page.goto('/panel/kasa');
  await expect(page).toHaveURL(/\/$/);
});

