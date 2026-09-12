import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  balanceReport, channelReport, downloadCsv, KANAL_BELIRTILMEMIS, lastMonthsReport,
  monthReport, programReport, slotReport, summarize, toCsv, withinRange,
} from './reports';
import { uid } from './ids';
import { makeBalanceLookup } from './money';
import { clearAll } from './storage';
import type { Payment } from '../types';
import type { Reservation } from '../types';

function make(over: Partial<Reservation> = {}): Reservation {
  return {
    id: uid('res'),
    businessId: 'biz_test', hallId: 'hall_test',
    code: '2026-1',
    customerName: 'Müşteri',
    customerPhone: '5321112233',
    date: '2026-03-10',
    slot: 'Gece',
    organizationType: 'Düğün',
    guestCount: 200,
    totalAmount: 100000,
    deposit: 25000,
    currency: 'TL',
    status: 'Kesin Rezervasyon',
    colorKey: 'dugun',
    services: [],
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

/** Tahsilatsız senaryolar için sabit çözücü */
const NO_PAYMENTS = makeBalanceLookup([]);
const lookup = (payments: Payment[]) => makeBalanceLookup(payments);

/** Testler artık depoya yazmaz; rezervasyonlar doğrudan kullanılır. */
const keep = (r: Reservation) => r;

beforeEach(() => clearAll());

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('withinRange', () => {
  it('boş aralıkta her tarihi kabul eder', () => {
    expect(withinRange('2026-05-01', { from: '', to: '' })).toBe(true);
  });

  it('sınır tarihlerini dahil eder', () => {
    expect(withinRange('2026-05-01', { from: '2026-05-01', to: '2026-05-31' })).toBe(true);
    expect(withinRange('2026-05-31', { from: '2026-05-01', to: '2026-05-31' })).toBe(true);
  });

  it('aralık dışını eler', () => {
    expect(withinRange('2026-04-30', { from: '2026-05-01', to: '2026-05-31' })).toBe(false);
    expect(withinRange('2026-06-01', { from: '2026-05-01', to: '2026-05-31' })).toBe(false);
  });
});

describe('summarize', () => {
  it('boş listede sıfır döner', () => {
    expect(summarize([], NO_PAYMENTS)).toEqual({ count: 0, total: 0, collected: 0, remaining: 0, guests: 0 });
  });

  it('tutar, tahsilat, bakiye ve davetliyi toplar', () => {
    const a = keep(make({ totalAmount: 100000, deposit: 25000, guestCount: 200 }));
    const b = keep(make({ totalAmount: 60000, deposit: 60000, guestCount: 150 }));
    const t = summarize([a, b], NO_PAYMENTS);
    expect(t.count).toBe(2);
    expect(t.total).toBe(160000);
    expect(t.collected).toBe(85000);
    expect(t.remaining).toBe(75000);
    expect(t.guests).toBe(350);
  });

  it('ek tahsilatları da hesaba katar', () => {
    const r = keep(make({ totalAmount: 100000, deposit: 20000 }));
    const t = summarize([r], lookup([
      { id: uid('pay'), reservationId: r.id, date: '2026-03-01', amount: 40000, method: 'Nakit', createdAt: '' },
    ]));
    expect(t.collected).toBe(60000);
    expect(t.remaining).toBe(40000);
  });
});

describe('programReport', () => {
  it('organizasyon türüne göre gruplar ve ciroya göre sıralar', () => {
    const rows = programReport([
      keep(make({ organizationType: 'Kına', totalAmount: 20000, deposit: 0 })),
      keep(make({ organizationType: 'Düğün', totalAmount: 150000, deposit: 0 })),
      keep(make({ organizationType: 'Düğün', totalAmount: 50000, deposit: 0 })),
    ], NO_PAYMENTS);
    expect(rows[0].organizationType).toBe('Düğün');
    expect(rows[0].count).toBe(2);
    expect(rows[0].total).toBe(200000);
    expect(rows[1].organizationType).toBe('Kına');
  });
});

describe('monthReport', () => {
  it('aylara göre gruplar ve kronolojik sıralar', () => {
    const rows = monthReport([
      keep(make({ date: '2026-05-04' })),
      keep(make({ date: '2026-03-10' })),
      keep(make({ date: '2026-03-22' })),
    ], NO_PAYMENTS);
    expect(rows.map((r) => r.label)).toEqual(['Mart 2026', 'Mayıs 2026']);
    expect(rows[0].count).toBe(2);
  });

  it('yıl geçişini doğru sıralar', () => {
    const rows = monthReport([
      keep(make({ date: '2027-01-05' })),
      keep(make({ date: '2026-12-20' })),
    ], NO_PAYMENTS);
    expect(rows.map((r) => r.label)).toEqual(['Aralık 2026', 'Ocak 2027']);
  });
});

describe('balanceReport — gelecek kaporalar ve ödemeler', () => {
  const BUGUN = '2026-03-01';

  it('yalnızca borcu kalan kayıtları listeler', () => {
    const paid = keep(make({ totalAmount: 50000, deposit: 50000 }));
    const open1 = keep(make({ totalAmount: 80000, deposit: 70000 }));
    const open2 = keep(make({ totalAmount: 200000, deposit: 20000 }));
    const rows = balanceReport([paid, open1, open2], NO_PAYMENTS, BUGUN);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.remaining).sort((a, b) => a - b)).toEqual([10000, 180000]);
  });

  /*
    Sıralama tutara göre değil tarihe göre: bu ekranın sorusu "hangi para
    ne zaman gelecek". En büyük alacak altı ay sonraki bir düğüne aitken
    bu haftaki tahsilat listenin dibinde kalıyordu.
  */
  it('yakın tarihli kaydı büyük tutarlı uzak kayıttan önce verir', () => {
    const yakin = keep(make({ date: '2026-03-05', totalAmount: 80000, deposit: 70000 }));
    const uzak = keep(make({ date: '2026-11-20', totalAmount: 400000, deposit: 20000 }));
    const rows = balanceReport([uzak, yakin], NO_PAYMENTS, BUGUN);
    expect(rows.map((r) => r.reservation.id)).toEqual([yakin.id, uzak.id]);
  });

  it('günü geçmiş ama bakiyesi kapanmamış kaydı en başa alır ve gecikmiş sayar', () => {
    const gecmis = keep(make({ date: '2026-02-10', totalAmount: 90000, deposit: 10000 }));
    const gelecek = keep(make({ date: '2026-03-05', totalAmount: 90000, deposit: 10000 }));
    const rows = balanceReport([gelecek, gecmis], NO_PAYMENTS, BUGUN);
    expect(rows[0].reservation.id).toBe(gecmis.id);
    expect(rows[0].overdue).toBe(true);
    expect(rows[0].daysLeft).toBe(-19);
    expect(rows[1].overdue).toBe(false);
    expect(rows[1].daysLeft).toBe(4);
  });

  it('aynı güne düşen iki kayıtta büyük alacağı üstte tutar', () => {
    const kucuk = keep(make({ date: '2026-03-05', totalAmount: 80000, deposit: 70000 }));
    const buyuk = keep(make({ date: '2026-03-05', totalAmount: 200000, deposit: 20000 }));
    const rows = balanceReport([kucuk, buyuk], NO_PAYMENTS, BUGUN);
    expect(rows.map((r) => r.reservation.id)).toEqual([buyuk.id, kucuk.id]);
  });

  it('en son alınan tahsilatı taşır', () => {
    const r = keep(make({
      totalAmount: 200000, deposit: 20000, createdAt: '2026-01-08T10:00:00.000Z',
    }));
    const rows = balanceReport([r], lookup([
      { id: 'p1', reservationId: r.id, date: '2026-01-10', amount: 30000, method: 'Nakit', createdAt: '' },
      { id: 'p2', reservationId: r.id, date: '2026-02-14', amount: 50000, method: 'Kredi Kartı', createdAt: '' },
    ]), BUGUN);
    expect(rows[0].lastPayment).toEqual({
      date: '2026-02-14', amount: 50000, method: 'Kredi Kartı', source: 'Tahsilat',
    });
  });

  /*
    Aynı güne birden çok tahsilat girilebiliyor; tarih eşitliğinde kayıt
    sırası belirleyici, yoksa "son tahsilat" rastgele seçilirdi.
  */
  it('aynı tarihli iki tahsilatta sonra girileni son sayar', () => {
    const r = keep(make({
      totalAmount: 200000, deposit: 20000, createdAt: '2026-01-08T10:00:00.000Z',
    }));
    const rows = balanceReport([r], lookup([
      { id: 'once', reservationId: r.id, date: '2026-02-14', amount: 10000, method: 'Nakit', createdAt: '2026-02-14T08:00:00.000Z' },
      { id: 'sonra', reservationId: r.id, date: '2026-02-14', amount: 20000, method: 'Nakit', createdAt: '2026-02-14T17:00:00.000Z' },
    ]), BUGUN);
    expect(rows[0].lastPayment?.amount).toBe(20000);
  });

  /*
    Kapora ödemeler listesinde değil rezervasyon satırında durur; hesaba
    katılmazsa yalnızca kapora almış bir müşteri "hiç tahsilat yok" gibi
    görünürdü.
  */
  it('yalnızca kapora alınmışsa kaporayı son tahsilat sayar', () => {
    const r = keep(make({
      totalAmount: 200000, deposit: 20000, depositMethod: 'Nakit',
      createdAt: '2026-01-08T10:00:00.000Z',
    }));
    expect(balanceReport([r], NO_PAYMENTS, BUGUN)[0].lastPayment).toEqual({
      date: '2026-01-08', amount: 20000, method: 'Nakit', source: 'Kapora',
    });
  });

  it('kaporadan sonra tahsilat yapılmışsa tahsilatı son sayar', () => {
    const r = keep(make({
      totalAmount: 200000, deposit: 20000, createdAt: '2026-01-08T10:00:00.000Z',
    }));
    const rows = balanceReport([r], lookup([
      { id: 'p1', reservationId: r.id, date: '2026-02-01', amount: 30000, method: 'Havale/EFT', createdAt: '' },
    ]), BUGUN);
    expect(rows[0].lastPayment?.source).toBe('Tahsilat');
    expect(rows[0].lastPayment?.date).toBe('2026-02-01');
  });

  it('hiç tahsilat yoksa son tahsilatı null verir', () => {
    const r = keep(make({ totalAmount: 200000, deposit: 0 }));
    expect(balanceReport([r], NO_PAYMENTS, BUGUN)[0].lastPayment).toBeNull();
  });

  it('iptal edilmiş kayıtları dışlar', () => {
    const cancelled = keep(make({ status: 'İptal', totalAmount: 90000, deposit: 0 }));
    expect(balanceReport([cancelled], NO_PAYMENTS, BUGUN)).toHaveLength(0);
  });
});

