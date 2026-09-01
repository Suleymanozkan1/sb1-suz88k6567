import { beforeEach, describe, expect, it } from 'vitest';
import {
  balanceReport, lastMonthsReport, monthReport, programReport, slotReport, summarize, toCsv, withinRange,
} from './reports';
import { uid } from './ids';
import { makeBalanceLookup } from './money';
import { clearAll } from './storage';
import type { Payment } from '../types';
import type { Reservation } from '../types';

function make(over: Partial<Reservation> = {}): Reservation {
  return {
    id: uid('res'),
    businessId: 'biz_test',
    code: 'DT-2026-0001',
    customerName: 'Müşteri',
    customerPhone: '5321112233',
    date: '2026-03-10',
    slot: 'Gece',
    organizationType: 'Düğün',
    guestCount: 200,
    totalAmount: 100000,
    deposit: 25000,
    currency: 'TL',
    status: 'Kesin Rezervasyon',
    colorKey: 'dugun',
    services: [],
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

/** Tahsilatsız senaryolar için sabit çözücü */
const NO_PAYMENTS = makeBalanceLookup([]);
const lookup = (payments: Payment[]) => makeBalanceLookup(payments);

/** Testler artık depoya yazmaz; rezervasyonlar doğrudan kullanılır. */
const keep = (r: Reservation) => r;

beforeEach(() => clearAll());

describe('withinRange', () => {
  it('boş aralıkta her tarihi kabul eder', () => {
    expect(withinRange('2026-05-01', { from: '', to: '' })).toBe(true);
  });

  it('sınır tarihlerini dahil eder', () => {
    expect(withinRange('2026-05-01', { from: '2026-05-01', to: '2026-05-31' })).toBe(true);
    expect(withinRange('2026-05-31', { from: '2026-05-01', to: '2026-05-31' })).toBe(true);
  });

  it('aralık dışını eler', () => {
    expect(withinRange('2026-04-30', { from: '2026-05-01', to: '2026-05-31' })).toBe(false);
    expect(withinRange('2026-06-01', { from: '2026-05-01', to: '2026-05-31' })).toBe(false);
  });
});

describe('summarize', () => {
  it('boş listede sıfır döner', () => {
    expect(summarize([], NO_PAYMENTS)).toEqual({ count: 0, total: 0, collected: 0, remaining: 0, guests: 0 });
  });

  it('tutar, tahsilat, bakiye ve davetliyi toplar', () => {
    const a = keep(make({ totalAmount: 100000, deposit: 25000, guestCount: 200 }));
    const b = keep(make({ totalAmount: 60000, deposit: 60000, guestCount: 150 }));
    const t = summarize([a, b], NO_PAYMENTS);
    expect(t.count).toBe(2);
    expect(t.total).toBe(160000);
    expect(t.collected).toBe(85000);
    expect(t.remaining).toBe(75000);
    expect(t.guests).toBe(350);
  });

  it('ek tahsilatları da hesaba katar', () => {
    const r = keep(make({ totalAmount: 100000, deposit: 20000 }));
    const t = summarize([r], lookup([
      { id: uid('pay'), reservationId: r.id, date: '2026-03-01', amount: 40000, method: 'Nakit', createdAt: '' },
    ]));
    expect(t.collected).toBe(60000);
    expect(t.remaining).toBe(40000);
  });
});

describe('programReport', () => {
  it('organizasyon türüne göre gruplar ve ciroya göre sıralar', () => {
    const rows = programReport([
      keep(make({ organizationType: 'Kına', totalAmount: 20000, deposit: 0 })),
      keep(make({ organizationType: 'Düğün', totalAmount: 150000, deposit: 0 })),
      keep(make({ organizationType: 'Düğün', totalAmount: 50000, deposit: 0 })),
    ], NO_PAYMENTS);
    expect(rows[0].organizationType).toBe('Düğün');
    expect(rows[0].count).toBe(2);
    expect(rows[0].total).toBe(200000);
    expect(rows[1].organizationType).toBe('Kına');
  });
});

describe('monthReport', () => {
  it('aylara göre gruplar ve kronolojik sıralar', () => {
    const rows = monthReport([
      keep(make({ date: '2026-05-04' })),
      keep(make({ date: '2026-03-10' })),
      keep(make({ date: '2026-03-22' })),
    ], NO_PAYMENTS);
    expect(rows.map((r) => r.label)).toEqual(['Mart 2026', 'Mayıs 2026']);
    expect(rows[0].count).toBe(2);
  });

  it('yıl geçişini doğru sıralar', () => {
    const rows = monthReport([
      keep(make({ date: '2027-01-05' })),
      keep(make({ date: '2026-12-20' })),
    ], NO_PAYMENTS);
    expect(rows.map((r) => r.label)).toEqual(['Aralık 2026', 'Ocak 2027']);
  });
});

describe('balanceReport', () => {
  it('yalnızca borcu kalanları en yüksek bakiyeden başlayarak listeler', () => {
    const paid = keep(make({ totalAmount: 50000, deposit: 50000 }));
    const small = keep(make({ totalAmount: 80000, deposit: 70000 }));
    const big = keep(make({ totalAmount: 200000, deposit: 20000 }));
    const rows = balanceReport([paid, small, big], NO_PAYMENTS);
    expect(rows).toHaveLength(2);
    expect(rows[0].reservation.id).toBe(big.id);
    expect(rows[0].remaining).toBe(180000);
  });

  it('iptal edilmiş kayıtları dışlar', () => {
    const cancelled = keep(make({ status: 'İptal', totalAmount: 90000, deposit: 0 }));
    expect(balanceReport([cancelled], NO_PAYMENTS)).toHaveLength(0);
  });
});

describe('slotReport', () => {
  it('gündüz ve gece seanslarını ayırır', () => {
    const rows = slotReport([
      keep(make({ slot: 'Gündüz' })),
      keep(make({ slot: 'Gece' })),
      keep(make({ slot: 'Gece' })),
    ], NO_PAYMENTS);
    expect(rows.find((r) => r.slot === 'Gece')?.count).toBe(2);
    expect(rows.find((r) => r.slot === 'Gündüz')?.count).toBe(1);
  });
});

describe('toCsv', () => {
  it('noktalı virgülle ayırır', () => {
    expect(toCsv(['a', 'b'], [[1, 2]])).toBe('a;b\r\n1;2');
  });

  it('ayraç, tırnak ve satır sonu içeren hücreleri kaçışlar', () => {
    expect(toCsv(['x'], [['a;b']])).toBe('x\r\n"a;b"');
    expect(toCsv(['x'], [['de"mo']])).toBe('x\r\n"de""mo"');
  });
});

describe('lastMonthsReport', () => {
  it('bugünden geriye kesintisiz takvim ayları üretir', () => {
    const rows = lastMonthsReport([], 6, '2026-09-01', NO_PAYMENTS);
    expect(rows.map((r) => r.label)).toEqual([
      'Nisan 2026', 'Mayıs 2026', 'Haziran 2026', 'Temmuz 2026', 'Ağustos 2026', 'Eylül 2026',
    ]);
  });

  it('gelecek tarihli kayıtları seriye dahil etmez', () => {
    const rows = lastMonthsReport(
      [keep(make({ date: '2027-04-10' }))],
      6,
      '2026-09-01',
      NO_PAYMENTS,
    );
    expect(rows.every((r) => r.count === 0)).toBe(true);
    expect(rows.some((r) => r.label.includes('2027'))).toBe(false);
  });

  it('kaydı olmayan ayları atlamaz, sıfır olarak gösterir', () => {
    const rows = lastMonthsReport(
      [keep(make({ date: '2026-07-15' }))],
      3,
      '2026-09-01',
      NO_PAYMENTS,
    );
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => [r.label, r.count])).toEqual([
      ['Temmuz 2026', 1], ['Ağustos 2026', 0], ['Eylül 2026', 0],
    ]);
  });

  it('yıl sınırını geriye doğru doğru geçer', () => {
    const rows = lastMonthsReport([], 3, '2027-01-15', NO_PAYMENTS);
    expect(rows.map((r) => r.label)).toEqual(['Kasım 2026', 'Aralık 2026', 'Ocak 2027']);
  });

  it('ay içindeki tutarları toplar', () => {
    const rows = lastMonthsReport(
      [
        keep(make({ date: '2026-09-05', totalAmount: 100000, deposit: 0 })),
        keep(make({ date: '2026-09-20', totalAmount: 50000, deposit: 0 })),
      ],
      1,
      '2026-09-01',
      NO_PAYMENTS,
    );
    expect(rows[0].count).toBe(2);
    expect(rows[0].total).toBe(150000);
  });
});
