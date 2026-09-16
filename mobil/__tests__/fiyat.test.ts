import { fiyatHesapla } from '../src/fiyat';

/*
  MOBİL FİYAT HESABI, PANELLE AYNI SONUCU VERMELİ.

  Formül iki pakette ayrı duruyor (Metro paneldeki dosyayı
  paketleyemiyor). Ayrı durduğu için ayrışabilir: biri düzeltilip
  öteki unutulursa aynı sözleşme telefonda ve panelde FARKLI tutar
  gösterir -- ve bunu ancak müşteri fark eder.

  Aşağıdaki çalışılmış örnek, paneldeki `rezervasyonFiyat.test.ts`
  içindeki "uçtan uca bir sözleşmeyi doğru toplar" testiyle BİREBİR
  aynı sayıları bekliyor. Biri değişirse öteki düşer.
*/
describe('mobil fiyat hesabı panelle aynı', () => {
  it('çalışılmış örneği aynı sayılarla verir', () => {
    // 300 kişi x 1.000 = 300.000, +25.000 ekler = 325.000
    // %10 iskonto = 32.500 -> ara toplam 292.500
    // %20 KDV = 58.500 -> genel toplam 351.000
    expect(fiyatHesapla({
      kisiBasi: 1000, davetli: 300, ekler: 25_000,
      iskonto: 10, yuzdeMi: true, kdvOrani: 20,
    })).toEqual({
      kisiBasiToplam: 300_000,
      sozlesmeFiyati: 325_000,
      iskontoTutari: 32_500,
      araToplam: 292_500,
      kdvTutari: 58_500,
      genelToplam: 351_000,
    });
  });

  it('iskonto sözleşme fiyatını aşamaz', () => {
    const s = fiyatHesapla({
      kisiBasi: 1000, davetli: 300, ekler: 0,
      iskonto: 500_000, yuzdeMi: false, kdvOrani: 20,
    });
    expect(s.araToplam).toBe(0);
    expect(s.genelToplam).toBe(0);
  });

  it('KDV matrahı iskonto düşüldükten sonra', () => {
    const s = fiyatHesapla({
      kisiBasi: 1000, davetli: 300, ekler: 0,
      iskonto: 100_000, yuzdeMi: false, kdvOrani: 20,
    });
    expect(s.araToplam).toBe(200_000);
    expect(s.kdvTutari).toBe(40_000);
  });

  it('kuruş artığı bırakmaz', () => {
    const s = fiyatHesapla({
      kisiBasi: 19.9, davetli: 3, ekler: 0,
      iskonto: 0, yuzdeMi: false, kdvOrani: 0,
    });
    expect(s.kisiBasiToplam).toBe(59.7);
  });

  it('geçersiz sayılarda çökmez', () => {
    const s = fiyatHesapla({
      kisiBasi: NaN, davetli: NaN, ekler: NaN,
      iskonto: NaN, yuzdeMi: false, kdvOrani: NaN,
    });
    expect(Number.isFinite(s.genelToplam)).toBe(true);
  });
});
