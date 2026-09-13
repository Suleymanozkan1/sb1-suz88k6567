import { describe, expect, it } from 'vitest';
import { kritikStokSayisi, stokDurumu, stokToplami, stokUrunleri } from './stok';
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
