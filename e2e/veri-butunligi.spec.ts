import { expect, test, type Page } from '@playwright/test';

/**
 * TEK GERÇEK VERİ KAYNAĞI (madde 34) ve son kontrol (madde 36).
 *
 * Şartname açık: "Aynı ödeme farklı modüllerde farklı rakam
 * göstermemeli." Bu, tek bir ekranı test ederek yakalanamaz; aynı
 * tahsilatın rezervasyon detayında, kasada ve raporlarda AYNI rakama
 * dönüştüğünü görmek gerekiyor.
 *
 * Ölçüm mutlak değil FARK üzerinden: tanıtım verisi zaten dolu ve
 * sabit bir toplam beklemek, tohum verisi her değiştiğinde testi
 * kırardı. Farkın kendisi zaten sorulan şey: "bu tahsilat kasaya
 * tam olarak ne kadar ekledi?"
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

/** "380.500,00 ₺" -> 380500 */
function paraOku(metin: string): number {
  const eslesme = /-?[\d.]+,\d{2}/.exec(metin);
  if (!eslesme) throw new Error(`Tutar okunamadı: ${metin}`);
  return Number(eslesme[0].replace(/\./g, '').replace(',', '.'));
}

async function kasaToplami(page: Page): Promise<number> {
  await page.goto('/panel/kasa');
  const kart = page.getByRole('region', { name: 'Kasa Durumu' });
  await expect(kart).toBeVisible();
  return paraOku(await kart.innerText());
}

test('Aynı tahsilat kasada, rezervasyonda ve raporda aynı rakamı gösteriyor', async ({ page }) => {
  await login(page);

  const kasaOnce = await kasaToplami(page);

  /*
    Kapora da bir tahsilattır ve kasaya girer. Ayrı bir alanda durduğu
    için kolayca unutulan ve kasayı olduğundan küçük gösteren kalem tam
    olarak budur.
  */
  await page.goto('/panel/rezervasyonlar/yeni');
  await page.locator('#customerName').fill('Bütünlük Testi');
  await page.locator('#customerPhone').fill('5329998877');
  await page.locator('#date').fill('2027-09-18');
  await page.locator('#guestCount').fill('300');
  await page.locator('#totalAmount').fill('300000');
  await page.locator('#deposit').fill('50000');
  await page.getByRole('button', { name: /Kaydet/ }).click();
  await expect(page).toHaveURL(/\/panel\/rezervasyonlar\/[0-9a-f-]{36}$/);
  const detayUrl = page.url();

  const kasaKaporaSonrasi = await kasaToplami(page);
  expect(kasaKaporaSonrasi - kasaOnce, 'kapora kasaya tam tutarıyla girmeli').toBe(50000);

  // Tahsilat ekle: kasa tam bu kadar artmalı, ne eksik ne fazla.
  await page.goto(detayUrl);
  await page.locator('#pay-amount').fill('80000');
  await page.getByRole('button', { name: /Tahsilat Ekle|Ekle|Kaydet/ }).first().click();
  await expect(page.getByText(/170\.000/).first()).toBeVisible();

  const kasaTahsilatSonrasi = await kasaToplami(page);
  expect(kasaTahsilatSonrasi - kasaKaporaSonrasi, 'tahsilat kasaya tam tutarıyla girmeli').toBe(80000);

  /*
    Aynı kayıt raporda da 170.000 kalan göstermeli. Rapor ayrı bir
    hesap yapsaydı iki ekran birbirini tutmaz, hangisinin doğru olduğu
    bilinemezdi.
  */
  await page.goto('/panel/raporlar?tab=bakiye');
  const satir = page.getByRole('row', { name: /Bütünlük Testi/ });
  await expect(satir).toBeVisible();
  const satirMetni = await satir.innerText();
  expect(satirMetni, 'raporda toplam tutar farklı').toContain('300.000');
  expect(satirMetni, 'raporda ödenen tutar farklı').toContain('130.000');
  expect(satirMetni, 'raporda kalan tutar farklı').toContain('170.000');
});

test('Tahsilat silinince kasa ve kalan birlikte geri dönüyor', async ({ page }) => {
  await login(page);

  await page.goto('/panel/rezervasyonlar/yeni');
  await page.locator('#customerName').fill('Geri Alma Testi');
  await page.locator('#customerPhone').fill('5329998866');
  await page.locator('#date').fill('2027-10-09');
  await page.locator('#guestCount').fill('200');
  await page.locator('#totalAmount').fill('100000');
  await page.locator('#deposit').fill('10000');
  await page.getByRole('button', { name: /Kaydet/ }).click();
  await expect(page).toHaveURL(/\/panel\/rezervasyonlar\/[0-9a-f-]{36}$/);
  const detayUrl = page.url();

  await page.locator('#pay-amount').fill('25000');
  await page.getByRole('button', { name: /Tahsilat Ekle|Ekle|Kaydet/ }).first().click();
  await expect(page.getByText(/65\.000/).first()).toBeVisible();

  const kasaTahsilatli = await kasaToplami(page);

  // Tahsilatı sil: kasa tam 25.000 azalmalı ve kalan 90.000'e dönmeli.
  await page.goto(detayUrl);
  await page.getByRole('button', { name: 'Tahsilatı sil' }).first().click();
  // Onay penceresi `alertdialog`; düğme metni "Evet, sil".
  await page.getByRole('alertdialog').getByRole('button', { name: 'Evet, sil' }).click();
  await expect(page.getByText(/90\.000/).first()).toBeVisible();

  const kasaSilinmis = await kasaToplami(page);
  expect(kasaTahsilatli - kasaSilinmis, 'silinen tahsilat kasadan tam tutarıyla çıkmalı').toBe(25000);
});

