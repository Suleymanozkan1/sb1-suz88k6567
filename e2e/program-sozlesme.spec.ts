import { expect, test, type Page } from '@playwright/test';

/**
 * Program raporu, sözleşme çıktısı, kasa bağlantısı ve işletme ekleme.
 *
 * Dört akışın ortak yanı, tarayıcıda görüleni doğrulamaları: rapor
 * çizelgesinin doğru güne yazması, sözleşmenin boş satır basmaması,
 * tahsilatın kasada sözleşme numarasıyla görünmesi ve kenar çubuğundan
 * yeni işletme açılabilmesi. Dördü de birim testlerinde görünmeyen
 * bağlantı noktalarında duruyor.
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

/**
 * Sözleşme çıktısını açar.
 *
 * Müşteri satırına tıkladıktan sonra ayrıntı sayfasının yerleştiği
 * doğrulanmadan "Sözleşme" bağlantısı aranırsa, yavaş bir yüklemede tıklama
 * hâlâ liste ekranındayken gerçekleşiyor ve test ara sıra düşüyordu.
 */
async function sozlesmeAc(page: Page, musteri: RegExp) {
  await page.goto('/panel/rezervasyonlar');
  await page.getByRole('link', { name: musteri }).first().click();
  await expect(page).toHaveURL(/\/panel\/rezervasyonlar\/(?!yeni$)[^/]+$/, { timeout: 15_000 });
  await page.getByRole('link', { name: /Sözleşme/ }).first().click();
  await expect(page).toHaveURL(/\/sozlesme$/, { timeout: 15_000 });
  await expect(page.locator('article')).toBeVisible();
}

