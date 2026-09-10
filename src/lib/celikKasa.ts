/**
 * Çelik kasa (fiziksel kasa) hesapları.
 *
 * İşletmenin kasasındaki gerçek para, gelir/gider kayıtlarından çıkan
 * muhasebe bakiyesiyle aynı değildir: havaleyle gelen tahsilat kasaya
 * girmez, kasadan alınıp bankaya yatırılan para kasadan çıkar ama gelir
 * kaydı yerinde durur. Bu yüzden çelik kasa ayrı bir hareket defteridir ve
 * iki bakiye hiçbir yerde toplanmaz.
 *
 * Her hareket, hangi gelir/gider satırından doğduğunu taşır; kasadaki
 * tutarın karşılığı defterde her zaman bulunur.
 */
import { uid } from './ids';
import type { SafeDirection, SafeMovement } from '../types';

/** Kasadaki para: girişler eksi çıkışlar. */
export function safeBalance(movements: SafeMovement[]): number {
  return movements.reduce(
    (toplam, m) => toplam + (m.direction === 'Giriş' ? m.amount : -m.amount),
    0,
  );
}

/** Girişler ve çıkışlar ayrı ayrı; kartın altındaki özet satırı için. */
export function safeTotals(movements: SafeMovement[]): { in: number; out: number } {
  return movements.reduce(
    (t, m) => (m.direction === 'Giriş'
      ? { in: t.in + m.amount, out: t.out }
      : { in: t.in, out: t.out + m.amount }),
    { in: 0, out: 0 },
  );
}

/** Bir gelir/gider satırına ait hareketler. */
export function movementsOf(movements: SafeMovement[], sourceId: string): SafeMovement[] {
  return movements.filter((m) => m.sourceId === sourceId);
}

/**
 * Bir satırın kasaya net etkisi.
 *
 * Kasaya girip sonra bankaya yatırılan para için 0 döner: satır kasayı
 * bir süre etkilemiştir ama şu an kasada değildir.
 */
export function sourceNet(movements: SafeMovement[], sourceId: string): number {
  return safeBalance(movementsOf(movements, sourceId));
}

/** Bu satır bu yönde kasaya işlenmiş mi? */
export function hasDirection(
  movements: SafeMovement[], sourceId: string, direction: SafeDirection,
): boolean {
  return movements.some((m) => m.sourceId === sourceId && m.direction === direction);
}

export interface SafeMovementInput {
  businessId: string;
  date: string;
  direction: SafeDirection;
  amount: number;
  description: string;
  sourceKind: SafeMovement['sourceKind'];
  sourceId: string;
}

/**
 * Kayıt nesnesini kurar.
 *
 * Tarih, hareketin doğduğu gelir/gider satırının tarihidir; kasadaki para
 * o gün değişmiştir. Kaydın açıldığı gün ayrıca `createdAt` içinde durur.
 */
export function makeSafeMovement(input: SafeMovementInput): SafeMovement {
  return {
    id: uid('kasa'),
    businessId: input.businessId,
    date: input.date,
    direction: input.direction,
    amount: input.amount,
    description: input.description,
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    createdAt: new Date().toISOString(),
  };
}
