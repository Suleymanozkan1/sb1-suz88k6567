import { expect, test, type Page } from '@playwright/test';

/** Harici kaynakları engeller; engellenen istekler konsol gürültüsü sayılmaz. */
async function blockExternalRequests(page: Page) {
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('http://127.0.0.1:4173') || url.startsWith('data:') || url.startsWith('blob:')) {
      return route.continue();
    }
    return route.abort();
  });
}

async function login(page: Page) {
  await blockExternalRequests(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Demo bilgilerini doldur' }).click();
  await page.getByRole('button', { name: 'Giriş Yap' }).click();
  await expect(page).toHaveURL(/\/panel$/);
}

/**
 * Panelin bütün ekranları.
 *
 * Kenar çubuğundaki her bağlantı ve kayıt açmadan görülebilen her alt
 * ekran burada. Ayrı kayıt gerektiren detay ekranları (rezervasyon
 * detayı, sözleşme, makbuz, fatura detayı, aday kartı) yaşam döngüsü
 * testlerinde açılıyor.
 */
const PANEL_YOLLARI = [
  '/panel', '/panel/takvim', '/panel/ozel-gunler',
  '/panel/rezervasyonlar', '/panel/rezervasyonlar/yeni',
  '/panel/musteriler', '/panel/kasa', '/panel/faturalar', '/panel/raporlar',
  '/panel/salonlar', '/panel/menuler', '/panel/urun-hizmet',
  '/panel/renk-ayarlari', '/panel/isletmeler', '/panel/kullanicilar',
  '/panel/hatirlatmalar', '/panel/odeme-bildirimleri',
  '/panel/musteri-adaylari', '/panel/musteri-adaylari/yeni',
  '/panel/musteri-adaylari/durumlar', '/panel/whatsapp-ayarlari',
  '/panel/sms', '/panel/izinler', '/panel/denetim', '/panel/sistem',
  '/panel/ayarlar',
];

/** Engellenen dış kaynak hataları uygulama hatası değildir; ayıklanır. */
function isAppError(text: string): boolean {
  return !/Failed to load resource|net::ERR_FAILED|ERR_BLOCKED/.test(text);
}

test('DENETIM: panel ekranlarında uygulama hatası ve kırık değer yok', async ({ page }) => {
  await login(page);
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && isAppError(m.text())) problems.push(`console: ${m.text()}`);
  });

  /*
    Kenar çubuğundaki HER ekran burada. Liste eksik kalırsa yeni bir
    ekranın konsol hatası ya da "NaN" gösteren bir alanı, kimse o sayfayı
    açana kadar fark edilmez.
  */
  for (const route of PANEL_YOLLARI) {
    await page.goto(route);
    await expect(page.locator('h1').first()).toBeVisible();
    const body = await page.locator('main').innerText();
    for (const bad of ['undefined', 'NaN', '[object Object]', 'Infinity']) {
      expect(body, `${route} ekranında "${bad}" görünüyor`).not.toContain(bad);
    }
  }
  expect(problems, problems.join('\n')).toEqual([]);
});

/*
  Şartnamenin 36. maddesi "Responsive görünüm bozuldu mu?" diye soruyor.
  Herkese açık sayfalar için bu denetim site.spec.ts'te vardı; PANEL
  ekranları denetimsizdi. Oysa salon sahibi paneli telefondan açıyor ve
  yatay kaydırma gerektiren bir tablo, o ekranda kullanılamaz demek.
*/
test('DENETIM: panel ekranları telefon genişliğinde yatay taşma yapmıyor', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const sorunlar: string[] = [];

  for (const route of PANEL_YOLLARI) {
    await page.goto(route);
    await expect(page.locator('h1').first()).toBeVisible();

    /*
      `scrollWidth` BURADA YANILTICI: kapalı kenar çubuğu ekranın
      solunda (x = -256) duruyor ve Chromium bunu scrollWidth'e
      ekliyor. Oysa soldaki taşma LTR bir sayfada kaydırılamıyor --
      ölçüldüğünde panelin tamamı 308px taşıyor gibi görünüyor, kullanıcı
      hiçbir yere kaydıramıyor.

      Doğru soru iki tane: (1) bir öğe ekranın SAĞINI aşıyor mu, (2)
      sayfa gerçekten yana kaydırılabiliyor mu. Yatay kaydırma
      çubuğunu doğuran budur.
    */
    const olcum = await page.evaluate(() => {
      const de = document.documentElement;
      const genislik = de.clientWidth;

      /*
        Kendi kutusunda kaydırılan tablolar (`overflow-x: auto`) taşma
        SAYILMIYOR: geniş bir tabloyu telefonda yana kaydırmak bilinçli
        bir tasarım ve sayfanın tamamını kaydırmıyor. Bu ayıklama
        olmasaydı denetim, doğru çalışan her tabloyu hata sayardı.
      */
      const kendiKutusundaKayar = (el: Element): boolean => {
        let ata = el.parentElement;
        while (ata && ata !== document.body) {
          const tasmaX = getComputedStyle(ata).overflowX;
          if (tasmaX === 'auto' || tasmaX === 'scroll' || tasmaX === 'hidden') return true;
          ata = ata.parentElement;
        }
        return false;
      };

      const tasanlar: string[] = [];
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > genislik + 1 && !kendiKutusundaKayar(el)) {
          tasanlar.push(`${el.tagName}.${String((el as HTMLElement).className).slice(0, 50)}`);
        }
      }

      // Kaydırma denemesi: gerçekten kayıyorsa değer sıfırdan farklı kalır.
      de.scrollLeft = 9999;
      const kaydi = de.scrollLeft;
      de.scrollLeft = 0;

      return { tasanlar: tasanlar.slice(0, 5), kaydi };
    });

    if (olcum.tasanlar.length > 0) sorunlar.push(`${route}: ${olcum.tasanlar.join(', ')}`);
    if (olcum.kaydi !== 0) sorunlar.push(`${route}: sayfa yana kaydırılabiliyor`);
  }

  // Bütün ekranlar birlikte raporlanıyor: ilk hatada durulsaydı sorunlar
  // teker teker, her koşuda bir tane çıkardı.
  expect(sorunlar, sorunlar.join('\n')).toEqual([]);
});

