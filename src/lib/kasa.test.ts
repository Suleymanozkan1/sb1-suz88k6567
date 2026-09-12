import { describe, expect, it } from 'vitest';
import { girdidenHareket, kasaBakiyesi, kasaDagilimi, kasaHareketleri } from './kasa';
import type { CashFlowEntry } from '../types';
import type { ReservationIncomeRow } from './reports';

/**
 * Kasa hesabı.
 *
 * Bu dosyanın asıl derdi: kasada duran paranın ne kadarının nerede
 * olduğunu doğru söylemek. Eskiden bu bilgi elle işaretlenen ayrı bir
 * defterdeydi (çelik kasa) ve unutulan her işaret kasayı olduğundan
 * farklı gösteriyordu. Artık ödeme tipinden çıkıyor.
 */
const g = (over: Partial<CashFlowEntry> = {}): CashFlowEntry => ({
  id: 'c1', businessId: 'b1', kind: 'Gelir', date: '2026-09-10',
  category: 'Kapora', amount: 1000, createdAt: '', ...over,
});

const r = (over: Partial<ReservationIncomeRow> = {}): ReservationIncomeRow => ({
  id: 'kapora:x', reservationId: 'x', date: '2026-09-12', category: 'Kapora',
  amount: 5000, contractNo: '2026-1', customerName: 'Ömer Ay', parties: 'Ömer Ay',
  ...over,
});

describe('gelir/gider hareketi', () => {
  it('geliri artı, gideri eksi sayar', () => {
    expect(girdidenHareket(g({ kind: 'Gelir', amount: 1000 })).tutar).toBe(1000);
    expect(girdidenHareket(g({ kind: 'Gider', amount: 1000 })).tutar).toBe(-1000);
  });

  it('ödeme tipini taşır', () => {
    expect(girdidenHareket(g({ method: 'Nakit' })).method).toBe('Nakit');
  });
});

describe('kasa dağılımı', () => {
  it('kanalları sabit sırada döndürür', () => {
    // Ekranda her yenilemede yer değiştiren kalem okunamaz olur.
    const d = kasaDagilimi([]);
    expect(d.kanallar.map((k) => k.method)).toEqual(['Nakit', 'Kredi Kartı', 'Havale/EFT']);
  });

  it('parayı kanallara ayırır', () => {
    const d = kasaDagilimi([
      { tutar: 200000, method: 'Nakit' },
      { tutar: 180000, method: 'Kredi Kartı' },
      { tutar: 500, method: 'Havale/EFT' },
    ]);
    expect(d.kanallar.find((k) => k.method === 'Nakit')?.tutar).toBe(200000);
    expect(d.kanallar.find((k) => k.method === 'Kredi Kartı')?.tutar).toBe(180000);
    expect(d.toplam).toBe(380500);
  });

  it('aynı kanaldaki giriş ve çıkışı netleştirir', () => {
    const d = kasaDagilimi([
      { tutar: 10000, method: 'Nakit' },
      { tutar: -4000, method: 'Nakit' },
    ]);
    expect(d.kanallar.find((k) => k.method === 'Nakit')?.tutar).toBe(6000);
  });

  it('tipi bilinmeyen kaydı bir kanala YAZMAZ', () => {
    /*
      Ödeme tipi alanı sonradan eklendi; eski satırların tipi gerçekten
      bilinmiyor. "Nakit" varsaymak uydurma bir veri üretir ve dağılımı
      sessizce yanlış gösterirdi.
    */
    const d = kasaDagilimi([{ tutar: 7000 }, { tutar: 3000, method: 'Nakit' }]);
    expect(d.belirtilmemis).toBe(7000);
    expect(d.kanallar.find((k) => k.method === 'Nakit')?.tutar).toBe(3000);
    // Ama toplamdan da DÜŞMÜYOR: para gerçekten kasada.
    expect(d.toplam).toBe(10000);
  });

  it('çek ve senedi kasa toplamına KATMAZ', () => {
    /*
      İkisi de henüz tahsil edilmemiş bir vaattir. Kasadaki parayla
      toplanırsa kasa olduğundan büyük görünür ve gerçekte olmayan bir
      paraya göre karar alınır.
    */
    const d = kasaDagilimi([
      { tutar: 1000, method: 'Nakit' },
      { tutar: 50000, method: 'Çek' },
      { tutar: 20000, method: 'Senet' },
    ]);
    expect(d.toplam).toBe(1000);
    expect(d.tahsilEdilmemis).toBe(70000);
  });

  it('bakiye dağılımın toplamıyla aynıdır', () => {
    // İki ayrı hesap yazılsaydı biri diğerini tutmazdı.
    const h = [{ tutar: 5000, method: 'Nakit' as const }, { tutar: -1200 }];
    expect(kasaBakiyesi(h)).toBe(kasaDagilimi(h).toplam);
  });
});

describe('hareketleri toplama', () => {
  it('gelir/gider ve rezervasyon tahsilatlarını birlikte sayar', () => {
    const h = kasaHareketleri([g({ amount: 1000, method: 'Nakit' })], [r({ amount: 5000, method: 'Havale/EFT' })]);
    expect(kasaDagilimi(h).toplam).toBe(6000);
  });

  it('ay öneki verilince yalnızca o ayı sayar', () => {
    const h = kasaHareketleri(
      [g({ date: '2026-09-10', amount: 1000 }), g({ id: 'c2', date: '2026-08-10', amount: 9999 })],
      [r({ date: '2026-09-12', amount: 5000 }), r({ id: 'k2', date: '2026-07-01', amount: 8888 })],
      '2026-09',
    );
    expect(kasaDagilimi(h).toplam).toBe(6000);
  });

  it('ay öneki verilmezse hepsini sayar', () => {
    const h = kasaHareketleri(
      [g({ date: '2026-09-10', amount: 1000 }), g({ id: 'c2', date: '2026-08-10', amount: 2000 })],
      [],
    );
    expect(kasaDagilimi(h).toplam).toBe(3000);
  });

  it('boş listede sıfır döner, çökmez', () => {
    const d = kasaDagilimi(kasaHareketleri([], []));
    expect(d.toplam).toBe(0);
    expect(d.belirtilmemis).toBe(0);
    expect(d.tahsilEdilmemis).toBe(0);
  });
});
