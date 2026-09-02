import { describe, expect, it } from 'vitest';
import {
  addDays, daysBetween, formatDate, formatDateLong, formatMoney, formatNumber,
  formatPhone, fromIso, initials, normalizeTr, slugify, toIso,
} from './format';

describe('formatMoney', () => {
  it('TL tutarını Türkçe biçimde gösterir', () => {
    expect(formatMoney(12500, 'TL')).toBe('12.500,00 ₺');
  });

  it('para birimine göre sembol seçer', () => {
    expect(formatMoney(100, 'EUR')).toBe('100,00 €');
    expect(formatMoney(100, 'USD')).toBe('100,00 $');
    expect(formatMoney(100, 'GBP')).toBe('100,00 £');
  });

  it('geçersiz sayıyı sıfır olarak gösterir', () => {
    expect(formatMoney(Number.NaN)).toBe('0,00 ₺');
  });

  it('bilinmeyen para biriminde TL sembolüne düşer', () => {
    expect(formatMoney(5, 'XXX')).toBe('5,00 ₺');
  });
});

describe('formatNumber', () => {
  it('binlik ayracı kullanır', () => {
    expect(formatNumber(4024)).toBe('4.024');
  });
});

describe('tarih yardımcıları', () => {
  it('ISO tarihi gg.aa.yyyy biçimine çevirir', () => {
    expect(formatDate('2026-08-30')).toBe('30.08.2026');
  });

  it('uzun tarih biçimini Türkçe ay adıyla verir', () => {
    expect(formatDateLong('2026-08-30')).toBe('30 Ağustos 2026');
  });

  it('boş girdide boş döner', () => {
    expect(formatDate('')).toBe('');
    expect(formatDateLong('')).toBe('');
  });

  it('gün ekler ve ay sınırını doğru geçer', () => {
    expect(addDays('2026-01-30', 3)).toBe('2026-02-02');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('geri doğru gün çıkarır', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('iki tarih arasındaki gün farkını hesaplar', () => {
    expect(daysBetween('2026-08-01', '2026-08-31')).toBe(30);
    expect(daysBetween('2026-08-31', '2026-08-01')).toBe(-30);
  });

  it('toIso ve fromIso birbirinin tersidir', () => {
    const iso = '2026-05-17';
    expect(toIso(fromIso(iso))).toBe(iso);
  });
});

describe('formatPhone', () => {
  it('10 haneli numarayı biçimlendirir', () => {
    expect(formatPhone('5321234567')).toBe('0532 123 45 67');
  });

  it('başındaki sıfırı ve ülke kodunu temizler', () => {
    expect(formatPhone('05321234567')).toBe('0532 123 45 67');
    expect(formatPhone('905321234567')).toBe('0532 123 45 67');
  });

  it('geçersiz uzunlukta girdiyi olduğu gibi döner', () => {
    expect(formatPhone('123')).toBe('123');
  });
});

describe('normalizeTr', () => {
  it('Türkçe karakterleri sadeleştirir', () => {
    expect(normalizeTr('Düğün Salonu ÇİÇEK')).toBe('dugun salonu cicek');
  });

  it('arama eşleşmesini büyük/küçük harften bağımsız yapar', () => {
    expect(normalizeTr('İSTANBUL')).toBe('istanbul');
  });
});

describe('slugify', () => {
  it('URL uyumlu slug üretir', () => {
    expect(slugify('Kır Düğünü Mekanları')).toBe('kir-dugunu-mekanlari');
  });
});

describe('initials', () => {
  it('ilk iki kelimenin baş harflerini alır', () => {
    expect(initials('Mehmet Yaraş')).toBe('MY');
  });

  it('tek kelimede tek harf döner', () => {
    expect(initials('Ahmet')).toBe('A');
  });
});
