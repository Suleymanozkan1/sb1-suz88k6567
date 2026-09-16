/** Rapor hesaplamaları: program bazlı, ay bazlı, tarih aralığı, alacak bakiyesi */
import { MONTH_NAMES } from '../data/constants';
import { daysBetween, todayIso } from './format';
import type {
  CashFlowEntry, OrganizationType, Payment, PaymentMethod, Reservation,
} from '../types';

/**
 * Tahsilat/bakiye çözücüsü. `makeBalanceLookup` bunu üretir; raporlar
 * ödemeleri kendisi okumaz, hazır çözücü alır.
 */
export interface BalanceLookup {
  paid: (r: Reservation) => number;
  remaining: (r: Reservation) => number;
  /*
    Gelecek ödemeler raporu "en son alınan ödeme"yi de gösteriyor; bunun
    için ham tahsilat satırları gerekiyor. İsteğe bağlı: yalnızca toplam
    isteyen raporlar (ay, seans, kanal) bunu vermek zorunda değil.
  */
  paymentsOf?: (id: string) => Payment[];
}

export interface RangeFilter {
  from: string;
  to: string;
}

export function withinRange(iso: string, range: RangeFilter): boolean {
  if (range.from && iso < range.from) return false;
  if (range.to && iso > range.to) return false;
  return true;
}

export interface Totals {
  count: number;
  total: number;
  collected: number;
  remaining: number;
  guests: number;
}

export function summarize(reservations: Reservation[], balance: BalanceLookup): Totals {
  return reservations.reduce<Totals>(
    (acc, r) => ({
      count: acc.count + 1,
      total: acc.total + r.totalAmount,
      collected: acc.collected + balance.paid(r),
      remaining: acc.remaining + balance.remaining(r),
      guests: acc.guests + r.guestCount,
    }),
    { count: 0, total: 0, collected: 0, remaining: 0, guests: 0 },
  );
}

export interface ProgramRow extends Totals {
  organizationType: OrganizationType;
}

/** Program (organizasyon türü) bazlı rapor */
export function programReport(reservations: Reservation[], balance: BalanceLookup): ProgramRow[] {
  const map = new Map<OrganizationType, Reservation[]>();
  reservations.forEach((r) => {
    const list = map.get(r.organizationType) ?? [];
    list.push(r);
    map.set(r.organizationType, list);
  });
  return [...map.entries()]
    .map(([organizationType, list]) => ({ organizationType, ...summarize(list, balance) }))
    .sort((a, b) => b.total - a.total);
}

export interface MonthRow extends Totals {
  year: number;
  month: number; // 0-11
  label: string;
}

/** Ay bazlı rapor */
export function monthReport(reservations: Reservation[], balance: BalanceLookup): MonthRow[] {
  const map = new Map<string, Reservation[]>();
  reservations.forEach((r) => {
    const key = r.date.slice(0, 7); // yyyy-mm
    const list = map.get(key) ?? [];
    list.push(r);
    map.set(key, list);
  });
  return [...map.entries()]
    .map(([key, list]) => {
      const [year, month] = key.split('-').map(Number);
      return {
        year,
        month: month - 1,
        label: `${MONTH_NAMES[month - 1]} ${year}`,
        ...summarize(list, balance),
      };
    })
    .sort((a, b) => (a.year - b.year) || (a.month - b.month));
}

export interface BalanceRow {
  reservation: Reservation;
  paid: number;
  remaining: number;
  /**
   * En son alınan tahsilat. Hesabın tabanı budur: salon sahibinin sorduğu
   * "bu müşteriden en son ne zaman, ne kadar aldık" sorusunun cevabı.
   * Hiç tahsilat yoksa (kapora da girilmemişse) null.
   */
  lastPayment: SonTahsilat | null;
  /**
   * Organizasyon gününe kalan gün. Eksi ise gün geçmiş ama bakiye
   * kapanmamış demektir; alacak vadesi düğün günüdür.
   */
  daysLeft: number;
  overdue: boolean;
}

/**
 * Gelecek kaporalar ve ödemeler (alacak bakiyesi).
 *
 * Yalnızca borcu kalan kayıtlar. Sıralama TUTARA GÖRE DEĞİL TARİHE GÖRE:
 * bu ekranın sorusu "hangi para ne zaman gelecek". En büyük alacak altı ay
 * sonraki bir düğüne aitken bu haftaki tahsilat listenin dibinde kalıyordu.
 *
 * Günü geçmiş ama bakiyesi kapanmamış kayıtlar en başta duruyor: alacağın
 * vadesi organizasyon günüdür, gün geçtiyse tahsilat gecikmiştir.
 */
