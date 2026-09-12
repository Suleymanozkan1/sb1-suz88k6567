import { describe, expect, it } from 'vitest';
import { anketGunu, anketMetni } from './anket';

/**
 * Deneyim anketi gönderimi (madde 31).
 *
 * Görev her gün çalışıp "bugün bir haftasını dolduran" organizasyonları
 * arıyor. Gün hesabı kayarsa anket ya hiç gitmez ya da yanlış güne
 * gider; ikisi de sessizce olur.
 */
describe('anketGunu', () => {
  it('bugünden yedi gün öncesini verir', () => {
    expect(anketGunu(new Date('2026-09-19T09:00:00Z'))).toBe('2026-09-12');
  });

  it('ay sınırını geriye doğru geçer', () => {
    expect(anketGunu(new Date('2026-10-03T09:00:00Z'))).toBe('2026-09-26');
  });

  it('yıl sınırını geriye doğru geçer', () => {
    expect(anketGunu(new Date('2027-01-04T09:00:00Z'))).toBe('2026-12-28');
  });

  /*
    Görev saat 9'da (UTC 6) çalışıyor; günün saati sonucu kaydırmamalı.
    Kaydırsaydı yaz saatinde anket bir gün erken giderdi.
  */
  it('günün saatinden etkilenmez', () => {
    expect(anketGunu(new Date('2026-09-19T00:00:00Z')))
      .toBe(anketGunu(new Date('2026-09-19T23:59:00Z')));
  });

  it('gecikme değeri verilebilir', () => {
    expect(anketGunu(new Date('2026-09-19T09:00:00Z'), 1)).toBe('2026-09-18');
  });
});

describe('anketMetni', () => {
  const metin = anketMetni('Grand Sahra', 'Ayşe ve Mehmet', 'https://ornek.com/anket?jeton=abc');

  it('müşteriye adıyla hitap eder', () => {
    expect(metin).toContain('Sayın Ayşe ve Mehmet');
  });

  it('işletme adını yazar', () => {
    expect(metin).toContain('Grand Sahra');
  });

  it('anket bağlantısını içerir', () => {
    expect(metin).toContain('https://ornek.com/anket?jeton=abc');
  });

  /*
    Puan aralığı metinde açık yazıyor: bağlantıyı açmadan neyin
    sorulduğunu bilmeyen çoğu kişi tıklamıyor.
  */
  it('puan aralığını açıklar', () => {
    expect(metin).toContain('1 ile 5 arasında');
  });
});
