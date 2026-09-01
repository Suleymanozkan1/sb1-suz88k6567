/** Tahsilat ve bakiye hesapları — saf fonksiyonlar, depodan bağımsız */
import type { Payment, Reservation } from '../types';

/** Rezervasyon kimliğine göre gruplanmış tahsilat haritası */
export function groupPayments(payments: Payment[]): Map<string, Payment[]> {
  const map = new Map<string, Payment[]>();
  payments.forEach((p) => {
    const list = map.get(p.reservationId) ?? [];
    list.push(p);
    map.set(p.reservationId, list);
  });
  return map;
}

/** Kaparo + ek tahsilatların toplamı */
export function totalPaid(reservation: Reservation, payments: Payment[] = []): number {
  const extra = payments.reduce((sum, p) => sum + p.amount, 0);
  return reservation.deposit + extra;
}

/** Kalan alacak bakiyesi (negatife düşmez) */
export function remainingBalance(reservation: Reservation, payments: Payment[] = []): number {
  return Math.max(0, reservation.totalAmount - totalPaid(reservation, payments));
}

/** Bir rezervasyon listesi için kimlik -> tahsilat/bakiye çözücü üretir */
export function makeBalanceLookup(payments: Payment[]) {
  const byReservation = groupPayments(payments);
  return {
    paid: (r: Reservation) => totalPaid(r, byReservation.get(r.id) ?? []),
    remaining: (r: Reservation) => remainingBalance(r, byReservation.get(r.id) ?? []),
    paymentsOf: (id: string) => byReservation.get(id) ?? [],
  };
}