export function balanceReport(
  reservations: Reservation[],
  balance: BalanceLookup,
  referenceIso: string = todayIso(),
): BalanceRow[] {
  return reservations
    .filter((r) => r.status !== 'İptal')
    .map((r) => {
      const odemeler = balance.paymentsOf?.(r.id) ?? [];
      const daysLeft = daysBetween(referenceIso, r.date);
      return {
        reservation: r,
        paid: balance.paid(r),
        remaining: balance.remaining(r),
        lastPayment: sonTahsilat(r, odemeler),
        daysLeft,
        overdue: daysLeft < 0,
      };
    })
    .filter((row) => row.remaining > 0)
    .sort((a, b) => {
      // Gecikmişler önce; kendi içlerinde en çok gecikmiş en üstte.
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      const tarih = a.reservation.date.localeCompare(b.reservation.date);
      // Aynı güne düşen iki kayıtta büyük alacak üstte: aynı gün içinde
      // önce hangisinin peşine düşüleceği tutara göre belli olur.
      return tarih !== 0 ? tarih : b.remaining - a.remaining;
    });
}

/**
 * En son alınan tahsilat.
 *
 * Kapora ödemeler listesinde değil rezervasyon satırında durur; hesaba
 * katılmazsa yalnızca kapora almış bir müşteri "hiç tahsilat yok" gibi
 * görünürdü. Tarihi, `reservationIncome` ile aynı kuralla kaydın açıldığı
 * gündür: sözleşme o gün imzalanmıştır.
 */
export interface SonTahsilat {
  date: string;
  amount: number;
  /** Eski kayıtlarda ödeme tipi bilinmiyor olabilir. */
  method?: PaymentMethod;
  source: 'Kapora' | 'Tahsilat';
}

/*
  Aynı güne birden çok tahsilat girilebildiği için tarih eşitliğinde kayıt
  sırası (createdAt) belirleyici: aynı gün girilen iki tahsilattan sonuncusu
  gerçekten en sonuncudur.
*/
function sonTahsilat(r: Reservation, odemeler: Payment[]): SonTahsilat | null {
  const hepsi: { date: string; sira: string; row: SonTahsilat }[] = odemeler.map((p) => ({
    date: p.date,
    sira: p.createdAt,
    row: { date: p.date, amount: p.amount, method: p.method, source: 'Tahsilat' },
  }));

  if (r.deposit > 0) {
    const gun = (r.createdAt || '').slice(0, 10) || r.date;
    hepsi.push({
      date: gun,
      // Kapora her zaman ilk tahsilattır; aynı güne düşen bir ödemeyle
      // eşitlikte ödeme sonra girilmiş sayılır.
      sira: '',
      row: { date: gun, amount: r.deposit, method: r.depositMethod, source: 'Kapora' },
    });
  }

  const sirali = hepsi.sort((a, b) => a.date.localeCompare(b.date) || a.sira.localeCompare(b.sira));
  return sirali[sirali.length - 1]?.row ?? null;
}

/**
 * Verilen tarihten geriye doğru `count` takvim ayı için kesintisiz seri üretir.
 * `monthReport` yalnızca kaydı olan ayları döndürdüğü için grafikte hem boş aylar
 * atlanıyor hem de gelecek tarihli kayıtlar "son aylar" gibi görünüyordu.
 */
