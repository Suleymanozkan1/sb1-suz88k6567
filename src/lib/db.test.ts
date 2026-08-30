import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEMO_CREDENTIALS, colorForReservation, deletePayment, deleteReservation, findReservationByCode,
  findSlotConflict, findUserByEmail, getColorSettings, getPayments, getReservations, getSmsLog,
  logSms, makeReferralCode, makeReservationCode, remainingBalance, saveColorSettings, seedIfEmpty,
  totalPaid, uid, upsertPayment, upsertReservation,
} from './db';
import { clearAll } from './storage';
import { DEFAULT_COLOR_SETTINGS } from '../data/constants';
import type { Reservation } from '../types';

function makeReservation(over: Partial<Reservation> = {}): Reservation {
  const now = new Date().toISOString();
  return {
    id: uid('res'),
    businessId: 'biz_test',
    code: makeReservationCode(),
    customerName: 'Test Müşteri',
    customerPhone: '5321112233',
    date: '2026-09-12',
    slot: 'Gece',
    organizationType: 'Düğün',
    guestCount: 300,
    totalAmount: 100000,
    deposit: 20000,
    currency: 'TL',
    status: 'Kesin Rezervasyon',
    colorKey: 'dugun',
    services: [],
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

beforeEach(() => {
  clearAll();
});

describe('seedIfEmpty', () => {
  it('demo hesabını ve örnek verileri oluşturur', () => {
    seedIfEmpty();
    const demo = findUserByEmail(DEMO_CREDENTIALS.email);
    expect(demo).toBeDefined();
    expect(demo?.password).toBe(DEMO_CREDENTIALS.password);
    expect(getReservations().length).toBeGreaterThan(0);
  });

  it('ikinci çağrıda veriyi çoğaltmaz', () => {
    seedIfEmpty();
    const first = getReservations().length;
    seedIfEmpty();
    expect(getReservations().length).toBe(first);
  });

  it('e-posta aramasını büyük/küçük harften bağımsız yapar', () => {
    seedIfEmpty();
    expect(findUserByEmail(DEMO_CREDENTIALS.email.toUpperCase())).toBeDefined();
  });
});

describe('rezervasyon kayıtları', () => {
  it('kaydeder ve koduyla bulur', () => {
    const r = upsertReservation(makeReservation({ code: 'DT-2026-9999' }));
    expect(findReservationByCode('dt-2026-9999')?.id).toBe(r.id);
  });

  it('bulunamayan kod için undefined döner', () => {
    expect(findReservationByCode('YOK-1')).toBeUndefined();
  });

  it('güncellemede kayıt sayısını artırmaz', () => {
    const r = upsertReservation(makeReservation());
    upsertReservation({ ...r, guestCount: 450 });
    const all = getReservations('biz_test');
    expect(all).toHaveLength(1);
    expect(all[0].guestCount).toBe(450);
  });

  it('silindiğinde bağlı tahsilatları da siler', () => {
    const r = upsertReservation(makeReservation());
    upsertPayment({
      id: uid('pay'), reservationId: r.id, date: '2026-09-01', amount: 5000,
      method: 'Nakit', createdAt: new Date().toISOString(),
    });
    expect(getPayments(r.id)).toHaveLength(1);
    deleteReservation(r.id);
    expect(getReservations()).toHaveLength(0);
    expect(getPayments(r.id)).toHaveLength(0);
  });
});

describe('seans çakışması', () => {
  it('aynı tarih ve seansta ikinci kaydı çakışma olarak bildirir', () => {
    upsertReservation(makeReservation({ date: '2026-10-10', slot: 'Gece' }));
    expect(findSlotConflict('biz_test', '2026-10-10', 'Gece')).toBeDefined();
  });

  it('farklı seansı çakışma saymaz', () => {
    upsertReservation(makeReservation({ date: '2026-10-10', slot: 'Gece' }));
    expect(findSlotConflict('biz_test', '2026-10-10', 'Gündüz')).toBeUndefined();
  });

  it('iptal edilmiş kaydı çakışma saymaz', () => {
    upsertReservation(makeReservation({ date: '2026-10-11', slot: 'Gece', status: 'İptal' }));
    expect(findSlotConflict('biz_test', '2026-10-11', 'Gece')).toBeUndefined();
  });

  it('kendi kaydını çakışma saymaz (düzenleme senaryosu)', () => {
    const r = upsertReservation(makeReservation({ date: '2026-10-12' }));
    expect(findSlotConflict('biz_test', '2026-10-12', 'Gece', r.id)).toBeUndefined();
  });

  it('başka işletmenin kaydını çakışma saymaz', () => {
    upsertReservation(makeReservation({ businessId: 'biz_other', date: '2026-10-13' }));
    expect(findSlotConflict('biz_test', '2026-10-13', 'Gece')).toBeUndefined();
  });
});

describe('ödeme hesapları', () => {
  it('kaparo tek başına toplam tahsilattır', () => {
    const r = upsertReservation(makeReservation({ totalAmount: 100000, deposit: 20000 }));
    expect(totalPaid(r)).toBe(20000);
    expect(remainingBalance(r)).toBe(80000);
  });

  it('ek tahsilatları kaparoya ekler', () => {
    const r = upsertReservation(makeReservation({ totalAmount: 100000, deposit: 20000 }));
    upsertPayment({ id: uid('pay'), reservationId: r.id, date: '2026-09-01', amount: 30000, method: 'Nakit', createdAt: '' });
    expect(totalPaid(r)).toBe(50000);
    expect(remainingBalance(r)).toBe(50000);
  });

  it('fazla tahsilatta kalan bakiye negatife düşmez', () => {
    const r = upsertReservation(makeReservation({ totalAmount: 100000, deposit: 20000 }));
    upsertPayment({ id: uid('pay'), reservationId: r.id, date: '2026-09-01', amount: 95000, method: 'Nakit', createdAt: '' });
    expect(remainingBalance(r)).toBe(0);
  });

  it('tahsilat silindiğinde bakiye geri artar', () => {
    const r = upsertReservation(makeReservation({ totalAmount: 100000, deposit: 20000 }));
    const payId = uid('pay');
    upsertPayment({ id: payId, reservationId: r.id, date: '2026-09-01', amount: 30000, method: 'Nakit', createdAt: '' });
    deletePayment(payId);
    expect(remainingBalance(r)).toBe(80000);
  });
});

describe('renk ayarları', () => {
  it('kaydedilmemişse varsayılanları döner', () => {
    expect(getColorSettings('biz_test')).toEqual(DEFAULT_COLOR_SETTINGS);
  });

  it('işletmeye özel renkleri saklar', () => {
    saveColorSettings('biz_test', [{ key: 'dugun', label: 'Düğün', color: '#ff0000' }]);
    expect(getColorSettings('biz_test')[0].color).toBe('#ff0000');
    expect(getColorSettings('biz_other')).toEqual(DEFAULT_COLOR_SETTINGS);
  });

  it('rezervasyona ait rengi çözer', () => {
    const r = makeReservation({ colorKey: 'kina' });
    expect(colorForReservation(r, DEFAULT_COLOR_SETTINGS)).toBe('#e74c3c');
  });

  it('bilinmeyen anahtarda varsayılan renge düşer', () => {
    const r = makeReservation({ colorKey: 'olmayan' });
    expect(colorForReservation(r, DEFAULT_COLOR_SETTINGS)).toBe('#47b2e4');
  });
});

describe('SMS kayıtları', () => {
  it('gönderilen mesajı kaydeder ve en yeniyi başa alır', () => {
    logSms({ businessId: 'biz_test', to: '5321112233', body: 'ilk', kind: 'Rezervasyon' });
    logSms({ businessId: 'biz_test', to: '5321112233', body: 'ikinci', kind: 'Hatırlatma' });
    const log = getSmsLog('biz_test');
    expect(log).toHaveLength(2);
    expect(log[0].body).toBe('ikinci');
  });

  it('işletmeye göre filtreler', () => {
    logSms({ businessId: 'biz_a', to: '5321112233', body: 'a', kind: 'Rezervasyon' });
    logSms({ businessId: 'biz_b', to: '5321112233', body: 'b', kind: 'Rezervasyon' });
    expect(getSmsLog('biz_a')).toHaveLength(1);
  });
});

describe('kod üreticileri', () => {
  it('rezervasyon kodu DT-YIL-NNNN biçimindedir', () => {
    expect(makeReservationCode()).toMatch(/^DT-\d{4}-\d{4}$/);
  });

  it('tavsiye kodu firma adından türetilir', () => {
    expect(makeReferralCode('Grand Yıldız')).toMatch(/^GRAN\d{3}$/);
  });

  it('kısa firma adını doldurur', () => {
    expect(makeReferralCode('AB')).toMatch(/^AB[X]{2}\d{3}$/);
  });

  it('benzersiz kimlik üretir', () => {
    const ids = new Set(Array.from({ length: 200 }, () => uid('x')));
    expect(ids.size).toBe(200);
  });
});
