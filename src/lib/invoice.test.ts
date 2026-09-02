import { describe, expect, it } from 'vitest';
import {
  computeInvoice, computeLine, formatInvoiceNumber, fromKurus, invoiceDeadlineStatus,
  isValidInvoiceNumber, isValidTckn, isValidVkn, roundHalfUp, toKurus,
} from './invoice';

describe('kuruş dönüşümü', () => {
  it('TL değerini kuruşa çevirir', () => {
    expect(toKurus(100)).toBe(10000);
    expect(toKurus(12.34)).toBe(1234);
    expect(toKurus(0.01)).toBe(1);
  });

  it('kayan nokta artığını temizler', () => {
    // 1.005 * 100 kayan noktada 100.49999999999999 olur
    expect(toKurus(1.005)).toBe(101);
    expect(toKurus(0.07 * 3)).toBe(21); // 0.21000000000000002
    expect(toKurus(1.1 + 2.2)).toBe(330); // 3.3000000000000003
  });

  it('geçersiz sayıyı sıfır kabul eder', () => {
    expect(toKurus(Number.NaN)).toBe(0);
    expect(toKurus(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("kuruşu TL'ye geri çevirir", () => {
    expect(fromKurus(12345)).toBe(123.45);
  });
});

describe('roundHalfUp', () => {
  it('yarımı yukarı yuvarlar', () => {
    expect(roundHalfUp(0.5)).toBe(1);
    expect(roundHalfUp(1.5)).toBe(2);
    expect(roundHalfUp(2.5)).toBe(3);
  });

  it('negatif sayılarda mutlak değere göre tutarlıdır', () => {
    expect(roundHalfUp(-0.5)).toBe(-1);
    expect(roundHalfUp(-1.5)).toBe(-2);
  });
});

describe('computeLine — satır hesabı', () => {
  it("KDV'siz basit satırı hesaplar", () => {
    const line = computeLine({
      description: 'Salon kiralama', quantity: 1, unit: 'Adet',
      unitPrice: 100000, vatRate: 0,
    });
    expect(line.baseKurus).toBe(10_000_000);
    expect(line.vatKurus).toBe(0);
    expect(line.totalKurus).toBe(10_000_000);
  });

  it("%20 KDV'yi doğru hesaplar", () => {
    const line = computeLine({
      description: 'Salon kiralama', quantity: 1, unit: 'Adet',
      unitPrice: 100000, vatRate: 20,
    });
    expect(fromKurus(line.baseKurus)).toBe(100000);
    expect(fromKurus(line.vatKurus)).toBe(20000);
    expect(fromKurus(line.totalKurus)).toBe(120000);
  });

  it("%10 KDV'yi doğru hesaplar", () => {
    const line = computeLine({
      description: 'Yemek', quantity: 250, unit: 'Kişi',
      unitPrice: 400, vatRate: 10,
    });
    expect(fromKurus(line.baseKurus)).toBe(100000);
    expect(fromKurus(line.vatKurus)).toBe(10000);
  });

  it("iskontoyu matrahtan düşer, KDV'yi iskonto sonrası hesaplar", () => {
    const line = computeLine({
      description: 'Salon', quantity: 1, unit: 'Adet',
      unitPrice: 100000, discountRate: 10, vatRate: 20,
    });
    expect(fromKurus(line.grossKurus)).toBe(100000);
    expect(fromKurus(line.discountKurus)).toBe(10000);
    expect(fromKurus(line.baseKurus)).toBe(90000);
    expect(fromKurus(line.vatKurus)).toBe(18000); // 90.000 x %20
    expect(fromKurus(line.totalKurus)).toBe(108000);
  });

  it('ondalıklı miktarı destekler', () => {
    const line = computeLine({
      description: 'Ek süre', quantity: 2.5, unit: 'Saat',
      unitPrice: 1500, vatRate: 20,
    });
    expect(fromKurus(line.baseKurus)).toBe(3750);
    expect(fromKurus(line.vatKurus)).toBe(750);
  });

  it('kuruş hassasiyetinde yuvarlama yapar', () => {
    // 33,33 x 3 = 99,99 ; KDV %20 = 19,998 -> 20,00
    const line = computeLine({
      description: 'Test', quantity: 3, unit: 'Adet', unitPrice: 33.33, vatRate: 20,
    });
    expect(line.baseKurus).toBe(9999);
    expect(line.vatKurus).toBe(2000);
    expect(line.totalKurus).toBe(11999);
  });

  it('iskonto oranını 0-100 aralığına sıkıştırır', () => {
    const over = computeLine({
      description: 'X', quantity: 1, unit: 'Adet', unitPrice: 100, discountRate: 150, vatRate: 20,
    });
    expect(over.baseKurus).toBe(0);

    const under = computeLine({
      description: 'X', quantity: 1, unit: 'Adet', unitPrice: 100, discountRate: -50, vatRate: 20,
    });
    expect(under.discountKurus).toBe(0);
  });
});

describe('computeInvoice — fatura toplamı', () => {
  it('satır toplamları ile fatura toplamı birebir tutar', () => {
    const invoice = computeInvoice([
      { description: 'Salon kiralama', quantity: 1, unit: 'Adet', unitPrice: 100000, vatRate: 20 },
      { description: 'Yemek', quantity: 250, unit: 'Kişi', unitPrice: 400, vatRate: 10 },
      { description: 'Orkestra', quantity: 1, unit: 'Adet', unitPrice: 25000, vatRate: 20 },
    ]);

    const lineSum = invoice.lines.reduce((a, l) => a + l.totalKurus, 0);
    expect(invoice.totalKurus).toBe(lineSum);
    expect(invoice.baseKurus + invoice.vatKurus).toBe(invoice.totalKurus);

    expect(fromKurus(invoice.baseKurus)).toBe(225000);
    expect(fromKurus(invoice.vatKurus)).toBe(35000); // 20000 + 10000 + 5000
    expect(fromKurus(invoice.totalKurus)).toBe(260000);
  });

  it('KDV dökümünü orana göre gruplar ve sıralar', () => {
    const invoice = computeInvoice([
      { description: 'A', quantity: 1, unit: 'Adet', unitPrice: 1000, vatRate: 20 },
      { description: 'B', quantity: 1, unit: 'Adet', unitPrice: 2000, vatRate: 10 },
      { description: 'C', quantity: 1, unit: 'Adet', unitPrice: 3000, vatRate: 20 },
    ]);

    expect(invoice.vatBreakdown).toHaveLength(2);
    expect(invoice.vatBreakdown[0].rate).toBe(10);
    expect(fromKurus(invoice.vatBreakdown[0].baseKurus)).toBe(2000);
    expect(invoice.vatBreakdown[1].rate).toBe(20);
    expect(fromKurus(invoice.vatBreakdown[1].baseKurus)).toBe(4000);
    expect(fromKurus(invoice.vatBreakdown[1].vatKurus)).toBe(800);
  });

  it("KDV dökümü toplamı fatura KDV'si ile eşittir", () => {
    const invoice = computeInvoice([
      { description: 'A', quantity: 3, unit: 'Adet', unitPrice: 33.33, vatRate: 20 },
      { description: 'B', quantity: 7, unit: 'Adet', unitPrice: 11.11, vatRate: 10 },
      { description: 'C', quantity: 1, unit: 'Adet', unitPrice: 0.05, vatRate: 1 },
    ]);
    const breakdownSum = invoice.vatBreakdown.reduce((a, b) => a + b.vatKurus, 0);
    expect(breakdownSum).toBe(invoice.vatKurus);
  });

  it('boş faturada sıfır döner', () => {
    const invoice = computeInvoice([]);
    expect(invoice.totalKurus).toBe(0);
    expect(invoice.vatBreakdown).toEqual([]);
  });

  it('çok satırlı faturada kuruş kaybı olmaz', () => {
    // Her biri yuvarlama gerektiren 100 satır
    const lines = Array.from({ length: 100 }, () => ({
      description: 'Satır', quantity: 3, unit: 'Adet', unitPrice: 33.33, vatRate: 20 as const,
    }));
    const invoice = computeInvoice(lines);
    expect(invoice.baseKurus).toBe(9999 * 100);
    expect(invoice.vatKurus).toBe(2000 * 100);
    expect(invoice.totalKurus).toBe(11999 * 100);
  });
});

describe('fatura numarası', () => {
  it('16 haneli e-Arşiv biçiminde üretir', () => {
    const no = formatInvoiceNumber('DGT', 2026, 1);
    expect(no).toBe('DGT2026000000001');
    expect(no).toHaveLength(16);
    expect(isValidInvoiceNumber(no)).toBe(true);
  });

  it('ön eki büyük harfe çevirir ve temizler', () => {
    expect(formatInvoiceNumber('dg-t', 2026, 5)).toBe('DGT2026000000005');
  });

  it('kısa ön eki doldurur', () => {
    expect(formatInvoiceNumber('A', 2026, 1)).toBe('AXX2026000000001');
  });

  it('büyük sıra numarasını taşırmaz', () => {
    expect(formatInvoiceNumber('DGT', 2026, 999_999_999)).toBe('DGT2026999999999');
  });

  it('geçersiz biçimi reddeder', () => {
    expect(isValidInvoiceNumber('DGT202600001')).toBe(false);
    expect(isValidInvoiceNumber('dgt2026000000001')).toBe(false);
  });
});

describe('kimlik doğrulama', () => {
  it("geçerli TCKN'yi kabul eder", () => {
    // Algoritmaya uygun örnek numara
    expect(isValidTckn('10000000146')).toBe(true);
  });

  it("geçersiz TCKN'yi reddeder", () => {
    expect(isValidTckn('10000000000')).toBe(false);
    expect(isValidTckn('01234567890')).toBe(false); // sıfırla başlayamaz
    expect(isValidTckn('123')).toBe(false);
    expect(isValidTckn('abcdefghijk')).toBe(false);
  });

  it("geçerli VKN'yi kabul eder", () => {
    expect(isValidVkn('0123456789')).toBe(true);
  });

  it("geçersiz VKN'yi reddeder", () => {
    expect(isValidVkn('1234567890')).toBe(false);
    expect(isValidVkn('12345')).toBe(false);
  });
});

describe('fatura düzenleme süresi (VUK 7 gün)', () => {
  it('hizmet günü tam süre kalır', () => {
    expect(invoiceDeadlineStatus('2026-09-01', '2026-09-01')).toEqual({ daysLeft: 7, overdue: false });
  });

  it('süre azalır', () => {
    expect(invoiceDeadlineStatus('2026-09-01', '2026-09-05').daysLeft).toBe(3);
  });

  it('son gün hâlâ geçerlidir', () => {
    expect(invoiceDeadlineStatus('2026-09-01', '2026-09-08').overdue).toBe(false);
  });

  it('süre dolduğunda uyarır', () => {
    const status = invoiceDeadlineStatus('2026-09-01', '2026-09-09');
    expect(status.overdue).toBe(true);
    expect(status.daysLeft).toBeLessThan(0);
  });
});
