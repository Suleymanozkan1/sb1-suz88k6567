import { describe, expect, it } from 'vitest';
import {
  DUGUN_GIDERI_KATEGORISI, giderKasaSatirlari, giderToplami, giderlerToplami, netHesap,
  tedarikciGiderleri, tedarikcidenMi,
} from './dugunGideri';
import type {
  Payment, Reservation, ReservationExpense, ReservationVendor, Vendor,
} from '../types';

/**
 * Düğün içi gider hesabı.
 *
 * Giderler kasa tablosuna YAZILMAZ, türetilir. Yazılsalardı bir gider
 * düzeltildiğinde ya da silindiğinde kasa rezervasyondan kopar ve aynı
 * para iki yerde farklı görünürdü; testler o ayrımı korur.
 */

function rez(over: Partial<Reservation> = {}): Reservation {
  return {
    id: 'r1', businessId: 'b1', hallId: 'h1', code: '2026-135',
    customerName: 'Zuhal Rana', customerPhone: '5330000001',
    date: '2026-09-12', slot: 'Gece', organizationType: 'Düğün',
    guestCount: 300, totalAmount: 100000, deposit: 30000, currency: 'TL',
    status: 'Kesin Rezervasyon', colorKey: 'dugun', services: [],
    createdAt: '2026-05-18T09:00:00.000Z', updatedAt: '', ...over,
  };
}

function gider(over: Partial<ReservationExpense> = {}): ReservationExpense {
  return {
    id: 'g1', businessId: 'b1', reservationId: 'r1',
    kind: 'Garson', unitCount: 10, unitPrice: 2000, note: '',
    createdAt: '', updatedAt: '', ...over,
  };
}

function odeme(over: Partial<Payment> = {}): Payment {
  return {
    id: 'p1', reservationId: 'r1', date: '2026-09-12', amount: 70000,
    method: 'Nakit', createdAt: '', ...over,
  };
}

describe('giderToplami', () => {
  it('birim ile birim fiyatı çarpar', () => {
    expect(giderToplami(gider())).toBe(20000);
  });

  /*
    Toplam ayrı bir alan değil, hesap. Ayrı dursaydı üç sayı birbirini
    tutmadığında hangisinin doğru olduğu bilinemezdi.
  */
  it('ondalıklı birimi destekler', () => {
    expect(giderToplami(gider({ unitCount: 2.5, unitPrice: 400 }))).toBe(1000);
  });

  it('bedelsiz hizmeti sıfır sayar ama satırı yok saymaz', () => {
    expect(giderToplami(gider({ unitPrice: 0 }))).toBe(0);
  });
});

describe('giderlerToplami', () => {
  it('bütün satırları toplar', () => {
    expect(giderlerToplami([
      gider({ id: 'g1', unitCount: 10, unitPrice: 2000 }),
      gider({ id: 'g2', kind: 'DJ', unitCount: 1, unitPrice: 8000 }),
    ])).toBe(28000);
  });

  it('gider yoksa sıfır döner', () => {
    expect(giderlerToplami([])).toBe(0);
  });
});

describe('netHesap', () => {
  it('kalan bakiye varsa onu taban alır', () => {
    const h = netHesap(rez(), [odeme()], [gider()], 30000);
    expect(h.tabanKaynagi).toBe('kalan');
    expect(h.taban).toBe(30000);
    expect(h.net).toBe(10000);
  });

  /*
    Kalan yoksa gider son tahsilattan karşılanmış olur; "hiç para alınmamış"
    gibi davranmak neti olduğundan kötü gösterirdi.
  */
  it('kalan bakiye yoksa son tahsilatı taban alır', () => {
    const h = netHesap(rez(), [
      odeme({ id: 'p1', date: '2026-08-01', amount: 20000 }),
      odeme({ id: 'p2', date: '2026-09-10', amount: 45000 }),
    ], [gider()], 0);
    expect(h.tabanKaynagi).toBe('sonOdeme');
    expect(h.taban).toBe(45000);
    expect(h.net).toBe(25000);
  });

  it('tahsilat kaydı yoksa kaporayı taban alır', () => {
    const h = netHesap(rez({ deposit: 25000 }), [], [gider({ unitPrice: 1000 })], 0);
    expect(h.tabanKaynagi).toBe('sonOdeme');
    expect(h.taban).toBe(25000);
    expect(h.net).toBe(15000);
  });

  it('hiç tahsilat yoksa tabanı sıfır bırakır', () => {
    const h = netHesap(rez({ deposit: 0 }), [], [gider()], 0);
    expect(h.tabanKaynagi).toBe('yok');
    expect(h.taban).toBe(0);
    expect(h.net).toBe(-20000);
  });

  /*
    Net eksi olabilir ve gizlenmez: giderleri kalan bakiyeyi aşan bir
    organizasyon zarardadır ve bunu ekranda görmek gerekir.
  */
  it('giderler tabanı aşarsa eksi net verir', () => {
    const h = netHesap(rez(), [odeme()], [gider({ unitPrice: 5000 })], 30000);
    expect(h.net).toBe(-20000);
  });

  it('gider yoksa net tabana eşittir', () => {
    expect(netHesap(rez(), [odeme()], [], 30000).net).toBe(30000);
  });
});

