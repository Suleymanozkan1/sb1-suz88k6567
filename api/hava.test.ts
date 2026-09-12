import { describe, expect, it } from 'vitest';
import { accuweatherCevir, guncelSicakligiCoz } from './hava';

/**
 * Hava durumu (madde 29).
 *
 * Sağlayıcı AccuWeather ve ücretsiz katmanı yalnızca birkaç günlük
 * tahmin veriyor. Çözümleyicinin kuralı: veri YOKSA satır ÜRETME.
 * Üretilseydi uzak tarihli düğünlerde 0° görünür, salon sahibi olmayan
 * bir tahmine bakarak karar verirdi.
 */
const YANIT = {
  DailyForecasts: [
    {
      Date: '2026-09-12T07:00:00+03:00',
      Temperature: { Minimum: { Value: 17.4, Unit: 'C' }, Maximum: { Value: 28.6, Unit: 'C' } },
      Day: { Icon: 4, IconPhrase: 'Parçalı güneşli' },
    },
    {
      Date: '2026-09-13T07:00:00+03:00',
      Temperature: { Minimum: { Value: 16, Unit: 'C' }, Maximum: { Value: 26, Unit: 'C' } },
      Day: { Icon: 12, IconPhrase: 'Sağanak yağışlı' },
    },
  ],
};

describe('accuweatherCevir', () => {
  it('günlük tahminleri satıra çevirir', () => {
    expect(accuweatherCevir(YANIT, 'b1')).toEqual([
      {
        business_id: 'b1', day: '2026-09-12', min_c: 17.4, max_c: 28.6,
        current_c: null, summary: 'Parçalı güneşli', icon: '4',
      },
      {
        business_id: 'b1', day: '2026-09-13', min_c: 16, max_c: 26,
        current_c: null, summary: 'Sağanak yağışlı', icon: '12',
      },
    ]);
  });

  /*
    `EpochDate` yerine `Date` alanının ilk 10 karakteri kullanılıyor:
    epoch, sunucunun saat dilimine göre bir gün kayabiliyor ve düğün
    günü tahmini bir gün önceye yazılırdı.
  */
  it('günü metin tarihten alır, saat dilimine bakmaz', () => {
    expect(accuweatherCevir(YANIT, 'b1')[0]?.day).toBe('2026-09-12');
  });

  it('içi boş tahmini yazmaz', () => {
    const govde = {
      DailyForecasts: [
        { Date: '2026-09-12T07:00:00+03:00', Temperature: {}, Day: {} },
      ],
    };
    expect(accuweatherCevir(govde, 'b1')).toEqual([]);
  });

  it('yalnızca özeti olan tahmini yazar', () => {
    const govde = {
      DailyForecasts: [
        { Date: '2026-09-12T07:00:00+03:00', Temperature: {}, Day: { IconPhrase: 'Açık' } },
      ],
    };
    expect(accuweatherCevir(govde, 'b1')).toEqual([{
      business_id: 'b1', day: '2026-09-12', min_c: null, max_c: null,
      current_c: null, summary: 'Açık', icon: '',
    }]);
  });

  it('geçersiz tarihli satırı atlar', () => {
    const govde = {
      DailyForecasts: [
        { Date: 'bilinmiyor', Temperature: { Maximum: { Value: 30 } }, Day: { IconPhrase: 'Açık' } },
      ],
    };
    expect(accuweatherCevir(govde, 'b1')).toEqual([]);
  });

  it('beklenmeyen gövdede boş liste döner', () => {
    expect(accuweatherCevir(null, 'b1')).toEqual([]);
    expect(accuweatherCevir({}, 'b1')).toEqual([]);
    expect(accuweatherCevir({ DailyForecasts: 'hata' }, 'b1')).toEqual([]);
  });
});

describe('guncelSicakligiCoz', () => {
  it('metrik sıcaklığı alır', () => {
    const govde = [{ Temperature: { Metric: { Value: 24.2, Unit: 'C' }, Imperial: { Value: 76 } } }];
    expect(guncelSicakligiCoz(govde)).toBe(24.2);
  });

  /*
    `Imperial` okunsaydı Fahrenheit değer Celsius sanılırdı ve 76° bir
    eylül günü olarak gösterilirdi.
  */
  it('Fahrenheit değere bakmaz', () => {
    const govde = [{ Temperature: { Imperial: { Value: 76 } } }];
    expect(guncelSicakligiCoz(govde)).toBeNull();
  });

  it('boş yanıtta null döner', () => {
    expect(guncelSicakligiCoz([])).toBeNull();
    expect(guncelSicakligiCoz(null)).toBeNull();
    expect(guncelSicakligiCoz({})).toBeNull();
  });

  it('sıfır dereceyi geçerli sayar', () => {
    expect(guncelSicakligiCoz([{ Temperature: { Metric: { Value: 0 } } }])).toBe(0);
  });
});
