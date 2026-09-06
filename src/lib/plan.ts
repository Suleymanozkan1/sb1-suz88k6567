/**
 * Ödeme planı ve iş emri hesapları.
 *
 * Tutarlar `payments` tablosuyla aynı birimdedir (TL). Kuruş/TL karışımı
 * sessiz tutar kaymasına yol açtığı için burada dönüşüm yapılmaz.
 */
import type { EventTask, Installment, Payment, ReservationVendor } from '../types';

export type InstallmentState = 'odendi' | 'gecikti' | 'yaklasiyor' | 'bekliyor';

export interface InstallmentRow extends Installment {
  state: InstallmentState;
  /** Vadeye kalan gün; geçmişse negatif. */
  daysLeft: number;
}

export interface PlanSummary {
  planned: number;
  paid: number;
  /** Plana göre vadesi geçmiş ve henüz karşılanmamış tutar. */
  overdue: number;
  /** Rezervasyon tutarının plana bağlanmamış kısmı. */
  unplanned: number;
  rows: InstallmentRow[];
}

/** İki ISO tarih arasındaki tam gün farkı (a - b). */
export function daysBetween(a: string, b: string): number {
  const MS = 24 * 60 * 60 * 1000;
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / MS);
}

/**
 * Taksitleri tahsilatlarla eşleştirir.
 *
 * Tahsilatlar tek tek taksitlere bağlanmaz; toplam tahsilat, vadesi önce gelen
 * taksitten başlayarak düşülür. Salon işletmeleri parayı böyle takip eder:
 * "ne kadar ödedi" sorusunun cevabı toplamdır, hangi taksite saydığı değil.
 */
export function buildPlan(
  installments: Installment[],
  payments: Payment[],
  totalAmount: number,
  today: string,
  warnDays = 7,
): PlanSummary {
  const ordered = [...installments].sort(
    (a, b) => a.dueDate.localeCompare(b.dueDate) || a.seq - b.seq,
  );
  const paid = payments.reduce((sum, p) => sum + p.amount, 0);
  const planned = ordered.reduce((sum, i) => sum + i.amount, 0);

  let remaining = paid;
  let overdue = 0;

  const rows = ordered.map((inst) => {
    const covered = Math.min(remaining, inst.amount);
    remaining -= covered;
    const isPaid = covered >= inst.amount;
    const daysLeft = daysBetween(inst.dueDate, today);

    let state: InstallmentState;
    if (isPaid) state = 'odendi';
    else if (daysLeft < 0) state = 'gecikti';
    else if (daysLeft <= warnDays) state = 'yaklasiyor';
    else state = 'bekliyor';

    if (state === 'gecikti') overdue += inst.amount - covered;
    return { ...inst, state, daysLeft };
  });

  return {
    planned,
    paid,
    overdue,
    unplanned: Math.max(0, totalAmount - planned),
    rows,
  };
}

/**
 * Kalan tutarı eşit taksitlere böler.
 * Yuvarlama artığı ilk taksite eklenir; taksit toplamı daima kalan tutara eşittir.
 */
export function splitInstallments(
  remaining: number,
  count: number,
  firstDue: string,
  monthGap = 1,
): Omit<Installment, 'id' | 'reservationId'>[] {
  const parts = Math.max(1, Math.floor(count));
  if (remaining <= 0) return [];

  const kurus = Math.round(remaining * 100);
  const base = Math.floor(kurus / parts);
  const extra = kurus - base * parts;

  return Array.from({ length: parts }, (_, i) => {
    const due = new Date(`${firstDue}T00:00:00Z`);
    due.setUTCMonth(due.getUTCMonth() + i * monthGap);
    return {
      seq: i + 1,
      dueDate: due.toISOString().slice(0, 10),
      amount: (base + (i === 0 ? extra : 0)) / 100,
      note: '',
    };
  });
}

/** İş emrini saate göre sıralar; aynı saatte eklenme sırası korunur. */
export function sortTasks(tasks: EventTask[]): EventTask[] {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((a, b) => a.task.atTime.localeCompare(b.task.atTime) || a.index - b.index)
    .map((x) => x.task);
}

/** Tedarikçi maliyetleri toplamı — organizasyonun dış gider yükü. */
export function vendorCostTotal(assignments: ReservationVendor[]): number {
  return assignments.reduce((sum, a) => sum + a.cost, 0);
}
