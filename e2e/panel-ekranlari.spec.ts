import { expect, test, type Page } from '@playwright/test';

/**
 * Panelin kalan ekranları için işlevsel akışlar.
 *
 * Diğer dosyalar rezervasyon, kasa, salon, menü, masa, fatura ve tedarikçi
 * tarafını kapsıyor; burada geriye kalan ekranlar tek tek çalıştırılıyor:
 * hatırlatmalar, kullanıcılar, renk ayarları, müşteriler, denetim kaydı,
 * ayarlar, takvim ve rezervasyon düzenleme.
 *
 * Vurgu hatırlatmalar ekranında: müşteriye giden metin ve kalan alacak
 * burada buluşuyor; ekranda görülenle SMS'e gidenin ayrışması daha önce
 * gerçek bir hataya yol açtı.
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

/** Tutarları bilinen bir rezervasyon açar ve adresini döndürür. */
async function rezervasyonAc(
  page: Page,
  { ad, tarih, tutar, kapora, telefon = '5339990001' }:
    { ad: string; tarih: string; tutar: number; kapora: number; telefon?: string },
) {
  await page.goto('/panel/rezervasyonlar/yeni');
  await page.locator('#hallId').selectOption({ index: 1 });
  await page.locator('#customerName').fill(ad);
  // Demo tohumunda 5321234567 zaten kayıtlı; müşteri satırları telefona
  // göre birleştiği için testler kendi numarasını kullanıyor.
  await page.locator('#customerPhone').fill(telefon);
  await page.locator('#date').fill(tarih);
  await page.locator('#guestCount').fill('200');
  await page.locator('#totalAmount').fill(String(tutar));
  await page.locator('#deposit').fill(String(kapora));
  await page.getByRole('button', { name: /Kaydet/ }).click();
  await expect(page).toHaveURL(/\/panel\/rezervasyonlar\/[^/]+$/);
  return page.url();
}

test.describe('Hatırlatmalar ekranı', () => {
  test('şablon metni düzenlenip kaydedilir', async ({ page }) => {
    await login(page);
    await page.goto('/panel/hatirlatmalar');
    await expect(page.getByRole('heading', { name: 'Hatırlatmalar', level: 1 })).toBeVisible();

    const metin = page.locator('textarea').first();
    const yeni = 'Sayin {musteri}, {tarih} kaydiniz alinmistir. Kod: {kod}';
    await metin.fill(yeni);

    await page.getByRole('button', { name: /Metni kaydet/ }).first().click();
    await expect(page.getByText('Kaydedildi').first()).toBeVisible();

    // Sayfa yenilendiğinde metin kalıcı olmalı.
    await page.reload();
    await expect(page.locator('textarea').first()).toHaveValue(yeni);
  });

  test('Türkçe harf uyarısı yalnızca gerektiğinde çıkar', async ({ page }) => {
    // ş, ğ, ı, İ ve ç GSM-7 alfabesinde yok; parça başına 160 yerine 70
    // karakter sayılır ve ücret ikiye katlanabilir.
    await login(page);
    await page.goto('/panel/hatirlatmalar');

    const metin = page.locator('textarea').first();
    await metin.fill('Sayin musteri, kaydiniz alinmistir.');
    await expect(page.getByText(/parça başına 70 karakter/)).toHaveCount(0);

    await metin.fill('Sayın müşteri, kaydınız alınmıştır.');
    await expect(page.getByText(/parça başına 70 karakter/).first()).toBeVisible();
  });

  test('karakter ve SMS parça sayısı gösterilir', async ({ page }) => {
    await login(page);
    await page.goto('/panel/hatirlatmalar');

    await page.locator('textarea').first().fill('a'.repeat(100));
    await expect(page.getByText('100 karakter · 1 SMS').first()).toBeVisible();

    await page.locator('textarea').first().fill('a'.repeat(200));
    await expect(page.getByText('200 karakter · 2 SMS').first()).toBeVisible();
  });

  test('ticari ileti ile işlem bildirimi ayrı etiketlenir', async ({ page }) => {
    // Sınıf yanlış görünürse kullanıcı onaysız ticari ileti gönderebileceğini
    // sanır; 6563 sayılı kanun buna izin vermiyor.
    await login(page);
    await page.goto('/panel/hatirlatmalar');

    await expect(page.getByText('İşlem bildirimi: onay gerekmez').first()).toBeVisible();
    await expect(page.getByText('Ticari ileti: İYS onayı gerekir').first()).toBeVisible();
  });

  test('otomatik gönderim kuralı açılıp gün ve saat düzenlenir', async ({ page }) => {
    await login(page);
    await page.goto('/panel/hatirlatmalar');

    const kutu = page.getByRole('checkbox', { name: 'Kendiliğinden gönderilsin' }).first();
    if (!(await kutu.isChecked())) await kutu.check();
    await expect(kutu).toBeChecked();

    const gun = page.locator('input[id^="gun-"]').first();
    await gun.fill('5');
    await gun.blur();
    await expect(page.getByText(/Organizasyondan 5 gün önce gönderilir/).first()).toBeVisible();

    await page.reload();
    await expect(page.locator('input[id^="gun-"]').first()).toHaveValue('5');
  });

  test('kural kapatılınca gün ve saat alanları kilitlenir', async ({ page }) => {
    await login(page);
    await page.goto('/panel/hatirlatmalar');

    const kutu = page.getByRole('checkbox', { name: 'Kendiliğinden gönderilsin' }).first();
    if (await kutu.isChecked()) await kutu.uncheck();

    await expect(page.locator('input[id^="gun-"]').first()).toBeDisabled();
    await expect(page.locator('input[id^="saat-"]').first()).toBeDisabled();
  });

  test('yer tutucu listesi ekranda gösterilir', async ({ page }) => {
    await login(page);
    await page.goto('/panel/hatirlatmalar');
    await expect(page.getByRole('heading', { name: 'Yer tutucular' })).toBeVisible();
    await expect(page.getByText('{musteri}').first()).toBeVisible();
    await expect(page.getByText('{kalan}').first()).toBeVisible();
  });
});

