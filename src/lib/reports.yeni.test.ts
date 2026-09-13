import { describe, expect, it } from 'vitest';
import {
  ekGiderRaporu, haftalikRapor, ilRaporu, islemAyRaporu, isletmeRaporu,
  surecRaporu, tahsilatAyRaporu, tavsiyeRaporu, yilAyRaporu,
  type BalanceLookup,
} from './reports';
import type { Payment, Reservation } from '../types';

function rez(over: Partial<Reservation> = {}): Reservation {
  return {
    id: 'r1', businessId: 'b1', hallId: 'h1', code: '2026-1',
    customerName: 'Test', customerPhone: '5330000000',
    date: '2026-09-12', slot: 'Gece', organizationType: 'Düğün',
    guestCount: 200, totalAmount: 100000, deposit: 20000,
    currency: 'TL', status: 'Kesin Rezervasyon', colorKey: 'dugun',
    services: [], createdAt: '', updatedAt: '',
    ...over,
  };
}

/** Kapora + verilen tahsilat toplamı. */
function bakiye(odenen: Record<string, number> = {}): BalanceLookup {
  return {
    paid: (r) => r.deposit + (odenen[r.id] ?? 0),
    remaining: (r) => r.totalAmount - r.deposit - (odenen[r.id] ?? 0),
  };
}

describe('ilRaporu', () => {
  it('ile göre gruplar, büyük/küçük harfi aynı sayar', () => {
    const satirlar = ilRaporu([
      rez({ id: 'a', city: 'Konya' }),
      rez({ id: 'b', city: 'konya', totalAmount: 50000 }),
      rez({ id: 'c', city: 'Ankara', totalAmount: 30000 }),
    ], bakiye());
    expect(satirlar).toHaveLength(2);
    expect(satirlar[0]).toMatchObject({ etiket: 'Konya', count: 2, total: 150000 });
  });

  it('boş ili UYDURMAZ, Belirtilmemiş satırında toplar', () => {
    const satirlar = ilRaporu([rez({ id: 'a' }), rez({ id: 'b', city: '  ' })], bakiye());
    expect(satirlar).toHaveLength(1);
    expect(satirlar[0]?.etiket).toBe('Belirtilmemiş');
    expect(satirlar[0]?.count).toBe(2);
  });
});

describe('tavsiyeRaporu', () => {
  it('yalnızca tavsiye kanalını alır', () => {
    const satirlar = tavsiyeRaporu([
      rez({ id: 'a', sourceChannel: 'Tavsiye', sourceDetail: 'Ayşe Yılmaz' }),
      rez({ id: 'b', sourceChannel: 'Tavsiye', sourceDetail: 'ayşe yılmaz', totalAmount: 20000 }),
      // Instagram'ın açıklaması da sourceDetail'de; rapora girmemeli.
      rez({ id: 'c', sourceChannel: 'Instagram', sourceDetail: 'reklam' }),
    ], bakiye());
    expect(satirlar).toHaveLength(1);
    expect(satirlar[0]).toMatchObject({ etiket: 'Ayşe Yılmaz', count: 2 });
  });

  it('eski Referans kanalını da sayar', () => {
    const satirlar = tavsiyeRaporu(
      [rez({ sourceChannel: 'Referans', sourceDetail: 'Mehmet' })], bakiye(),
    );
    expect(satirlar[0]?.etiket).toBe('Mehmet');
  });

  it('tavsiye edeni yazılmamış kaydı ayrı satırda gösterir', () => {
    const satirlar = tavsiyeRaporu([rez({ sourceChannel: 'Tavsiye' })], bakiye());
    expect(satirlar[0]?.etiket).toMatch(/tavsiye eden yazılmamış/);
  });
});

