import { describe, expect, it } from 'vitest';
import { oncekiAy, raporMetni } from './monthly-report';

/**
 * Aylık rapor (madde 24).
 *
 * Görev ayın ilk günü çalışıp BİTEN ayın özetini çıkarıyor; yıl sınırını
 * doğru geçmezse 1 Ocak'ta "2026-00" gibi bir dönem üretir ve rapor hiç
 * oluşmaz.
 */
describe('oncekiAy', () => {
  it('ayın ilk gününde bir önceki ayı verir', () => {
    expect(oncekiAy(new Date('2026-09-01T03:00:00Z'))).toBe('2026-08');
  });

  it('yıl başında bir önceki yılın aralığına döner', () => {
    expect(oncekiAy(new Date('2027-01-01T03:00:00Z'))).toBe('2026-12');
  });

  it('ay ortasında da biten ayı verir', () => {
    expect(oncekiAy(new Date('2026-09-17T12:00:00Z'))).toBe('2026-08');
  });

  it('ayı iki haneli yazar', () => {
    expect(oncekiAy(new Date('2026-04-01T00:00:00Z'))).toBe('2026-03');
  });
});

describe('raporMetni', () => {
  const ozet = {
    rezervasyon: 23, davetli: 7030, ciro: 3715000, tahsilat: 1439000,
    kalan: 2276000, gider: 95000, aday: 100, donusen: 12,
  };

  it('bütün başlıkları içerir', () => {
    const metin = raporMetni('Grand Sahra', '2026-08', ozet);
    expect(metin).toContain('Grand Sahra - 2026-08 ayı özeti');
    expect(metin).toContain('Organizasyon sayısı : 23');
    expect(metin).toContain('Rezervasyona dönen  : 12');
  });

  // Tutarlar Türkçe yazımla: "3,715,000.00" biçiminde bir rapor okunmaz.
  it('tutarları Türkçe biçimde yazar', () => {
    expect(raporMetni('X', '2026-08', ozet)).toContain('3.715.000,00 TL');
  });

  it('sıfır değerlerde de satırları atlamaz', () => {
    const bos = { rezervasyon: 0, davetli: 0, ciro: 0, tahsilat: 0, kalan: 0, gider: 0, aday: 0, donusen: 0 };
    const metin = raporMetni('X', '2026-08', bos);
    expect(metin).toContain('Organizasyon sayısı : 0');
    expect(metin).toContain('0,00 TL');
  });
});
