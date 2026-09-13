import { describe, expect, it } from 'vitest';
import { demoUret } from './uret';

/*
  Üretilen demo verisinin ZAMAN SIRASI.

  Bu dosya görünüşü değil sırayı koruyor: sözleşme düğünden önce imzalanır,
  para ancak tahsil edildiği gün kasaya girer. Sıra bozulduğunda hata
  gürültülü değildi -- ileri tarihli bir düğünün kaporası "bugün kasada
  duran para" gibi görünüyor, kasa dağılımı ve gelir raporu gerçekte
  olmayan parayı sayıyordu.
*/
const BUGUN = new Date(2026, 8, 13);
const BUGUN_ISO = '2026-09-13';

function uret() {
  return demoUret({
    tohum: 20260913,
    adet: 300,
    pencere: { baslangicGun: -550, bitisGun: 550, bugun: BUGUN },
  });
}

describe('demo verisi zaman sırası', () => {
  it('sözleşme düğünden önce imzalanmış olur', () => {
    const { reservations } = uret();
    expect(reservations.length).toBeGreaterThan(100);
    for (const r of reservations) {
      expect((r.createdAt ?? '').slice(0, 10) <= r.date).toBe(true);
    }
  });

  it('sözleşme bugünden sonraya atılmaz', () => {
    // Henüz imzalanmamış bir sözleşme üretilmemeli.
    for (const r of uret().reservations) {
      expect((r.createdAt ?? '').slice(0, 10) <= BUGUN_ISO).toBe(true);
    }
  });

  it('tahsilat bugünü geçmez', () => {
    // İleri tarihli tahsilat, alınmamış parayı kasada gösterirdi.
    const { payments } = uret();
    expect(payments.length).toBeGreaterThan(50);
    for (const p of payments) expect(p.date <= BUGUN_ISO).toBe(true);
  });

  it('tahsilat sözleşmeden önce olmaz', () => {
    const { reservations, payments } = uret();
    const sozlesme = new Map(reservations.map((r) => [r.id, (r.createdAt ?? '').slice(0, 10)]));
    for (const p of payments) {
      expect(p.date >= sozlesme.get(p.reservationId)!).toBe(true);
    }
  });

  it('kasa satırı ileri tarihli olmaz', () => {
    const { cashFlow } = uret();
    expect(cashFlow.length).toBeGreaterThan(100);
    for (const e of cashFlow) expect(e.date <= BUGUN_ISO).toBe(true);
  });

  it('aday kaydı geçmişte açılır, sorduğu tarih ileridedir', () => {
    for (const a of uret().leads) {
      const acilis = a.createdAt.slice(0, 10);
      expect(acilis <= BUGUN_ISO).toBe(true);
      if (a.eventDate) expect(a.eventDate > acilis).toBe(true);
    }
  });

  it('aynı tohum aynı veriyi üretir', () => {
    // Demo her açılışta aynı görünmeli; ekran görüntüsü ve sunum buna dayanıyor.
    expect(JSON.stringify(uret())).toBe(JSON.stringify(uret()));
  });
});
