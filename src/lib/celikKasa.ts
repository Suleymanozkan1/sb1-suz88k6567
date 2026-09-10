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
import type { CashFlowKind, SafeDirection, SafeMovement } from '../types';

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

/** Bu satırın kasada hiç hareketi var mı? */
export function hasMovement(movements: SafeMovement[], sourceId: string): boolean {
  return movements.some((m) => m.sourceId === sourceId);
}

/**
 * Satırın kasadaki doğal yönü.
 *
 * Gelir kasaya girer, gider kasadan çıkar. Bunu kullanıcının seçimine
 * bırakmak, nakit ödenen bir maaşı kasaya para giriyormuş gibi işlemeye
 * izin veriyordu; kasa o tutar kadar fazla görünüyordu.
 */
export function naturalDirection(kind: CashFlowKind): SafeDirection {
  return kind === 'Gider' ? 'Çıkış' : 'Giriş';
}

/**
 * Bu satır kasaya bu yönde işlenebilir mi?
 *
 * Karar satırın geçmişine değil, şu anki netine ve türüne bakar:
 *
 *   * Doğal yön (gelirde giriş, giderde çıkış) ancak net sıfırken yazılır.
 *   * Ters yön — gelirin bankaya yatırılması, giderin geri alınması — ancak
 *     satırın kasada bir etkisi varken yazılır.
 *
 * Böylece kasaya girip bankaya yatırılan para ertesi gün yine kasaya
 * konabilir, ama aynı hareket arka arkaya iki kez yazılamaz: para
 * kasadayken tekrar işlemek çift sayımdır, kasada yokken geri almak
 * kasayı olmadığı bir yere çeker.
 */
export function safeAllows(
  movements: SafeMovement[], sourceId: string, direction: SafeDirection, kind: CashFlowKind,
): boolean {
  const net = sourceNet(movements, sourceId);
  const dogal = naturalDirection(kind);
  if (direction === dogal) return net === 0;
  return dogal === 'Giriş' ? net > 0 : net < 0;
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
