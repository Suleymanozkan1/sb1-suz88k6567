/** Rapor hesaplamaları: program bazlı, ay bazlı, tarih aralığı, alacak bakiyesi */
import { MONTH_NAMES } from '../data/constants';
import type { OrganizationType, Payment, Reservation } from '../types';

/**
 * Tahsilat/bakiye çözücüsü. `makeBalanceLookup` bunu üretir; raporlar
 * ödemeleri kendisi okumaz, hazır çözücü alır.
 */
export interface BalanceLookup {
  paid: (r: Reservation) => number;
  remaining: (r: Reservation) => number;
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
}

/** Alacak bakiyesi raporu: yalnızca borcu kalan kayıtlar */
export function balanceReport(reservations: Reservation[], balance: BalanceLookup): BalanceRow[] {
  return reservations
    .filter((r) => r.status !== 'İptal')
    .map((r) => ({ reservation: r, paid: balance.paid(r), remaining: balance.remaining(r) }))
    .filter((row) => row.remaining > 0)
    .sort((a, b) => b.remaining - a.remaining);
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
  method?: string;
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

/** CSV dışa aktarım (Excel uyumlu, noktalı virgül ayraçlı) */
export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const escape = (v: string | number) => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(escape).join(';'), ...rows.map((r) => r.map(escape).join(';'))].join('\r\n');
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
