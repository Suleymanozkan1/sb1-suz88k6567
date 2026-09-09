/**
 * İş emri ve tedarikçi hesapları.
 *
 * Tutarlar `payments` tablosuyla aynı birimdedir (TL). Kuruş/TL karışımı
 * sessiz tutar kaymasına yol açtığı için burada dönüşüm yapılmaz.
 */
import type { EventTask, ReservationVendor } from '../types';

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