test.describe('Program raporu', () => {
  test('rezervasyon listesinden çizelgeye geçilir', async ({ page }) => {
    await login(page);
    await page.goto('/panel/rezervasyonlar');
    await page.getByRole('link', { name: 'Program raporu' }).click();

    await expect(page).toHaveURL(/\/panel\/raporlar\?tab=cizelge/);
    await expect(page.getByRole('tab', { name: 'Program raporu' })).toHaveAttribute('aria-selected', 'true');
  });

  test('salon sütunlarıyla çizelge çizilir', async ({ page }) => {
    await login(page);
    await page.goto('/panel/raporlar?tab=cizelge');

    await expect(page.getByRole('columnheader', { name: 'Kristal Salon' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Zümrüt Salon' })).toBeVisible();
  });

  test('tarih aralığında yalnızca dolu günler listelenir', async ({ page }) => {
    await login(page);
    await page.goto('/panel/raporlar?tab=cizelge');

    // Tohumda bu aralıkta yalnızca 9 Mart'ta bir düğün var.
    await page.locator('#rp-from').fill('2027-03-08');
    await page.locator('#rp-to').fill('2027-03-10');

    await expect(page.getByText(/^09\.03\.2027 SALI/).first()).toBeVisible();
    await expect(page.getByText(/^08\.03\.2027/)).toHaveCount(0);
    await expect(page.getByText(/^10\.03\.2027/)).toHaveCount(0);
  });

  test('kayıt bulunmayan aralıkta gün sayısını bildirir', async ({ page }) => {
    await login(page);
    await page.goto('/panel/raporlar?tab=cizelge');

    await page.locator('#rp-from').fill('2035-01-01');
    await page.locator('#rp-to').fill('2035-01-03');

    // "Aralık seçilmedi" ile "aralık boş" ayrı iletiler; ikincisi kullanıcıyı
    // tarih kutularına geri göndermemeli.
    await expect(page.getByText('Seçilen 3 günün hiçbirinde organizasyon bulunmuyor.')).toBeVisible();
  });

  test('aynı gün aynı salondaki iki tören saat bandıyla ayrılır', async ({ page }) => {
    await login(page);
    await page.goto('/panel/raporlar?tab=cizelge');

    // Tanıtım haftasında cumartesi Zümrüt Salon'da gündüz ve gece iki düğün var.
    const gunduz = page.getByText('13:00-17:00 DÜĞÜN');
    const gece = page.getByText('19:00-23:00 DÜĞÜN');
    await expect(gunduz).toBeVisible();
    await expect(gece).toBeVisible();
  });

  test('ek not girilince çizelgeyle birlikte görünür', async ({ page }) => {
    await login(page);
    await page.goto('/panel/raporlar?tab=cizelge');

    await page.locator('#rp-notlar').fill('Sahne cumartesi 12:00 kurulacak.');
    await expect(page.locator('#rp-notlar')).toHaveValue('Sahne cumartesi 12:00 kurulacak.');

    // Not bu tarayıcıda saklanır; rapor her açılışta yeniden yazılmamalı.
    await page.reload();
    await expect(page.locator('#rp-notlar')).toHaveValue('Sahne cumartesi 12:00 kurulacak.');
  });

  test('Word çıktısı indirilir ve geçerli bir paket olur', async ({ page }) => {
    await login(page);
    await page.goto('/panel/raporlar?tab=cizelge');

    const [indirme] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Word indir' }).click(),
    ]);

    expect(indirme.suggestedFilename()).toMatch(/^program-raporu-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.docx$/);
    const yol = await indirme.path();
    expect(yol).toBeTruthy();
  });

  test('kayıt bulunmayan aralıkta Word indirme kapalıdır', async ({ page }) => {
    await login(page);
    await page.goto('/panel/raporlar?tab=cizelge');

    await page.locator('#rp-from').fill('2035-01-01');
    await page.locator('#rp-to').fill('2035-01-03');

    await expect(page.getByRole('button', { name: 'Word indir' })).toBeDisabled();
  });
});

test.describe('Salon kiralama sözleşmesi', () => {
  test('sözleşme örnek belgedeki düzende çıkar', async ({ page }) => {
    await login(page);
    await sozlesmeAc(page, /Zuhal Rana/);

    const belge = page.locator('article');
    await expect(belge.getByText('Sözleşme No :')).toBeVisible();
    await expect(belge.getByText('Gelin ve Damat :')).toBeVisible();
    await expect(belge.getByText('Kiraya Veren İmza')).toBeVisible();
    await expect(belge.getByText('Kiralayan İmza')).toBeVisible();
  });

  test('on altı maddelik şartlar sözleşmede yer alır', async ({ page }) => {
    await login(page);
    await sozlesmeAc(page, /Zuhal Rana/);

    const sartlar = page.getByRole('heading', { name: 'Sözleşme Şartları' });
    await expect(sartlar).toBeVisible();
    const metin = await page.locator('article').innerText();
    expect(metin).toContain('CAYMA TAZMİNATI');
    expect(metin).toContain('16. )');
    expect(metin).toContain('İstanbul Mahkemeleri');
  });

  test('menü içeriği sözleşmenin sağ sütununa basılır', async ({ page }) => {
    await login(page);
    await sozlesmeAc(page, /Zuhal Rana/);

    const metin = await page.locator('article').innerText();
    expect(metin).toContain('ANA YEMEK');
    expect(metin).toContain('Et Kavurma');
    expect(metin).toContain('İÇECEKLER');
  });
});

test.describe('Kasa ve rezervasyon geliri', () => {
  test('tahsilatlar sözleşme numarasıyla kasada görünür', async ({ page }) => {
    await login(page);
    await page.goto('/panel/kasa');

    await expect(page.getByRole('heading', { name: 'Gelir Gider Kayıtları' })).toBeVisible();
    await expect(page.getByText('Kapora').first()).toBeVisible();
    // Türetilmiş satırın kaynağı belli olmalı; silme düğmesi yerine etiket durur.
    await expect(page.getByText('Rezervasyon', { exact: true }).first()).toBeVisible();
  });

  test('kasadaki tahsilat satırı rezervasyona götürür', async ({ page }) => {
    await login(page);
    await page.goto('/panel/kasa');

    await page.locator('table tbody tr a').first().click();
    await expect(page).toHaveURL(/\/panel\/rezervasyonlar\/(?!yeni$)[^/]+$/);
  });
});

test.describe('Çelik kasa', () => {
  /**
   * Kasa ekranını açar ve tablonun çizilmesini bekler.
   *
   * `count()` beklemez; sayım sayfa henüz boşken yapılırsa sıfır çıkar ve
   * test ürün hatası yokken düşer.
   */
  async function kasaAc(page: Page) {
    await page.goto('/panel/kasa');
    await expect(page.getByRole('heading', { name: 'Gelir Gider Kayıtları' })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Gelir ve gider kayıtları' })).toBeVisible();
  }

  test('kasa bakiyesinden ayrı bir kart olarak durur', async ({ page }) => {
    await login(page);
    await kasaAc(page);

    // İki bakiye toplanmaz: biri muhasebe hesabı, diğeri kasadaki gerçek para.
    await expect(page.getByText('Kasa Bakiyesi')).toBeVisible();
    // Çelik kasa kartını özet satırından tanıyoruz; "Çelik Kasa" metni
    // ayrıca tablo başlığında da geçiyor.
    await expect(page.getByText(/^Giren .+ · Çıkan /)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Çelik Kasa Hareketleri' })).toBeVisible();
  });

  test('her gelir gider satırında iki düğme bulunur', async ({ page }) => {
    await login(page);
    await kasaAc(page);

    const ekle = page.getByRole('button', { name: /^Çelik kasaya ekle:/ });
    const cikar = page.getByRole('button', { name: /^Çelik kasadan çıkar:/ });
    await expect(ekle.first()).toBeVisible();
    expect(await ekle.count()).toBe(await cikar.count());
  });

  test('kasaya eklenen kayıt deftere düşer ve düğme kapanır', async ({ page }) => {
    await login(page);
    await kasaAc(page);

    const defter = page.getByRole('table', { name: 'Çelik kasa hareketleri' });
    await expect(defter).toBeVisible();
    const oncekiSatir = await defter.locator('tbody tr').count();

    const ekle = page.getByRole('button', { name: /^Çelik kasaya ekle:/ }).first();
    await ekle.click();

    // Aynı satır ikinci kez yazılamaz; çift sayım kasadaki parayı bozardı.
    await expect(ekle).toBeDisabled();
    await expect(defter.locator('tbody tr')).toHaveCount(oncekiSatir + 1);
  });

  test('kasadan çıkarılan kayıt bakiyeyi geri alır', async ({ page }) => {
    await login(page);
    await kasaAc(page);

    // Kasaya girip bankaya yatırılan para: satırın kasaya net etkisi sıfır.
    const satir = page.locator('table tbody tr').filter({
      has: page.getByRole('button', { name: /^Çelik kasaya ekle:/ }),
    }).first();
    await satir.getByRole('button', { name: /^Çelik kasaya ekle:/ }).click();
    await expect(satir.getByRole('button', { name: /^Çelik kasaya ekle:/ })).toBeDisabled();
    await satir.getByRole('button', { name: /^Çelik kasadan çıkar:/ }).click();

    await expect(satir.getByRole('button', { name: /^Çelik kasadan çıkar:/ })).toBeDisabled();
    await expect(satir).toContainText('0,00 ₺');
  });

  test('girip çıkan kayıt kasaya yeniden eklenebilir', async ({ page }) => {
    await login(page);
    await kasaAc(page);

    // Para kasa ile banka arasında bir kez değil sürekli gidip gelir.
    // Satırın bir tur sonra kilitlenmesi kullanıcının bildirdiği hataydı.
    const defter = page.getByRole('table', { name: 'Çelik kasa hareketleri' });
    await expect(defter).toBeVisible();
    const once = await defter.locator('tbody tr').count();

    const satir = page.locator('table tbody tr').filter({
      has: page.getByRole('button', { name: /^Çelik kasaya ekle:/ }),
    }).first();
    const ekle = satir.getByRole('button', { name: /^Çelik kasaya ekle:/ });
    const cikar = satir.getByRole('button', { name: /^Çelik kasadan çıkar:/ });

    await ekle.click();
    await expect(ekle).toBeDisabled();
    await cikar.click();
    await expect(cikar).toBeDisabled();

    // Tur tamamlandı: düğme yeniden açılmalı ve ikinci tur yürümeli.
    await expect(ekle).toBeEnabled();
    await ekle.click();
    await expect(ekle).toBeDisabled();
    await expect(cikar).toBeEnabled();

    await expect(defter.locator('tbody tr')).toHaveCount(once + 3);
  });

  test('gider kasadan ödenir, kasayı azaltır ve geri alınabilir', async ({ page }) => {
    await login(page);
    await kasaAc(page);

    // Bildirilen hata: nakit ödenen gider "Ekle" ile kasayı ARTIRIYORDU ve
    // kasadan düşülemiyordu. Gider satırında artık "Ekle" düğmesi yok.
    const satir = page.locator('table tbody tr').filter({
      has: page.getByRole('button', { name: /^Çelik kasadan öde:/ }),
    }).first();
    const ode = satir.getByRole('button', { name: /^Çelik kasadan öde:/ });
    const geriAl = satir.getByRole('button', { name: /^Çelik kasaya geri al:/ });

    await expect(ode).toBeEnabled();
    await expect(geriAl).toBeDisabled();
    await expect(satir.getByRole('button', { name: /^Çelik kasaya ekle:/ })).toHaveCount(0);

    // Kartın bakiyesi ikinci paragrafta; "Giren / Çıkan" özeti her hareketle
    // değiştiği için karşılaştırma yalnızca bakiye üzerinden yapılıyor.
    const kasaBakiye = page.locator('.card').filter({ hasText: 'Çelik Kasa' })
      .locator('p').nth(1);
    const tutar = async () => Number(
      (await kasaBakiye.innerText()).replace(/[^0-9,-]/g, '').replace(/\./g, '').replace(',', '.'),
    );
    const once = await tutar();

    await ode.click();
    await expect(ode).toBeDisabled();
    await expect(geriAl).toBeEnabled();
    // Asıl kontrol: gider kasayı AZALTMALI.
    expect(await tutar()).toBeLessThan(once);

    await geriAl.click();
    await expect(ode).toBeEnabled();
    expect(await tutar()).toBe(once);
  });

  test('yanlış işlenen hareket defterden silinir', async ({ page }) => {
    await login(page);
    await kasaAc(page);

    const defter = page.getByRole('table', { name: 'Çelik kasa hareketleri' });
    await expect(defter.locator('tbody tr').first()).toBeVisible();
    const once = await defter.locator('tbody tr').count();

    await defter.getByRole('button', { name: 'Çelik kasa hareketini sil' }).first().click();
    await page.getByRole('button', { name: 'Evet, sil' }).click();

    await expect(defter.locator('tbody tr')).toHaveCount(once - 1);
  });
});

test.describe('İşletme ekleme', () => {
  test('kenar çubuğundaki bağlantı yeni işletme formunu açar', async ({ page }) => {
    await login(page);

    await page.getByRole('link', { name: 'Yeni işletme ekle' }).click();
    await expect(page).toHaveURL(/\/panel\/isletmeler/);
    await expect(page.getByRole('heading', { name: 'Yeni İşletme' })).toBeVisible();
  });

  test('eklenen işletme listeye ve aktif işletme seçicisine düşer', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'Yeni işletme ekle' }).click();

    await page.locator('#bz-name').fill('Sahra Bahçe Salonu');
    await page.locator('#bz-city').selectOption({ index: 1 });
    await page.locator('#bz-phone').fill('5551112233');
    await page.locator('#bz-capacity').fill('400');
    await page.getByRole('button', { name: /^Kaydet/ }).click();

    // Ad hem listede hem aktif işletme seçicisinde geçiyor; listedeki
    // başlığa bakılıyor.
    await expect(page.getByRole('heading', { name: 'Sahra Bahçe Salonu' })).toBeVisible();
    await expect(page.locator('#active-business')).toContainText('Sahra Bahçe Salonu');
  });
});