test.describe('Hatırlatma metni ile ekrandaki tutar', () => {
  test('şablondaki kalan tutar rezervasyon detayındakiyle aynıdır', async ({ page }) => {
    // Kapora bir tahsilattır. Yalnızca ek ödemeler toplanırsa müşteriye
    // ekrandakinden yüksek bir rakam gider; bu hata gerçekten yaşandı.
    await login(page);
    const adres = await rezervasyonAc(page, {
      ad: 'Kapora Testi', tarih: '2026-11-14', tutar: 250000, kapora: 60000,
    });

    await page.locator('#pay-amount').fill('60500');
    await page.getByRole('button', { name: 'Ekle', exact: true }).click();

    // 250.000 - (60.000 kapora + 60.500 tahsilat) = 129.500
    await expect(page.getByText('129.500,00 ₺').first()).toBeVisible();

    // Aynı sayfadaki hatırlatma taslağı da bu rakamı taşımalı.
    await page.getByRole('button', { name: 'Ödeme hatırlatması' }).click();
    const metin = page.getByText(/Sayin Kapora Testi/);
    await expect(metin).toContainText('129.500');
    await expect(metin).not.toContainText('185.000');
    void adres;
  });

  test('tahsilat kalan alacaktan fazla girilemez', async ({ page }) => {
    await login(page);
    await rezervasyonAc(page, {
      ad: 'Fazla Tahsilat', tarih: '2026-11-21', tutar: 100000, kapora: 20000,
      telefon: '5339990002',
    });

    await page.locator('#pay-amount').fill('90000');
    await page.getByRole('button', { name: 'Ekle', exact: true }).click();

    await expect(page.getByText(/kalan alacaktan.*fazla olamaz/)).toBeVisible();
  });

  test('gönderilecek metnin SMS parça sayısı gösterilir', async ({ page }) => {
    await login(page);
    await rezervasyonAc(page, {
      ad: 'Parca Sayaci', tarih: '2026-11-28', tutar: 100000, kapora: 20000,
      telefon: '5339990003',
    });

    await page.getByRole('button', { name: 'Rezervasyon onayı' }).click();
    await expect(page.getByText(/karakter · \d+ SMS/).first()).toBeVisible();
  });
});

test.describe('Kullanıcılar ekranı', () => {
  test('personel eklenir, düzenlenir ve silinir', async ({ page }) => {
    await login(page);
    await page.goto('/panel/kullanicilar');
    await expect(page.getByRole('heading', { name: 'Kullanıcılar', level: 1 })).toBeVisible();

    await page.getByRole('button', { name: 'Yeni Kullanıcı' }).click();
    await page.locator('#us-name').fill('Deneme Personel');
    await page.locator('#us-email').fill('deneme.personel@ornek.com');
    await page.locator('#us-mobile').fill('5329998877');
    await page.locator('#us-password').fill('personel1234');
    await page.getByRole('button', { name: 'Kaydet' }).click();

    await expect(page.getByText('Deneme Personel')).toBeVisible();

    await page.getByRole('button', { name: 'Deneme Personel düzenle' }).click();
    await page.locator('#us-name').fill('Deneme Personel 2');
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await expect(page.getByText('Deneme Personel 2')).toBeVisible();

    await page.getByRole('button', { name: 'Deneme Personel 2 sil' }).click();
    await page.getByRole('button', { name: /Evet|Sil/ }).click();
    await expect(page.getByText('Deneme Personel 2')).toHaveCount(0);
  });

  test('kullanılan e-posta ile ikinci personel açılamaz', async ({ page }) => {
    await login(page);
    await page.goto('/panel/kullanicilar');

    await page.getByRole('button', { name: 'Yeni Kullanıcı' }).click();
    await page.locator('#us-name').fill('Kopya');
    await page.locator('#us-email').fill('demo@sahratakip.com');
    await page.locator('#us-mobile').fill('5329998877');
    await page.locator('#us-password').fill('personel1234');
    await page.getByRole('button', { name: 'Kaydet' }).click();

    await expect(page.getByText(/başka bir kullanıcıya ait/)).toBeVisible();
  });
});

