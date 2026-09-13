/**
 * Kasa hesabı: paranın ne kadarı, hangi kanalda.
 *
 * Tek gerçek kaynak burası. Kasa bakiyesi Özet sayfasında, Kasa ekranında
 * ve raporlarda AYNI fonksiyondan çıkıyor; aynı hesabın üç ekranda üç kez
 * yazılması, birinin diğerini tutmamasıyla biter ve hangisinin doğru
 * olduğu anlaşılmaz.
 *
 * Para ÜÇ kaynaktan geliyor, üçü de sayılıyor:
 *   1. Elle girilen gelir/gider satırları (cash_flow)
 *   2. Rezervasyon tahsilatları -- kapora dahil (reports.reservationIncome)
 *   3. Düğün içi giderler (dugunGideri.giderKasaSatirlari) -- eksi işaretli
 *
 * Eskiden paranın fiziksel yeri "çelik kasa" adlı AYRI bir defterde elle
 * işaretleniyordu. Bu ikinci bir muhasebeydi: her satır iki kez elleniyor,
 * unutulan her işaret kasayı olduğundan farklı gösteriyordu. Artık yer,
 * paranın zaten taşıdığı ödeme tipinden çıkıyor; elle bakım istemiyor.
 */
import type { CashFlowEntry, PaymentMethod } from '../types';
import { KASA_KANALLARI } from '../types';
import type { ReservationIncomeRow } from './reports';

/** Kasaya para taşıyan tek bir hareket. Kaynağı ne olursa olsun aynı biçim. */
export interface KasaHareketi {
  /** Artı: kasaya girdi. Eksi: kasadan çıktı. */
  tutar: number;
  method?: PaymentMethod;
}

export interface KasaKanali {
  method: PaymentMethod;
  tutar: number;
}

export interface KasaDagilimi {
  /** Kanal başına net tutar. Sıra sabit; ekranda yer değiştiren kalem okunamaz. */
  kanallar: KasaKanali[];
  /**
   * Ödeme tipi girilmemiş kayıtların toplamı.
   *
   * Ayrı gösteriliyor, çünkü bir kanala yazmak uydurma olurdu: ödeme tipi
   * alanı sonradan eklendi ve eski satırların tipi gerçekten bilinmiyor.
   * Sıfırdan farklıysa sahibi geçmişe dönüp doldurabilsin diye görünür.
   */
  belirtilmemis: number;
  /**
   * Çek ve senet toplamı. Kasa toplamına GİRMEZ.
   *
   * İkisi de henüz tahsil edilmemiş bir vaattir; kasadaki parayla
   * toplanırsa kasa olduğundan büyük görünür ve gerçekte olmayan bir
   * paraya göre karar alınır.
   */
  tahsilEdilmemis: number;
  /** Kasadaki para: kanalların toplamı + tipi bilinmeyenler. */
  toplam: number;
}

/** Gelir/gider satırını kasa hareketine çevirir. Gider eksi işaretli. */
export function girdidenHareket(e: CashFlowEntry): KasaHareketi {
  return { tutar: e.kind === 'Gelir' ? e.amount : -e.amount, method: e.method };
}

/**
 * Kasadaki paranın kanallara dağılımı.
 *
 * Girdi olarak hareket listesi alıyor, ham kayıtları değil: böylece
 * "bu ayın kasası" ile "tüm zamanların kasası" aynı hesabı kullanıyor,
 * yalnızca beslendiği liste değişiyor.
 */
export function kasaDagilimi(hareketler: KasaHareketi[]): KasaDagilimi {
  const sayac = new Map<PaymentMethod, number>();
  let belirtilmemis = 0;
  let tahsilEdilmemis = 0;

  for (const h of hareketler) {
    if (!h.method) { belirtilmemis += h.tutar; continue; }
    if (!KASA_KANALLARI.includes(h.method)) { tahsilEdilmemis += h.tutar; continue; }
    sayac.set(h.method, (sayac.get(h.method) ?? 0) + h.tutar);
  }

  const kanallar = KASA_KANALLARI.map((m) => ({ method: m, tutar: sayac.get(m) ?? 0 }));
  const toplam = kanallar.reduce((s, k) => s + k.tutar, 0) + belirtilmemis;
  return { kanallar, belirtilmemis, tahsilEdilmemis, toplam };
}

/** Kasa bakiyesi. Dağılımın toplamıyla aynı; ayrı bir hesap YAZILMIYOR. */
export function kasaBakiyesi(hareketler: KasaHareketi[]): number {
  return kasaDagilimi(hareketler).toplam;
}

/**
 * Gelir/gider ve rezervasyon tahsilatlarını tek listede toplar.
 *
 * `ayOneki` verilirse (YYYY-AA) yalnızca o ay sayılır. Özet sayfası
 * içinde bulunulan ayı gösteriyor; ay süzgeci burada duruyor ki ekran
 * ile rapor aynı tanımı kullansın ve iki yerde farklı ay sınırı olmasın.
 */
export function kasaHareketleri(
  girdiler: CashFlowEntry[],
  rezervasyonGelirleri: ReservationIncomeRow[],
  /**
   * Düğün içi giderler (madde 12).
   *
   * Kasadan ÇIKAN para: garson, DJ, vale ücreti o gün ödeniyor. Kasa
   * hesabına katılmasalardı, gider satırı Gelir/Gider listesinde
   * görünür ama kasa toplamı azalmaz; aynı para iki ekranda farklı
   * görünürdü (madde 34).
   *
   * Ödeme tipi YOK: gider satırında hangi kanaldan ödendiği
   * tutulmuyor. Bir kanala yazmak uydurma olurdu, bu yüzden
   * "Belirtilmemiş" kovasına eksi olarak düşüyorlar.
   */
  dugunGiderleri: { date: string; amount: number }[] = [],
  ayOneki?: string,
): KasaHareketi[] {
  const ayda = (tarih: string) => !ayOneki || tarih.startsWith(ayOneki);
  return [
    ...girdiler.filter((e) => ayda(e.date)).map(girdidenHareket),
    ...rezervasyonGelirleri
      .filter((r) => ayda(r.date))
      .map((r) => ({ tutar: r.amount, method: r.method })),
    ...dugunGiderleri
      .filter((g) => ayda(g.date))
      .map((g) => ({ tutar: -g.amount })),
  ];
}
