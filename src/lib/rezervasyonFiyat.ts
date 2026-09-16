/**
 * Rezervasyon fiyat hesabı.
 *
 * Ekranda altı sayı var ama yalnızca DÖRDÜ giriliyor:
 *
 *   girilen    kişi başı fiyat, davetli sayısı, iskonto, KDV oranı
 *   hesaplanan kişibaşı toplam, iskonto tutarı, ara toplam, KDV, genel toplam
 *
 * Hesaplananlar saklanmıyor. Saklansaydı fiyat sonradan düzeltildiğinde
 * birbirini tutmayan iki sayı kalırdı ve hangisinin doğru olduğu
 * bilinemezdi -- üstelik yanlış olan, faturaya giden olurdu.
 *
 * KURUŞ. Bütün ara sonuçlar iki haneye yuvarlanıyor. Yuvarlanmasaydı
 * kayan nokta artığı (3 x 19,90 = 59,699999999999996) hem ekranda hem
 * de dışa aktarımda görünürdü.
 */

/** İki haneye (kuruşa) yuvarlar. */
function kurus(deger: number): number {
  if (!Number.isFinite(deger)) return 0;
  return Math.round((deger + Number.EPSILON) * 100) / 100;
}

export interface FiyatGirdisi {
  /** Kişi başı fiyat. */
  kisiBasi: number;
  davetli: number;
  /** Paket dışı kalemler (Extralar). */
  ekler: number;
  /** İskonto: tutar ya da yüzde -- `yuzdeMi` belirler. */
  iskonto: number;
  yuzdeMi: boolean;
  /** KDV oranı, yüzde. */
  kdvOrani: number;
}

export interface FiyatSonucu {
  /** Kişi başı x davetli. */
  kisiBasiToplam: number;
  /** Kişibaşı toplam + ekler. İskonto bunun üzerinden hesaplanır. */
  sozlesmeFiyati: number;
  /** İskontonun TL karşılığı (yüzde girildiyse çevrilmiş hâli). */
  iskontoTutari: number;
  /** İskonto düşülmüş tutar; KDV matrahı. */
  araToplam: number;
  kdvTutari: number;
  /** Ara toplam + KDV. Müşterinin ödeyeceği. */
  genelToplam: number;
}

export function fiyatHesapla(girdi: FiyatGirdisi): FiyatSonucu {
  const kisiBasiToplam = kurus(Math.max(0, girdi.kisiBasi) * Math.max(0, girdi.davetli));
  const sozlesmeFiyati = kurus(kisiBasiToplam + Math.max(0, girdi.ekler));

  /*
    İSKONTO SÖZLEŞME FİYATININ ÜZERİNDEN, EKLER DAHİL.

    Ekler hariç tutulsaydı "yüzde 10 iskonto" sözü, eklerin payı
    arttıkça giderek daha az indirim anlamına gelirdi; müşteriyle
    konuşulan oran ile faturadaki oran tutmazdı.
  */
  const hamIskonto = girdi.yuzdeMi
    ? sozlesmeFiyati * (Math.max(0, girdi.iskonto) / 100)
    : Math.max(0, girdi.iskonto);

  /*
    İskonto sözleşme fiyatını AŞAMAZ. Aşsaydı ara toplam negatife
    düşer, KDV eksi çıkar ve müşteriye para borçlu görünürdük.
  */
  const iskontoTutari = kurus(Math.min(hamIskonto, sozlesmeFiyati));
  const araToplam = kurus(sozlesmeFiyati - iskontoTutari);

  const oran = Math.min(100, Math.max(0, girdi.kdvOrani));
  const kdvTutari = kurus(araToplam * (oran / 100));

  return {
    kisiBasiToplam,
    sozlesmeFiyati,
    iskontoTutari,
    araToplam,
    kdvTutari,
    genelToplam: kurus(araToplam + kdvTutari),
  };
}

/**
 * Türkiye'de uygulanan KDV oranları.
 *
 * Salon hizmeti %20; yiyecek-içecek ağırlıklı sözleşmelerde %10
 * uygulanabiliyor. %0 istisna kapsamı için duruyor -- listede
 * olmasaydı kullanıcı istisnalı bir işi kaydedemezdi.
 */
export const KDV_ORANLARI = [0, 1, 10, 20] as const;
