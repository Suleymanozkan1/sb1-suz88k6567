/**
 * Rezervasyon fiyat hesabı (mobil).
 *
 * NEDEN PANELDEN İÇE AKTARILMIYOR. Mobil ayrı bir Expo paketi ve
 * Metro yalnızca `mobil/` klasörünü izliyor; `../../src/lib` altındaki
 * dosyayı paketleyemez. İzleme klasörü eklemek Metro yapılandırmasını
 * değiştirmeyi gerektiriyor ve bu paket zaten Hermes tarafında kırılgan
 * (sürüm uyuşmazlığı bir kez sürüm derlemesini tamamen durdurmuştu).
 *
 * Bu yüzden formül burada TEKRARLANIYOR -- ve tekrarlandığı için
 * ayrışma riski var. Riski testler kapatıyor: `__tests__/fiyat.test.ts`
 * ile paneldeki `rezervasyonFiyat.test.ts` AYNI çalışılmış örneği
 * (300 kişi, 25.000 ek, %10 iskonto, %20 KDV -> 351.000) bekliyor.
 * Biri değişirse öteki düşer.
 *
 * KURUŞ DEĞİL TL. Mobilin geri kalanı tutarları kuruş taşıyor ama bu
 * fonksiyon TL ile çalışıyor, çünkü panelle birebir aynı sayıları
 * vermesi gerekiyor. Çağıran taraf kuruşa çevirmekten sorumlu.
 */

function kurusaYuvarla(deger: number): number {
  if (!Number.isFinite(deger)) return 0;
  return Math.round((deger + Number.EPSILON) * 100) / 100;
}

export interface FiyatGirdisi {
  kisiBasi: number;
  davetli: number;
  ekler: number;
  iskonto: number;
  yuzdeMi: boolean;
  kdvOrani: number;
}

export interface FiyatSonucu {
  kisiBasiToplam: number;
  sozlesmeFiyati: number;
  iskontoTutari: number;
  araToplam: number;
  kdvTutari: number;
  genelToplam: number;
}

export function fiyatHesapla(girdi: FiyatGirdisi): FiyatSonucu {
  const kisiBasiToplam = kurusaYuvarla(
    Math.max(0, girdi.kisiBasi) * Math.max(0, girdi.davetli),
  );
  const sozlesmeFiyati = kurusaYuvarla(kisiBasiToplam + Math.max(0, girdi.ekler));

  // İskonto sözleşme fiyatının üzerinden, ekler dahil: hariç tutulsaydı
  // "yüzde 10 iskonto" sözü eklerin payı arttıkça daha az indirim olurdu.
  const hamIskonto = girdi.yuzdeMi
    ? sozlesmeFiyati * (Math.max(0, girdi.iskonto) / 100)
    : Math.max(0, girdi.iskonto);

  // Fiyatı aşamaz; aşsaydı ara toplam negatife düşer, müşteriye borçlu görünürdük.
  const iskontoTutari = kurusaYuvarla(Math.min(hamIskonto, sozlesmeFiyati));
  const araToplam = kurusaYuvarla(sozlesmeFiyati - iskontoTutari);

  // KDV matrahı iskonto DÜŞÜLDÜKTEN sonra: önce alınsaydı devlete,
  // müşteriden hiç alınmamış para üzerinden KDV ödenirdi.
  const oran = Math.min(100, Math.max(0, girdi.kdvOrani));
  const kdvTutari = kurusaYuvarla(araToplam * (oran / 100));

  return {
    kisiBasiToplam,
    sozlesmeFiyati,
    iskontoTutari,
    araToplam,
    kdvTutari,
    genelToplam: kurusaYuvarla(araToplam + kdvTutari),
  };
}