describe('slotReport', () => {
  it('gündüz ve gece seanslarını ayırır', () => {
    const rows = slotReport([
      keep(make({ slot: 'Gündüz' })),
      keep(make({ slot: 'Gece' })),
      keep(make({ slot: 'Gece' })),
    ], NO_PAYMENTS);
    expect(rows.find((r) => r.slot === 'Gece')?.count).toBe(2);
    expect(rows.find((r) => r.slot === 'Gündüz')?.count).toBe(1);
  });
});

describe('toCsv', () => {
  it('noktalı virgülle ayırır', () => {
    expect(toCsv(['a', 'b'], [[1, 2]])).toBe('a;b\r\n1;2');
  });

  it('ayraç, tırnak ve satır sonu içeren hücreleri kaçışlar', () => {
    expect(toCsv(['x'], [['a;b']])).toBe('x\r\n"a;b"');
    expect(toCsv(['x'], [['de"mo']])).toBe('x\r\n"de""mo"');
  });
});

describe('lastMonthsReport', () => {
  it('bugünden geriye kesintisiz takvim ayları üretir', () => {
    const rows = lastMonthsReport([], 6, '2026-09-01', NO_PAYMENTS);
    expect(rows.map((r) => r.label)).toEqual([
      'Nisan 2026', 'Mayıs 2026', 'Haziran 2026', 'Temmuz 2026', 'Ağustos 2026', 'Eylül 2026',
    ]);
  });

  it('gelecek tarihli kayıtları seriye dahil etmez', () => {
    const rows = lastMonthsReport(
      [keep(make({ date: '2027-04-10' }))],
      6,
      '2026-09-01',
      NO_PAYMENTS,
    );
    expect(rows.every((r) => r.count === 0)).toBe(true);
    expect(rows.some((r) => r.label.includes('2027'))).toBe(false);
  });

  it('kaydı olmayan ayları atlamaz, sıfır olarak gösterir', () => {
    const rows = lastMonthsReport(
      [keep(make({ date: '2026-07-15' }))],
      3,
      '2026-09-01',
      NO_PAYMENTS,
    );
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => [r.label, r.count])).toEqual([
      ['Temmuz 2026', 1], ['Ağustos 2026', 0], ['Eylül 2026', 0],
    ]);
  });

  it('yıl sınırını geriye doğru doğru geçer', () => {
    const rows = lastMonthsReport([], 3, '2027-01-15', NO_PAYMENTS);
    expect(rows.map((r) => r.label)).toEqual(['Kasım 2026', 'Aralık 2026', 'Ocak 2027']);
  });

  it('ay içindeki tutarları toplar', () => {
    const rows = lastMonthsReport(
      [
        keep(make({ date: '2026-09-05', totalAmount: 100000, deposit: 0 })),
        keep(make({ date: '2026-09-20', totalAmount: 50000, deposit: 0 })),
      ],
      1,
      '2026-09-01',
      NO_PAYMENTS,
    );
    expect(rows[0].count).toBe(2);
    expect(rows[0].total).toBe(150000);
  });
});

