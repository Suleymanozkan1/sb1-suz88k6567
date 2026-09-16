import { describe, expect, it } from 'vitest';
import {
  SAYIM_BASLIKLARI, kritikStokSayisi, sayimCsvSatirlari, sayimSatirlari,
  stokDegeri, stokDurumu, stokSatirDegeri, stokToplami, stokUrunleri,
} from './stok';
import type { Vendor } from '../types';

/**
 * Stok hesabı.
 *
 * Toplam adet saklanmıyor, hesaplanıyor: koli, adet ve toplam ayrı ayrı
 * saklansaydı sayımdan sonra birbirini tutmayan üç sayı kalırdı.
 */
function urun(over: Partial<Vendor> = {}): Vendor {
  return {
    id: 'v1', businessId: 'b1', name: 'Su', category: 'İçecek', kind: 'urun',
    phone: '', note: '', unitPrice: 0,
    boxCount: 10, unitsPerBox: 24, looseCount: 0, minCount: 0,
    isActive: true, createdAt: '', ...over,
  };
}

function hizmet(over: Partial<Vendor> = {}): Vendor {
  return urun({
    id: 'h1', name: 'DJ', category: 'Orkestra / Müzik', kind: 'hizmet',
    boxCount: 0, unitsPerBox: 0, looseCount: 0, minCount: 0, ...over,
  });
}

describe('stokToplami', () => {
  it('koliyi koli içi adetle çarpar', () => {
    expect(stokToplami(urun())).toBe(240);
  });

  // Koliden bozulmuş tek adetler koli hesabına girmez, ayrıca eklenir.
  it('bozulmuş tek adetleri ekler', () => {
    expect(stokToplami(urun({ boxCount: 3, unitsPerBox: 24, looseCount: 7 }))).toBe(79);
  });

  it('koli yokken yalnızca tek adedi sayar', () => {
    expect(stokToplami(urun({ boxCount: 0, unitsPerBox: 0, looseCount: 15 }))).toBe(15);
  });

  it('yarım koliyi destekler', () => {
    expect(stokToplami(urun({ boxCount: 2.5, unitsPerBox: 24, looseCount: 0 }))).toBe(60);
  });
});

describe('stokUrunleri', () => {
  it('hizmetleri dışarıda bırakır', () => {
    expect(stokUrunleri([urun(), hizmet()]).map((v) => v.name)).toEqual(['Su']);
  });

  it('pasife alınmış ürünü listelemez', () => {
    expect(stokUrunleri([urun({ isActive: false })])).toEqual([]);
  });
});

describe('stokDurumu', () => {
  /*
    Ölçek en büyük stoğa göre: mutlak sayıya göre çizilseydi 240 şişe
    suyun yanında 12 paket peçete hiç görünmezdi.
  */
  it('çubuk oranını en büyük stoğa göre hesaplar', () => {
    const satirlar = stokDurumu([
      urun({ id: 'v1', name: 'Su', boxCount: 10, unitsPerBox: 24 }),
      urun({ id: 'v2', name: 'Peçete', boxCount: 0, unitsPerBox: 0, looseCount: 120 }),
    ]);
    expect(satirlar.find((s) => s.name === 'Su')?.oran).toBe(100);
    expect(satirlar.find((s) => s.name === 'Peçete')?.oran).toBe(50);
  });

  it('kritik seviyedeki ürünü başa alır', () => {
    const satirlar = stokDurumu([
      urun({ id: 'v1', name: 'Su', boxCount: 10, unitsPerBox: 24 }),
      urun({ id: 'v2', name: 'Kola', boxCount: 0, unitsPerBox: 0, looseCount: 5, minCount: 10 }),
    ]);
    expect(satirlar[0].name).toBe('Kola');
    expect(satirlar[0].kritik).toBe(true);
  });

  // Eşik sıfırsa takip edilmiyor demektir; her ürün kritik görünemez.
  it('eşik girilmemiş ürünü kritik saymaz', () => {
    expect(stokDurumu([urun({ boxCount: 0, unitsPerBox: 0, looseCount: 0 })])[0].kritik)
      .toBe(false);
  });

  it('eşiğe eşit stoğu kritik sayar', () => {
    const [satir] = stokDurumu([
      urun({ boxCount: 0, unitsPerBox: 0, looseCount: 10, minCount: 10 }),
    ]);
    expect(satir.kritik).toBe(true);
  });

  it('ürün yoksa boş liste döner', () => {
    expect(stokDurumu([hizmet()])).toEqual([]);
  });
});

describe('kritikStokSayisi', () => {
  it('yalnızca kritik olanları sayar', () => {
    expect(kritikStokSayisi([
      urun({ id: 'v1', minCount: 0 }),
      urun({ id: 'v2', boxCount: 0, unitsPerBox: 0, looseCount: 2, minCount: 10 }),
      urun({ id: 'v3', boxCount: 0, unitsPerBox: 0, looseCount: 1, minCount: 5 }),
    ])).toBe(2);
  });
});