/*
  Düğün içi giderler (madde 12) gelir/gider bölümüne KENDİLİĞİNDEN
  aktarılıyor. İki yerde ayrı ayrı girilseydi salon sahibi aynı gideri
  iki kez yazar ve kâr olduğundan düşük görünürdü.
*/
test('Düğün içi gider kasadan tam tutarıyla düşüyor', async ({ page }) => {
  await login(page);

  await page.goto('/panel/rezervasyonlar/yeni');
  await page.locator('#customerName').fill('Gider Bütünlük');
  await page.locator('#customerPhone').fill('5329998855');
  await page.locator('#date').fill('2027-11-13');
  await page.locator('#guestCount').fill('250');
  await page.locator('#totalAmount').fill('200000');
  await page.locator('#deposit').fill('0');
  await page.getByRole('button', { name: /Kaydet/ }).click();
  await expect(page).toHaveURL(/\/panel\/rezervasyonlar\/[0-9a-f-]{36}$/);
  const detayUrl = page.url();

  const kasaOnce = await kasaToplami(page);

  await page.goto(detayUrl);
  await page.locator('#gd-kind').fill('Garson');
  await page.locator('#gd-count').fill('10');
  await page.locator('#gd-price').fill('2000');
  await page.getByRole('button', { name: 'Gider Ekle' }).click();
  // 10 x 2.000 = 20.000
  await expect(page.getByText(/20\.000/).first()).toBeVisible();

  const kasaSonra = await kasaToplami(page);
  expect(kasaOnce - kasaSonra, 'düğün içi gider kasadan tam tutarıyla çıkmalı').toBe(20000);
});

/*
  Ciro, gider ve kâr raporu (maddeler 20 ve 23). Kâr, kasa ve
  rezervasyon verisinden TÜRETİLİYOR; ayrı bir hesap yazılsaydı bu ekran
  Gelir/Gider ekranıyla farklı rakam gösterebilirdi.
*/
test('Ciro, gider ve kâr raporu aynı veriden türüyor', async ({ page }) => {
  await login(page);

  await page.goto('/panel/rezervasyonlar/yeni');
  await page.locator('#customerName').fill('Kâr Raporu Testi');
  await page.locator('#customerPhone').fill('5329998844');
  await page.locator('#date').fill('2029-05-19');
  await page.locator('#guestCount').fill('150');
  await page.locator('#totalAmount').fill('400000');
  await page.locator('#deposit').fill('0');
  await page.getByRole('button', { name: /Kaydet/ }).click();
  await expect(page).toHaveURL(/\/panel\/rezervasyonlar\/[0-9a-f-]{36}$/);

  // 5 x 3.000 = 15.000 düğün içi gider
  await page.locator('#gd-kind').fill('Vale');
  await page.locator('#gd-count').fill('5');
  await page.locator('#gd-price').fill('3000');
  await page.getByRole('button', { name: 'Gider Ekle' }).click();
  await expect(page.getByText(/15\.000/).first()).toBeVisible();

  await page.goto('/panel/raporlar?tab=kar');
  await expect(page.getByRole('tab', { name: 'Ciro, gider ve kâr' })).toBeVisible();

  // 2029'da başka kayıt yok: ciro 400.000, gider 15.000, kâr 385.000.
  const satir = page.getByRole('row', { name: /^2029/ });
  await expect(satir).toBeVisible();
  const metin = await satir.innerText();
  expect(metin, 'ciro yanlış').toContain('400.000');
  expect(metin, 'düğün içi gider kâra girmemiş').toContain('15.000');
  expect(metin, 'kâr yanlış').toContain('385.000');
});

test('Kâr raporu aylık kırılıma geçebiliyor', async ({ page }) => {
  await login(page);
  await page.goto('/panel/raporlar?tab=kar');

  await page.getByRole('button', { name: 'Aylık' }).click();
  // Aylık kırılımda dönem sütunu ay adıyla yazılıyor.
  await expect(page.getByRole('cell', { name: /\w+ 20\d{2}/ }).first()).toBeVisible();
});