describe('downloadCsv', () => {
  /**
   * Excel, BOM olmadan UTF-8 CSV'yi Latin-1 sanıyor ve Türkçe harfleri
   * bozuyor. Dosyanın başına eklenen BOM bunu engelliyor.
   */
  it('dosyayı BOM ile üretir ve indirmeyi tetikler', () => {
    const olusturulanUrl = 'blob:ornek/1';
    const olustur = vi.fn((_blob: Blob) => olusturulanUrl);
    const serbestBirak = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL: olustur, revokeObjectURL: serbestBirak });

    const tiklamalar: HTMLAnchorElement[] = [];
    const gercekOlustur = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((etiket: string) => {
      const el = gercekOlustur(etiket) as HTMLAnchorElement;
      if (etiket === 'a') {
        el.click = () => { tiklamalar.push(el); };
      }
      return el;
    });

    downloadCsv('rapor.csv', 'Ad;Tutar\nÇiğdem;1000');

    expect(tiklamalar).toHaveLength(1);
    expect(tiklamalar[0].download).toBe('rapor.csv');
    expect(tiklamalar[0].href).toContain(olusturulanUrl);

    const blob = olustur.mock.calls[0][0];
    expect(blob.type).toContain('charset=utf-8');

    // Bağlantı DOM'da bırakılmamalı, nesne adresi serbest bırakılmalı.
    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
    expect(serbestBirak).toHaveBeenCalledWith(olusturulanUrl);
  });

  it('içeriğin başına BOM ekler', () => {
    // jsdom Blob'u okunamıyor; kurucuya gelen parçalar yakalanıyor.
    const parcalar: unknown[][] = [];
    const GercekBlob = globalThis.Blob;
    vi.stubGlobal('Blob', class extends GercekBlob {
      constructor(bolum: unknown[], secenek?: BlobPropertyBag) {
        super(bolum as BlobPart[], secenek);
        parcalar.push(bolum);
      }
    });
    vi.stubGlobal('URL', {
      ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined,
    });
    const gercekOlustur = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((etiket: string) => {
      const el = gercekOlustur(etiket) as HTMLAnchorElement;
      if (etiket === 'a') el.click = () => undefined;
      return el;
    });

    downloadCsv('rapor.csv', 'Ad;Tutar');

    expect(parcalar[0]).toEqual(['\ufeffAd;Tutar']);
  });
});


