/**
 * Stok hesabı.
 *
 * Salonun sarf malzemesi koliyle alınıp adetle tükeniyor: 10 koli su,
 * kolisi 24 adet. Depoda kaç şişe kaldığını kolileri çarpıp bozulmuş
 * adetleri eklemeden söylemek mümkün değil.
 *
 * TOPLAM SAKLANMIYOR, HESAPLANIYOR. Ayrı bir kolonda dursaydı sayım
 * sonrası koli, adet ve toplam birbirini tutmadığında hangisinin doğru
 * olduğu bilinemezdi.
 */
import type { Vendor } from '../types';

/** Bir ürünün toplam adedi: koli x koli içi + tek adet. */
export function stokToplami(v: Vendor): number {
  return v.boxCount * v.unitsPerBox + v.looseCount;
}

/** Ürünler; hizmetler stok tutmaz. */
export function stokUrunleri(hepsi: Vendor[]): Vendor[] {
  return hepsi.filter((v) => v.kind === 'urun' && v.isActive);
}

export interface StokSatiri {
  id: string;
  name: string;
  toplam: number;
  minCount: number;
  /** Kritik seviyenin altında mı? Eşik girilmemişse her zaman false. */
  kritik: boolean;
  /**
   * Çubuğun dolu oranı (0-100).
   *
   * Ölçek, listedeki EN BÜYÜK stoğa göre. Mutlak sayıya göre çizilseydi
   * 240 şişe suyun yanında 12 paket peçete hiç görünmezdi.
   */
  oran: number;
}

/**
 * Özet sayfasındaki stok çubukları.
 *
 * Sıralama kritik olanlar önce: ekranı açan kişinin görmesi gereken şey
 * neyin bittiği, neyin bol olduğu değil.
 */
export function stokDurumu(hepsi: Vendor[]): StokSatiri[] {
  const urunler = stokUrunleri(hepsi);
  const enBuyuk = urunler.reduce((m, v) => Math.max(m, stokToplami(v)), 0);

  return urunler
    .map((v) => {
      const toplam = stokToplami(v);
      return {
        id: v.id,
        name: v.name,
        toplam,
        minCount: v.minCount,
        kritik: v.minCount > 0 && toplam <= v.minCount,
        oran: enBuyuk > 0 ? Math.round((toplam / enBuyuk) * 100) : 0,
      };
    })
    .sort((a, b) => {
      if (a.kritik !== b.kritik) return a.kritik ? -1 : 1;
      return b.toplam - a.toplam;
    });
}

/** Kritik seviyedeki ürün sayısı; özet kartında uyarı olarak çıkıyor. */
export function kritikStokSayisi(hepsi: Vendor[]): number {
  return stokDurumu(hepsi).filter((s) => s.kritik).length;
}

/**
 * Bir ürünün stok değeri: eldeki toplam adet x birim fiyat.
 *
 * Birim fiyatı girilmemiş ürün 0 sayılıyor, listeden düşürülmüyor.
 * Düşürülseydi toplam sessizce eksik çıkar, "elimizdeki stoğun TL
 * karşılığı" sorusunun cevabı yanlış olurdu -- üstelik hangi ürünün
 * eksik bırakıldığı da görünmezdi. Fiyatsız ürün toplama 0 katar ama
 * listede durur.
 */
export function stokSatirDegeri(v: Vendor): number {
  /*
    KURUŞA YUVARLANIYOR. Kayan nokta çarpımı kuruşu tutturamıyor:
    246 x 19,90 gibi sıradan bir hesap 4895,399999999999 çıkarıyor ve
    bu değer Excel'e ham sayı olarak yazıldığı için hücrede aynen
    görünüyordu. Birim fiyat zaten numeric(12,2); sonuç da iki hane.
  */
  const deger = stokToplami(v) * v.unitPrice;
  return Math.round((deger + Number.EPSILON) * 100) / 100;
}

/**
 * Verilen ürünlerin toplam stok değeri.
 *
 * HİZMET SAYILMAZ. Hizmetin stoğu yoktur; birim fiyatı tek seferlik
 * ücrettir. Toplama katılsaydı "depoda duran mal" ile "ödenecek
 * hizmet" aynı rakamda toplanır, ortaya hiçbir şeyi karşılamayan bir
 * sayı çıkardı.
 *
 * Süzgeçten geçmiş liste bekleniyor: ekranda ne gösteriliyorsa
 * toplamı da onun olmalı. Kullanıcı seçim yaptığında seçtiği
 * kalemlerin toplamını görmeli.
 */
export function stokDegeri(kalemler: Vendor[]): number {
  const toplam = kalemler
    .filter((v) => v.kind === 'urun')
    .reduce((t, v) => t + stokSatirDegeri(v), 0);
  // Satırlar yuvarlansa da toplama sırasında kuruş altı birikebiliyor.
  return Math.round((toplam + Number.EPSILON) * 100) / 100;
}

/**
 * Sayım çıktısının bir satırı.
 *
 * Excel dökümü ile A4 sayım kâğıdı AYNI listeden besleniyor. İki ayrı
 * yerde kurulsaydı biri güncellenip öteki unutulur, kâğıttaki sayımla
 * dosyadaki liste tutmazdı -- sayım yapan kişi bunu ancak depoda fark
 * ederdi.
 *
 * Biçimlendirme burada YAPILMIYOR: Excel'e ham sayı gitmeli ki hücre
 * toplanabilsin, kâğıda ise binlik ayraçlı metin gitmeli ki okunabilsin.
 * Ortak olan hangi satırların hangi değerlerle çıktığı.
 */
export interface SayimSatiri {
  id: string;
  ad: string;
  kategori: string;
  koli: number;
  koliIci: number;
  tekAdet: number;
  toplamAdet: number;
  birimFiyat: number;
  /** Satırın stok değeri: toplam adet x birim fiyat. */
  tutar: number;
}

/** Sayım çıktısı satırları. Sıra ekrandaki sırayı korur. */
export function sayimSatirlari(urunler: Vendor[]): SayimSatiri[] {
  return urunler.map((v) => ({
    id: v.id,
    ad: v.name,
    kategori: v.category,
    koli: v.boxCount,
    koliIci: v.unitsPerBox,
    tekAdet: v.looseCount,
    toplamAdet: stokToplami(v),
    birimFiyat: v.unitPrice,
    tutar: stokSatirDegeri(v),
  }));
}

/**
 * Sayım çıktısının sütun başlıkları.
 *
 * Son sütun "Sayım" BOŞ kalıyor: kâğıt depoya götürülüp elle
 * dolduruluyor. Sistemdeki adet zaten "Toplam Adet" sütununda; ikisi
 * yan yana olmasaydı sayan kişi farkı yerinde göremez, karşılaştırmayı
 * sonra ekran başında yapmak zorunda kalırdı.
 */
export const SAYIM_BASLIKLARI = [
  'Ürün', 'Kategori', 'Koli', 'Koli İçi', 'Tek Adet', 'Toplam Adet',
  'Birim Fiyat', 'Tutar', 'Sayım',
] as const;

/** Excel dökümü için ham satırlar; son sütun elle doldurulmak üzere boş. */
export function sayimCsvSatirlari(urunler: Vendor[]): (string | number)[][] {
  return sayimSatirlari(urunler).map((s) => [
    s.ad, s.kategori, s.koli, s.koliIci, s.tekAdet, s.toplamAdet, s.birimFiyat, s.tutar, '',
  ]);
}
