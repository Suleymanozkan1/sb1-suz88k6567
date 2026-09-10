import { beforeEach, describe, expect, it } from 'vitest';
import {
  hasMovement, makeSafeMovement, movementsOf, naturalDirection, safeAllows,
  safeBalance, safeTotals, sourceNet,
} from './celikKasa';
import { localRepo } from './repo/local';
import { clearAll } from './storage';
import type { SafeMovement } from '../types';

/**
 * Çelik kasa.
 *
 * Kasadaki para, gelir/gider bakiyesinden ayrı tutulur. Buradaki testler
 * iki hesabın birbirine karışmamasını ve kasadaki paranın iki kez
 * sayılmamasını koruyor: çift sayım, kasadaki parayı olduğundan farklı
 * gösterir ve akşam sayımda tutmayan bir fark bırakır.
 *
 * Buna karşılık kasaya girip çıkan para yeniden kasaya konabilmeli; para
 * kasa ile banka arasında bir kez değil, sürekli gidip gelir.
 */

function hareket(over: Partial<SafeMovement> = {}): SafeMovement {
  return {
    id: 'm1', businessId: 'biz_test', date: '2026-09-12', direction: 'Giriş',
    amount: 1000, description: 'Gelir · Tahsilat', sourceKind: 'cash_flow',
    sourceId: 'cf1', createdAt: '2026-09-12T10:00:00.000Z', ...over,
  };
}

describe('safeBalance', () => {
  it('girişleri toplar, çıkışları düşer', () => {
    expect(safeBalance([
      hareket({ id: 'a', amount: 1000, direction: 'Giriş' }),
      hareket({ id: 'b', amount: 400, direction: 'Çıkış' }),
    ])).toBe(600);
  });

  it('hareket yoksa sıfırdır', () => {
    expect(safeBalance([])).toBe(0);
  });

  it('çıkış girişten fazlaysa eksiye düşer', () => {
    // Kasadan olduğundan fazla para çıkmışsa bu bir hatadır ve gizlenmemeli.
    expect(safeBalance([hareket({ direction: 'Çıkış', amount: 500 })])).toBe(-500);
  });
});

describe('safeTotals', () => {
  it('giren ve çıkanı ayrı verir', () => {
    expect(safeTotals([
      hareket({ id: 'a', amount: 1000, direction: 'Giriş' }),
      hareket({ id: 'b', amount: 250, direction: 'Giriş' }),
      hareket({ id: 'c', amount: 400, direction: 'Çıkış' }),
    ])).toEqual({ in: 1250, out: 400 });
  });
});

describe('movementsOf / sourceNet / safeAllows', () => {
  const hareketler = [
    hareket({ id: 'a', sourceId: 'cf1', direction: 'Giriş', amount: 1000 }),
    hareket({ id: 'b', sourceId: 'cf1', direction: 'Çıkış', amount: 1000 }),
    hareket({ id: 'c', sourceId: 'cf2', direction: 'Giriş', amount: 300 }),
  ];

  it('satıra ait hareketleri süzer', () => {
    expect(movementsOf(hareketler, 'cf1').map((m) => m.id)).toEqual(['a', 'b']);
    expect(movementsOf(hareketler, 'yok')).toEqual([]);
  });

  it('kasaya girip bankaya yatırılan satırın neti sıfırdır', () => {
    expect(sourceNet(hareketler, 'cf1')).toBe(0);
    expect(sourceNet(hareketler, 'cf2')).toBe(300);
    expect(sourceNet(hareketler, 'yok')).toBe(0);
  });

  it('satırın kasada hareketi var mı söyler', () => {
    expect(hasMovement(hareketler, 'cf1')).toBe(true);
    expect(hasMovement(hareketler, 'yok')).toBe(false);
  });

  it('kasada duran gelir tekrar eklenemez, çıkarılabilir', () => {
    expect(safeAllows(hareketler, 'cf2', 'Giriş', 'Gelir')).toBe(false);
    expect(safeAllows(hareketler, 'cf2', 'Çıkış', 'Gelir')).toBe(true);
  });

  it('girip çıkmış gelir yeniden eklenebilir', () => {
    expect(safeAllows(hareketler, 'cf1', 'Giriş', 'Gelir')).toBe(true);
    expect(safeAllows(hareketler, 'cf1', 'Çıkış', 'Gelir')).toBe(false);
  });

  it('hiç işlenmemiş gelir eklenebilir ama çıkarılamaz', () => {
    expect(safeAllows(hareketler, 'yok', 'Giriş', 'Gelir')).toBe(true);
    expect(safeAllows(hareketler, 'yok', 'Çıkış', 'Gelir')).toBe(false);
  });
});