describe('channelReport', () => {
  const bakiye = { paid: () => 0, remaining: (r: Reservation) => r.totalAmount };
  const k = (over: Partial<Reservation>) => make(over);

  it('kanal başına sayar ve payı yüzde olarak verir', () => {
    const rapor = channelReport([
      k({ id: '1', sourceChannel: 'Instagram' }),
      k({ id: '2', sourceChannel: 'Instagram' }),
      k({ id: '3', sourceChannel: 'Google' }),
      k({ id: '4', sourceChannel: 'Düğün.com' }),
    ], bakiye);

    expect(rapor.map((r) => [r.channel, r.count])).toEqual([
      ['Instagram', 2], ['Google', 1], ['Düğün.com', 1],
    ]);
    expect(rapor[0].share).toBe(50);
  });

  it('kanalı boş kayıtları gizlemez, Belirtilmemiş sayar', () => {
    // Gizlenseler yüzdeler yalnızca doldurulmuş kayıtlar üzerinden
    // hesaplanır ve Instagram gerçekte olduğundan güçlü görünürdü.
    const rapor = channelReport([
      k({ id: '1', sourceChannel: 'Instagram' }),
      k({ id: '2' }),
      k({ id: '3' }),
    ], bakiye);

    const bos = rapor.find((r) => r.channel === KANAL_BELIRTILMEMIS);
    expect(bos?.count).toBe(2);
    expect(rapor.find((r) => r.channel === 'Instagram')?.share).toBeCloseTo(33.3, 1);
  });

  it('açıklamaları tek satırda toplar, ayrı kanal yapmaz', () => {
    // 40 farklı tavsiye edenin adı 40 satırlık bir rapor üretirdi.
    const rapor = channelReport([
      k({ id: '1', sourceChannel: 'Referans', sourceDetail: 'Ayşe' }),
      k({ id: '2', sourceChannel: 'Referans', sourceDetail: 'Mehmet' }),
      k({ id: '3', sourceChannel: 'Referans', sourceDetail: 'Ayşe' }),
    ], bakiye);

    expect(rapor).toHaveLength(1);
    expect(rapor[0].count).toBe(3);
    // Tekrar eden ad iki kez yazılmıyor.
    expect(rapor[0].detail).toBe('Ayşe, Mehmet');
  });

  it('çok getiren kanal başta, eşitlikte ciro belirler', () => {
    const rapor = channelReport([
      k({ id: '1', sourceChannel: 'Google', totalAmount: 100000 }),
      k({ id: '2', sourceChannel: 'Instagram', totalAmount: 20000 }),
    ], bakiye);
    expect(rapor[0].channel).toBe('Google');
  });

  it('kayıt yoksa boş rapor verir', () => {
    expect(channelReport([], bakiye)).toEqual([]);
  });

  it('ciro ve davetli toplamlarını taşır', () => {
    const rapor = channelReport([
      k({ id: '1', sourceChannel: 'Instagram', totalAmount: 50000, guestCount: 300 }),
      k({ id: '2', sourceChannel: 'Instagram', totalAmount: 30000, guestCount: 200 }),
    ], bakiye);
    expect(rapor[0]).toMatchObject({ total: 80000, guests: 500, count: 2 });
  });
});
