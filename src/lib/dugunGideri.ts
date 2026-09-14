/**
 * Düğün içi gider hesabı.
 *
 * Bir organizasyonun kendi içinde harcananlar: garson, DJ, vale,
 * fotoğrafçı. Bu kalemler gelir/gider defterine genel bir kategoriyle
 * yazıldığında hangi düğünün ne kadara mal olduğu görünmüyordu.
 *
 * Hesap tek yerde: rezervasyon ekranındaki net tutar, Kasa ekranındaki
 * gider satırları ve raporlar aynı fonksiyonlardan besleniyor.
 */
import type { Payment, Reservation, ReservationExpense, ReservationVendor, Vendor } from '../types';

/**
 * Tedarikçi ücretlerini düğün içi gider satırlarına çevirir.
 *
 * NEDEN TÜRETİLİYOR, KOPYALANMIYOR. "Ürün ve Hizmet" bölümünde girilen
 * ücretler (orkestra, çiçek, gelinlik) düğünün maliyetidir ama gider
 * defterine hiç girmiyordu: rezervasyonun net tutarı, kasa ve kâr
 * raporu bu parayı hiç görmüyordu. Salon 60.500 ₺ tedarikçi ödemesi
 * olan bir düğünü kârlı sanabiliyordu.
 *
 * Satırlar kaydedilmiyor, okunduğu anda hesaplanıyor -- tıpkı
 * `giderKasaSatirlari` gibi. Kaydedilseydi bir tedarikçi ücreti
 * düzeltildiğinde ya da tedarikçi silindiğinde gider satırı geride
 * kalır, aynı para iki yerde farklı görünürdü. Tek gerçek kaynak
 * tedarikçi satırının kendisi.
 *
 * ID ÖNEKLİ: bu satırlar elle silinemez ya da düzenlenemez, çünkü
 * defterde karşılıkları yok. Ekran öneki görünce satırı kilitliyor ve
 * kullanıcıyı ücretin girildiği yere yönlendiriyor.
 */
export const TEDARIKCI_GIDER_ONEKI = 'tedarikci_';

export function tedarikciGiderleri(
  resVendors: ReservationVendor[],
  vendors: Vendor[],
  businessId: string,
): ReservationExpense[] {
  const ad = new Map(vendors.map((v) => [v.id, v]));
  return resVendors
    // Ücretsiz satır gidere girmiyor: sıfırlık bir kalem defteri
    // uzatıyor, hiçbir sorunun cevabını değiştirmiyor.
    .filter((rv) => rv.cost > 0)
    .map((rv) => {
      const v = ad.get(rv.vendorId);
      return {
        id: `${TEDARIKCI_GIDER_ONEKI}${rv.id}`,
        businessId,
        reservationId: rv.reservationId,
        // Tedarikçinin adı kalem adı oluyor: "Buz Gösterisi" satırı
        // defterde "Şov / Animasyon" kategorisinden daha anlaşılır.
        kind: v?.name ?? 'Tedarikçi',
        unitCount: 1,
        unitPrice: rv.cost,
        note: rv.note,
        createdAt: '',
        updatedAt: '',
      };
    });
}

/** Satır tedarikçiden mi türedi? Elle düzenlenemeyenler bunlar. */
export function tedarikcidenMi(gider: ReservationExpense): boolean {
  return gider.id.startsWith(TEDARIKCI_GIDER_ONEKI);
}

/** Bir gider satırının toplamı. Alan değil, hesap: birim x birim fiyat. */
export function giderToplami(g: ReservationExpense): number {
  return g.unitCount * g.unitPrice;
}

/** Bir organizasyonun bütün giderlerinin toplamı. */
export function giderlerToplami(giderler: ReservationExpense[]): number {
  return giderler.reduce((s, g) => s + giderToplami(g), 0);
}

