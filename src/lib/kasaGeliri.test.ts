import { describe, expect, it } from 'vitest';
import { contractParties, reservationIncome } from './reports';
import type { Payment, Reservation } from '../types';

/**
 * Rezervasyondan türetilen kasa satırları.
 *
 * Bu satırlar kasa tablosuna yazılmaz, hesaplanır. Yazılsalardı tutar
 * düzeltildiğinde ya da bir tahsilat silindiğinde kasa rezervasyondan
 * kopardı ve aynı para iki kez sayılırdı; testler o ayrımı korur.
 */

function rez(over: Partial<Reservation>): Reservation {
  return {
    id: 'r1', businessId: 'b1', hallId: 'h1', code: '20261',
    customerName: 'Zuhal Rana', customerPhone: '5330000001',
    date: '2026-09-12', slot: 'Gece', organizationType: 'Düğün',
    guestCount: 300, totalAmount: 100000, deposit: 30000, currency: 'TL',
    status: 'Kesin Rezervasyon', colorKey: 'dugun', services: [],
    createdAt: '2026-05-18T09:00:00.000Z', updatedAt: '', ...over,
  };
}

function odeme(over: Partial<Payment>): Payment {
  return {
    id: 'p1', reservationId: 'r1', date: '2026-09-12', amount: 70000,
    method: 'Nakit', createdAt: '', ...over,
  };
}

describe('contractParties', () => {
  it('ikinci kişi varsa iki adı birleştirir', () => {
    expect(contractParties(rez({ customerName: 'Zuhal Rana', secondPersonName: 'Mustafa Sezgin' })))
      .toBe('Zuhal Rana / Mustafa Sezgin');
  });

  it('ikinci kişi yoksa tek ad döner', () => {
    expect(contractParties(rez({ secondPersonName: undefined }))).toBe('Zuhal Rana');
    expect(contractParties(rez({ secondPersonName: '   ' }))).toBe('Zuhal Rana');
  });

  it('ikinci kişi birinciyle aynıysa adı iki kez yazmaz', () => {
    expect(contractParties(rez({ customerName: 'Zuhal Rana', secondPersonName: 'Zuhal Rana' })))
      .toBe('Zuhal Rana');
  });
});

describe('reservationIncome', () => {
  it('kaporayı ayrı bir gelir satırı olarak verir', () => {
    const [satir] = reservationIncome([rez({})], []);
    expect(satir.category).toBe('Kapora');
    expect(satir.amount).toBe(30000);
    // Kaporanın tarihi sözleşmenin açıldığı gündür.
    expect(satir.date).toBe('2026-05-18');
  });

  it('kapora sıfırsa satır açmaz', () => {
    expect(reservationIncome([rez({ deposit: 0 })], [])).toEqual([]);
  });

  it('tahsilatları sözleşme numarası ve taraflarla yazar', () => {
    const satirlar = reservationIncome(
      [rez({ code: '202612', secondPersonName: 'Mustafa Sezgin' })],
      [odeme({})],
    );
    const tahsilat = satirlar.find((s) => s.category === 'Tahsilat')!;
    expect(tahsilat.contractNo).toBe('202612');
    expect(tahsilat.parties).toBe('Zuhal Rana / Mustafa Sezgin');
    expect(tahsilat.customerName).toBe('Zuhal Rana');
    expect(tahsilat.method).toBe('Nakit');
    expect(tahsilat.amount).toBe(70000);
  });

  it('kapora ve tahsilat birlikte toplam tahsilatı verir', () => {
    const toplam = reservationIncome([rez({})], [odeme({})])
      .reduce((t, s) => t + s.amount, 0);
    expect(toplam).toBe(100000);
  });

  it('iptal edilen rezervasyonun geliri kasaya girmez', () => {
    expect(reservationIncome([rez({ status: 'İptal' })], [odeme({})])).toEqual([]);
  });

  it('rezervasyonu olmayan tahsilatı yok sayar', () => {
    // Silinmiş bir kaydın artığı kasada sahipsiz satır olarak durmamalı.
    expect(reservationIncome([], [odeme({ reservationId: 'yok' })])).toEqual([]);
  });

  it('satırları tarihe göre yeniden eskiye sıralar', () => {
    const satirlar = reservationIncome(
      [rez({})],
      [odeme({ id: 'p1', date: '2026-06-01' }), odeme({ id: 'p2', date: '2026-09-12' })],
    );
    expect(satirlar.map((s) => s.date)).toEqual(['2026-09-12', '2026-06-01', '2026-05-18']);
  });

  it('satır kimlikleri kasa kaydı gibi görünmez', () => {
    // Türetilmiş satır silinemez; kimliği kasa tablosundaki bir satıra
    // karışmamalı.
    const satirlar = reservationIncome([rez({})], [odeme({})]);
    expect(satirlar.map((s) => s.id).sort()).toEqual(['kapora:r1', 'tahsilat:p1']);
    satirlar.forEach((s) => expect(s.reservationId).toBe('r1'));
  });

  it('createdAt boşsa organizasyon tarihine düşer', () => {
    const [satir] = reservationIncome([rez({ createdAt: '' })], []);
    expect(satir.date).toBe('2026-09-12');
  });

  it('birden çok rezervasyonu birlikte toplar', () => {
    const satirlar = reservationIncome(
      [rez({ id: 'a', code: '20261' }), rez({ id: 'b', code: '20262', deposit: 10000 })],
      [odeme({ id: 'p1', reservationId: 'a' }), odeme({ id: 'p2', reservationId: 'b', amount: 5000 })],
    );
    expect(satirlar.length).toBe(4);
    expect(satirlar.reduce((t, s) => t + s.amount, 0)).toBe(30000 + 70000 + 10000 + 5000);
  });
});
