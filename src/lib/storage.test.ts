import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KEYS, clearAll, read, remove, write } from './storage';

/**
 * Kalıcı depolama katmanı.
 *
 * Buranın tek kuralı var: tarayıcı depolaması erişilemez ya da dolu
 * olduğunda uygulama çökmemeli. Gizli sekmede, kota dolduğunda ya da
 * site verisi engellendiğinde `localStorage` istisna fırlatır; her çağrı
 * bunu yutup makul bir varsayılana düşüyor. Testler bu davranışı
 * doğruluyor, çünkü kaybı sessiz olan tek şey burada.
 */
beforeEach(() => { clearAll(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('read ve write', () => {
  it('yazılan değeri aynı tiple geri okur', () => {
    write('deneme', { ad: 'Ayşe', tutar: 250000 });
    expect(read('deneme', null)).toEqual({ ad: 'Ayşe', tutar: 250000 });
  });

  it('kayıt yoksa varsayılanı döndürür', () => {
    expect(read('olmayan', ['varsayilan'])).toEqual(['varsayilan']);
  });

  it('boş dizi ve sıfır gibi değerleri varsayılanla karıştırmaz', () => {
    write('bos', []);
    expect(read('bos', ['x'])).toEqual([]);
    write('sifir', 0);
    expect(read('sifir', 99)).toBe(0);
  });

  it('anahtarları ön ekle saklar', () => {
    write('deneme', 1);
    expect(window.localStorage.getItem('dt:deneme')).toBe('1');
  });

  it('bozuk JSON kaydında varsayılana düşer', () => {
    // Sürüm geçişi ya da elle düzenleme sonrası kayıt bozulabilir;
    // uygulama açılmamak yerine boş başlamalı.
    window.localStorage.setItem('dt:bozuk', '{ yarim');
    expect(read('bozuk', { güvenli: true })).toEqual({ güvenli: true });
  });

  it('okuma istisna fırlatırsa varsayılana düşer', () => {
    vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
      throw new Error('erişim engellendi');
    });
    expect(read('deneme', 'yedek')).toBe('yedek');
  });

  it('kota dolduğunda yazma sessizce geçer', () => {
    vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => write('deneme', { büyük: 'veri' })).not.toThrow();
  });
});

describe('remove', () => {
  it('kaydı siler', () => {
    write('deneme', 1);
    remove('deneme');
    expect(read('deneme', null)).toBeNull();
  });

  it('olmayan kaydı silmek hata vermez', () => {
    expect(() => remove('olmayan')).not.toThrow();
  });

  it('silme istisna fırlatırsa yutulur', () => {
    vi.spyOn(window.localStorage.__proto__, 'removeItem').mockImplementation(() => {
      throw new Error('erişim engellendi');
    });
    expect(() => remove('deneme')).not.toThrow();
  });
});

describe('clearAll', () => {
  it('yalnızca uygulamanın kendi anahtarlarını siler', () => {
    // Aynı alan adında başka bir uygulamanın verisi varsa ona
    // dokunulmamalı.
    write('deneme', 1);
    window.localStorage.setItem('baska-uygulama', 'korunmali');

    clearAll();

    expect(read('deneme', null)).toBeNull();
    expect(window.localStorage.getItem('baska-uygulama')).toBe('korunmali');
  });

  it('birden çok anahtarı birlikte siler', () => {
    write(KEYS.users, [{ id: 'u1' }]);
    write(KEYS.reservations, [{ id: 'r1' }]);

    clearAll();

    expect(read(KEYS.users, null)).toBeNull();
    expect(read(KEYS.reservations, null)).toBeNull();
  });

  it('temizleme istisna fırlatırsa yutulur', () => {
    vi.spyOn(window.localStorage.__proto__, 'key').mockImplementation(() => {
      throw new Error('erişim engellendi');
    });
    expect(() => clearAll()).not.toThrow();
  });
});

describe('KEYS', () => {
  it('her anahtar benzersizdir', () => {
    // Aynı anahtarı iki varlık paylaşsaydı biri diğerinin üzerine yazardı.
    const degerler = Object.values(KEYS);
    expect(new Set(degerler).size).toBe(degerler.length);
  });
});