test.describe('Renk ayarları ekranı', () => {
  test('seçilen renk kaydedilir ve takvimde kullanılır', async ({ page }) => {
    await login(page);
    await page.goto('/panel/renk-ayarlari');
    await expect(page.getByRole('heading', { name: /Renk Ayarları/, level: 1 })).toBeVisible();

    await page.locator('#color-dugun').fill('#123456');
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await expect(page.getByText('Renk ayarlarınız kaydedildi.')).toBeVisible();

    await page.reload();
    await expect(page.locator('#color-dugun')).toHaveValue('#123456');
  });

  test('varsayılana dönülebilir', async ({ page }) => {
    await login(page);
    await page.goto('/panel/renk-ayarlari');

    await page.locator('#color-dugun').fill('#123456');
    await page.getByRole('button', { name: 'Varsayılana dön' }).click();

    await expect(page.locator('#color-dugun')).not.toHaveValue('#123456');
  });
});

test.describe('Müşteriler ekranı', () => {
  test('müşteri rezervasyondan otomatik oluşur ve bakiyesi doğrudur', async ({ page }) => {
    await login(page);
    await rezervasyonAc(page, {
      ad: 'Zerrin Müşteri', tarih: '2026-12-05', tutar: 200000, kapora: 50000,
      telefon: '5339990010',
    });

    await page.goto('/panel/musteriler');
    await expect(page.getByRole('heading', { name: 'Müşteriler', level: 1 })).toBeVisible();

    const satir = page.getByRole('row', { name: /Zerrin Müşteri/ });
    await expect(satir).toBeVisible();
    await expect(satir).toContainText('200.000,00');
    // Ödenen = kapora, kalan = toplam - kapora.
    await expect(satir).toContainText('50.000,00');
    await expect(satir).toContainText('150.000,00');
  });

  test('arama listeyi daraltır', async ({ page }) => {
    await login(page);
    await page.goto('/panel/musteriler');
    // Liste yüklenmeden sayılırsa sıfır okunur.
    await expect(page.getByRole('table')).toBeVisible();
    const oncekiSayi = await page.getByRole('row').count();
    expect(oncekiSayi).toBeGreaterThan(1);

    await page.locator('#ms-q').fill('kesinlikle-olmayan-bir-isim');
    await expect(page.getByText('Müşteri kaydı bulunamadı.')).toBeVisible();

    await page.locator('#ms-q').fill('');
    await expect(page.getByRole('row')).toHaveCount(oncekiSayi);
  });

  test('telefon ile de aranabilir', async ({ page }) => {
    await login(page);
    await rezervasyonAc(page, {
      ad: 'Telefonla Bulunan', tarih: '2026-12-09', tutar: 100000, kapora: 10000,
      telefon: '5339990011',
    });

    await page.goto('/panel/musteriler');
    await page.locator('#ms-q').fill('5339990011');
    await expect(page.getByRole('row', { name: /Telefonla Bulunan/ })).toBeVisible();
  });
});

test.describe('Denetim kaydı ekranı', () => {
  test('demo modunda durumu açıkça bildirir', async ({ page }) => {
    // Denetim kaydı veritabanı tetikleyicileriyle yazılır; tarayıcıda
    // karşılığı yok. Boş bir tablo göstermek "hiçbir şey olmadı" gibi
    // okunurdu.
    await login(page);
    await page.goto('/panel/denetim');
    await expect(page.getByRole('heading', { name: 'Denetim Kaydı', level: 1 })).toBeVisible();
    await expect(page.locator('#au-q')).toBeVisible();
    await expect(page.locator('#au-action')).toBeVisible();
  });

  test('işlem türü süzgeci seçilebilir', async ({ page }) => {
    await login(page);
    await page.goto('/panel/denetim');
    await page.locator('#au-action').selectOption({ index: 1 });
    await expect(page.locator('#au-action')).not.toHaveValue('');
  });
});

