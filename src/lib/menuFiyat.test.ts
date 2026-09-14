import { describe, expect, it } from 'vitest';
import { kurusToLira, liraToKurus, menuTotalKurus } from './menuFiyat';

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
