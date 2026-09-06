import { describe, expect, it } from 'vitest';
import { buildPlan, daysBetween, splitInstallments, sortTasks, vendorCostTotal } from './plan';
import type { EventTask, Installment, Payment } from '../types';

const taksit = (seq: number, dueDate: string, amount: number): Installment =>
  ({ id: `i${seq}`, reservationId: 'r1', seq, dueDate, amount, note: '' });

const odeme = (amount: number): Payment =>
  ({ id: `p${amount}`, reservationId: 'r1', date: '2027-01-01', amount, method: 'Nakit', createdAt: '' });

describe('gün farkı', () => {
  it('ileri ve geri tarihleri doğru sayar', () => {
    expect(daysBetween('2027-01-10', '2027-01-01')).toBe(9);
    expect(daysBetween('2027-01-01', '2027-01-10')).toBe(-9);
    expect(daysBetween('2027-01-01', '2027-01-01')).toBe(0);
  });

  it('ay ve yıl sınırını doğru geçer', () => {
    expect(daysBetween('2027-03-01', '2027-02-28')).toBe(1);
    expect(daysBetween('2028-01-01', '2027-12-31')).toBe(1);
  });

  it('yaz saati geçişinde kaymaz', () => {
    // Türkiye'de yaz saati uygulaması kalktı, ancak UTC kullanımı bunu garantiler
    expect(daysBetween('2027-03-29', '2027-03-28')).toBe(1);
    expect(daysBetween('2027-10-26', '2027-10-25')).toBe(1);
  });
});

describe('ödeme planı', () => {
  const plan = [taksit(1, '2027-01-15', 30000), taksit(2, '2027-03-15', 30000), taksit(3, '2027-06-01', 40000)];

  it('tahsilatı vadesi önce gelen taksitten düşer', () => {
    const s = buildPlan(plan, [odeme(35000)], 100000, '2027-02-01');
    expect(s.rows[0].state).toBe('odendi');
    expect(s.rows[1].state).not.toBe('odendi');
  });

  it('vadesi geçmiş ve karşılanmamış tutarı gecikmiş sayar', () => {
    const s = buildPlan(plan, [], 100000, '2027-04-01');
    expect(s.rows[0].state).toBe('gecikti');
    expect(s.rows[1].state).toBe('gecikti');
    expect(s.overdue).toBe(60000);
  });

  it('ödenmiş taksit vadesi geçse bile gecikmiş sayılmaz', () => {
    const s = buildPlan(plan, [odeme(60000)], 100000, '2027-04-01');
    expect(s.overdue).toBe(0);
    expect(s.rows.filter((r) => r.state === 'odendi')).toHaveLength(2);
  });

  it('kısmen karşılanan taksitin kalanını gecikmiş sayar', () => {
    const s = buildPlan(plan, [odeme(10000)], 100000, '2027-02-01');
    expect(s.overdue).toBe(20000);
  });

  it('vadesi yaklaşan taksiti ayırt eder', () => {
    const s = buildPlan(plan, [], 100000, '2027-01-10');
    expect(s.rows[0].state).toBe('yaklasiyor');
    expect(s.rows[1].state).toBe('bekliyor');
  });

  it('plana bağlanmamış tutarı bildirir', () => {
    expect(buildPlan([taksit(1, '2027-01-15', 30000)], [], 100000, '2027-01-01').unplanned).toBe(70000);
    expect(buildPlan(plan, [], 100000, '2027-01-01').unplanned).toBe(0);
  });

  it('taksitleri vade sırasına dizer', () => {
    const karisik = [taksit(3, '2027-06-01', 40000), taksit(1, '2027-01-15', 30000), taksit(2, '2027-03-15', 30000)];
    expect(buildPlan(karisik, [], 100000, '2027-01-01').rows.map((r) => r.seq)).toEqual([1, 2, 3]);
  });

  it('girdi dizisini bozmaz', () => {
    const karisik = [taksit(3, '2027-06-01', 40000), taksit(1, '2027-01-15', 30000)];
    buildPlan(karisik, [], 100000, '2027-01-01');
    expect(karisik[0].seq).toBe(3);
  });

  it('plan yokken toplamları sıfır döndürür', () => {
    const s = buildPlan([], [], 100000, '2027-01-01');
    expect(s).toMatchObject({ planned: 0, overdue: 0, unplanned: 100000 });
    expect(s.rows).toEqual([]);
  });
});

describe('taksit bölme', () => {
  it('kalan tutarı eşit böler', () => {
    const t = splitInstallments(90000, 3, '2027-01-15');
    expect(t.map((x) => x.amount)).toEqual([30000, 30000, 30000]);
  });

  it('yuvarlama artığı ilk taksite eklenir ve toplam korunur', () => {
    const t = splitInstallments(100, 3, '2027-01-15');
    expect(t.map((x) => x.amount)).toEqual([33.34, 33.33, 33.33]);
    expect(t.reduce((s, x) => s + x.amount, 0)).toBeCloseTo(100, 2);
  });

  it('her bölmede toplam daima kalan tutara eşittir', () => {
    for (const [tutar, adet] of [[1, 3], [10, 7], [99999.99, 6], [12345.67, 5]]) {
      const toplam = splitInstallments(tutar, adet, '2027-01-15')
        .reduce((s, x) => s + x.amount, 0);
      expect(toplam).toBeCloseTo(tutar, 2);
    }
  });

  it('vadeleri aylık ilerletir', () => {
    expect(splitInstallments(300, 3, '2027-01-31').map((x) => x.dueDate))
      .toEqual(['2027-01-31', '2027-03-03', '2027-03-31']);
  });

  it('sıfır ya da negatif kalanda boş plan döner', () => {
    expect(splitInstallments(0, 3, '2027-01-15')).toEqual([]);
    expect(splitInstallments(-500, 3, '2027-01-15')).toEqual([]);
  });

  it('taksit sayısı sıfır verilse bile tek taksit üretir', () => {
    expect(splitInstallments(1000, 0, '2027-01-15')).toHaveLength(1);
  });
});

describe('iş emri sıralaması', () => {
  const gorev = (id: string, atTime: string): EventTask =>
    ({ id, reservationId: 'r1', atTime, title: id, responsible: '', done: false });

  it('saate göre sıralar', () => {
    expect(sortTasks([gorev('c', '21:30'), gorev('a', '17:00'), gorev('b', '19:00')]).map((t) => t.id))
      .toEqual(['a', 'b', 'c']);
  });

  it('aynı saatte ekleme sırasını korur', () => {
    expect(sortTasks([gorev('x', '18:00'), gorev('y', '18:00')]).map((t) => t.id)).toEqual(['x', 'y']);
  });
});

describe('tedarikçi maliyeti', () => {
  it('atamaların maliyetini toplar', () => {
    expect(vendorCostTotal([
      { id: '1', reservationId: 'r1', vendorId: 'v1', cost: 15000, note: '' },
      { id: '2', reservationId: 'r1', vendorId: 'v2', cost: 8500, note: '' },
    ])).toBe(23500);
  });

  it('atama yokken sıfır döner', () => {
    expect(vendorCostTotal([])).toBe(0);
  });
});
