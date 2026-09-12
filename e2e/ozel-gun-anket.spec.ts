import { expect, test, type Page } from '@playwright/test';

/**
 * Özel günler, takvim işaretleri, hava durumu ve anket (maddeler 28-31).
 *
 * Bu akışların ortak riski AYNI: dördü de dışarıdan veri bekliyor ve
 * tanıtım kipinde o veri yok. Doğrulanan şey, veri yokken ekranın
 * uydurma bir rakam göstermemesi ve kırılmaması.
 */
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

test('Özel Günler ekranı resmî tatilleri sistem kaynağıyla listeler', async ({ page }) => {
  await login(page);
  await page.goto('/panel/ozel-gunler');

  await expect(page.getByRole('heading', { name: 'Özel Günler', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: /Geçmiş .* göster/ }).click();

  const satir = page.getByRole('row', { name: /Cumhuriyet Bayramı/ }).first();
  await expect(satir).toBeVisible();
  // Ortak günler "Sistem" kaynaklı: silme düğmesi hiç çizilmemeli.
  await expect(satir.getByRole('cell', { name: 'Sistem' })).toBeVisible();
  await expect(satir.getByRole('button')).toHaveCount(0);
});

/**
 * Tarih GELECEKTE seçiliyor: liste varsayılan olarak geçmiş günleri
 * gizliyor ve geçmiş bir tarihle eklenen kayıt eklendiği anda
 * görünmezdi. Ayın 1'i sabitlenerek ay sonunda çalışan koşuda tarihin
 * bir sonraki aya kaymasının önüne geçiliyor.
 */
const AY_ADLARI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

test('İşletmenin kendi özel günü eklenir, takvimde görünür ve silinir', async ({ page }) => {
  await login(page);
  await page.goto('/panel/ozel-gunler');

  const bugun = new Date();
  const hedef = new Date(bugun.getFullYear(), bugun.getMonth() + 2, 1);
  const iso = `${hedef.getFullYear()}-${String(hedef.getMonth() + 1).padStart(2, '0')}-01`;

  await page.locator('#og-tarih').fill(iso);
  await page.locator('#og-ad').fill('Okullar kapanıyor');
  await page.locator('#og-tur').selectOption('okul');
  await page.getByRole('button', { name: 'Ekle' }).click();

  const satir = page.getByRole('row', { name: /Okullar kapanıyor/ });
  await expect(satir).toBeVisible();
  await expect(satir.getByRole('cell', { name: 'İşletme' })).toBeVisible();

  // Takvimde de görünmeli: iki ekran aynı kayda bakıyor.
  await page.goto('/panel/takvim');
  await page.getByRole('button', { name: 'Sonraki ay' }).click();
  await page.getByRole('button', { name: 'Sonraki ay' }).click();
  await expect(page.getByRole('button', {
    name: new RegExp(`1 ${AY_ADLARI[hedef.getMonth()]} .*Okullar kapanıyor`),
  })).toBeVisible();

  // Silme: onay penceresinden geçiyor.
  await page.goto('/panel/ozel-gunler');
  await page.getByRole('button', { name: 'Okullar kapanıyor gününü sil' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sil' }).click();
  await expect(page.getByRole('row', { name: /Okullar kapanıyor/ })).toHaveCount(0);
});

test('Aynı gün ve isimde ikinci özel gün reddedilir', async ({ page }) => {
  await login(page);
  await page.goto('/panel/ozel-gunler');

  const yil = new Date().getFullYear();
  for (let i = 0; i < 2; i += 1) {
    await page.locator('#og-tarih').fill(`${yil}-06-20`);
    await page.locator('#og-ad').fill('Kandil');
    await page.getByRole('button', { name: 'Ekle' }).click();
  }
  await expect(page.getByText(/zaten var/)).toBeVisible();
});

test('Dini gün ve okul tarihi hazır gelmiyor, sebebi ekranda yazıyor', async ({ page }) => {
  await login(page);
  await page.goto('/panel/ozel-gunler');
  await expect(page.getByText(/Diyanet ile Millî Eğitim/)).toBeVisible();
});

/*
  Kur şeridi ve hava durumu satırı, veri YOKKEN hiç çizilmiyor. Boş
  kutucuk ya da örnek rakam gösterilseydi salon sahibi gerçek sanıp ona
  göre fiyat verirdi.
*/
test('Kur verisi yokken şerit hiç çizilmiyor', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('heading', { name: 'Döviz / Altın' })).toHaveCount(0);
});

test('Tahmin yokken rezervasyonda açık mesaj yazıyor', async ({ page }) => {
  await login(page);
  await page.goto('/panel/rezervasyonlar');
  await page.getByRole('link', { name: /Ayşe|Zeynep|Elif|Merve/ }).first().click();
  await expect(page).toHaveURL(/\/panel\/rezervasyonlar\/[^/]+$/);

  await expect(page.getByText('Hava durumu')).toBeVisible();
  await expect(page.getByText('Tahmin henüz mevcut değil')).toBeVisible();
});

test('Anket raporu veri yokken nasıl çalıştığını anlatıyor', async ({ page }) => {
  await login(page);
  await page.goto('/panel/raporlar?tab=anket');
  // Sekmeler `role="tab"` taşıyor; düğme olarak aranırsa bulunamaz.
  await expect(page.getByRole('tab', { name: 'Deneyim anketi' })).toBeVisible();
  await expect(page.getByText(/organizasyondan bir hafta sonra/)).toBeVisible();
});

test('Ayarlarda hava durumu ve anket adresi alanları var', async ({ page }) => {
  await login(page);
  await page.goto('/panel/isletmeler');
  await page.getByRole('button', { name: /Düzenle/ }).first().click();

  await page.locator('#bz-weather').fill('318251');
  await page.locator('#bz-survey-email').fill('mudur@ornek.com');
  await page.getByRole('button', { name: 'Kaydet' }).click();

  // Kaydedilen değerler formu yeniden açınca geri gelmeli.
  await page.getByRole('button', { name: /Düzenle/ }).first().click();
  await expect(page.locator('#bz-weather')).toHaveValue('318251');
  await expect(page.locator('#bz-survey-email')).toHaveValue('mudur@ornek.com');
});

/*
  Anket sayfası herkese açık: müşterinin sistemde hesabı yok. Jetonsuz
  ya da bozuk bir bağlantı açık bir hata göstermeli; boş bir form
  göstermek müşteriyi cevap veremeyeceği bir ekranda bırakırdı.
*/
test('Anket sayfası jetonsuz açıldığında açık hata veriyor', async ({ page }) => {
  await block(page);
  await page.goto('/anket');
  await expect(page.getByRole('heading', { name: 'Deneyim Anketi', level: 1 })).toBeVisible();
  await expect(page.getByText(/Anket bağlantısı eksik/)).toBeVisible();
});