describe('naturalDirection / gider yönü', () => {
  it('gelir kasaya girer, gider kasadan çıkar', () => {
    expect(naturalDirection('Gelir')).toBe('Giriş');
    expect(naturalDirection('Gider')).toBe('Çıkış');
  });

  it('işlenmemiş gider kasadan ödenebilir, kasaya eklenemez', () => {
    // Bildirilen hata: nakit ödenen maaş "kasaya ekle" ile kasayı
    // artırıyordu ve kasadan düşülemiyordu.
    expect(safeAllows([], 'cf9', 'Çıkış', 'Gider')).toBe(true);
    expect(safeAllows([], 'cf9', 'Giriş', 'Gider')).toBe(false);
  });

  it('kasadan ödenen gider geri alınabilir, ikinci kez ödenemez', () => {
    const odenmis = [hareket({ id: 'g', sourceId: 'cf9', direction: 'Çıkış', amount: 7500 })];
    expect(safeAllows(odenmis, 'cf9', 'Çıkış', 'Gider')).toBe(false);
    expect(safeAllows(odenmis, 'cf9', 'Giriş', 'Gider')).toBe(true);
    expect(sourceNet(odenmis, 'cf9')).toBe(-7500);
  });

  it('geri alınan gider yeniden kasadan ödenebilir', () => {
    const tur = [
      hareket({ id: 'g1', sourceId: 'cf9', direction: 'Çıkış', amount: 7500 }),
      hareket({ id: 'g2', sourceId: 'cf9', direction: 'Giriş', amount: 7500 }),
    ];
    expect(sourceNet(tur, 'cf9')).toBe(0);
    expect(safeAllows(tur, 'cf9', 'Çıkış', 'Gider')).toBe(true);
    expect(safeAllows(tur, 'cf9', 'Giriş', 'Gider')).toBe(false);
  });
});

describe('makeSafeMovement', () => {
  it('hareketin tarihini kaynağın tarihinden alır', () => {
    // Kasadaki para, kaydın tarihinde değişmiştir; kaydın açıldığı gün
    // ayrıca createdAt içinde durur.
    const m = makeSafeMovement({
      businessId: 'biz', date: '2026-05-05', direction: 'Giriş', amount: 500,
      description: 'Gelir · Tahsilat', sourceKind: 'cash_flow', sourceId: 'cf9',
    });
    expect(m.date).toBe('2026-05-05');
    expect(m.createdAt).not.toBe('');
    expect(m.id).toMatch(/^kasa_/);
  });

  it('her çağrıda ayrı kimlik üretir', () => {
    const girdi = {
      businessId: 'biz', date: '2026-05-05', direction: 'Giriş' as const, amount: 1,
      description: '', sourceKind: 'cash_flow' as const, sourceId: 'cf9',
    };
    expect(makeSafeMovement(girdi).id).not.toBe(makeSafeMovement(girdi).id);
  });
});

