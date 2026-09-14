/**
 * Menü fiyatlandırması.
 *
 * Para birimi her yerde kuruş cinsinden tamsayıdır; ondalıklı aritmetik
 * (`0.1 + 0.2 !== 0.3`) fatura ve tahsilat toplamlarında kuruş kaydırır.
 *
 * Dosya eskiden `seating.ts` adını taşıyordu ve masa düzeni hesaplarını
 * da içeriyordu. Masa düzeni kaldırılınca geriye yalnızca fiyat
 * yardımcıları kaldı; ad da ona göre düzeltildi -- "seating" diye bir
 * dosyada menü fiyatı aramak kimsenin aklına gelmezdi.
 */
import type { Menu } from '../types';

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
