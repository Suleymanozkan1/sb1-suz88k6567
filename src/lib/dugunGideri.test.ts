import { describe, expect, it } from 'vitest';
import {
  DUGUN_GIDERI_KATEGORISI, giderKasaSatirlari, giderToplami, giderlerToplami, netHesap,
} from './dugunGideri';
import type { Payment, Reservation, ReservationExpense } from '../types';

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
