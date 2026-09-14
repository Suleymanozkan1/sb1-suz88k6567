/**
 * Tanıtım verisinin ERİŞEMEYECEĞİ tarihler.
 *
 * NEDEN GEREKLİ. Tohum, rezervasyonları bugünün çevresindeki ±550 güne
 * yayıyor (`src/lib/seed.ts`) ve bu pencere takvimle birlikte KAYIYOR.
 * Testlere sabit tarih yazıldığında (`2027-09-18` gibi) kayıt aylarca
 * sorunsuz açılıyor, sonra bir sabah pencere o güne yetişiyor ve test
 * sınamak istediği kural yüzünden değil "bu salonda zaten rezervasyon
 * var" diye düşüyor. 14 Eylül 2026'da üç uçtan uca test ve bir birim
 * testi aynı anda tam olarak böyle düştü.
 *
 * Çözüm tarihi ileri almak DEĞİL -- 2031 de bir gün pencereye girer.
 * Tarih bugünden türetiliyor: pencerenin dışı, pencere nereye kayarsa
 * kaysın dışarıda kalıyor.
 */

/** Tohum penceresinin yarıçapı; `seed.ts` ile aynı olmalı. */
const PENCERE_GUN = 550;

/** Pencerenin bittiği yerle test tarihleri arasındaki emniyet payı. */
const PAY_GUN = 400;

/**
 * Bugünden `kaydir` gün sonrasını `YYYY-AA-GG` olarak verir.
 *
 * Sıfır verildiğinde pencerenin hemen ötesindeki ilk gün dönüyor; farklı
 * testler çakışmasın diye her biri kendi kaymasını veriyor.
 */
export function uzakGun(kaydir = 0): string {
  const g = new Date();
  g.setDate(g.getDate() + PENCERE_GUN + PAY_GUN + kaydir);
  const iki = (n: number) => String(n).padStart(2, '0');
  return `${g.getFullYear()}-${iki(g.getMonth() + 1)}-${iki(g.getDate())}`;
}

/** `uzakGun` çıktısını ekranda göründüğü `GG.AA.YYYY` biçimine çevirir. */
export function gunGoster(iso: string): string {
  const [y, a, g] = iso.split('-');
  return `${g}.${a}.${y}`;
}
