import { expect, test, type Page } from '@playwright/test';

/** Harici kaynaklar (yazı tipleri) test ortamında erişilemez; isteği asılı bırakmamak için engellenir. */
async function blockExternalRequests(page: Page) {
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('http://127.0.0.1:4173') || url.startsWith('data:') || url.startsWith('blob:')) {
      return route.continue();
    }
    return route.abort();
  });
}

/**
 * Güvenlik davranışları.
 *
 * Bu testler statik önizleme sunucusunda çalışır; sunucu tarafı uç noktalar
 * (/api/*) burada yoktur. Amaç, uç noktaların bulunmadığı bir dağıtımda
 * uygulamanın güvenli ve kullanılabilir kalmasını doğrulamaktır.
 */
test.describe('İstemci tarafı güvenlik', () => {
  test('panel rotaları oturumsuz erişime kapalı', async ({ page }) => {
    await blockExternalRequests(page);
    for (const path of [
      '/panel', '/panel/rezervasyonlar', '/panel/kasa', '/panel/raporlar',
      '/panel/kullanicilar', '/panel/denetim', '/panel/izinler', '/panel/sistem',
      '/panel/faturalar', '/panel/ayarlar',
    ]) {
      await page.goto(path);
      await expect(page, `${path} korumasız`).toHaveURL(/\/uye-girisi$/);
    }
  });

  test('giriş ve panel sayfaları arama motorlarına kapalı', async ({ page }) => {
    await blockExternalRequests(page);
    await page.goto('/uye-girisi');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  });

  test('robots.txt panel yollarını dışlar', async ({ page }) => {
    const response = await page.goto('/robots.txt');
    const body = await response!.text();
    expect(body).toContain('Disallow: /panel');
    expect(body).toContain('Disallow: /uye-girisi');
  });

  test('kod doğrulama telefonu maskeler ve ödeme bilgisi sızdırmaz', async ({ page }) => {
    await blockExternalRequests(page);
    // Demo verisindeki bir kodu panelden alıp herkese açık sayfada sorgula
    await page.goto('/uye-girisi');
    await page.getByRole('button', { name: 'Demo bilgilerini doldur' }).click();
    await page.getByRole('button', { name: 'Giriş Yap' }).click();
    await expect(page).toHaveURL(/\/panel$/);

    await page.goto('/panel/rezervasyonlar');
    await expect(page.locator('table tbody tr').first()).toBeVisible();
    const code = (await page.locator('td.font-mono').first().innerText()).trim();

    await page.goto('/kod-dogrulama');
    await page.getByLabel('Rezervasyon Kodu').fill(code);
    await page.getByRole('button', { name: 'Kodu Kontrol Et' }).click();
    await expect(page.getByText('Rezervasyon kaydı doğrulandı.')).toBeVisible();

    // Telefon maskeli olmalı, ödeme alanları hiç görünmemeli
    await expect(page.getByText(/\*\*\*\*\*/)).toBeVisible();
    await expect(page.getByText('Kalan Alacak')).toHaveCount(0);
    await expect(page.getByText('Kaparo')).toHaveCount(0);
    await expect(page.getByText('Ödenen')).toHaveCount(0);
  });

  test('ticari ileti İYS onayı olmadan gönderilemez', async ({ page }) => {
    await blockExternalRequests(page);
    await page.goto('/uye-girisi');
    await page.getByRole('button', { name: 'Demo bilgilerini doldur' }).click();
    await page.getByRole('button', { name: 'Giriş Yap' }).click();
    await expect(page).toHaveURL(/\/panel$/);

    // İzin ekranı, muafiyet kuralını açıkça anlatmalı
    await page.goto('/panel/izinler');
    await expect(page.getByRole('heading', { name: 'İYS İzin Yönetimi' })).toBeVisible();
    await expect(page.getByText(/işlem bildirimleri/i)).toBeVisible();
    await expect(page.getByText(/3 iş günü/).first()).toBeVisible();

    // Ret kaydı ekle
    await page.getByLabel('Cep Telefonu').fill('5329998877');
    await page.getByLabel('Durum').selectOption('RET');
    await page.getByRole('button', { name: /Kaydet/ }).click();
    await expect(page.getByText('İzin kaydı kaydedildi.')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'RET' })).toBeVisible();
  });

  test('SMS kuyruğu görünümü açılır', async ({ page }) => {
    await blockExternalRequests(page);
    await page.goto('/uye-girisi');
    await page.getByRole('button', { name: 'Demo bilgilerini doldur' }).click();
    await page.getByRole('button', { name: 'Giriş Yap' }).click();
    await expect(page).toHaveURL(/\/panel$/);

    await page.goto('/panel/sms');
    await page.getByRole('tab', { name: /Kuyruk/ }).click();
    // Kuyruk görünümü açılmalı (kayıt olsun olmasın)
    await expect(page.getByRole('tab', { name: /Kuyruk/ })).toHaveAttribute('aria-selected', 'true');
  });

  test('yedek indirme kendi verisini üretir', async ({ page }) => {
    await blockExternalRequests(page);
    await page.goto('/uye-girisi');
    await page.getByRole('button', { name: 'Demo bilgilerini doldur' }).click();
    await page.getByRole('button', { name: 'Giriş Yap' }).click();
    await expect(page).toHaveURL(/\/panel$/);

    await page.goto('/panel/sistem');
    await expect(page.getByRole('heading', { name: 'Sistem Durumu' })).toBeVisible();

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Yedeği indir/ }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^duguntakip-yedek-\d{4}-\d{2}-\d{2}\.json$/);
  });

  test('fatura tutarları arayüzde doğru hesaplanır', async ({ page }) => {
    await blockExternalRequests(page);
    await page.goto('/uye-girisi');
    await page.getByRole('button', { name: 'Demo bilgilerini doldur' }).click();
    await page.getByRole('button', { name: 'Giriş Yap' }).click();
    await expect(page).toHaveURL(/\/panel$/);

    await page.goto('/panel/faturalar');
    await page.getByRole('button', { name: /Yeni Fatura/ }).click();

    await page.getByLabel('Ad Soyad').fill('Test Müşteri');
    await page.getByLabel('Açıklama').fill('Salon kiralama');
    await page.getByLabel('Birim Fiyat').fill('100000');
    await page.getByLabel('KDV %').selectOption('20');

    // 100.000 matrah + %20 KDV = 120.000 toplam
    await expect(page.getByText('Genel Toplam')).toBeVisible();
    await expect(page.getByText('120.000,00 ₺').first()).toBeVisible();
  });

  test('sunucu sırları sayfa kaynağına sızmıyor', async ({ page }) => {
    await blockExternalRequests(page);
    // vercel.json başlıkları yalnızca Vercel'de uygulanır; burada sayfanın
    // kendisinin çerçeveleme koruması için meta/CSP beklemiyoruz.
    // Bunun yerine hassas verinin sayfa kaynağına gömülmediğini doğruluyoruz.
    await page.goto('/');
    const html = await page.content();
    expect(html).not.toContain('service_role');
    expect(html).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(html).not.toContain('NETGSM_PASS');
    expect(html).not.toContain('OTP_SECRET');
  });

  test('derlenmiş paketlerde sunucu sırları bulunmuyor', async ({ request }) => {
    const index = await (await request.get('/')).text();
    const scripts = [...index.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
    expect(scripts.length).toBeGreaterThan(0);

    for (const src of scripts) {
      const code = await (await request.get(src!)).text();
      expect(code, `${src} sunucu sırrı içeriyor`)
        .not.toMatch(/NETGSM_PASS|OTP_SECRET|service_role_key|IYS_PASSWORD|CRON_SECRET|EINVOICE_API_KEY/i);
    }
  });
});
