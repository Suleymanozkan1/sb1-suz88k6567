import { describe, expect, it } from 'vitest';
import { TAHMIN_YOK_METNI, guncelSicaklik, havaMetni, sicaklikMetni, tahminBul } from './hava';
import type { WeatherForecast } from '../types';

/**
 * Hava durumu (madde 29).
 *
 * Şartname açık: "API'nin tahmin sağlayamadığı uzak tarihlerde 'Tahmin
 * henüz mevcut değil' gibi açık bir mesaj göster." Bu modülün tek işi,
 * eksik veriyi rakama çevirmeden geçirmek -- 0° yazan bir düğün günü,
 * olmayan bir bilgiyi doğruymuş gibi gösterirdi.
 */
function tahmin(patch: Partial<WeatherForecast>): WeatherForecast {
  return {
    businessId: 'b1',
    day: '2026-09-12',
    summary: 'Parçalı bulutlu',
    icon: '4',
    fetchedAt: '2026-09-12T06:15:00Z',
    ...patch,
  };
}

describe('tahminBul', () => {
  it('istenen günün satırını verir', () => {
    const liste = [tahmin({ day: '2026-09-12' }), tahmin({ day: '2026-09-13' })];
    expect(tahminBul(liste, '2026-09-13')?.day).toBe('2026-09-13');
  });

  it('kayıt yoksa null döner', () => {
    expect(tahminBul([tahmin({})], '2027-06-01')).toBeNull();
  });

  it('boş listede null döner', () => {
    expect(tahminBul([], '2026-09-12')).toBeNull();
  });
});

describe('sicaklikMetni', () => {
  it('en düşük ve en yükseği birlikte yazar', () => {
    expect(sicaklikMetni(tahmin({ minC: 17.4, maxC: 28.6 }))).toBe('17° / 29°');
  });

  it('yalnızca en yüksek varsa tek değer yazar', () => {
    expect(sicaklikMetni(tahmin({ maxC: 28 }))).toBe('28°');
  });

  it('yalnızca en düşük varsa tek değer yazar', () => {
    expect(sicaklikMetni(tahmin({ minC: 12 }))).toBe('12°');
  });

  it('sıcaklık yoksa boş döner', () => {
    expect(sicaklikMetni(tahmin({}))).toBe('');
  });

  // Sıfır derece geçerli bir değer; "yok" ile karıştırılırsa kış
  // düğünlerinde tahmin kaybolurdu.
  it('sıfır dereceyi yok saymaz', () => {
    expect(sicaklikMetni(tahmin({ minC: 0, maxC: 4 }))).toBe('0° / 4°');
  });
});

describe('havaMetni', () => {
  it('sıcaklık ve özeti birleştirir', () => {
    expect(havaMetni(tahmin({ minC: 17, maxC: 28 }))).toBe('17° / 28° · Parçalı bulutlu');
  });

  it('tahmin yoksa açık mesaj verir', () => {
    expect(havaMetni(null)).toBe(TAHMIN_YOK_METNI);
  });

  it('içi boş satırda da açık mesaj verir', () => {
    expect(havaMetni(tahmin({ summary: '' }))).toBe(TAHMIN_YOK_METNI);
  });

  it('yalnızca özet varsa özeti yazar', () => {
    expect(havaMetni(tahmin({ summary: 'Yağmurlu' }))).toBe('Yağmurlu');
  });
});

describe('guncelSicaklik', () => {
  it('bugünün anlık sıcaklığını verir', () => {
    const liste = [tahmin({ day: '2026-09-12', currentC: 24.2 })];
    expect(guncelSicaklik(liste, '2026-09-12')).toBe(24.2);
  });

  it('anlık değer yoksa null döner', () => {
    expect(guncelSicaklik([tahmin({ day: '2026-09-12' })], '2026-09-12')).toBeNull();
  });

  // Anlık sıcaklık yalnızca bugünün satırında anlamlı.
  it('başka günün satırına bakmaz', () => {
    const liste = [tahmin({ day: '2026-09-13', currentC: 24 })];
    expect(guncelSicaklik(liste, '2026-09-12')).toBeNull();
  });
});
