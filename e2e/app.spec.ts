import { expect, test, type Page } from '@playwright/test';

/** Harici (test ortamında erişilemeyen) kaynakları engeller. */
async function blockExternalRequests(page: Page) {
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('http://127.0.0.1:4173') || url.startsWith('data:') || url.startsWith('blob:')) {
      return route.continue();
    }
    return route.abort();
  });
}

/** Demo hesabıyla giriş yapar; SMS kodu demo ortamında ekranda gösterilir. */
async function login(page: Page) {
  await blockExternalRequests(page);
  await page.goto('/uye-girisi');
  await page.getByRole('button', { name: 'Demo bilgilerini doldur' }).click();
  await page.getByRole('button', { name: 'Giriş Yap' }).click();
  await expect(page.getByRole('heading', { name: /SMS Doğrulama/ })).toBeVisible();

  const codeText = await page.locator('strong.font-mono').first().innerText();
  await page.getByLabel('Sms Kodu').fill(codeText.trim());
  await page.getByRole('button', { name: 'Doğrula ve Giriş Yap' }).click();
  await expect(page).toHaveURL(/\/panel$/);
}

test.describe('Üye paneli', () => {
  test('oturum açılmadan panel erişimi giriş sayfasına yönlendirir', async ({ page }) => {
    await blockExternalRequests(page);
    await page.goto('/panel');
    await expect(page).toHaveURL(/\/uye-girisi$/);
  });

  test('SMS doğrulaması ile giriş yapılır', async ({ page }) => {
    await login(page);
    await expect(page.getByRole('heading', { name: /Hoş geldiniz/ })).toBeVisible();
  });

  test('tüm panel ekranları hatasız açılır', async ({ page }) => {
    await login(page);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    const routes: [string, string][] = [
      ['/panel/takvim', 'Rezervasyon Takvimi'],
      ['/panel/rezervasyonlar', 'Rezervasyonlar'],
      ['/panel/rezervasyonlar/yeni', 'Yeni Rezervasyon'],
      ['/panel/musteriler', 'Müşteriler'],
      ['/panel/kasa', 'Gelir Gider Kayıtları'],
      ['/panel/raporlar', 'Raporlar'],
      ['/panel/renk-ayarlari', 'Rezervasyon Renk Ayarları'],
      ['/panel/isletmeler', 'Firmalarım / Adminler'],
      ['/panel/kullanicilar', 'Kullanıcılar'],
      ['/panel/sms', 'SMS Kayıtları'],
      ['/panel/tavsiye-et', 'Tavsiye Et Kazan'],
      ['/panel/abonelik', 'Aboneliğim'],
      ['/panel/ayarlar', 'Ayarlar'],
    ];

    for (const [path, heading] of routes) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test('uçtan uca: rezervasyon oluştur, tahsilat ekle, sözleşme görüntüle', async ({ page }) => {
    await login(page);
    await page.goto('/panel/rezervasyonlar/yeni');

    const future = new Date();
    future.setDate(future.getDate() + 120);
    const iso = future.toISOString().slice(0, 10);

    await page.getByLabel(/Müşteri Adı Soyadı/).fill('E2E Test Çifti');
    await page.getByLabel(/^Telefon/).fill('5339998877');
    await page.getByLabel(/^Tarih/).fill(iso);
    await page.getByLabel(/^Seans/).selectOption('Gündüz');
    await page.getByLabel(/Davetli Sayısı/).fill('400');
    await page.getByLabel(/Toplam Tutar/).fill('200000');
    await page.getByLabel(/^Kaparo/).fill('50000');
    await expect(page.getByLabel('Kalan Alacak')).toHaveValue('150.000');
    await page.getByRole('button', { name: 'Kaydet' }).click();

    // Detay sayfası — "Kalan Alacak" satırını etiketiyle birlikte hedefliyoruz,
    // aynı tutar birden fazla satırda görünebildiği için.
    const remaining = page.locator('dt', { hasText: 'Kalan Alacak' }).locator('+ dd');
    const collected = page.locator('dt', { hasText: 'Toplam Tahsilat' }).locator('+ dd');

    await expect(page.getByRole('heading', { name: 'E2E Test Çifti', level: 1 })).toBeVisible();
    await expect(remaining).toHaveText('150.000,00 ₺');
    await expect(collected).toHaveText('50.000,00 ₺');

    // Tahsilat ekle: 50.000 ödendiğinde kalan 150.000 -> 100.000 olmalı
    await page.getByLabel('Tutar').fill('50000');
    await page.getByRole('button', { name: /Ekle/ }).click();
    await expect(remaining).toHaveText('100.000,00 ₺');
    await expect(collected).toHaveText('100.000,00 ₺');

    // Otomatik SMS kaydı oluşmuş olmalı
    await page.goto('/panel/sms');
    await expect(page.getByText(/E2E Test Cifti|E2E Test Çifti/).first()).toBeVisible();

    // Rezervasyon listesinde görünür
    await page.goto('/panel/rezervasyonlar');
    await page.getByLabel('İsim / telefon / kod').fill('E2E Test');
    await expect(page.getByRole('link', { name: 'E2E Test Çifti', exact: true })).toBeVisible();

    // Sözleşme çıktısı
    await page.getByRole('link', { name: 'E2E Test Çifti', exact: true }).click();
    await page.getByRole('link', { name: /Sözleşme/ }).click();
    await expect(page.getByRole('heading', { name: 'SALON KİRALAMA SÖZLEŞMESİ' })).toBeVisible();
    await expect(page.getByRole('row', { name: /Toplam Kira Bedeli/ })).toContainText('200.000,00 ₺');
    await expect(page.getByRole('row', { name: /Kalan Bakiye/ })).toContainText('100.000,00 ₺');
  });

  test('rezervasyon kodu herkese açık doğrulama sayfasında sorgulanabilir', async ({ page }) => {
    await login(page);
    await page.goto('/panel/rezervasyonlar');
    const code = await page.locator('td.font-mono').first().innerText();

    await page.goto('/kod-dogrulama');
    await page.getByLabel('Rezervasyon Kodu').fill(code.trim());
    await page.getByRole('button', { name: 'Kodu Kontrol Et' }).click();
    await expect(page.getByText('Rezervasyon kaydı doğrulandı.')).toBeVisible();
  });

  test('raporlar arasında sekme geçişi çalışır', async ({ page }) => {
    await login(page);
    await page.goto('/panel/raporlar');
    await page.getByRole('tab', { name: 'Ay bazlı rapor' }).click();
    await expect(page.getByRole('tab', { name: 'Ay bazlı rapor' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: 'Alacak bakiyesi' }).click();
    await expect(page.getByText('Toplam kalan alacak')).toBeVisible();
  });

  test('işletme değiştirme rezervasyon listesini değiştirir', async ({ page }) => {
    await login(page);
    await page.goto('/panel/rezervasyonlar');
    // Panel ekranları tembel yüklendiği için tablo görünene kadar beklenir.
    await expect(page.locator('table tbody tr').first()).toBeVisible();
    const firstCount = await page.locator('table tbody tr').count();
    expect(firstCount).toBeGreaterThan(0);

    await page.getByLabel('Aktif işletme').selectOption({ label: 'Yıldız Kır Bahçesi' });
    await page.goto('/panel/rezervasyonlar');
    await expect(page.locator('table tbody tr').first()).toBeVisible();
    const secondCount = await page.locator('table tbody tr').count();
    expect(secondCount).toBeGreaterThan(0);
    expect(secondCount).not.toBe(firstCount);
  });

  test('çıkış yapıldığında panel erişimi kapanır', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: 'Çıkış Yap' }).click();
    await page.goto('/panel');
    await expect(page).toHaveURL(/\/uye-girisi$/);
  });
});