describe('isletmeRaporu', () => {
  it('işletmeye göre ayırır', () => {
    const satirlar = isletmeRaporu([
      rez({ id: 'a', businessId: 'b1' }),
      rez({ id: 'b', businessId: 'b2', totalAmount: 300000 }),
    ], bakiye(), (id) => (id === 'b1' ? 'Sahra' : 'Kristal'));
    expect(satirlar[0]).toMatchObject({ etiket: 'Kristal', total: 300000 });
    expect(satirlar[1]?.etiket).toBe('Sahra');
  });
});

describe('haftalikRapor', () => {
  it('haftayı pazartesiden başlatır', () => {
    // 2026-09-12 cumartesi; haftası 2026-09-07 pazartesi.
    const satirlar = haftalikRapor([rez({ date: '2026-09-12' })], bakiye());
    expect(satirlar[0]?.baslangic).toBe('2026-09-07');
    expect(satirlar[0]?.bitis).toBe('2026-09-13');
  });

  it('pazar gününü bir önceki haftaya yazar', () => {
    /*
      Salonun yoğun iki günü cumartesi-pazar. Hafta pazardan başlasaydı
      aynı hafta sonu iki ayrı satıra bölünürdü.
    */
    const satirlar = haftalikRapor([
      rez({ id: 'a', date: '2026-09-12' }),
      rez({ id: 'b', date: '2026-09-13' }),
    ], bakiye());
    expect(satirlar).toHaveLength(1);
    expect(satirlar[0]?.count).toBe(2);
  });

  it('yeniden eskiye sıralar', () => {
    const satirlar = haftalikRapor([
      rez({ id: 'a', date: '2026-09-12' }),
      rez({ id: 'b', date: '2026-10-10' }),
    ], bakiye());
    expect(satirlar[0]?.baslangic > satirlar[1]!.baslangic).toBe(true);
  });
});

describe('yilAyRaporu', () => {
  it('yılı satır, ayı sütun yapar', () => {
    const satirlar = yilAyRaporu([
      rez({ id: 'a', date: '2026-09-12' }),
      rez({ id: 'b', date: '2026-09-19', totalAmount: 50000 }),
      rez({ id: 'c', date: '2025-09-20', totalAmount: 40000 }),
    ]);
    expect(satirlar.map((s) => s.yil)).toEqual([2026, 2025]);
    expect(satirlar[0]?.aylar[8]).toEqual({ count: 2, total: 150000, guests: 400 });
    expect(satirlar[0]?.aylar[0]).toEqual({ count: 0, total: 0, guests: 0 });
    expect(satirlar[0]?.toplam.count).toBe(2);
  });
});

describe('tahsilatAyRaporu', () => {
  const odeme = (o: Partial<Payment>): Payment => ({
    id: 'p', reservationId: 'r1', date: '2026-03-10', amount: 1000,
    method: 'Nakit', createdAt: '', ...o,
  });

  it('parayı KASAYA GİRDİĞİ aya yazar', () => {
    const satirlar = tahsilatAyRaporu([
      odeme({ id: 'p1', date: '2026-03-10', amount: 20000 }),
      odeme({ id: 'p2', date: '2026-09-01', amount: 80000 }),
    ]);
    expect(satirlar.map((s) => s.donem)).toEqual(['2026-09', '2026-03']);
    expect(satirlar[1]?.tutar).toBe(20000);
  });

  it('ödeme tipine göre dağıtır', () => {
    const satirlar = tahsilatAyRaporu([
      odeme({ id: 'p1', amount: 1000, method: 'Nakit' }),
      odeme({ id: 'p2', amount: 2000, method: 'Havale/EFT' }),
      odeme({ id: 'p3', amount: 500, method: 'Nakit' }),
    ]);
    expect(satirlar[0]?.tipler).toEqual({ Nakit: 1500, 'Havale/EFT': 2000 });
    expect(satirlar[0]?.adet).toBe(3);
  });
});