/*
  STOK DEĞERİ.

  "Elimizdeki mevcut stoğun TL karşılığı" sorusunun cevabı. Yanlış
  çıkması, sayım sonrası kimsenin fark etmeyeceği bir hata olurdu:
  rakam makul görünür ama tutmaz.
*/
describe('stokSatirDegeri', () => {
  it('toplam adedi birim fiyatla çarpar', () => {
    // 10 koli x 24 = 240 adet, adedi 3 TL
    expect(stokSatirDegeri(urun({ unitPrice: 3 }))).toBe(720);
  });

  it('bozuk adetleri de sayar', () => {
    // 2 x 24 + 5 = 53 adet
    expect(stokSatirDegeri(urun({ boxCount: 2, looseCount: 5, unitPrice: 10 }))).toBe(530);
  });

  it('birim fiyatı girilmemiş ürün sıfır eder', () => {
    expect(stokSatirDegeri(urun({ unitPrice: 0 }))).toBe(0);
  });

  it('kuruşlu birim fiyatı korur', () => {
    // 240 x 2.5 = 600; ondalık kayıp olmamalı
    expect(stokSatirDegeri(urun({ unitPrice: 2.5 }))).toBe(600);
  });
});

describe('stokDegeri', () => {
  it('ürünlerin değerini toplar', () => {
    const liste = [
      urun({ id: 'a', unitPrice: 3 }),                          // 240 x 3 = 720
      urun({ id: 'b', boxCount: 1, unitsPerBox: 6, unitPrice: 50 }), // 6 x 50 = 300
    ];
    expect(stokDegeri(liste)).toBe(1020);
  });

  it('hizmeti toplama katmaz', () => {
    /*
      Hizmetin stoğu yok; birim fiyatı tek seferlik ücret. Katılsaydı
      "depoda duran mal" ile "ödenecek hizmet" aynı rakamda toplanır,
      hiçbir şeyi karşılamayan bir sayı çıkardı.
    */
    const liste = [
      urun({ id: 'a', unitPrice: 3 }),
      hizmet({ id: 'h', unitPrice: 9000, boxCount: 1, unitsPerBox: 1 }),
    ];
    expect(stokDegeri(liste)).toBe(720);
  });

  it('fiyatsız ürünü listeden düşürmez, sıfır olarak toplar', () => {
    // Düşürülseydi toplam sessizce eksik çıkardı.
    const liste = [urun({ id: 'a', unitPrice: 3 }), urun({ id: 'b', unitPrice: 0 })];
    expect(stokDegeri(liste)).toBe(720);
  });

  it('boş listede sıfır döner', () => {
    expect(stokDegeri([])).toBe(0);
  });

  it('yalnızca verilen kalemleri toplar (seçim)', () => {
    // Ekranda ne gösteriliyorsa toplamı da onun olmalı.
    const hepsi = [urun({ id: 'a', unitPrice: 3 }), urun({ id: 'b', unitPrice: 100 })];
    expect(stokDegeri(hepsi.filter((v) => v.id === 'a'))).toBe(720);
  });
});

/*
  SAYIM ÇIKTISI.

  Excel dökümü ile A4 sayım kâğıdı aynı listeden besleniyor. Ayrı
  kurulsalardı biri güncellenip öteki unutulur, kâğıttaki sayımla
  dosyadaki liste tutmazdı.
*/
describe('sayimSatirlari', () => {
  it('ürünün bütün sayım alanlarını çıkarır', () => {
    const [satir] = sayimSatirlari([urun({ boxCount: 3, unitsPerBox: 12, looseCount: 4, unitPrice: 5 })]);
    expect(satir).toEqual({
      id: 'v1', ad: 'Su', kategori: 'İçecek',
      koli: 3, koliIci: 12, tekAdet: 4,
      toplamAdet: 40,   // 3 x 12 + 4
      birimFiyat: 5,
      tutar: 200,       // 40 x 5
    });
  });

  it('ekrandaki sırayı korur', () => {
    // Çıktı, kullanıcının ekranda gördüğü sırayla eşleşmeli; yoksa
    // kâğıttaki satırı ekranda aramak gerekirdi.
    const liste = [urun({ id: 'b', name: 'Kola' }), urun({ id: 'a', name: 'Ayran' })];
    expect(sayimSatirlari(liste).map((s) => s.ad)).toEqual(['Kola', 'Ayran']);
  });

  it('boş listede boş döner', () => {
    expect(sayimSatirlari([])).toEqual([]);
  });
});

describe('sayimCsvSatirlari', () => {
  it('başlık sayısı kadar hücre üretir', () => {
    // Sütun sayısı tutmazsa Excel'de veriler kayar; sessiz ve can sıkıcı.
    const satirlar = sayimCsvSatirlari([urun({ unitPrice: 5 })]);
    expect(satirlar[0]).toHaveLength(SAYIM_BASLIKLARI.length);
  });

  it('son sütunu (Sayım) boş bırakır', () => {
    // Kâğıt depoya götürülüp elle dolduruluyor.
    expect(SAYIM_BASLIKLARI[SAYIM_BASLIKLARI.length - 1]).toBe('Sayım');
    const [satir] = sayimCsvSatirlari([urun({ unitPrice: 5 })]);
    expect(satir[satir.length - 1]).toBe('');
  });

  it('Excel toplayabilsin diye ham sayı yazar, biçimlendirilmiş metin değil', () => {
    const [satir] = sayimCsvSatirlari([urun({ boxCount: 100, unitsPerBox: 24, unitPrice: 2.5 })]);
    expect(satir[5]).toBe(2400);   // toplam adet
    expect(satir[7]).toBe(6000);   // tutar
    satir.slice(2, 8).forEach((h) => expect(typeof h).toBe('number'));
  });
});