test.describe('Üye kaydı', () => {
  test('yeni üyelik oluşturulup panele giriş yapılır', async ({ page }) => {
    await blockExternalRequests(page);
    await page.goto('/uye-ol');
    const email = `e2e${Date.now()}@example.com`;

    await page.getByLabel(/Üye Firma Adı/).fill('E2E Düğün Salonu');
    await page.getByLabel(/Yetkili Ad Soyad/).fill('E2E Yetkili');
    await page.getByLabel(/Cep Telefonu/).fill('5321230000');
    await page.getByLabel(/Kategori/).selectOption('Düğün Salonu');
    await page.getByLabel(/Şehir/).selectOption('İzmir');
    await page.getByLabel(/İlçe/).selectOption('Bornova');
    await page.getByLabel(/Email Adresiniz/).fill(email);
    await page.locator('#password').fill('sifre1234');
    await page.locator('#passwordRepeat').fill('sifre1234');
    await page.locator('#acceptPrivacy').check();
    await page.locator('#acceptTerms').check();
    await page.getByRole('button', { name: 'Üye Ol' }).click();

    await expect(page).toHaveURL(/\/panel$/);
    await expect(page.getByRole('heading', { name: /Hoş geldiniz, E2E Yetkili/ })).toBeVisible();
  });
});