describe('islemAyRaporu', () => {
  it('olayları aya ve türe göre sayar', () => {
    const satirlar = islemAyRaporu([
      { event: 'eklendi', createdAt: '2026-09-01T10:00:00Z' },
      { event: 'eklendi', createdAt: '2026-09-05T10:00:00Z' },
      { event: 'silindi', createdAt: '2026-09-06T10:00:00Z' },
      { event: 'eklendi', createdAt: '2026-08-01T10:00:00Z' },
    ]);
    expect(satirlar[0]).toMatchObject({
      donem: '2026-09', toplam: 3, olaylar: { eklendi: 2, silindi: 1 },
    });
  });

  it('tarihsiz kaydı atar', () => {
    expect(islemAyRaporu([{ event: 'eklendi', createdAt: '' }])).toEqual([]);
  });
});

describe('surecRaporu', () => {
  it('iş bekleyeni üste alır', () => {
    const satirlar = surecRaporu([
      rez({ id: 'tam', deposit: 100000, date: '2026-12-01' }),
      rez({ id: 'kaporasiz', deposit: 0, date: '2026-11-01' }),
    ], bakiye(), '2026-09-13');
    expect(satirlar[0]?.reservation.id).toBe('kaporasiz');
    expect(satirlar[0]?.sonraki).toBe('Kapora alınmadı');
    expect(satirlar[1]?.sonraki).toBe('');
  });

  it('düğüne bir hafta kalmış açık bakiyeyi ayrı uyarır', () => {
    const satirlar = surecRaporu(
      [rez({ date: '2026-09-18' })], bakiye(), '2026-09-13',
    );
    expect(satirlar[0]?.sonraki).toMatch(/bir hafta kaldı/);
    expect(satirlar[0]?.kalanGun).toBe(5);
  });

  it('geçmiş düğünün açık bakiyesini ayrı uyarır', () => {
    const satirlar = surecRaporu(
      [rez({ date: '2026-08-01' })], bakiye(), '2026-09-13',
    );
    expect(satirlar[0]?.sonraki).toMatch(/Düğün geçti/);
  });

  it('tahsilat yüzdesini hesaplar', () => {
    const satirlar = surecRaporu([rez({ deposit: 25000 })], bakiye(), '2026-09-13');
    expect(satirlar[0]?.yuzde).toBe(25);
  });

  it('iptal edileni hiç almaz', () => {
    expect(surecRaporu([rez({ status: 'İptal' })], bakiye(), '2026-09-13')).toEqual([]);
  });

  it('sıfır tutarlı kayıtta bölme hatası vermez', () => {
    const satirlar = surecRaporu(
      [rez({ totalAmount: 0, deposit: 0 })], bakiye(), '2026-09-13',
    );
    expect(satirlar[0]?.yuzde).toBe(0);
  });
});

describe('ekGiderRaporu', () => {
  it('kalemi toplar ve kaç organizasyonda geçtiğini sayar', () => {
    const satirlar = ekGiderRaporu([
      { reservationId: 'r1', kind: 'Garson', unitCount: 5, unitPrice: 1000 },
      { reservationId: 'r2', kind: 'garson', unitCount: 3, unitPrice: 1000 },
      { reservationId: 'r1', kind: 'DJ', unitCount: 1, unitPrice: 15000 },
    ]);
    // Tutara göre sıralı: DJ tek kalemde 15.000, garson toplamda 8.000.
    expect(satirlar[0]).toMatchObject({ kind: 'DJ', adet: 1, organizasyon: 1, tutar: 15000 });
    expect(satirlar[1]).toMatchObject({ kind: 'Garson', adet: 8, organizasyon: 2, tutar: 8000 });
  });

  it('adsız kalemi Belirtilmemiş sayar', () => {
    const satirlar = ekGiderRaporu([
      { reservationId: 'r1', kind: '   ', unitCount: 1, unitPrice: 100 },
    ]);
    expect(satirlar[0]?.kind).toBe('Belirtilmemiş');
  });
});