describe('giderKasaSatirlari', () => {
  const taraflar = (r: Reservation) => r.customerName;

  it('gideri sözleşme numarasıyla kasa satırına çevirir', () => {
    const [satir] = giderKasaSatirlari([gider()], [rez()], taraflar);
    expect(satir.category).toBe(DUGUN_GIDERI_KATEGORISI);
    expect(satir.amount).toBe(20000);
    expect(satir.contractNo).toBe('2026-135');
    expect(satir.kind).toBe('Garson');
  });

  /*
    Satır kimliği kasa tablosundaki bir satıra karşılık gelmez; türetilmiş
    olduğu kimlikten de anlaşılsın.
  */
  it('türetilmiş kimlik üretir', () => {
    expect(giderKasaSatirlari([gider()], [rez()], taraflar)[0].id).toBe('dugun-gider:g1');
  });

  // Gider düğün günü yapılır; aylık raporda düğünle aynı aya düşmeli.
  it('tarih olarak organizasyon gününü kullanır', () => {
    expect(giderKasaSatirlari([gider()], [rez()], taraflar)[0].date).toBe('2026-09-12');
  });

  it('iptal edilmiş rezervasyonun giderini kasaya almaz', () => {
    expect(giderKasaSatirlari([gider()], [rez({ status: 'İptal' })], taraflar)).toEqual([]);
  });

  it('rezervasyonu bulunmayan gideri atlar', () => {
    expect(giderKasaSatirlari([gider({ reservationId: 'yok' })], [rez()], taraflar)).toEqual([]);
  });

  it('satırları yeniden eskiye sıralar', () => {
    const satirlar = giderKasaSatirlari(
      [gider({ id: 'g1', reservationId: 'r1' }), gider({ id: 'g2', reservationId: 'r2' })],
      [rez(), rez({ id: 'r2', date: '2026-10-04', code: '2026-140' })],
      taraflar,
    );
    expect(satirlar.map((s) => s.date)).toEqual(['2026-10-04', '2026-09-12']);
  });
});


/*
  Tedarikçi ücretleri ("Ürün ve Hizmet" bölümü) düğünün maliyetidir ama
  gider defterine hiç girmiyordu: net tutar, kasa ve kâr raporu bu parayı
  görmüyordu. 60.500 ₺ tedarikçi ödemesi olan bir düğün kârlı
  görünebiliyordu.

  Satırlar KAYDEDİLMİYOR, okunduğu anda türetiliyor: kaydedilseydi bir
  ücret düzeltildiğinde gider satırı geride kalır, aynı para iki yerde
  farklı görünürdü.
*/
describe('tedarikçi ücretleri düğün içi gidere sayılıyor', () => {
  const tedarikci = (over: Partial<Vendor> = {}): Vendor => ({
    id: 'v1', businessId: 'b1', name: 'Lale Çiçekçilik', category: 'Çiçek / Süsleme',
    kind: 'hizmet', phone: '', note: '', unitPrice: 0,
    boxCount: 0, unitsPerBox: 0, looseCount: 0, isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  } as Vendor);

  const atama = (over: Partial<ReservationVendor> = {}): ReservationVendor => ({
    id: 'rv1', reservationId: 'r1', vendorId: 'v1', cost: 6500, note: '', ...over,
  });

  it('her ücretli tedarikçi bir gider satırına dönüşüyor', () => {
    const satirlar = tedarikciGiderleri(
      [atama(), atama({ id: 'rv2', vendorId: 'v2', cost: 45000 })],
      [tedarikci(), tedarikci({ id: 'v2', name: 'Buz Gösterisi' })],
      'b1',
    );

    expect(satirlar).toHaveLength(2);
    expect(giderlerToplami(satirlar)).toBe(51500);
    // Kalem adı tedarikçinin adı: defterde kategoriden daha anlaşılır.
    expect(satirlar[0].kind).toBe('Lale Çiçekçilik');
    expect(satirlar[1].kind).toBe('Buz Gösterisi');
  });

  it('ücretsiz tedarikçi defteri uzatmıyor', () => {
    expect(tedarikciGiderleri([atama({ cost: 0 })], [tedarikci()], 'b1')).toHaveLength(0);
  });

  it('türetilmiş satır işaretli, elle girilen değil', () => {
    const [tedarikciSatiri] = tedarikciGiderleri([atama()], [tedarikci()], 'b1');
    expect(tedarikcidenMi(tedarikciSatiri)).toBe(true);
    expect(tedarikcidenMi(gider())).toBe(false);
  });

  it('silinmiş tedarikçide satır kayboluyor değil, adsız kalıyor', () => {
    /*
      Tedarikçi kaydı silinse bile PARA HARCANMIŞ durumda. Satır düşürülse
      kâr olduğundan yüksek görünürdü; adı bilinmiyorsa da tutar defterde
      kalmalı.
    */
    const [satir] = tedarikciGiderleri([atama()], [], 'b1');
    expect(satir.kind).toBe('Tedarikçi');
    expect(giderToplami(satir)).toBe(6500);
  });

  it('net hesap tedarikçi ücretini de düşüyor', () => {
    const tedarikciGider = tedarikciGiderleri([atama({ cost: 20000 })], [tedarikci()], 'b1');
    const hepsi = [...tedarikciGider];
    // Kalan bakiye 50.000, tedarikçi 20.000 -> elde 30.000 kalıyor.
    expect(netHesap(rez(), [], hepsi, 50000).net).toBe(30000);
  });

  it('kasa satırı tedarikçi giderinden de çıkıyor', () => {
    const tedarikciGider = tedarikciGiderleri([atama({ cost: 9000 })], [tedarikci()], 'b1');
    const satirlar = giderKasaSatirlari(tedarikciGider, [rez()], () => 'Zuhal & Rana');

    expect(satirlar).toHaveLength(1);
    expect(satirlar[0].amount).toBe(9000);
    expect(satirlar[0].category).toBe(DUGUN_GIDERI_KATEGORISI);
    // Tarih organizasyonun günü: aylık raporda düğünle aynı aya düşmeli.
    expect(satirlar[0].date).toBe('2026-09-12');
  });
});
