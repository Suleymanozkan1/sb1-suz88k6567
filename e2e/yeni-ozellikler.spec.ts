import { expect, test, type Page } from '@playwright/test';

async function block(page: Page) {
  await page.route('**/*', (r) => {
    const u = r.request().url();
    return (u.startsWith('http://127.0.0.1:4173') || u.startsWith('data:') || u.startsWith('blob:'))
      ? r.continue() : r.abort();
  });
}

async function login(page: Page) {
  await block(page);
  await page.goto('/uye-girisi');
  await page.getByRole('button', { name: 'Demo bilgilerini doldur' }).click();
  await page.getByRole('button', { name: 'Giriş Yap' }).click();
  await expect(page).toHaveURL(/\/panel$/);
}

test('Salonlar ekranı: salon eklenir ve listelenir', async ({ page }) => {
  await login(page);
  await page.goto('/panel/salonlar');
  await expect(page.getByRole('heading', { name: 'Salonlar' })).toBeVisible();
  await expect(page.getByText('Kristal Salon')).toBeVisible();

  await page.getByRole('button', { name: /Yeni Salon/ }).click();
  await page.locator('#hall-name').fill('Teras Salon');
  await page.locator('#hall-capacity').fill('180');
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('Teras Salon')).toBeVisible();
  await expect(page.getByText('180 kişi')).toBeVisible();
});

test('Aynı isimde ikinci salon reddedilir', async ({ page }) => {
  await login(page);
  await page.goto('/panel/salonlar');
  await page.getByRole('button', { name: /Yeni Salon/ }).click();
  await page.locator('#hall-name').fill('Kristal Salon');
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText(/zaten var/)).toBeVisible();
});

test('Menü ekranı: kişi başı menü örnek tutarları gösterir', async ({ page }) => {
  await login(page);
  await page.goto('/panel/menuler');
  await expect(page.getByRole('heading', { name: 'Menüler ve Paketler' })).toBeVisible();
  await expect(page.getByText('Açık Büfe Ziyafet')).toBeVisible();
  // 450 ₺/kişi × 300 kişi = 135.000 ₺
  await expect(page.getByText(/135\.000/).first()).toBeVisible();
});

test('Rezervasyonda menü seçilince tutar önerilir', async ({ page }) => {
  await login(page);
  await page.goto('/panel/rezervasyonlar/yeni');
  await page.locator('#customerName').fill('Menü Testi');
  await page.locator('#customerPhone').fill('5321119911');
  await page.locator('#date').fill('2027-10-10');
  await page.locator('#guestCount').fill('200');
  await page.locator('#menuId').selectOption('menu_demo1');
  // 450 × 200 = 90.000 ₺
  const oneri = page.getByRole('button', { name: /Menüye göre .*90\.000.* uygula/ });
  await expect(oneri).toBeVisible();
  await oneri.click();
  await expect(page.locator('#totalAmount')).toHaveValue('90000');
});

test('Farklı salonlara aynı gün ve seansta rezervasyon açılabilir', async ({ page }) => {
  await login(page);
  for (const [ad, tel, salon] of [
    ['Salon A Müşteri', '5321118801', 'hall_demo1'],
    ['Salon B Müşteri', '5321118802', 'hall_demo2'],
  ]) {
    await page.goto('/panel/rezervasyonlar/yeni');
    await page.locator('#hallId').selectOption(salon);
    await page.locator('#customerName').fill(ad);
    await page.locator('#customerPhone').fill(tel);
    await page.locator('#date').fill('2027-11-11');
    await page.locator('#guestCount').fill('150');
    await page.locator('#totalAmount').fill('100000');
    await page.getByRole('button', { name: /Kaydet/ }).click();
    await expect(page).toHaveURL(/\/panel\/rezervasyonlar\/[0-9a-f-]{36}$/);
  }
  await page.goto('/panel/rezervasyonlar');
  await expect(page.getByText('Salon A Müşteri')).toBeVisible();
  await expect(page.getByText('Salon B Müşteri')).toBeVisible();
});

test('Aynı salona aynı gün ve seansta ikinci kayıt engellenir', async ({ page }) => {
  await login(page);
  for (const [ad, tel] of [['Çakışan A', '5321118811'], ['Çakışan B', '5321118812']]) {
    await page.goto('/panel/rezervasyonlar/yeni');
    await page.locator('#hallId').selectOption('hall_demo1');
    await page.locator('#customerName').fill(ad);
    await page.locator('#customerPhone').fill(tel);
    await page.locator('#date').fill('2027-12-12');
    await page.locator('#guestCount').fill('150');
    await page.locator('#totalAmount').fill('100000');
    await page.getByRole('button', { name: /Kaydet/ }).click();
  }
  await expect(page.getByText(/bu salonda|zaten bir rezervasyon/i).first()).toBeVisible();
});

test('Masa düzeni: plan önerilir, kaydedilir ve eksik koltuk uyarısı verir', async ({ page }) => {
  await login(page);
  await page.goto('/panel/rezervasyonlar/yeni');
  await page.locator('#customerName').fill('Masa Testi');
  await page.locator('#customerPhone').fill('5321117733');
  await page.locator('#date').fill('2028-01-15');
  await page.locator('#guestCount').fill('250');
  await page.locator('#totalAmount').fill('200000');
  await page.getByRole('button', { name: /Kaydet/ }).click();
  await expect(page).toHaveURL(/\/panel\/rezervasyonlar\/[0-9a-f-]{36}$/);

  await expect(page.getByRole('heading', { name: 'Masa Oturma Düzeni' })).toBeVisible();
  await page.getByRole('button', { name: 'Davetliye göre plan öner' }).click();
  // 250 / 10 = 25 masa, 250 koltuk
  await expect(page.getByText('25', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Masa düzenini kaydet' }).click();
  await expect(page.getByText('Kaydedilmemiş değişiklik var.')).toBeHidden();

  // Bir masayı silince koltuk eksilir ve uyarı çıkar
  await page.getByRole('button', { name: '1. masayı sil', exact: true }).click();
  await expect(page.getByText(/koltuk eksik/)).toBeVisible();
});

test('Tahsilat makbuzu açılır ve tutarı taşır', async ({ page }) => {
  await login(page);
  await page.goto('/panel/rezervasyonlar');
  await page.locator('tbody a').first().click();
  await page.waitForURL(/\/panel\/rezervasyonlar\/[^/]+$/);

  await page.locator('#pay-amount').fill('25000');
  await page.getByRole('button', { name: /Ekle|Kaydet/ }).first().click();
  await expect(page.getByRole('link', { name: 'Makbuz' }).first()).toBeVisible();

  await page.getByRole('link', { name: 'Makbuz' }).first().click();
  await expect(page).toHaveURL(/\/makbuz\?tahsilat=/);
  await expect(page.getByText('TAHSİLAT MAKBUZU')).toBeVisible();
  await expect(page.getByText(/25\.000/).first()).toBeVisible();
});
