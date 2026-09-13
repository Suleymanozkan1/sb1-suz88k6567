import { describe, expect, it } from 'vitest';
import { hadiseAdi, hadiseSimgesi, hadiseSinifi } from './mgm';

describe('hadiseAdi', () => {
  it('bilinen kodu Türkçe adına çevirir', () => {
    expect(hadiseAdi('A')).toBe('Açık');
    expect(hadiseAdi('PB')).toBe('Parçalı bulutlu');
    expect(hadiseAdi('GSY')).toBe('Gök gürültülü sağanak yağışlı');
  });

  it('küçük harfli ve boşluklu kodu da tanır', () => {
    expect(hadiseAdi(' pb ')).toBe('Parçalı bulutlu');
  });

  it('tanınmayan kodu ATMAZ, ham hâlini gösterir', () => {
    // MGM yeni bir kod eklediğinde satır boş kalmasın.
    expect(hadiseAdi('XYZ')).toBe('XYZ');
  });

  it('boş kodda boş döner', () => {
    expect(hadiseAdi('')).toBe('');
    expect(hadiseAdi('   ')).toBe('');
  });
});

describe('hadiseSinifi', () => {
  it('açık, bulutlu, yağmur, kar ve fırtınayı ayırır', () => {
    expect(hadiseSinifi('A')).toBe('acik');
    expect(hadiseSinifi('CB')).toBe('bulutlu');
    expect(hadiseSinifi('HY')).toBe('yagmur');
    expect(hadiseSinifi('KKAR')).toBe('kar');
    expect(hadiseSinifi('GSY')).toBe('firtina');
    expect(hadiseSinifi('SG')).toBe('sis');
  });

  it('karlı kodu yağmura düşürmez', () => {
    // 'KF' (karla karışık yağmur) içinde Y yok ama kar sınıfında.
    expect(hadiseSinifi('KF')).toBe('kar');
    expect(hadiseSinifi('K')).toBe('kar');
  });

  it('bilinmeyen kodu bilinmiyor sayar', () => {
    expect(hadiseSinifi('ZZZ')).toBe('bilinmiyor');
    expect(hadiseSinifi('')).toBe('bilinmiyor');
  });
});

describe('hadiseSimgesi', () => {
  it('sınıfa göre simge verir', () => {
    expect(hadiseSimgesi('A')).toBe('☀');
    expect(hadiseSimgesi('HY')).toBe('🌧');
  });

  it('bilinmeyen kodda simge zorlamaz', () => {
    expect(hadiseSimgesi('ZZZ')).toBe('');
  });
});