describe('depo: çelik kasa defteri', () => {
  beforeEach(() => { clearAll(); });

  const yaz = (over: Partial<SafeMovement> = {}) =>
    localRepo.addSafeMovement(hareket({ ...over }));

  it('yazılan hareketi geri verir', async () => {
    await yaz();
    const liste = await localRepo.listSafeMovements('biz_test');
    expect(liste).toHaveLength(1);
    expect(liste[0].amount).toBe(1000);
  });

  it('başka işletmenin hareketini vermez', async () => {
    await yaz();
    await yaz({ id: 'm2', businessId: 'biz_baska', sourceId: 'cf9' });
    expect(await localRepo.listSafeMovements('biz_test')).toHaveLength(1);
  });

  it('kasada duran satırı ikinci kez kasaya yazmaz', async () => {
    // İki kez tıklamak kasadaki parayı ikiye katlardı.
    await yaz();
    await expect(yaz({ id: 'm2' })).rejects.toThrow(/zaten çelik kasada/);
    expect(await localRepo.listSafeMovements('biz_test')).toHaveLength(1);
  });

  it('aynı satırın ters yönü yazılabilir', async () => {
    // Kasaya giren para sonradan bankaya yatırılabilir.
    await yaz();
    await yaz({ id: 'm2', direction: 'Çıkış' });
    expect(safeBalance(await localRepo.listSafeMovements('biz_test'))).toBe(0);
  });

  it('girip çıkan satır yeniden kasaya eklenebilir', async () => {
    // Kullanıcının bildirdiği hata: bir tur döndükten sonra satır kilitleniyordu.
    await yaz();
    await yaz({ id: 'm2', direction: 'Çıkış' });
    await yaz({ id: 'm3' });
    await yaz({ id: 'm4', direction: 'Çıkış' });
    await yaz({ id: 'm5' });

    const liste = await localRepo.listSafeMovements('biz_test');
    expect(liste).toHaveLength(5);
    expect(safeBalance(liste)).toBe(1000);
  });

  it('kasada olmayan satır kasadan çıkarılamaz', async () => {
    await expect(yaz({ direction: 'Çıkış' })).rejects.toThrow(/kasada değil/);
  });

  it('kasaya girenden fazlası çıkarılamaz', async () => {
    await yaz({ amount: 1000 });
    await expect(yaz({ id: 'm2', direction: 'Çıkış', amount: 1500 }))
      .rejects.toThrow(/fazlası işlenemez/);
  });

  it('sıfır ya da eksi tutarı reddeder', async () => {
    await expect(yaz({ amount: 0 })).rejects.toThrow(/sıfırdan büyük/);
    await expect(yaz({ amount: -5 })).rejects.toThrow(/sıfırdan büyük/);
  });

  it('hareketi siler', async () => {
    await yaz();
    await localRepo.deleteSafeMovement('m1');
    expect(await localRepo.listSafeMovements('biz_test')).toEqual([]);
  });

  it('silinen hareketin yönü yeniden yazılabilir', async () => {
    // Yanlış yöne basan kullanıcı düzeltebilmeli.
    await yaz();
    await localRepo.deleteSafeMovement('m1');
    await yaz({ id: 'm2' });
    expect(await localRepo.listSafeMovements('biz_test')).toHaveLength(1);
  });

  it('satırlar birbirini kilitlemez', async () => {
    await yaz({ id: 'a', sourceId: 'cf1' });
    await yaz({ id: 'b', sourceId: 'cf2' });
    expect(safeBalance(await localRepo.listSafeMovements('biz_test'))).toBe(2000);
  });

  it('gider kasadan ödenir, kasayı azaltır', async () => {
    // Bildirilen hata: nakit ödenen 7.500 TL'lik maaş kasayı ARTIRIYORDU.
    await localRepo.addCashFlow({
      id: 'gd1', businessId: 'biz_test', kind: 'Gider', date: '2026-09-12',
      category: 'Personel Maaş', amount: 7500, createdAt: '',
    });

    await expect(yaz({ id: 'g0', sourceId: 'gd1', direction: 'Giriş', amount: 7500 }))
      .rejects.toThrow(/düşülmemiş/);

    await yaz({ id: 'g1', sourceId: 'gd1', direction: 'Çıkış', amount: 7500 });
    expect(safeBalance(await localRepo.listSafeMovements('biz_test'))).toBe(-7500);
  });

  it('kasadan ödenen gider ikinci kez ödenemez, geri alınabilir', async () => {
    await localRepo.addCashFlow({
      id: 'gd1', businessId: 'biz_test', kind: 'Gider', date: '2026-09-12',
      category: 'Personel Maaş', amount: 7500, createdAt: '',
    });
    await yaz({ id: 'g1', sourceId: 'gd1', direction: 'Çıkış', amount: 7500 });

    await expect(yaz({ id: 'g2', sourceId: 'gd1', direction: 'Çıkış', amount: 7500 }))
      .rejects.toThrow(/zaten düşülmüş/);

    await yaz({ id: 'g3', sourceId: 'gd1', direction: 'Giriş', amount: 7500 });
    expect(safeBalance(await localRepo.listSafeMovements('biz_test'))).toBe(0);

    // Tur tamamlandı: gider yeniden kasadan ödenebilir.
    await yaz({ id: 'g4', sourceId: 'gd1', direction: 'Çıkış', amount: 7500 });
    expect(safeBalance(await localRepo.listSafeMovements('biz_test'))).toBe(-7500);
  });

  it('giderde kasadan düşülenden fazlası geri alınamaz', async () => {
    await localRepo.addCashFlow({
      id: 'gd1', businessId: 'biz_test', kind: 'Gider', date: '2026-09-12',
      category: 'Personel Maaş', amount: 7500, createdAt: '',
    });
    await yaz({ id: 'g1', sourceId: 'gd1', direction: 'Çıkış', amount: 7500 });
    await expect(yaz({ id: 'g2', sourceId: 'gd1', direction: 'Giriş', amount: 9000 }))
      .rejects.toThrow(/fazlası işlenemez/);
  });

  it('gelir ve gider kasada birbirini götürür', async () => {
    // Muhasebe bakiyesi ayrı; buradaki toplam kasadaki gerçek paradır.
    await localRepo.addCashFlow({
      id: 'gl1', businessId: 'biz_test', kind: 'Gelir', date: '2026-09-12',
      category: 'Diğer Gelir', amount: 10000, createdAt: '',
    });
    await localRepo.addCashFlow({
      id: 'gd1', businessId: 'biz_test', kind: 'Gider', date: '2026-09-12',
      category: 'Personel Maaş', amount: 4000, createdAt: '',
    });
    await yaz({ id: 'a', sourceId: 'gl1', direction: 'Giriş', amount: 10000 });
    await yaz({ id: 'b', sourceId: 'gd1', direction: 'Çıkış', amount: 4000 });
    expect(safeBalance(await localRepo.listSafeMovements('biz_test'))).toBe(6000);
  });

  it('gelir/gider kaydı silinince ona bağlı hareket de düşer', async () => {
    // Kalsaydı kasada kaynağı görünmeyen bir tutar dururdu.
    await localRepo.addCashFlow({
      id: 'cf1', businessId: 'biz_test', kind: 'Gelir', date: '2026-09-12',
      category: 'Diğer Gelir', amount: 1000, createdAt: '',
    });
    await yaz();
    await localRepo.deleteCashFlow('cf1');
    expect(await localRepo.listSafeMovements('biz_test')).toEqual([]);
  });

  it('tarihe göre yeniden eskiye sıralar', async () => {
    await yaz({ id: 'a', date: '2026-05-01', sourceId: 'cf1' });
    await yaz({ id: 'b', date: '2026-09-01', sourceId: 'cf2' });
    const liste = await localRepo.listSafeMovements('biz_test');
    expect(liste.map((m) => m.id)).toEqual(['b', 'a']);
  });

  it('rezervasyondan türeyen satır da kasaya işlenebilir', async () => {
    // Bu satır kasa tablosunda durmaz; kimliği "kapora:<id>" biçimindedir.
    await yaz({ sourceKind: 'reservation', sourceId: 'kapora:res_1' });
    const [m] = await localRepo.listSafeMovements('biz_test');
    expect(m.sourceKind).toBe('reservation');
    expect(m.sourceId).toBe('kapora:res_1');
  });
});
