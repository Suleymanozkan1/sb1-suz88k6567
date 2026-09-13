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

/**
 * Düğün içi giderler: rezervasyonda girilen gider hem net tutarı düşürür
 * hem de gelir/gider defterinde "Düğün İçi Gider" kategorisiyle görünür.
 *
 * Satır kasa tablosuna yazılmıyor, türetiliyor; bu akış iki ekranın aynı
 * rakamı gösterdiğini tarayıcıda doğruluyor.
 */
test('Düğün içi gider net tutarı düşürür ve kasada görünür', async ({ page }) => {
  await login(page);
  await page.goto('/panel/rezervasyonlar/yeni');

  const gelecek = new Date();
  gelecek.setDate(gelecek.getDate() + 90);
  await page.locator('#customerName').fill('Gider Testi');
  await page.locator('#customerPhone').fill('5321119944');
  await page.locator('#date').fill(gelecek.toISOString().slice(0, 10));
  await page.locator('#guestCount').fill('300');
  await page.locator('#totalAmount').fill('150000');
  await page.locator('#deposit').fill('50000');
  await page.getByRole('button', { name: /Kaydet/ }).click();
  await expect(page).toHaveURL(/\/panel\/rezervasyonlar\/[0-9a-f-]{36}$/);

  // Sözleşme numarası başlığın altında, tarih ve seansla aynı satırda durur.
  const sozlesmeNo = (await page.locator('span.font-mono').first().textContent())?.trim() ?? '';
  expect(sozlesmeNo).toMatch(/^\d{4}-\d+$/);

  // Gider yokken taban kalan bakiyedir: 150.000 - 50.000 = 100.000
  const gider = page.getByRole('region', { name: 'Düğün İçi Giderler' });
  await expect(gider.getByText('Kalan bakiye')).toBeVisible();
  await expect(gider.getByText('Bu organizasyon için gider girilmemiş.')).toBeVisible();

  // 10 garson x 2.000 = 20.000
  await gider.locator('#gd-kind').fill('Garson');
  await gider.locator('#gd-count').fill('10');
  await gider.locator('#gd-price').fill('2000');
  await gider.getByRole('button', { name: 'Gider Ekle' }).click();

  await expect(gider.getByRole('cell', { name: 'Garson', exact: true })).toBeVisible();
  await expect(gider.getByText('20.000,00 ₺').first()).toBeVisible();
  // Net: 100.000 - 20.000 = 80.000
  await expect(gider.getByText('80.000,00 ₺')).toBeVisible();

  // Aynı gider gelir/gider defterinde sözleşme numarasıyla görünür.
  await page.goto('/panel/kasa');
  await expect(page.getByText('Düğün İçi Gider').first()).toBeVisible();
  await expect(page.getByText(sozlesmeNo).first()).toBeVisible();
});

/**
 * Gelecek kaporalar ve ödemeler: sıralama tutara göre değil tarihe göre,
 * ve her satır en son alınan tahsilatı gösteriyor.
 */
