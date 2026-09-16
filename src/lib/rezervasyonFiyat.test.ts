import { describe, expect, it } from 'vitest';
import { fiyatHesapla, type FiyatGirdisi } from './rezervasyonFiyat';

/*
  REZERVASYON FİYAT HESABI.

  Bu sayılar sözleşmeye ve faturaya gidiyor. Yanlış olması, kimsenin
  hemen fark etmeyeceği ama sonradan düzeltilemeyecek türden bir hata:
  müşteri imzaladıktan sonra rakam tartışılmıyor.
*/
function girdi(over: Partial<FiyatGirdisi> = {}): FiyatGirdisi {
  return {
    kisiBasi: 1000, davetli: 300, ekler: 0,
    iskonto: 0, yuzdeMi: false, kdvOrani: 0,
    ...over,
  };
}

describe('kişibaşı toplam', () => {
  it('kişi başı fiyatı davetli sayısıyla çarpar', () => {
    expect(fiyatHesapla(girdi()).kisiBasiToplam).toBe(300_000);
  });

  it('kuruşlu fiyatta kayan nokta artığı bırakmaz', () => {
    // 3 x 19,90 kayan noktada 59,699999999999996 çıkıyor.
    const s = fiyatHesapla(girdi({ kisiBasi: 19.9, davetli: 3 }));
    expect(s.kisiBasiToplam).toBe(59.7);
  });

  it('davetli girilmemişse sıfır', () => {
    expect(fiyatHesapla(girdi({ davetli: 0 })).kisiBasiToplam).toBe(0);
  });

  it('negatif girdiyi sıfır sayar', () => {
    // Eksi davetli diye bir şey yok; hesabı negatife düşürmemeli.
    expect(fiyatHesapla(girdi({ davetli: -5 })).kisiBasiToplam).toBe(0);
    expect(fiyatHesapla(girdi({ kisiBasi: -10 })).kisiBasiToplam).toBe(0);
  });
});

describe('sözleşme fiyatı', () => {
  it('ekleri kişibaşı toplama ekler', () => {
    expect(fiyatHesapla(girdi({ ekler: 25_000 })).sozlesmeFiyati).toBe(325_000);
  });
});

describe('iskonto', () => {
  it('tutar olarak düşer', () => {
    const s = fiyatHesapla(girdi({ iskonto: 30_000 }));
    expect(s.iskontoTutari).toBe(30_000);
    expect(s.araToplam).toBe(270_000);
  });

  it('yüzde olarak hesaplanır', () => {
    const s = fiyatHesapla(girdi({ iskonto: 10, yuzdeMi: true }));
    expect(s.iskontoTutari).toBe(30_000);
    expect(s.araToplam).toBe(270_000);
  });

  it('yüzde iskonto EKLERİ de kapsar', () => {
    /*
      Ekler hariç tutulsaydı "yüzde 10 iskonto" sözü, eklerin payı
      arttıkça giderek daha az indirim anlamına gelirdi; müşteriyle
      konuşulan oran ile faturadaki oran tutmazdı.
    */
    const s = fiyatHesapla(girdi({ ekler: 100_000, iskonto: 10, yuzdeMi: true }));
    expect(s.sozlesmeFiyati).toBe(400_000);
    expect(s.iskontoTutari).toBe(40_000);
  });

  it('sözleşme fiyatını aşamaz', () => {
    // Aşsaydı ara toplam negatife düşer, müşteriye borçlu görünürdük.
    const s = fiyatHesapla(girdi({ iskonto: 500_000 }));
    expect(s.iskontoTutari).toBe(300_000);
    expect(s.araToplam).toBe(0);
    expect(s.genelToplam).toBe(0);
  });

  it('yüzde 100 üzerindeki oran da fiyatı aşmaz', () => {
    const s = fiyatHesapla(girdi({ iskonto: 150, yuzdeMi: true }));
    expect(s.araToplam).toBe(0);
  });

  it('negatif iskonto fiyatı artırmaz', () => {
    const s = fiyatHesapla(girdi({ iskonto: -50_000 }));
    expect(s.iskontoTutari).toBe(0);
    expect(s.araToplam).toBe(300_000);
  });
});

describe('KDV', () => {
  it('iskonto DÜŞÜLDÜKTEN sonraki tutar üzerinden hesaplanır', () => {
    /*
      Matrah iskontodan önce alınsaydı devlete, müşteriden hiç
      alınmamış para üzerinden KDV ödenirdi.
    */
    const s = fiyatHesapla(girdi({ iskonto: 100_000, kdvOrani: 20 }));
    expect(s.araToplam).toBe(200_000);
    expect(s.kdvTutari).toBe(40_000);
    expect(s.genelToplam).toBe(240_000);
  });

  it('sıfır oran geçerlidir', () => {
    // İstisna kapsamı. "Girilmemiş" ile "sıfır" aynı şey.
    const s = fiyatHesapla(girdi({ kdvOrani: 0 }));
    expect(s.kdvTutari).toBe(0);
    expect(s.genelToplam).toBe(300_000);
  });

  it('kuruşa yuvarlar', () => {
    const s = fiyatHesapla(girdi({ kisiBasi: 33.33, davetli: 3, kdvOrani: 10 }));
    expect(s.araToplam).toBe(99.99);
    expect(s.kdvTutari).toBe(10);
  });

  it('oran aralık dışına çıkamaz', () => {
    expect(fiyatHesapla(girdi({ kdvOrani: -5 })).kdvTutari).toBe(0);
    expect(fiyatHesapla(girdi({ kdvOrani: 500 })).kdvTutari).toBe(300_000);
  });
});

describe('genel toplam', () => {
  it('uçtan uca bir sözleşmeyi doğru toplar', () => {
    // 300 kişi x 1.000 = 300.000, +25.000 ekler = 325.000
    // %10 iskonto = 32.500 -> ara toplam 292.500
    // %20 KDV = 58.500 -> genel toplam 351.000
    const s = fiyatHesapla(girdi({ ekler: 25_000, iskonto: 10, yuzdeMi: true, kdvOrani: 20 }));
    expect(s).toEqual({
      kisiBasiToplam: 300_000,
      sozlesmeFiyati: 325_000,
      iskontoTutari: 32_500,
      araToplam: 292_500,
      kdvTutari: 58_500,
      genelToplam: 351_000,
    });
  });

  it('boş formda her şey sıfır', () => {
    const s = fiyatHesapla(girdi({ kisiBasi: 0, davetli: 0 }));
    expect(s.genelToplam).toBe(0);
  });

  it('geçersiz sayılarda çökmez', () => {
    // Boş bir alan Number('') ile NaN olabiliyor; ekran sayı göstermeli.
    const s = fiyatHesapla(girdi({ kisiBasi: NaN, davetli: NaN, ekler: NaN }));
    expect(Number.isFinite(s.genelToplam)).toBe(true);
  });
});
