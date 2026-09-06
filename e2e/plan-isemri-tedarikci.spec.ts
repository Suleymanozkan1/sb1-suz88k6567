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

/** Tutarı bilinen bir rezervasyon açar ve detay sayfasında bırakır. */
async function rezervasyonAc(page: Page, ad: string, tarih: string, tutar = '100000') {
  await page.goto('/panel/rezervasyonlar/yeni');
  await page.locator('#hallId').selectOption('hall_demo1');
  await page.locator('#customerName').fill(ad);
  await page.locator('#customerPhone').fill('5321119900');
  await page.locator('#date').fill(tarih);
  await page.locator('#guestCount').fill('200');
  await page.locator('#totalAmount').fill(tutar);
  await page.getByRole('button', { name: /Kaydet/ }).click();
  await expect(page).toHaveURL(/\/panel\/rezervasyonlar\/[0-9a-f-]{36}$/);
}

test('Ödeme planı: kalan tutar taksitlere bölünür ve toplam korunur', async ({ page }) => {
  await login(page);
  await rezervasyonAc(page, 'Plan Testi', '2028-03-05');

  await expect(page.getByRole('heading', { name: 'Ödeme Planı' })).toBeVisible();
  await page.locator('#plan-count').fill('4');
  await page.getByRole('button', { name: 'Kalan tutarı böl' }).click();

  // 100.000 / 4 = 25.000 × 4
  await expect(page.locator('input[aria-label="1. taksit tutarı"]')).toHaveValue('25000');
  await expect(page.locator('input[aria-label="4. taksit tutarı"]')).toHaveValue('25000');
  await expect(page.getByText('100.000,00 ₺').first()).toBeVisible();

  await page.getByRole('button', { name: 'Ödeme planını kaydet' }).click();
  await expect(page.getByText('Kaydedilmemiş değişiklik var.')).toBeHidden();
});

test('Ödeme planı: rezervasyon tutarını aşan plan reddedilir', async ({ page }) => {
  await login(page);
  await rezervasyonAc(page, 'Aşım Testi', '2028-03-06', '50000');

  await page.locator('#plan-count').fill('2');
  await page.getByRole('button', { name: 'Kalan tutarı böl' }).click();
  await page.locator('input[aria-label="1. taksit tutarı"]').fill('40000');
  await page.getByRole('button', { name: 'Ödeme planını kaydet' }).click();
  await expect(page.getByText(/aşamaz/)).toBeVisible();
});

test('Ödeme planı: vadesi geçmiş taksit gecikmiş olarak işaretlenir', async ({ page }) => {
  await login(page);
  await rezervasyonAc(page, 'Gecikme Testi', '2028-03-07');

  await page.locator('#plan-first').fill('2020-01-15');
  await page.locator('#plan-count').fill('2');
  await page.getByRole('button', { name: 'Kalan tutarı böl' }).click();
  await expect(page.getByText('Gecikti').first()).toBeVisible();
});

test('İş emri: örnek akış yüklenir ve kaydedilir', async ({ page }) => {
  await login(page);
  await rezervasyonAc(page, 'İş Emri Testi', '2028-03-08');

  await expect(page.getByRole('heading', { name: 'Etkinlik İş Emri' })).toBeVisible();
  await page.getByRole('button', { name: 'Örnek akışla başla' }).click();
  await expect(page.getByText('6 iş, 0 tanesi tamamlandı.')).toBeVisible();

  await page.locator('input[aria-label="1. iş tamamlandı"]').check();
  await expect(page.getByText('6 iş, 1 tanesi tamamlandı.')).toBeVisible();
  await page.getByRole('button', { name: 'İş emrini kaydet' }).click();
  await expect(page.getByText('Kaydedilmemiş değişiklik var.')).toBeHidden();
});

test('Tedarikçiler ekranı: tedarikçi eklenir', async ({ page }) => {
  await login(page);
  await page.goto('/panel/tedarikciler');
  await expect(page.getByRole('heading', { name: 'Tedarikçiler' })).toBeVisible();
  await expect(page.getByText('Yıldız Orkestra')).toBeVisible();

  await page.getByRole('button', { name: /Yeni Tedarikçi/ }).click();
  await page.locator('#vendor-name').fill('Deneme Pastanesi');
  await page.locator('#vendor-category').selectOption('Pasta');
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('Deneme Pastanesi')).toBeVisible();
});

test('Tedarikçi ataması: maliyet toplanır ve kaydedilir', async ({ page }) => {
  await login(page);
  await rezervasyonAc(page, 'Tedarikçi Testi', '2028-03-09');

  await expect(page.getByRole('heading', { name: 'Tedarikçiler' })).toBeVisible();
  await page.getByRole('button', { name: /Tedarikçi ekle/ }).click();
  await page.locator('select[aria-label="1. tedarikçi"]').selectOption({ index: 1 });
  await page.locator('input[aria-label="1. tedarikçi ücreti"]').fill('15000');
  await page.locator('input[aria-label="1. tedarikçi geliş saati"]').fill('18:30');
  await expect(page.getByText(/toplam maliyet 15\.000/)).toBeVisible();

  await page.getByRole('button', { name: 'Tedarikçileri kaydet' }).click();
  await expect(page.getByText('Kaydedilmemiş değişiklik var.')).toBeHidden();
});
