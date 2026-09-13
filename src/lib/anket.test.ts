import { describe, expect, it } from 'vitest';
import { anketOrtalamasi, anketOzeti, anketTarihi, puanlariSuz } from './anket';
import type { Survey } from '../types';

/**
 * Deneyim anketi (madde 31).
 *
 * Puan doğrulaması hem anket sayfasında hem sunucuda bu modülden
 * geçiyor. Aralık dışı bir puanın sızması, ortalamaları kalıcı olarak
 * bozar: cevap bir kez yazıldıktan sonra geri alınamıyor.
 */
describe('puanlariSuz', () => {
  it('geçerli puanları olduğu gibi alır', () => {
    expect(puanlariSuz({ salon: 5, ikram: 3 })).toEqual({ salon: 5, ikram: 3 });
  });

  it('metin gelen sayıyı çevirir', () => {
    expect(puanlariSuz({ salon: '4' })).toEqual({ salon: 4 });
  });

  it('aralık dışı puanı reddeder', () => {
    expect(puanlariSuz({ salon: 0 })).toBeNull();
    expect(puanlariSuz({ salon: 6 })).toBeNull();
    expect(puanlariSuz({ salon: -3 })).toBeNull();
  });

  it('ondalık puanı reddeder', () => {
    expect(puanlariSuz({ salon: 4.5 })).toBeNull();
  });

  it('sayı olmayan değeri reddeder', () => {
    expect(puanlariSuz({ salon: 'iyi' })).toBeNull();
  });

  // Eski bir bağlantı eski bir anahtarla gelebilir; bu, cevabın tamamını
  // çöpe atmayı gerektirmez.
  it('tanınmayan anahtarı yok sayar', () => {
    expect(puanlariSuz({ salon: 5, bilinmeyen: 9 })).toEqual({ salon: 5 });
  });

  it('boş bırakılan soruyu atlar', () => {
    expect(puanlariSuz({ salon: 5, ikram: '', personel: null })).toEqual({ salon: 5 });
  });

  it('hiç puan yoksa null döner', () => {
    expect(puanlariSuz({})).toBeNull();
    expect(puanlariSuz({ ikram: '' })).toBeNull();
  });

  it('nesne olmayan girdiyi reddeder', () => {
    expect(puanlariSuz(null)).toBeNull();
    expect(puanlariSuz('5')).toBeNull();
    expect(puanlariSuz([5, 4])).toBeNull();
  });
});

describe('anketOrtalamasi', () => {
  it('puanların ortalamasını verir', () => {
    expect(anketOrtalamasi({ salon: 5, ikram: 3 })).toBe(4);
  });

  it('puan yoksa null döner', () => {
    expect(anketOrtalamasi(undefined)).toBeNull();
    expect(anketOrtalamasi({})).toBeNull();
  });
});

function anket(patch: Partial<Survey>): Survey {
  return {
    id: patch.id ?? 'a1',
    businessId: 'b1',
    reservationId: patch.reservationId ?? 'r1',
    comment: '',
    createdAt: '2026-09-01T00:00:00Z',
    ...patch,
  };
}

describe('anketOzeti', () => {
  const liste = [
    anket({ id: 'a1', sentAt: '2026-09-01T00:00:00Z', answeredAt: '2026-09-02T00:00:00Z', scores: { salon: 5, ikram: 4 } }),
    anket({ id: 'a2', sentAt: '2026-09-01T00:00:00Z', answeredAt: '2026-09-03T00:00:00Z', scores: { salon: 3 } }),
    // Gönderildi ama cevaplanmadı.
    anket({ id: 'a3', sentAt: '2026-09-01T00:00:00Z' }),
    // Hiç gönderilmedi: hiçbir sayıya girmemeli.
    anket({ id: 'a4' }),
  ];

  it('gönderilen ve cevaplananı ayrı sayar', () => {
    const ozet = anketOzeti(liste);
    expect(ozet.gonderilen).toBe(3);
    expect(ozet.cevaplanan).toBe(2);
  });

  it('cevap oranını gönderilen üzerinden hesaplar', () => {
    expect(anketOzeti(liste).cevapOrani).toBeCloseTo((2 / 3) * 100, 5);
  });

  // Cevaplanmamış anket ortalamaya girerse memnuniyet olduğundan düşük
  // görünür; bu, olmayan bir sorunu var gibi gösterirdi.
  it('ortalamayı yalnızca cevaplardan hesaplar', () => {
    expect(anketOzeti(liste).ortalama).toBeCloseTo((5 + 4 + 3) / 3, 5);
  });

  it('soru bazında ortalama ve cevap sayısı verir', () => {
    const sorular = anketOzeti(liste).sorular;
    const salon = sorular.find((s) => s.key === 'salon');
    const ikram = sorular.find((s) => s.key === 'ikram');
    expect(salon).toEqual({ key: 'salon', label: 'Salon ve düzen', cevap: 2, ortalama: 4 });
    expect(ikram?.cevap).toBe(1);
  });

  it('hiç cevaplanmayan soruyu listelemez', () => {
    const sorular = anketOzeti(liste).sorular;
    expect(sorular.some((s) => s.key === 'temizlik')).toBe(false);
  });

  it('hiç anket yoksa sıfırlarla döner', () => {
    const ozet = anketOzeti([]);
    expect(ozet).toEqual({
      gonderilen: 0, cevaplanan: 0, cevapOrani: 0, ortalama: null, sorular: [],
    });
  });
});

describe('anketTarihi', () => {
  it('organizasyondan bir hafta sonrasını verir', () => {
    expect(anketTarihi('2026-09-12')).toBe('2026-09-19');
  });

  it('ay sınırını geçer', () => {
    expect(anketTarihi('2026-09-28')).toBe('2026-10-05');
  });

  it('yıl sınırını geçer', () => {
    expect(anketTarihi('2026-12-30')).toBe('2027-01-06');
  });
});
