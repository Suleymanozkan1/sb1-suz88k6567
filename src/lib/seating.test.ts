import { describe, expect, it } from 'vitest';
import {
  kurusToLira, liraToKurus, menuTotalKurus, nextTableNo, suggestTables, summarizeSeating,
} from './seating';
import type { SeatingTable } from '../types';

const masa = (tableNo: number, seats: number): SeatingTable =>
  ({ id: `t${tableNo}`, reservationId: 'r1', tableNo, seats, label: '' });

describe('menü tutarı', () => {
  it('kişi başı menüyü davetli sayısıyla çarpar', () => {
    expect(menuTotalKurus({ pricing: 'kisi_basi', priceKurus: 45000 }, 300)).toBe(13_500_000);
  });

  it('sabit menüde davetli sayısını dikkate almaz', () => {
    expect(menuTotalKurus({ pricing: 'sabit', priceKurus: 15_000_000 }, 300)).toBe(15_000_000);
    expect(menuTotalKurus({ pricing: 'sabit', priceKurus: 15_000_000 }, 1)).toBe(15_000_000);
  });

  it('negatif ya da kesirli davetli sayısı tutarı bozmaz', () => {
    expect(menuTotalKurus({ pricing: 'kisi_basi', priceKurus: 45000 }, -10)).toBe(0);
    expect(menuTotalKurus({ pricing: 'kisi_basi', priceKurus: 45000 }, 2.7)).toBe(90000);
  });

  it('sıfır davetlide sıfır döner', () => {
    expect(menuTotalKurus({ pricing: 'kisi_basi', priceKurus: 45000 }, 0)).toBe(0);
  });
});

describe('kuruş dönüşümü', () => {
  it('ileri geri dönüşte değer korunur', () => {
    for (const lira of [0, 1, 450, 1999.99, 123456.78]) {
      expect(kurusToLira(liraToKurus(lira))).toBe(lira);
    }
  });

  it('kayan nokta artığı bırakmaz', () => {
    expect(liraToKurus(1999.99)).toBe(199999);
    expect(liraToKurus(0.1 + 0.2)).toBe(30);
  });
});

describe('masa planı özeti', () => {
  it('koltuk yeterliyse eksik göstermez', () => {
    const ozet = summarizeSeating([masa(1, 10), masa(2, 10)], 18);
    expect(ozet).toMatchObject({ tableCount: 2, totalSeats: 20, missingSeats: 0, spareSeats: 2, isEnough: true });
  });

  it('koltuk yetmiyorsa eksiği bildirir', () => {
    const ozet = summarizeSeating([masa(1, 10)], 25);
    expect(ozet).toMatchObject({ totalSeats: 10, missingSeats: 15, spareSeats: 0, isEnough: false });
  });

  it('masa yokken davetli sayısı kadar eksik verir', () => {
    expect(summarizeSeating([], 100).missingSeats).toBe(100);
  });

  it('tam denk gelen planı yeterli sayar', () => {
    expect(summarizeSeating([masa(1, 10), masa(2, 10)], 20).isEnough).toBe(true);
  });
});

describe('masa planı önerisi', () => {
  it('davetliyi masalara böler ve son masayı kalanla doldurur', () => {
    expect(suggestTables(25, 10)).toEqual([
      { tableNo: 1, seats: 10 }, { tableNo: 2, seats: 10 }, { tableNo: 3, seats: 5 },
    ]);
  });

  it('tam bölünen sayıda eşit masa üretir', () => {
    expect(suggestTables(30, 10)).toEqual([
      { tableNo: 1, seats: 10 }, { tableNo: 2, seats: 10 }, { tableNo: 3, seats: 10 },
    ]);
  });

  it('önerilen plan her zaman davetli sayısına yeter', () => {
    for (const [g, p] of [[1, 10], [9, 10], [11, 10], [137, 8], [300, 12]]) {
      const toplam = suggestTables(g, p).reduce((s, t) => s + t.seats, 0);
      expect(toplam).toBe(g);
    }
  });

  it('sıfır davetlide boş plan döner', () => {
    expect(suggestTables(0, 10)).toEqual([]);
  });

  it('masa başı sıfır koltuk verilse bile sonsuz döngüye girmez', () => {
    expect(suggestTables(5, 0)).toHaveLength(5);
  });
});

describe('sıradaki masa numarası', () => {
  it('en büyük numaranın bir fazlasını verir', () => {
    expect(nextTableNo([masa(1, 8), masa(5, 8)])).toBe(6);
  });

  it('boş planda 1 ile başlar', () => {
    expect(nextTableNo([])).toBe(1);
  });
});
