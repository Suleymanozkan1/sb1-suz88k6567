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
