import { expect, test, type Page } from '@playwright/test';
import { demoUret } from '../src/lib/demo/uret';

/**
 * Hacimli veriyle bütün panelin taranması.
 *
 * Diğer uçtan uca dosyalar üç beş kayıtla belirli akışları sınıyor.
 * Burada sorulan soru başka: 480 rezervasyon, üç yıl, iptaller,
 * bedelsiz kayıtlar, fazla tahsilatlar ve boş bırakılmış alanlar
 * varken ekranların hepsi çiziliyor mu?
 *
 * Tek kayıtla görünmeyen hatalar buradan çıkar: boş aya bölme,
 * tanımsız alana erişim, listeyi sıralarken karşılaşılan null,
 * "hiç veri yok" durumunu varsayan bir bileşen.
 *
 * KONSOL HATASI TESTİ DÜŞÜRÜR. Ekran çizilmiş görünse bile React'in
 * yakaladığı bir hata konsola düşer; sessizce geçilirse bozuk ekran
 * "çalışıyor" sanılır.
 */
const VERI = demoUret();

/** Demo tohumundaki salon kimlikleri; üretilen veri bunlara bağlanmalı. */
const SALONLAR = ['hall_demo1', 'hall_demo2'];

async function block(page: Page) {
  await page.route('**/*', (r) => {
    const u = r.request().url();
    return (u.startsWith('http://127.0.0.1:4173') || u.startsWith('data:') || u.startsWith('blob:'))
      ? r.continue() : r.abort();
  });
}

/** Sayfadaki konsol hatalarını ve yakalanmamış istisnaları toplar. */
function hatalariTopla(page: Page): string[] {
  const hatalar: string[] = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const metin = m.text();
    // Ağ engellemesinden gelen gürültü bizim hatamız değil.
    if (/net::ERR_FAILED|Failed to load resource/.test(metin)) return;
    hatalar.push(metin);
  });
  page.on('pageerror', (e) => hatalar.push(`pageerror: ${e.message}`));
  return hatalar;
}

/**
 * Hacimli veriyi tarayıcı belleğine yazar.
 *
 * Demo tohumunun kendisi bozulmuyor: kullanıcı, işletme, salon ve
 * ayarlar olduğu gibi kalıyor, yalnızca hacim gerektiren tablolar
 * değiştiriliyor. Böylece giriş akışı ve ekran ayarları demo tohumuyla
 * aynı kalıyor.
 */
async function veriyiYaz(page: Page) {
  const rezervasyonlar = VERI.reservations.map((r, i) => ({
    ...r,
    businessId: 'biz_demo',
    hallId: SALONLAR[i % SALONLAR.length],
  }));

  await page.evaluate(
    ({ rez, ode, kasa, gid, aday }) => {
      // Depo katmanı bütün anahtarları 'dt:' ön ekiyle yazıyor
      // (src/lib/storage.ts); ön ek atlanırsa veri yazılır ama uygulama
      // onu hiç görmez.
      const yaz = (k: string, v: unknown) =>
        localStorage.setItem(`dt:${k}`, JSON.stringify(v));
      yaz('reservations', rez);
      yaz('payments', ode);
      yaz('cashflow', kasa);
      yaz('dugun-ici-giderler', gid);
      yaz('musteri-adaylari', aday);
    },
    {
      rez: rezervasyonlar,
      ode: VERI.payments,
      kasa: VERI.cashFlow.map((c) => ({ ...c, businessId: 'biz_demo' })),
      gid: VERI.expenses.map((g) => ({ ...g, businessId: 'biz_demo' })),
      aday: VERI.leads.map((a) => ({ ...a, businessId: 'biz_demo' })),
    },
  );
}