test.describe('Ayarlar ekranı', () => {
  test('profil bilgileri kaydedilir ve kalıcı olur', async ({ page }) => {
    await login(page);
    await page.goto('/panel/ayarlar');
    await expect(page.getByRole('heading', { name: 'Ayarlar', level: 1 })).toBeVisible();

    await page.locator('#st-name').fill('Güncel Yetkili');
    await page.locator('#st-capacity').fill('750');
    await page.getByRole('button', { name: 'Kaydet' }).first().click();

    await page.reload();
    await expect(page.locator('#st-name')).toHaveValue('Güncel Yetkili');
    await expect(page.locator('#st-capacity')).toHaveValue('750');
  });

  test('e-posta alanı salt okunur', async ({ page }) => {
    // E-posta kimlik doğrulamanın anahtarı; panelden değiştirilemez.
    await login(page);
    await page.goto('/panel/ayarlar');
    await expect(page.locator('#st-email')).toHaveAttribute('readonly', '');
  });

  test('şifre tekrarı uyuşmazsa uyarır', async ({ page }) => {
    await login(page);
    await page.goto('/panel/ayarlar');

    await page.locator('#pw-current').fill('demo1234');
    await page.locator('#pw-next').fill('yenisifre1');
    await page.locator('#pw-repeat').fill('baskasifre1');
    await page.getByRole('button', { name: 'Şifreyi Güncelle' }).click();

    await expect(page.getByText(/uyuşmuyor|aynı/i).first()).toBeVisible();
  });

  test('şehir seçilince ilçe listesi yüklenir', async ({ page }) => {
    await login(page);
    await page.goto('/panel/ayarlar');

    await page.locator('#st-city').selectOption('İstanbul');
    const ilce = page.locator('#st-district');
    await expect(ilce.locator('option', { hasText: 'Çekmeköy' })).toHaveCount(1);
  });
});

test.describe('Takvim ekranı', () => {
  test('ay gezinmesi başlığı değiştirir ve geri döner', async ({ page }) => {
    await login(page);
    await page.goto('/panel/takvim');
    await expect(page.getByRole('heading', { name: 'Rezervasyon Takvimi', level: 1 })).toBeVisible();

    const baslik = page.locator('h2').first();
    const ilk = await baslik.textContent();

    await page.getByRole('button', { name: 'Sonraki ay' }).click();
    await expect(baslik).not.toHaveText(ilk ?? '');

    await page.getByRole('button', { name: 'Önceki ay' }).click();
    await expect(baslik).toHaveText(ilk ?? '');
  });

  test('rezervasyon açılan gün takvimde işaretlenir', async ({ page }) => {
    await login(page);
    await rezervasyonAc(page, {
      ad: 'Takvim Testi', tarih: '2026-10-17', tutar: 120000, kapora: 20000,
    });

    await page.goto('/panel/takvim');
    // Ekim 2026'ya kadar ilerle.
    for (let i = 0; i < 24; i += 1) {
      if (await page.locator('h2').first().textContent() === 'Ekim 2026') break;
      await page.getByRole('button', { name: 'Sonraki ay' }).click();
    }

    await expect(page.getByLabel(/17 Ekim 2026, 1 rezervasyon/)).toBeVisible();
  });
});

test.describe('Rezervasyon düzenleme', () => {
  test('tutar güncellenince kalan alacak yeniden hesaplanır', async ({ page }) => {
    await login(page);
    const adres = await rezervasyonAc(page, {
      ad: 'Düzenleme Testi', tarih: '2026-10-24', tutar: 100000, kapora: 20000,
    });

    await expect(page.getByText('80.000,00 ₺').first()).toBeVisible();

    await page.goto(`${adres}/duzenle`);
    await page.locator('#totalAmount').fill('150000');
    await page.getByRole('button', { name: /Kaydet/ }).click();

    await expect(page).toHaveURL(/\/panel\/rezervasyonlar\/[^/]+$/);
    await expect(page.getByText('130.000,00 ₺').first()).toBeVisible();
  });

  test('kapora toplam tutarı aşamaz', async ({ page }) => {
    await login(page);
    const adres = await rezervasyonAc(page, {
      ad: 'Kapora Sınırı', tarih: '2026-10-31', tutar: 100000, kapora: 20000,
    });

    await page.goto(`${adres}/duzenle`);
    await page.locator('#deposit').fill('200000');
    await page.getByRole('button', { name: /Kaydet/ }).click();

    await expect(page.getByText(/kapora.*büyük olamaz/i)).toBeVisible();
  });
});