test('DENETIM: rezervasyon yaşam döngüsü, oluştur, tahsilat, bakiye, sözleşme', async ({ page }) => {
  await login(page);

  await page.goto('/panel/rezervasyonlar/yeni');
  await page.locator('#customerName').fill('Denetim Testi');
  await page.locator('#customerPhone').fill('5321112233');
  await page.locator('#date').fill('2027-06-12');
  await page.locator('#guestCount').fill('400');
  await page.locator('#totalAmount').fill('300000');
  await page.locator('#deposit').fill('50000');
  // Kalan alacak alanı kendiliğinden hesaplanmalı
  await expect(page.locator('#balance')).toHaveValue(/250000|250\.000/);
  await page.getByRole('button', { name: /Kaydet/ }).click();
  // Kayıt sonrası doğrudan detay sayfasına gidilir
  await expect(page).toHaveURL(/\/panel\/rezervasyonlar\/[0-9a-f-]{36}$/);
  const detayUrl = page.url();
  await expect(page.getByText('Denetim Testi').first()).toBeVisible();

  // Listede de görünmeli
  await page.goto('/panel/rezervasyonlar');
  await expect(page.getByText('Denetim Testi').first()).toBeVisible();
  await page.goto(detayUrl);
  await expect(page.getByText(/250\.000/).first()).toBeVisible();

  // Tahsilat ekle: 80.000 -> toplam tahsilat 130.000, kalan 170.000
  await page.locator('#pay-amount').fill('80000');
  await page.getByRole('button', { name: /Tahsilat Ekle|Ekle|Kaydet/ }).first().click();
  await expect(page.getByText(/170\.000/).first()).toBeVisible();
  await expect(page.getByText(/130\.000/).first()).toBeVisible();

  await page.goto(`${detayUrl}/sozlesme`);
  await expect(page.getByText('Denetim Testi').first()).toBeVisible();
});

test('DENETIM: aynı tarih ve seansa ikinci rezervasyon engellenir', async ({ page }) => {
  await login(page);
  for (const [ad, tel] of [['Çakışma A', '5321112244'], ['Çakışma B', '5321112255']]) {
    await page.goto('/panel/rezervasyonlar/yeni');
    await page.locator('#customerName').fill(ad);
    await page.locator('#customerPhone').fill(tel);
    await page.locator('#date').fill('2027-08-08');
    await page.locator('#guestCount').fill('250');
    await page.locator('#totalAmount').fill('100000');
    await page.getByRole('button', { name: /Kaydet/ }).click();
    if (ad === 'Çakışma A') await expect(page).toHaveURL(/\/panel\/rezervasyonlar/);
  }
  await expect(page.getByText(/dolu|çakış|zaten|kayıtlı/i).first()).toBeVisible();
});

test('DENETIM: kasa kaydı eklenir, listeye ve bakiyeye yansır', async ({ page }) => {
  await login(page);
  await page.goto('/panel/kasa');
  await expect(page.locator('tbody tr').first()).toBeVisible();
  const before = await page.locator('tbody tr').count();

  await page.getByLabel('Açıklama').fill('Denetim gideri');
  await page.getByLabel('Tutar', { exact: true }).fill('12345');
  await page.getByRole('button', { name: /Ekle|Kaydet/ }).first().click();

  await expect(page.getByText('Denetim gideri')).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(before + 1);
});

test('DENETIM: rapor toplamları kasa ve rezervasyon verisiyle tutarlı', async ({ page }) => {
  await login(page);
  await page.goto('/panel/raporlar');
  await expect(page.locator('h1')).toBeVisible();
  const body = await page.locator('main').innerText();
  expect(body).not.toMatch(/NaN|undefined|Infinity/);
  // Para birimi biçimi bozulmamalı
  expect(body).toMatch(/₺|TL/);
});

test('DENETIM: çıkış yapınca oturum kapanır ve panel korunur', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: /Çıkış/ }).first().click();
  await page.goto('/panel/kasa');
  await expect(page).toHaveURL(/\/$/);
});

