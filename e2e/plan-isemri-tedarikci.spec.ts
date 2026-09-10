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
  await page.goto('/');
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
