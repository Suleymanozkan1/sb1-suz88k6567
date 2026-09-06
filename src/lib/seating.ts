/**
 * Menü fiyatlandırması ve masa oturma düzeni hesapları.
 *
 * Para birimi her yerde kuruş cinsinden tamsayıdır; ondalıklı aritmetik
 * (`0.1 + 0.2 !== 0.3`) fatura ve tahsilat toplamlarında kuruş kaydırır.
 */
import type { Menu, SeatingTable } from '../types';

/**
 * Menünün bir rezervasyon için tutarı.
 * Kişi başı menüde davetli sayısıyla çarpılır, sabit menüde sayıdan bağımsızdır.
 */
export function menuTotalKurus(menu: Pick<Menu, 'pricing' | 'priceKurus'>, guestCount: number): number {
  if (menu.pricing === 'sabit') return menu.priceKurus;
  // Negatif ya da kesirli davetli sayısı tutarı bozmasın
  const guests = Math.max(0, Math.floor(guestCount));
  return menu.priceKurus * guests;
}

/** Kuruşu arayüzde kullanılan tam TL değerine çevirir (form alanları TL ile çalışır). */
export function kurusToLira(kurus: number): number {
  return Math.round(kurus) / 100;
}

export function liraToKurus(lira: number): number {
  // toFixed ile kayan nokta artığı temizlenir: 4500.005 -> 450001 değil 450000
  return Math.round(Number(lira.toFixed(2)) * 100);
}

export interface SeatingSummary {
  tableCount: number;
  totalSeats: number;
  /** Davetli sayısına göre eksik koltuk; fazlalık varsa 0 döner. */
  missingSeats: number;
  /** Koltuk fazlası; eksik varsa 0 döner. */
  spareSeats: number;
  isEnough: boolean;
}

/** Masa planının davetli sayısını karşılayıp karşılamadığını özetler. */
export function summarizeSeating(tables: SeatingTable[], guestCount: number): SeatingSummary {
  const totalSeats = tables.reduce((sum, t) => sum + t.seats, 0);
  const guests = Math.max(0, Math.floor(guestCount));
  return {
    tableCount: tables.length,
    totalSeats,
    missingSeats: Math.max(0, guests - totalSeats),
    spareSeats: Math.max(0, totalSeats - guests),
    isEnough: totalSeats >= guests,
  };
}

/**
 * Davetli sayısı ve masa başı koltuk sayısından masa planı önerir.
 * Son masa eksik dolabilir; toplam koltuk daima davetli sayısına yeter.
 */
export function suggestTables(guestCount: number, seatsPerTable: number): { tableNo: number; seats: number }[] {
  const guests = Math.max(0, Math.floor(guestCount));
  const perTable = Math.max(1, Math.floor(seatsPerTable));
  if (guests === 0) return [];

  const count = Math.ceil(guests / perTable);
  return Array.from({ length: count }, (_, i) => ({
    tableNo: i + 1,
    seats: i === count - 1 ? guests - perTable * (count - 1) : perTable,
  }));
}

/** Bir sonraki boş masa numarası (aradaki boşlukları doldurmaz, sona ekler). */
export function nextTableNo(tables: SeatingTable[]): number {
  return tables.reduce((max, t) => Math.max(max, t.tableNo), 0) + 1;
}