test('Gelecek kaporalar ekranı son tahsilatı ve vadeyi gösterir', async ({ page }) => {
  await login(page);
  await page.goto('/panel/raporlar');
  await page.getByRole('tab', { name: 'Gelecek Kaporalar ve Ödemeler' }).click();

  await expect(page.getByRole('columnheader', { name: 'Son tahsilat' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Durum' })).toBeVisible();
  await expect(page.getByText('Toplam kalan alacak')).toBeVisible();
  await expect(page.getByText(/gün kaldı|gün gecikti|Bugün/).first()).toBeVisible();
});

/**
 * Çelik Kasa güncel kasanın altında, küçük: her ödeme tipi ayrı bakiye.
 * Hareket defteri yok -- o defter her satırın elle işaretlenmesini
 * istiyordu ve unutulan her işaret kasayı olduğundan farklı gösteriyordu.
 */
test('Çelik Kasa kasa kartının altında ayrı bakiyeler gösterir', async ({ page }) => {
  await login(page);
  await page.goto('/panel/kasa');

  const kart = page.getByRole('region', { name: 'Kasa Durumu' });
  await expect(kart.getByRole('heading', { name: 'Çelik Kasa' })).toBeVisible();
  for (const kanal of ['Nakit', 'Kredi Kartı', 'Havale/EFT']) {
    await expect(kart.getByText(kanal, { exact: true })).toBeVisible();
  }
  await expect(page.getByText('Çelik Kasa Hareketleri')).toHaveCount(0);

  // Özet sayfasında aynı kart şifreyle açılıyor: salonun kasasındaki nakit,
  // ekranın yanından geçen herkesin göreceği bir bilgi olmamalı.
  await page.goto('/panel');
  const ozetKart = page.getByRole('region', { name: 'Kasa Durumu' });
  await expect(ozetKart.getByLabel('Çelik kasayı görmek için hesap şifreniz')).toBeVisible();
  await expect(ozetKart.getByRole('heading', { name: 'Çelik Kasa' })).toHaveCount(0);
});

/**
 * Madde 9-10: tahsilat düzenleme, kasaya girmeyen ödeme uyarısı ve
 * değişiklik geçmişi.
 *
 * Uyarı YALNIZCA kasaya girmeyen tahsilatta (çek/senet) çıkıyor; her
 * kayıtta pencere açan bir sistem birkaç günde tıklanmadan geçilir.
 */
test('Çek ile alınan tahsilat uyarı verir, geçmişe düşer', async ({ page }) => {
  await login(page);
  await page.goto('/panel/rezervasyonlar/yeni');

  const gelecek = new Date();
  gelecek.setDate(gelecek.getDate() + 100);
  await page.locator('#customerName').fill('Odeme Uyari Testi');
  await page.locator('#customerPhone').fill('5321119955');
  await page.locator('#date').fill(gelecek.toISOString().slice(0, 10));
  await page.locator('#guestCount').fill('200');
  await page.locator('#totalAmount').fill('120000');
  await page.locator('#deposit').fill('20000');
  await page.getByRole('button', { name: /Kaydet/ }).click();
  await expect(page).toHaveURL(/\/panel\/rezervasyonlar\/[0-9a-f-]{36}$/);

  // Nakit tahsilat: uyarı ÇIKMAMALI.
  await page.locator('#pay-amount').fill('30000');
  await page.getByRole('button', { name: 'Ekle', exact: true }).click();
  await expect(page.getByText('Bu tahsilat kasaya girmedi')).toHaveCount(0);

  // Çek ile tahsilat: uyarı çıkmalı.
  await page.locator('#pay-amount').fill('25000');
  await page.locator('#pay-method').selectOption('Çek');
  await page.getByRole('button', { name: 'Ekle', exact: true }).click();
  await expect(page.getByText('Bu tahsilat kasaya girmedi')).toBeVisible();
  await page.getByRole('button', { name: 'Şimdilik kalsın' }).click();
  await expect(page.getByText('kasaya girmedi', { exact: true }).first()).toBeVisible();

  // Geçmiş: hem ekleme hem "kasaya girmedi" satırı olmalı.
  const gecmis = page.getByRole('region', { name: 'Ödeme Değişiklik Geçmişi' });
  await expect(gecmis.getByText('Yeni tahsilat').first()).toBeVisible();
  await expect(gecmis.getByText('Kasaya girmedi').first()).toBeVisible();

  // Düzenleme: tutar değişince geçmişe eski → yeni satırı düşer.
  await page.getByRole('button', { name: /tahsilatını düzenle/ }).first().click();
  await page.locator('#duz-amount').fill('35000');
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(gecmis.getByText('Tutar değişti').first()).toBeVisible();
});

/**
 * Yönetici bildirimi ayarları: metin düzenlenebilir olmalı, kurallar
 * kapalı başlamalı (SMS ücretli).
 */
test('Ödeme bildirim kuralları kapalı başlar ve metni düzenlenebilir', async ({ page }) => {
  await login(page);
  await page.goto('/panel/odeme-bildirimleri');

  await expect(page.getByRole('heading', { name: 'Ödeme Bildirimleri', level: 1 })).toBeVisible();
  await expect(page.getByLabel('Yeni tahsilat bildirimi')).not.toBeChecked();

  // Alıcı ekleme: numara normalize edilerek kaydedilir.
  await page.locator('#al-ad').fill('Emrah Bey');
  await page.locator('#al-tel').fill('0533 100 00 55');
  await page.getByRole('button', { name: 'Ekle', exact: true }).click();
  await expect(page.getByText('0533 100 00 55')).toBeVisible();

  // Geçersiz numara reddedilir.
  await page.locator('#al-ad').fill('Hatali');
  await page.locator('#al-tel').fill('0212 555 44 33');
  await page.getByRole('button', { name: 'Ekle', exact: true }).click();
  await expect(page.getByText(/Geçerli bir cep telefonu/)).toBeVisible();
});

/**
 * Madde 25-26: ürün stoğu koli x koli içi + tek adet olarak hesaplanıyor
 * ve özet sayfasında çubuk olarak görünüyor.
 */
test('Ürün stoğu koliden hesaplanır ve özette görünür', async ({ page }) => {
  await login(page);
  await page.goto('/panel/urun-hizmet');
  await page.getByRole('tab', { name: 'Ürünler ve Stok' }).click();

  // Tohum veri: 10 koli x 24 + 6 tek adet = 246
  await expect(page.getByRole('cell', { name: 'Su (0,5 lt)', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '246', exact: true })).toBeVisible();

  // Yeni ürün: 5 koli x 12 + 3 = 63
  await page.getByRole('button', { name: /Yeni Ürün/ }).click();
  await page.locator('#vendor-name').fill('Ayran');
  await page.locator('#vendor-box').fill('5');
  await page.locator('#vendor-per').fill('12');
  await page.locator('#vendor-loose').fill('3');
  await expect(page.getByText('63 adet')).toBeVisible();
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByRole('cell', { name: 'Ayran', exact: true })).toBeVisible();

  // Hizmette stok alanları hiç sorulmuyor: DJ'in kolisi olmaz.
  await page.getByRole('button', { name: /Yeni Ürün|Yeni Hizmet/ }).click();
  await page.locator('#vendor-kind').selectOption('hizmet');
  await expect(page.locator('#vendor-box')).toHaveCount(0);
  await page.getByRole('button', { name: 'Vazgeç' }).click();

  // Özet sayfasında stok çubukları ve kritik uyarısı.
  await page.goto('/panel');
  const stok = page.getByRole('region', { name: 'Stok durumu' });
  await expect(stok.getByText('Su (0,5 lt)')).toBeVisible();
  await expect(stok.getByText(/ürün kritik seviyede/)).toBeVisible();
});

/**
 * Maddeler 16-19: görüşme alanları, otomatik takip ve dönüşüm raporu.
 */
test('Görüşme alanları kaydedilir, teklif takibi ve opsiyon uyarısı çıkar', async ({ page }) => {
  await login(page);
  await page.goto('/panel/musteri-adaylari/yeni');

  const yarin = new Date();
  yarin.setDate(yarin.getDate() + 3);
  const opsiyon = yarin.toISOString().slice(0, 10);

  await page.locator('#ml-name').fill('Görüşme Testi');
  await page.locator('#ml-phone').fill('5331234567');
  await page.locator('#ml-guests').fill('250');
  await page.locator('#ml-offer').fill('180000');
  await page.locator('#ml-option').fill(opsiyon);
  await page.getByRole('button', { name: /Kaydet/ }).click();
  await expect(page).toHaveURL(/\/panel\/musteri-adaylari\/[^/]+$/);

  // Teklif fiyatı ve opsiyon tarihi kayda geçmiş olmalı.
  await expect(page.getByText('180.000,00 ₺')).toBeVisible();
  // Opsiyon üç gün sonra: uyarı çıkmalı (madde 18).
  await expect(page.getByText(/Opsiyon tarihine 3 gün kaldı/)).toBeVisible();

  // Teklif durumuna geçince takip tarihi kendiliğinden kuruluyor.
  await page.locator('#lead-status').selectOption('teklif_verildi');
  await expect(page.locator('#lead-followup')).not.toHaveValue('');

  // Özet sayfasındaki opsiyon bandı.
  await page.goto('/panel');
  await expect(page.getByText(/opsiyon tarihi yaklaşıyor/)).toBeVisible();
});

test('Görüşme ve dönüşüm raporu sekmesi açılır', async ({ page }) => {
  await login(page);
  await page.goto('/panel/raporlar');
  await page.getByRole('tab', { name: 'Görüşme ve dönüşüm' }).click();

  await expect(page.getByRole('columnheader', { name: 'Salona gelen' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Dönüşüm' })).toBeVisible();
  await expect(page.getByText(/Dönüşüm oranı: rezervasyona dönen/)).toBeVisible();
});

/**
 * Maddeler 7, 8, 13, 14: takvim sağ bölümü, kanal listesi, sözleşme
 * numarası ve hızlı yanıtlar.
 */
test('Sözleşme numarası düğün yılına göre verilir', async ({ page }) => {
  await login(page);
  await page.goto('/panel/rezervasyonlar/yeni');

  await page.locator('#customerName').fill('Uzak Yıl Testi');
  await page.locator('#customerPhone').fill('5321117766');
  await page.locator('#date').fill('2030-06-12');
  await page.locator('#guestCount').fill('200');
  await page.locator('#totalAmount').fill('150000');
  // Kanal listesi şartnamedeki seçenekleri taşımalı (madde 8).
  await page.locator('#sourceChannel').selectOption('Tavsiye');
  await page.getByRole('button', { name: /Kaydet/ }).click();
  await expect(page).toHaveURL(/\/panel\/rezervasyonlar\/[0-9a-f-]{36}$/);

  // Sözleşme açıldığı yıla değil, düğünün yapılacağı yıla göre (madde 13).
  await expect(page.locator('span.font-mono').first()).toHaveText(/^2030-\d+$/);

  // "Extralar" (hizmet kutucukları) kaldırıldı (madde 8).
  await page.goto('/panel/rezervasyonlar/yeni');
  await expect(page.getByText('Hizmetler', { exact: true })).toHaveCount(0);
});

test('Takvimde ay listesi yok, gün seçilince panel açılır', async ({ page }) => {
  await login(page);
  await page.goto('/panel/takvim');

  // Sağdaki "ayın kayıtları" bölümü kaldırıldı (madde 7).
  await expect(page.getByText(/ayı kayıtları/)).toHaveCount(0);

  // Bir güne tıklanınca o günün paneli açılıyor.
  await page.locator('button[aria-label*="rezervasyon"]').first().click();
  await expect(page.getByRole('button', { name: 'Kapat' })).toBeVisible();
});

test('Hızlı yanıt kaydedilir ve müşteri kartında kullanılır', async ({ page }) => {
  await login(page);
  await page.goto('/panel/hatirlatmalar');

  // Yeni hazır mesaj türleri (madde 14).
  for (const ad of ['Prova', 'Fotoğraf / video seçimi', 'Fotoğraflar hazır']) {
    await expect(page.getByRole('heading', { name: ad })).toBeVisible();
  }

  const kutu = page.getByRole('region', { name: 'Hızlı Yanıt Kaydet' });
  await kutu.locator('#hy-title').fill('Yemekli fiyat');
  await kutu.locator('#hy-body').fill('Yemekli fiyatimiz kisi basi 1.250 TL');
  await kutu.getByRole('button', { name: 'Hızlı yanıtı kaydet' }).click();
  await expect(kutu.getByText('Yemekli fiyatimiz kisi basi 1.250 TL')).toBeVisible();

  // Müşteri kartındaki not kutusuna tek tuşla ekleniyor.
  await page.goto('/panel/musteri-adaylari');
  await page.locator('a[href^="/panel/musteri-adaylari/lead"]').first().click();
  await page.waitForURL(/\/panel\/musteri-adaylari\/[^/]+$/);
  await page.getByRole('button', { name: 'Yemekli fiyat' }).click();
  await expect(page.locator('#lead-note')).toHaveValue('Yemekli fiyatimiz kisi basi 1.250 TL');
});

/**
 * Maddeler 21, 23, 24: fatura müşteri seçimi ve görüntüleme, salon
 * bazlı rapor, aylık rapor anahtarı.
 */
test('Faturada kayıtlı müşteriden doldurma ve görüntüleme çalışır', async ({ page }) => {
  await login(page);
  await page.goto('/panel/faturalar');

  await page.getByRole('button', { name: 'Kayıtlı Müşterilerden Seç' }).click();
  const secim = page.getByRole('region', { name: 'Kayıtlı müşteriler' });
  await expect(secim).toBeVisible();

  // Arama listeyi daraltır, seçim formu doldurur.
  const ilkAd = (await secim.locator('li p').first().textContent())?.trim() ?? '';
  await secim.getByRole('button', { name: 'Seç' }).first().click();
  await expect(page.locator('#fb-name')).toHaveValue(ilkAd);
  // Tutar rezervasyondan geliyor ama kilitli değil (madde 21).
  await expect(page.locator('#ln-price-0')).not.toBeDisabled();

  // Fatura kesilince listede rezervasyon sütunu ve görüntüleme bağlantısı
  // görünür; sözleşme numarası satırdan okunabilmeli (madde 21).
  await page.getByRole('button', { name: 'Faturayı oluştur ve gönder' }).first().click();
  await expect(page.getByRole('columnheader', { name: 'Rezervasyon' })).toBeVisible();
  await page.getByRole('link', { name: 'Görüntüle' }).first().click();
  await expect(page).toHaveURL(/\/panel\/faturalar\/[^/]+$/);
  await expect(page.getByRole('heading', { name: /Fatura/ })).toBeVisible();
});

test('Salon bazlı rapor ayrı ayrı ve toplam gösterir', async ({ page }) => {
  await login(page);
  await page.goto('/panel/raporlar');
  await page.getByRole('tab', { name: 'Salon bazlı rapor' }).click();

  await expect(page.getByRole('columnheader', { name: 'Salon' })).toBeVisible();
  await expect(page.getByText('Seçilen salonların toplamı')).toBeVisible();

  // Salon süzgeci bütün raporları birden daraltıyor.
  const suzgec = page.getByRole('group', { name: 'Salonlar' });
  await expect(suzgec).toBeVisible();
});

test('Kullanıcıya aylık rapor anahtarı eklenir', async ({ page }) => {
  await login(page);
  await page.goto('/panel/kullanicilar');

  await expect(page.getByRole('columnheader', { name: 'Aylık Rapor' })).toBeVisible();
  await page.getByRole('button', { name: /Yeni Kullanıcı/ }).click();
  await expect(page.getByLabel(/Aylık rapor gönderilsin/)).not.toBeChecked();
});

/**
 * Maddeler 27, 32: ekran kilidi ayarı ve hata bildirimi.
 */
test('Hata bildirimi kaydedilir ve denetim ekranında görünür', async ({ page }) => {
  await login(page);
  await page.goto('/panel/kasa');

  // Düğme her ekranda sabit; bulunduğu sayfa kendiliğinden kaydediliyor.
  await page.getByRole('button', { name: 'Hata Bildir' }).click();
  await expect(page.getByText('/panel/kasa')).toBeVisible();
  await page.locator('#hata-metin').fill('Kasa toplamı yanlış görünüyor.');
  await page.getByRole('button', { name: 'Gönder' }).click();
  await expect(page.getByText(/Bildiriminiz kaydedildi/)).toBeVisible();
  await page.getByRole('dialog', { name: 'Hata Bildir' })
    .getByRole('button', { name: 'Kapat' }).last().click();

  await page.goto('/panel/denetim');
  const bolum = page.getByRole('region', { name: 'Kullanıcı Hata Bildirimleri' });
  await expect(bolum.getByText('Kasa toplamı yanlış görünüyor.')).toBeVisible();
  // Hangi sayfada olduğu da kayıtta duruyor (madde 32).
  await expect(bolum.getByText('/panel/kasa')).toBeVisible();
});

test('Ekran kilidi süresi ayarlanabilir', async ({ page }) => {
  await login(page);
  await page.goto('/panel/isletmeler');
  await page.getByRole('button', { name: /Düzenle/ }).first().click();

  const secim = page.locator('#bz-lock');
  await expect(secim).toBeVisible();
  // Varsayılan 120 saniye (madde 27).
  await expect(secim).toHaveValue('120');
  for (const saniye of ['0', '30', '60', '300', '600']) {
    await expect(secim.locator(`option[value="${saniye}"]`)).toHaveCount(1);
  }
});