export function lastMonthsReport(
  reservations: Reservation[],
  count: number,
  referenceIso: string,
  balance: BalanceLookup,
): MonthRow[] {
  const [refYear, refMonth] = referenceIso.split('-').map(Number);
  const buckets = new Map<string, Reservation[]>();
  reservations.forEach((r) => {
    const key = r.date.slice(0, 7);
    const list = buckets.get(key) ?? [];
    list.push(r);
    buckets.set(key, list);
  });

  const rows: MonthRow[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(refYear, refMonth - 1 - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const key = `${year}-${String(month + 1).padStart(2, '0')}`;
    rows.push({
      year,
      month,
      label: `${MONTH_NAMES[month]} ${year}`,
      ...summarize(buckets.get(key) ?? [], balance),
    });
  }
  return rows;
}

export interface SlotRow extends Totals {
  slot: string;
}

/** Gündüz / Gece seans dağılımı */
export function slotReport(reservations: Reservation[], balance: BalanceLookup): SlotRow[] {
  const map = new Map<string, Reservation[]>();
  reservations.forEach((r) => {
    const list = map.get(r.slot) ?? [];
    list.push(r);
    map.set(r.slot, list);
  });
  return [...map.entries()].map(([slot, list]) => ({ slot, ...summarize(list, balance) }));
}

export interface ChannelRow extends Totals {
  /** Kanal adı; kaydedilmemişse "Belirtilmemiş". */
  channel: string;
  detail: string;
  /** Toplam kayıt içindeki payı, yüzde. */
  share: number;
}

/** Kanalı kaydedilmemiş rezervasyonlar raporda bu başlık altında toplanır. */
export const KANAL_BELIRTILMEMIS = 'Belirtilmemiş';

/**
 * Müşteri bize hangi kanaldan ulaştı raporu.
 *
 * "Yıl sonunda 100 düğünün kaçı Instagram'dan geldi" sorusunun cevabı.
 *
 * Kanalı boş bırakılmış kayıtlar gizlenmiyor, "Belirtilmemiş" olarak
 * sayılıyor: gizlenseler yüzdeler yalnızca doldurulmuş kayıtlar üzerinden
 * hesaplanır ve Instagram gerçekte olduğundan güçlü görünürdü. Belirtilmemiş
 * satırının kendisi de bir bilgidir -- alanın ne kadar doldurulduğunu söyler.
 *
 * Referans ve "Diğer" kanallarında açıklama ayrı bir satır yapmıyor: 40
 * farklı tavsiye edenin adı 40 satırlık bir rapor üretirdi. Açıklamalar tek
 * satırda toplanıp yan sütunda gösteriliyor.
 */
export function channelReport(reservations: Reservation[], balance: BalanceLookup): ChannelRow[] {
  const map = new Map<string, Reservation[]>();
  reservations.forEach((r) => {
    const kanal = r.sourceChannel ?? KANAL_BELIRTILMEMIS;
    const list = map.get(kanal) ?? [];
    list.push(r);
    map.set(kanal, list);
  });

  const toplamAdet = reservations.length;
  return [...map.entries()]
    .map(([channel, list]) => {
      const detaylar = [...new Set(
        list.map((r) => r.sourceDetail?.trim()).filter((d): d is string => Boolean(d)),
      )];
      return {
        channel,
        detail: detaylar.join(', '),
        share: toplamAdet > 0 ? (list.length / toplamAdet) * 100 : 0,
        ...summarize(list, balance),
      };
    })
    // Çok getiren kanal başta. Eşitlikte ciroya bakılıyor; iki kanal aynı
    // sayıda kayıt getirdiyse hangisinin daha değerli olduğu budur.
    .sort((a, b) => b.count - a.count || b.total - a.total);
}

/**
 * Kasa ekranında görünen, rezervasyondan türetilmiş gelir satırı.
 *
 * Bu satırlar kasa tablosuna ayrıca YAZILMAZ, tahsilat kayıtlarından
 * hesaplanır. Yazılsalardı rezervasyon tutarı düzeltildiğinde ya da bir
 * tahsilat silindiğinde kasa ile rezervasyon birbirinden kopardı; iki
 * yerde duran aynı para er geç iki kez sayılır.
 */
export interface ReservationIncomeRow {
  /** Türetilmiş satır kimliği; kasa tablosundaki bir satıra karşılık gelmez. */
  id: string;
  reservationId: string;
  date: string;
  /** Kapora mı sonradan yapılan tahsilat mı */
  category: 'Kapora' | 'Tahsilat';
  amount: number;
  /** Sözleşme numarası (rezervasyon kodu) */
  contractNo: string;
  customerName: string;
  /** İkinci kişi varsa "Ahmet Yılmaz / Elif Kaya" biçiminde tam ad */
  parties: string;
  /** Paranın hangi kanaldan geldiği. Eski kayıtlarda boş olabilir. */
  method?: PaymentMethod;
}

/** Sözleşmedeki taraflar: ikinci kişi varsa iki isim birlikte yazılır. */
export function contractParties(reservation: Reservation): string {
  const ikinci = reservation.secondPersonName?.trim();
  if (!ikinci || ikinci === reservation.customerName.trim()) return reservation.customerName;
  return `${reservation.customerName} / ${ikinci}`;
}

/**
 * Rezervasyonlardan gelen bütün gelirleri kasa satırlarına çevirir.
 *
 * Kapora da bir tahsilattır: rezervasyon üzerinde ayrı bir alanda durduğu
 * için ödemeler listesinde görünmez, ama kasaya girmezse "rezervasyondan
 * gelen gelirlerin hepsi" eksik kalır. Kaporanın tarihi kaydın açıldığı
 * gündür; sözleşme o gün imzalanmış olur.
 *
 * İptal edilmiş rezervasyonlar dışarıda kalır.
 */
export function reservationIncome(
  reservations: Reservation[],
  payments: Payment[],
): ReservationIncomeRow[] {
  const kayitlar = new Map(reservations.filter((r) => r.status !== 'İptal').map((r) => [r.id, r]));
  const satirlar: ReservationIncomeRow[] = [];

  for (const r of kayitlar.values()) {
    if (r.deposit > 0) {
      satirlar.push({
        id: `kapora:${r.id}`,
        reservationId: r.id,
        date: (r.createdAt || '').slice(0, 10) || r.date,
        category: 'Kapora',
        amount: r.deposit,
        contractNo: r.code,
        customerName: r.customerName,
        parties: contractParties(r),
        // Kapora da bir tahsilattır ve kasaya girer; kanalı taşınmazsa
        // kasa dağılımında salonun en büyük nakit girişi görünmez olur.
        method: r.depositMethod,
      });
    }
  }

  for (const p of payments) {
    const r = kayitlar.get(p.reservationId);
    if (!r) continue;
    satirlar.push({
      id: `tahsilat:${p.id}`,
      reservationId: r.id,
      date: p.date,
      category: 'Tahsilat',
      amount: p.amount,
      contractNo: r.code,
      customerName: r.customerName,
      parties: contractParties(r),
      method: p.method,
    });
  }

  return satirlar.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * CSV dışa aktarım (Excel uyumlu, noktalı virgül ayraçlı).
 *
 * FORMÜL ÖNEKLERİ ETKİSİZLEŞTİRİLİYOR. Hücreler kullanıcının girdiği
 * metinden geliyor: ürün adı, müşteri adı, not. Excel `=`, `+`, `-` ya
 * da `@` ile başlayan bir hücreyi FORMÜL sayıp çalıştırır; `=1+1`
 * masum, ama `=HYPERLINK(...)` ya da bir DDE çağrısı dosyayı açan
 * kişinin makinesinde iş yaptırabilir (CWE-1236). Saldırı CSV'yi
 * üreten sistemde değil, onu açan kişide patlıyor -- yani müşterinin
 * muhasebecisinde.
 *
 * Önüne tek tırnak konuyor: Excel tırnağı göstermez, hücreyi metin
 * sayar. Sayılara dokunulmuyor; onların toplanabilmesi gerekiyor.
 */
function formuluEtkisizlestir(deger: string): string {
  return /^[=+\-@\t\r]/.test(deger) ? `'${deger}` : deger;
}

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const escape = (v: string | number) => {
    const ham = String(v ?? '');
    const s = typeof v === 'number' ? ham : formuluEtkisizlestir(ham);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(escape).join(';'), ...rows.map((r) => r.map(escape).join(';'))].join('\r\n');
}

/**
 * CSV dosyasını indirir.
 *
 * ADRES HEMEN İPTAL EDİLMİYOR. `URL.revokeObjectURL` `click()`'ten
 * hemen sonra, aynı çağrı içinde çağrılıyordu. Tarayıcıların çoğu
 * indirmeyi eşzamanlı başlatır ve bu çalışır; ana iş parçacığı meşgulken
 * adresin indirme kaydedilmeden geçersiz kalması bilinen bir tuzak ve
 * sonucu sessiz: ne hata çıkar ne dosya iner.
 *
 * ÖNLEM AMAÇLI: böyle bir kayıp gözlemlenmedi, ölçülen bir hatayı
 * kapatmıyor. İptal bir sonraki olay döngüsüne bırakılıyor; adres yine
 * serbest bırakılıyor, sızıntı olmuyor.
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/* ------------------------------------------------ ciro, gider ve kâr */

/**
 * Bir dönemin (yıl ya da ay) finansal özeti.
 *
 * Şartnamenin 20. ve 23. maddeleri toplam, ciro, gider ve kârı birlikte
 * istiyor. Kâr AYRI BİR ALAN DEĞİL, hesaplanıyor: ciro - gider. Ayrı
 * tutulsaydı üç sayı birbirini tutmadığında hangisinin doğru olduğu
 * bilinemezdi.
 */
export interface KarRow {
  /** "2026" ya da "2026-09". */
  donem: string;
  /** Dönemdeki organizasyon sayısı. */
  count: number;
  /** Sözleşme tutarlarının toplamı. */
  ciro: number;
  /** Tahsil edilen: kapora + tahsilatlar. */
  collected: number;
  /** Serbest gelir/gider satırlarındaki gelirler. */
  otherIncome: number;
  /** Gelir/gider giderleri + düğün içi giderler. */
  expense: number;
  /** ciro + diğer gelir - gider. */
  kar: number;
}

/**
 * Ciro, gider ve kâr raporu.
 *
 * Dönem anahtarı `yillik` ile seçiliyor: yıl bazında "2026", ay
 * bazında "2026-09".
 *
 * TARİH SEÇİMİ ÖNEMLİ. Organizasyon cirosu DÜĞÜN GÜNÜNE yazılıyor,
 * sözleşmenin açıldığı güne değil: bir salonun eylül ayı cirosu, eylülde
 * yapılan düğünlerdir. Düğün içi giderler de aynı güne düşüyor, böylece
 * gelir ve gideri aynı dönemde karşılaşıyor. Serbest gelir/gider
 * satırları kendi tarihlerini kullanıyor.
 *
 * İptal edilen organizasyonlar hiçbir toplama girmiyor: olmamış bir
 * düğünün cirosu da gideri de yoktur.
 */
export function karRaporu(
  reservations: Reservation[],
  balance: BalanceLookup,
  cashFlow: CashFlowEntry[],
  weddingExpenses: { date: string; amount: number }[] = [],
  yillik = true,
): KarRow[] {
  const donem = (iso: string) => (yillik ? iso.slice(0, 4) : iso.slice(0, 7));
  const map = new Map<string, KarRow>();

  const satir = (anahtar: string): KarRow => {
    const mevcut = map.get(anahtar);
    if (mevcut) return mevcut;
    const yeni: KarRow = {
      donem: anahtar, count: 0, ciro: 0, collected: 0,
      otherIncome: 0, expense: 0, kar: 0,
    };
    map.set(anahtar, yeni);
    return yeni;
  };

  for (const r of reservations) {
    if (r.status === 'İptal') continue;
    const s = satir(donem(r.date));
    s.count += 1;
    s.ciro += r.totalAmount;
    s.collected += balance.paid(r);
  }

  for (const e of cashFlow) {
    const s = satir(donem(e.date));
    if (e.kind === 'Gelir') s.otherIncome += e.amount;
    else s.expense += e.amount;
  }

  for (const g of weddingExpenses) {
    satir(donem(g.date)).expense += g.amount;
  }

  return [...map.values()]
    .map((s) => ({ ...s, kar: s.ciro + s.otherIncome - s.expense }))
    .sort((a, b) => b.donem.localeCompare(a.donem));
}

// =====================================================================
// Rakip programın rapor listesindeki eksikler
//
// Var olan raporlar (program, ay, salon, kanal, gelecek kaporalar,
// gündüz/gece, ciro-gider-kâr, dönüşüm, anket) olduğu gibi duruyor;
// aşağıdakiler onların üstüne ekleniyor.
// =====================================================================

/** Bir gruplama satırı: ad + Totals. */
export interface KirilimRow extends Totals {
  anahtar: string;
  etiket: string;
}

/**
 * Serbest anahtara göre kırılım üretir.
 *
 * Altı ayrı rapor (il, ilçe, işletme, tavsiye eden, salon, tür) aynı
 * işi yapıyordu; her biri kendi döngüsünü yazsaydı "iptal edileni say"
 * hatasını altı yerde ayrı ayrı yapma şansı olurdu.
 */
export function kirilim(
  reservations: Reservation[],
  balance: BalanceLookup,
  anahtarla: (r: Reservation) => { anahtar: string; etiket: string } | null,
): KirilimRow[] {
  const map = new Map<string, { etiket: string; list: Reservation[] }>();
  reservations.forEach((r) => {
    const k = anahtarla(r);
    if (!k) return;
    const mevcut = map.get(k.anahtar) ?? { etiket: k.etiket, list: [] };
    mevcut.list.push(r);
    map.set(k.anahtar, mevcut);
  });
  return [...map.entries()]
    .map(([anahtar, v]) => ({ anahtar, etiket: v.etiket, ...summarize(v.list, balance) }))
    .sort((a, b) => b.total - a.total || a.etiket.localeCompare(b.etiket, 'tr'));
}

/** Boş bırakılmış alanların ortak etiketi. */
export const BELIRTILMEMIS = 'Belirtilmemiş';

/** İl bazlı rezervasyon raporu. */
export function ilRaporu(reservations: Reservation[], balance: BalanceLookup): KirilimRow[] {
  return kirilim(reservations, balance, (r) => {
    const il = (r.city ?? '').trim();
    /*
      Boş il UYDURULMUYOR. İşletmenin iliyle doldurmak, gerçekte başka
      ilden gelen müşterileri yanlış ile yazmak olurdu.
    */
    return il
      ? { anahtar: il.toLocaleLowerCase('tr'), etiket: il }
      : { anahtar: '', etiket: BELIRTILMEMIS };
  });
}

/** Öneren / tavsiye eden raporu. */
export function tavsiyeRaporu(reservations: Reservation[], balance: BalanceLookup): KirilimRow[] {
  return kirilim(reservations, balance, (r) => {
    /*
      Yalnızca TAVSİYE ile gelenler. "Instagram" kanalının açıklaması da
      sourceDetail'de duruyor; hepsi katılsaydı rapor "kim tavsiye etti"
      sorusuna değil "açıklama ne yazıyor" sorusuna cevap verirdi.
    */
    if (r.sourceChannel !== 'Tavsiye' && r.sourceChannel !== 'Referans') return null;
    const ad = (r.sourceDetail ?? '').trim();
    return ad
      ? { anahtar: ad.toLocaleLowerCase('tr'), etiket: ad }
      : { anahtar: '', etiket: `${BELIRTILMEMIS} (tavsiye eden yazılmamış)` };
  });
}

/** İşletme (firma) bazlı rapor: birden çok salon işletmesi olanlar için. */
export function isletmeRaporu(
  reservations: Reservation[],
  balance: BalanceLookup,
  isletmeAdi: (id: string) => string,
): KirilimRow[] {
  return kirilim(reservations, balance, (r) => ({
    anahtar: r.businessId,
    etiket: isletmeAdi(r.businessId) || BELIRTILMEMIS,
  }));
}

export interface HaftaRow extends Totals {
  /** Haftanın pazartesi günü, ISO. */
  baslangic: string;
  bitis: string;
  etiket: string;
}

/**
 * Haftalık rapor.
 *
 * Hafta PAZARTESİ başlıyor: salonun iş haftası cumartesi-pazara doğru
 * dolduğu için, pazar günüyle başlayan bir hafta yoğun iki günü ikiye
 * bölerdi.
 */
export function haftalikRapor(reservations: Reservation[], balance: BalanceLookup): HaftaRow[] {
  const map = new Map<string, Reservation[]>();
  reservations.forEach((r) => {
    const g = new Date(`${r.date}T00:00:00`);
    const kaydir = (g.getDay() + 6) % 7; // Pazartesi = 0
    g.setDate(g.getDate() - kaydir);
    const anahtar = g.toISOString().slice(0, 10);
    const list = map.get(anahtar) ?? [];
    list.push(r);
    map.set(anahtar, list);
  });
  return [...map.entries()]
    .map(([baslangic, list]) => {
      const son = new Date(`${baslangic}T00:00:00`);
      son.setDate(son.getDate() + 6);
      const bitis = son.toISOString().slice(0, 10);
      return {
        baslangic,
        bitis,
        etiket: `${baslangic.slice(8, 10)}.${baslangic.slice(5, 7)} - ${bitis.slice(8, 10)}.${bitis.slice(5, 7)}.${bitis.slice(0, 4)}`,
        ...summarize(list, balance),
      };
    })
    .sort((a, b) => b.baslangic.localeCompare(a.baslangic));
}

export interface YilAyHucresi {
  count: number;
  total: number;
  guests: number;
}

export interface YilAyRow {
  yil: number;
  /** 12 ay; olmayan ay sıfır hücre. */
  aylar: YilAyHucresi[];
  toplam: YilAyHucresi;
}

/**
 * Yıllık / aylık rezervasyon matrisi.
 *
 * Ay bazlı rapor ayları alt alta diziyor; bu rapor yılları YAN YANA
 * koyuyor ki "geçen eylül ile bu eylül" karşılaştırılabilsin. Aynı
 * veriden iki farklı soru.
 */
export function yilAyRaporu(reservations: Reservation[]): YilAyRow[] {
  const bos = (): YilAyHucresi => ({ count: 0, total: 0, guests: 0 });
  const map = new Map<number, YilAyRow>();

  reservations.forEach((r) => {
    const yil = Number(r.date.slice(0, 4));
    const ay = Number(r.date.slice(5, 7)) - 1;
    if (!Number.isFinite(yil) || ay < 0 || ay > 11) return;
    let satir = map.get(yil);
    if (!satir) {
      satir = { yil, aylar: Array.from({ length: 12 }, bos), toplam: bos() };
      map.set(yil, satir);
    }
    const h = satir.aylar[ay]!;
    h.count += 1; h.total += r.totalAmount; h.guests += r.guestCount;
    satir.toplam.count += 1;
    satir.toplam.total += r.totalAmount;
    satir.toplam.guests += r.guestCount;
  });

  return [...map.values()].sort((a, b) => b.yil - a.yil);
}

export interface TahsilatAyRow {
  /** yyyy-mm */
  donem: string;
  etiket: string;
  adet: number;
  tutar: number;
  /** Ödeme tipine göre dağılım. */
  tipler: Record<string, number>;
}

/**
 * Aylık tahsilat (gelir) raporu.
 *
 * Ay bazlı rapordan FARKLI: orada ciro düğün gününe yazılır (tahakkuk),
 * burada para KASAYA GİRDİĞİ güne (nakit). Eylülde yapılacak bir düğünün
 * martta alınan kaporası, ay raporunda eylülde, burada martta görünür.
 * "Bu ay elime ne geçti" sorusunun cevabı bu tablodadır.
 */
export function tahsilatAyRaporu(payments: Payment[]): TahsilatAyRow[] {
  const map = new Map<string, TahsilatAyRow>();
  payments.forEach((p) => {
    const donem = p.date.slice(0, 7);
    let satir = map.get(donem);
    if (!satir) {
      const ay = Number(donem.slice(5, 7)) - 1;
      satir = {
        donem,
        etiket: `${MONTH_NAMES[ay] ?? donem} ${donem.slice(0, 4)}`,
        adet: 0, tutar: 0, tipler: {},
      };
      map.set(donem, satir);
    }
    satir.adet += 1;
    satir.tutar += p.amount;
    satir.tipler[p.method] = (satir.tipler[p.method] ?? 0) + p.amount;
  });
  return [...map.values()].sort((a, b) => b.donem.localeCompare(a.donem));
}

export interface IslemAyRow {
  donem: string;
  etiket: string;
  /** Olay türüne göre sayım: eklendi, güncellendi, silindi... */
  olaylar: Record<string, number>;
  toplam: number;
}

/**
 * Aylık rezervasyon işlemleri raporu.
 *
 * "Kaç rezervasyon var" değil, "o ay ne yapıldı": kaç tahsilat girildi,
 * kaçı düzeltildi, kaçı silindi. Bir tutarsızlığın hangi ay doğduğunu
 * bulmanın en kısa yolu.
 */
export function islemAyRaporu(
  olaylar: { event: string; createdAt: string }[],
): IslemAyRow[] {
  const map = new Map<string, IslemAyRow>();
  olaylar.forEach((o) => {
    const donem = (o.createdAt || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(donem)) return;
    let satir = map.get(donem);
    if (!satir) {
      const ay = Number(donem.slice(5, 7)) - 1;
      satir = {
        donem,
        etiket: `${MONTH_NAMES[ay] ?? donem} ${donem.slice(0, 4)}`,
        olaylar: {}, toplam: 0,
      };
      map.set(donem, satir);
    }
    satir.olaylar[o.event] = (satir.olaylar[o.event] ?? 0) + 1;
    satir.toplam += 1;
  });
  return [...map.values()].sort((a, b) => b.donem.localeCompare(a.donem));
}

export interface SurecRow {
  reservation: Reservation;
  /** Sözleşme numarası verilmiş mi. */
  sozlesme: boolean;
  /** Kapora alınmış mı. */
  kapora: boolean;
  /** Tahsilat toplamın yüzde kaçı. */
  yuzde: number;
  kalan: number;
  /** Düğüne kaç gün kaldı; geçmişse negatif. */
  kalanGun: number;
  /** Sıradaki iş; boşsa tamamlanmış. */
  sonraki: string;
}

/**
 * Rezervasyon süreçleri raporu.
 *
 * Her organizasyonun hangi aşamada takıldığını tek tabloda gösterir.
 * "Sıradaki iş" sütunu, sıralamayı da belirliyor: düğünü yaklaşmış ama
 * parası eksik kayıtlar en üstte.
 */
export function surecRaporu(
  reservations: Reservation[],
  balance: BalanceLookup,
  bugun = todayIso(),
): SurecRow[] {
  return reservations
    .filter((r) => r.status !== 'İptal')
    .map((r) => {
      const odenen = balance.paid(r);
      const kalan = balance.remaining(r);
      const kalanGun = daysBetween(bugun, r.date);
      const yuzde = r.totalAmount > 0 ? Math.round((odenen / r.totalAmount) * 100) : 0;
      const sozlesme = Boolean(r.code?.trim());
      const kapora = r.deposit > 0;

      let sonraki = '';
      if (!sozlesme) sonraki = 'Sözleşme numarası yok';
      else if (!kapora) sonraki = 'Kapora alınmadı';
      else if (kalan > 0 && kalanGun <= 7 && kalanGun >= 0) sonraki = 'Düğüne bir hafta kaldı, bakiye açık';
      else if (kalan > 0 && kalanGun < 0) sonraki = 'Düğün geçti, bakiye açık';
      else if (kalan > 0) sonraki = 'Bakiye tahsil edilecek';

      return { reservation: r, sozlesme, kapora, yuzde, kalan, kalanGun, sonraki };
    })
    .sort((a, b) => {
      // Önce iş bekleyenler, sonra düğünü en yakın olan.
      const ai = a.sonraki ? 0 : 1;
      const bi = b.sonraki ? 0 : 1;
      if (ai !== bi) return ai - bi;
      return a.reservation.date.localeCompare(b.reservation.date);
    });
}

export interface EkGiderRow {
  kind: string;
  adet: number;
  /** Kaç organizasyonda geçti. */
  organizasyon: number;
  tutar: number;
}

/**
 * Rezervasyon ek kalemleri raporu.
 *
 * Rakip programdaki "Extralar" raporunun karşılığı. Bizde "Extralar"
 * (hizmet kutucukları) 8. madde ile KALDIRILMIŞTI; yerine düğün içi
 * gider kalemleri geçti. Rapor gerçekte var olan bu kalemleri
 * özetliyor: hangi kalem kaç düğünde, kaç adet, ne tuttu.
 */
export function ekGiderRaporu(
  giderler: { reservationId: string; kind: string; unitCount: number; unitPrice: number }[],
): EkGiderRow[] {
  const map = new Map<string, { ad: string; adet: number; tutar: number; rez: Set<string> }>();
  giderler.forEach((g) => {
    const ad = g.kind.trim() || BELIRTILMEMIS;
    const anahtar = ad.toLocaleLowerCase('tr');
    /*
      Gösterilecek ad İLK yazımdan alınıyor. Her satırda üzerine
      yazılsaydı "Garson" ve "garson" karışımında listede rastgele biri
      kalırdı; ilk girilen, salonun kendi yazımıdır.
    */
    const mevcut = map.get(anahtar) ?? { ad, adet: 0, tutar: 0, rez: new Set<string>() };
    mevcut.adet += g.unitCount;
    mevcut.tutar += g.unitCount * g.unitPrice;
    mevcut.rez.add(g.reservationId);
    map.set(anahtar, mevcut);
  });
  return [...map.values()]
    .map((v) => ({
      kind: v.ad,
      adet: v.adet,
      organizasyon: v.rez.size,
      tutar: v.tutar,
    }))
    .sort((a, b) => b.tutar - a.tutar);
}