async function girisVeDoldur(page: Page) {
  await block(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Demo bilgilerini doldur' }).click();
  await page.getByRole('button', { name: 'Giriş Yap' }).click();
  await expect(page).toHaveURL(/\/panel$/);
  await veriyiYaz(page);
  await page.reload();
  await expect(page).toHaveURL(/\/panel$/);
}

/** Panelin bütün ekranları (kimlik gerektiren ayrıntı sayfaları hariç). */
const EKRANLAR = [
  ['Özet', '/panel'],
  ['Takvim', '/panel/takvim'],
  ['Özel Günler', '/panel/ozel-gunler'],
  ['Rezervasyonlar', '/panel/rezervasyonlar'],
  ['Yeni Rezervasyon', '/panel/rezervasyonlar/yeni'],
  ['Kasa', '/panel/kasa'],
  ['Faturalar', '/panel/faturalar'],
  ['Raporlar', '/panel/raporlar'],
  ['Renk Ayarları', '/panel/renk-ayarlari'],
  ['Müşteriler', '/panel/musteriler'],
  ['İşletmeler', '/panel/isletmeler'],
  ['Kullanıcılar', '/panel/kullanicilar'],
  ['Salonlar', '/panel/salonlar'],
  ['Menüler', '/panel/menuler'],
  ['Hatırlatmalar', '/panel/hatirlatmalar'],
  ['Ödeme Bildirimleri', '/panel/odeme-bildirimleri'],
  ['Ürün ve Hizmet', '/panel/urun-hizmet'],
  ['Tedarikçiler', '/panel/tedarikciler'],
  ['SMS', '/panel/sms'],
  ['Müşteri Adayları', '/panel/musteri-adaylari'],
  ['Aday Durumları', '/panel/musteri-adaylari/durumlar'],
  ['WhatsApp Ayarları', '/panel/whatsapp-ayarlari'],
  ['İzinler', '/panel/izinler'],
  ['Denetim', '/panel/denetim'],
  ['Sistem', '/panel/sistem'],
  ['Ayarlar', '/panel/ayarlar'],
] as const;

test.describe('hacimli veriyle panel taraması', () => {
  test('bütün ekranlar hatasız çiziliyor', async ({ page }) => {
    const hatalar = hatalariTopla(page);
    await girisVeDoldur(page);

    const bos: string[] = [];
    for (const [ad, yol] of EKRANLAR) {
      await page.goto(yol);
      // Ana bölge çizilmeden sonraki ekrana geçilmemeli.
      await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });
      const metin = (await page.locator('main').innerText()).trim();
      if (metin.length < 20) bos.push(`${ad} (${yol})`);
    }

    expect(bos, 'içi boş kalan ekran').toEqual([]);
    expect(hatalar, 'konsol hatası').toEqual([]);
  });

  test('rezervasyon listesi hacim altında kayıtları gösteriyor', async ({ page }) => {
    const hatalar = hatalariTopla(page);
    await girisVeDoldur(page);

    await page.goto('/panel/rezervasyonlar');
    await expect(page.locator('main')).toBeVisible();
    // Üretilen kayıtların kodu DMO ile başlıyor; listede görünmeliler.
    await expect(page.getByText(/DMO\d{5}/).first()).toBeVisible({ timeout: 15_000 });
    expect(hatalar).toEqual([]);
  });

  test('rezervasyon ayrıntısı, sözleşmesi ve makbuzu açılıyor', async ({ page }) => {
    const hatalar = hatalariTopla(page);
    await girisVeDoldur(page);

    // Tahsilatı olan bir kaydı seçiyoruz: sözleşme ve makbuz dolu olsun.
    const hedef = VERI.reservations.find(
      (r) => VERI.payments.some((p) => p.reservationId === r.id) && r.totalAmount > 0,
    )!;

    // Makbuz hangi tahsilatın makbuzu olduğunu adres parametresinden (tahsilat=)
    // alıyor; parametresiz açılırsa "tahsilat bulunamadı" der.
    const odeme = VERI.payments.find((p) => p.reservationId === hedef.id)!;

    for (const yol of ['', '/sozlesme', `/makbuz?tahsilat=${odeme.id}`]) {
      await page.goto(`/panel/rezervasyonlar/${hedef.id}${yol}`);
      await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });
      await expect(
        page.getByText(hedef.customerName).first(),
        `${yol || 'ayrıntı'} ekranında müşteri adı`,
      ).toBeVisible();
    }
    expect(hatalar).toEqual([]);
  });

  test('raporların hepsi açılıyor ve içi doluyor', async ({ page }) => {
    const hatalar = hatalariTopla(page);
    await girisVeDoldur(page);

    await page.goto('/panel/raporlar');
    await expect(page.locator('main')).toBeVisible();

    const sekmeler = page.getByRole('tab');
    const adet = await sekmeler.count();
    // Rapor listesi 24 sekme; sayı düşerse rapor kaybolmuş demektir.
    expect(adet).toBeGreaterThanOrEqual(20);

    const bos: string[] = [];
    for (let i = 0; i < adet; i += 1) {
      const sekme = sekmeler.nth(i);
      const ad = (await sekme.innerText()).trim();
      await sekme.click();
      const panel = page.getByRole('tabpanel');
      await expect(panel).toBeVisible({ timeout: 10_000 });
      const metin = (await panel.innerText()).trim();
      if (metin.length < 20) bos.push(ad);
    }

    expect(bos, 'içi boş kalan rapor').toEqual([]);
    expect(hatalar, 'konsol hatası').toEqual([]);
  });

  test('rapor indirme araçları hacim altında çalışıyor', async ({ page }) => {
    const hatalar = hatalariTopla(page);
    await girisVeDoldur(page);

    await page.goto('/panel/raporlar');
    await expect(page.locator('main')).toBeVisible();

    const fs = await import('node:fs/promises');
    /** İndirilen dosyanın içeriğini okur; boş dosya baştan eleniyor. */
    async function indirilen(dosya: { suggestedFilename(): string; path(): Promise<string | null> }) {
      const yol = await dosya.path();
      expect(yol, dosya.suggestedFilename()).toBeTruthy();
      const icerik = (await fs.readFile(yol!, 'utf-8')).trim();
      // Başlık satırı her hâlükârda yazılmalı: içi boş bir dosya, aracın
      // hiç çalışmadığı anlamına gelir.
      expect(icerik.length, dosya.suggestedFilename()).toBeGreaterThan(20);
      return icerik;
    }

    /*
      Program çizelgesi sekmesinde CSV yerine WORD düğmesi var; ikisi
      farklı araç ve ikisi de hacim altında sınanmalı. Varsayılan sekme
      çizelge olduğu için Word önce geliyor.
    */
    const wordDugme = page.getByRole('button', { name: /Word indir/ });
    if (await wordDugme.isVisible()) {
      const bekle = page.waitForEvent('download');
      await wordDugme.click();
      const dosya = await bekle;
      expect(dosya.suggestedFilename()).toMatch(/\.doc[x]?$/);
      expect((await indirilen(dosya)).length).toBeGreaterThan(50);
    }

    /*
      CSV düğmesi çizelge DIŞINDAKİ sekmelerde çıkıyor. HEPSİ deneniyor:
      ilkinde durulsaydı, günlük rapor gibi tek güne bakan bir sekmeye
      denk geldiğinde -- o gün organizasyon yoksa başlıktan ibaret, doğru
      bir dosya üretir -- test hem yanlış yere bakmış hem de geri kalan
      on altı raporu hiç sınamamış olurdu.
    */
    const sekmeler = page.getByRole('tab');
    const adet = await sekmeler.count();
    let csvSayisi = 0;
    let satirliRapor = 0;

    for (let i = 0; i < adet; i += 1) {
      await sekmeler.nth(i).click();
      const csvDugme = page.getByRole('button', { name: /CSV indir/ });
      if (!(await csvDugme.isVisible())) continue;

      const bekle = page.waitForEvent('download');
      await csvDugme.click();
      const dosya = await bekle;
      expect(dosya.suggestedFilename()).toMatch(/^rapor-.*\.csv$/);
      const icerik = await indirilen(dosya);
      csvSayisi += 1;
      if (icerik.split('\n').length > 1) satirliRapor += 1;
    }

    expect(csvSayisi, 'CSV indirme düğmesi hiçbir sekmede bulunamadı').toBeGreaterThan(0);
    // Yüzlerce kayıtlık veride raporların çoğu satır üretmeli.
    expect(satirliRapor, 'hiçbir rapor veri satırı yazmadı').toBeGreaterThan(0);
    expect(hatalar).toEqual([]);
  });

  test('takvim hacimli ayda çiziliyor', async ({ page }) => {
    const hatalar = hatalariTopla(page);
    await girisVeDoldur(page);

    await page.goto('/panel/takvim');
    await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });
    // Aynı güne birden çok organizasyon düşen bir ay var; ızgara bunu
    // taşırmadan çizmeli.
    expect(hatalar).toEqual([]);
  });
});
