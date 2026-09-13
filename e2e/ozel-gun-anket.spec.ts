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
  /*
    Kaynak "Otomatik": resmî tatiller artık pakete gömülü bir listeden
    değil sağlayıcıdan (date.nager.at) çekiliyor. Ortak günde silme
    düğmesi hiç çizilmiyor; etiket zaten sebebi söylüyor.
  */
  await expect(satir.getByRole('cell', { name: 'Otomatik' })).toBeVisible();
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
  // Ad, MEB'den gelen gerçek gün adlarıyla ÇAKIŞMAMALI: "Okullar
  // kapanıyor" otomatik listede de var ve satır iki kez eşleşiyordu.
  await page.locator('#og-ad').fill('Salon deneme günü');
  await page.locator('#og-tur').selectOption('okul');
  await page.getByRole('button', { name: 'Ekle' }).click();

  const satir = page.getByRole('row', { name: /Salon deneme günü/ });
  await expect(satir).toBeVisible();
  await expect(satir.getByRole('cell', { name: 'İşletme' })).toBeVisible();

  // Takvimde de görünmeli: iki ekran aynı kayda bakıyor.
  await page.goto('/panel/takvim');
  await page.getByLabel('Yıl').selectOption(String(hedef.getFullYear()));
  await page.getByRole('button', { name: AY_ADLARI[hedef.getMonth()], exact: true }).click();
  await expect(page.getByRole('button', {
    name: new RegExp(`1 ${AY_ADLARI[hedef.getMonth()]} .*Salon deneme günü`),
  })).toBeVisible();

  // Silme: onay penceresinden geçiyor.
  await page.goto('/panel/ozel-gunler');
  await page.getByRole('button', { name: 'Salon deneme günü gününü sil' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sil' }).click();
  await expect(page.getByRole('row', { name: /Salon deneme günü/ })).toHaveCount(0);
});

test('Aynı gün ve isimde ikinci özel gün reddedilir', async ({ page }) => {
  await login(page);
  await page.goto('/panel/ozel-gunler');

  const yil = new Date().getFullYear();
  for (let i = 0; i < 2; i += 1) {
    await page.locator('#og-tarih').fill(`${yil}-06-20`);
    await page.locator('#og-ad').fill('Salon bakımı');
    await page.getByRole('button', { name: 'Ekle' }).click();
  }
  await expect(page.getByText(/zaten var/)).toBeVisible();
});

/*
  Bayram, arife ve kandil artık SAĞLAYICIDAN çekiliyor; elle girilecek
  tek şey okul tarihleri ve salonun kendi günleri. Tür listesinde
  otomatik gelen türler DURMAMALI: elle girilen bir kopya takvimde aynı
  günü iki kez gösterirdi.
*/
test('Otomatik gelen türler elle girilemiyor, sebebi ekranda yazıyor', async ({ page }) => {
  await login(page);
  await page.goto('/panel/ozel-gunler');

  await expect(page.getByText(/otomatik olarak/i)).toBeVisible();
  await expect(page.getByText(/Millî Eğitim Bakanlığı/)).toBeVisible();
  // Listede de "kesinleşmedi" rozetleri var; aranan, açıklamadaki
  // vurgulu sözcük.
  await expect(page.getByRole('strong').filter({ hasText: 'kesinleşmedi' })).toBeVisible();

  const turler = await page.locator('#og-tur option').allTextContents();
  expect(turler).toEqual(['Okul', 'Özel gün']);
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

/*
  Hava tahmini zinciri: uç nokta -> gunleriTazele -> depo -> ekran.

  Zincirin ÜÇ ayrı yerinde kopukluk vardı ve üçü de sessizdi: uç nokta
  tahmini döndürüyordu ama istemci okumuyordu, depo katmanı her durumda
  boş liste dönüyordu, MGM'nin günlük tahmini de gün içinde yarından
  başladığı için bugünün satırı hiç oluşmuyordu. Hiçbiri hata vermiyordu;
  ekranda yalnızca hiçbir şey görünmüyordu. Bu test zincirin tamamını
  uçtan uca bağlıyor.

  Yanıt, canlı uç noktanın (MGM) gerçek biçimiyle aynı.
*/
test('Tahmin gelince hava durumu satırı çiziliyor', async ({ page }) => {
  const bugun = new Date();
  const gun = (ekle: number) => {
    const g = new Date(bugun);
    g.setDate(g.getDate() + ekle);
    return `${g.getFullYear()}-${String(g.getMonth() + 1).padStart(2, '0')}-${String(g.getDate()).padStart(2, '0')}`;
  };

  await block(page);
  // Uç nokta yanıtı: MGM günlük tahmini YARINDAN başlıyor, bugün yok.
  await page.route('**/api/demo-hava', (r) => r.fulfill({
    status: 200,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify({
      uretim: new Date().toISOString(),
      il: 'Konya',
      ilce: 'Selçuklu',
      simdi: 22,
      gunluk: [
        { gun: gun(1), enDusuk: 17, enYuksek: 28, hadise: 'PB' },
        { gun: gun(2), enDusuk: 16, enYuksek: 27, hadise: 'PB' },
      ],
      saatlik: [{ saat: `${gun(0)}T21:00`, sicaklik: 22, hadise: 'AB' }],
    }),
  }));

  await page.goto('/');
  await page.getByRole('button', { name: 'Demo bilgilerini doldur' }).click();
  await page.getByRole('button', { name: 'Giriş Yap' }).click();
  await expect(page).toHaveURL(/\/panel$/);

  // Bugünün satırı anlık değerden kuruluyor; ekranda sıcaklık görünmeli.
  const satir = page.getByText(/Bugünün hava durumu/);
  await expect(satir).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('22°', { exact: false }).first()).toBeVisible();
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

test('Hava durumu ayar istemiyor, anket adresi kaydediliyor', async ({ page }) => {
  await login(page);
  await page.goto('/panel/isletmeler');
  await page.getByRole('button', { name: /Düzenle/ }).first().click();

  /*
    Hava durumu konum anahtarı alanı KALDIRILDI (0038). MGM'ye geçilince
    istasyon işletmenin il/ilçesinden bulunuyor; salon sahibinin
    sağlayıcının sitesinden anahtar araması gerekmiyor.
  */
  await expect(page.locator('#bz-weather')).toHaveCount(0);
  await expect(page.getByText(/Meteoroloji Genel Müdürlüğü/)).toBeVisible();

  await page.locator('#bz-survey-email').fill('mudur@ornek.com');
  await page.getByRole('button', { name: 'Kaydet' }).click();

  // Kaydedilen değer formu yeniden açınca geri gelmeli.
  await page.getByRole('button', { name: /Düzenle/ }).first().click();
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