export interface NetHesap {
  /** Giderler düşülmeden önceki tutar. */
  taban: number;
  /** Tabanın neye dayandığı; ekranda açıkça yazılıyor. */
  tabanKaynagi: 'kalan' | 'sonOdeme' | 'yok';
  giderler: number;
  /** taban - giderler. Eksi olabilir. */
  net: number;
}

/**
 * Düğünün net tutarı.
 *
 * Taban tercihen KALAN BAKİYEDİR: giderler çoğu zaman düğün günü, kalan
 * tahsilatla birlikte ödenir; salon sahibinin sorduğu soru "elime ne
 * geçecek".
 *
 * Kalan bakiye yoksa (her şey tahsil edilmişse) son tahsilat tabana
 * alınıyor: gider o paradan karşılanmış oluyor. Hiç tahsilat da yoksa
 * taban sıfır ve net, giderlerin eksisi olarak çıkıyor.
 *
 * Net EKSİ OLABİLİR ve gizlenmiyor: giderleri kalan bakiyeyi aşan bir
 * organizasyon zarardadır ve bunu ekranda görmek gerekir.
 */
export function netHesap(
  reservation: Reservation,
  payments: Payment[],
  giderler: ReservationExpense[],
  kalanBakiye: number,
): NetHesap {
  const gider = giderlerToplami(giderler);

  if (kalanBakiye > 0) {
    return { taban: kalanBakiye, tabanKaynagi: 'kalan', giderler: gider, net: kalanBakiye - gider };
  }

  /*
    Kalan yoksa son tahsilata düşülüyor. Kapora da bir tahsilattır;
    ödemeler listesi boşsa o baz alınıyor, yoksa "hiç para alınmamış"
    gibi görünür ve net olduğundan daha kötü çıkardı.
  */
  const sonOdeme = [...payments].sort((a, b) => b.date.localeCompare(a.date))[0];
  const taban = sonOdeme?.amount ?? reservation.deposit ?? 0;
  if (taban > 0) {
    return { taban, tabanKaynagi: 'sonOdeme', giderler: gider, net: taban - gider };
  }

  return { taban: 0, tabanKaynagi: 'yok', giderler: gider, net: -gider };
}

/** Gelir/gider defterinde bu giderlerin görüneceği kategori. */
export const DUGUN_GIDERI_KATEGORISI = 'Düğün İçi Gider';

export interface GiderSatiri {
  id: string;
  reservationId: string;
  date: string;
  category: string;
  amount: number;
  contractNo: string;
  parties: string;
  kind: string;
}

/**
 * Düğün içi giderleri kasa defteri satırlarına çevirir.
 *
 * Satırlar cash_flow tablosuna YAZILMIYOR, türetiliyor -- rezervasyon
 * tahsilatlarında olduğu gibi. Yazılsaydı gider düzeltildiğinde ya da
 * silindiğinde kasa rezervasyondan kopar ve aynı para iki yerde farklı
 * görünürdü. Tek gerçek kaynak gider satırının kendisi.
 *
 * Tarih olarak organizasyonun günü kullanılıyor: gider o gün yapılıyor
 * ve aylık raporda düğünle aynı aya düşmesi gerekiyor.
 */
export function giderKasaSatirlari(
  giderler: ReservationExpense[],
  rezervasyonlar: Reservation[],
  taraflar: (r: Reservation) => string,
): GiderSatiri[] {
  const kayitlar = new Map(
    rezervasyonlar.filter((r) => r.status !== 'İptal').map((r) => [r.id, r]),
  );

  return giderler.flatMap((g) => {
    const r = kayitlar.get(g.reservationId);
    if (!r) return [];
    return [{
      id: `dugun-gider:${g.id}`,
      reservationId: r.id,
      date: r.date,
      category: DUGUN_GIDERI_KATEGORISI,
      amount: giderToplami(g),
      contractNo: r.code,
      parties: taraflar(r),
      kind: g.kind,
    }];
  }).sort((a, b) => b.date.localeCompare(a.date));
}
