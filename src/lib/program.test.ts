import { describe, expect, it } from 'vitest';
import { buildProgram, dateRange, menuLineOf, programDateLabel, programIsEmpty } from './program';
import type { ColorSetting, Hall, Menu, Reservation } from '../types';

/**
 * Program çizelgesi.
 *
 * Çizelge salonun duvarına asılıyor: yanlış güne yazılmış bir tören ya da
 * eksik kalan bir satır doğrudan işletmenin gününü bozar.
 */

const SALONLAR: Hall[] = [
  { id: 'h1', businessId: 'b1', name: 'Kristal Salon', capacity: 500, note: '', isActive: true, createdAt: '' },
  { id: 'h2', businessId: 'b1', name: 'Zümrüt Salon', capacity: 300, note: '', isActive: true, createdAt: '' },
];

const MENULER: Menu[] = [
  { id: 'm1', businessId: 'b1', name: 'Menü-2', pricing: 'kisi_basi', priceKurus: 1000, description: '', isActive: true, createdAt: '' },
];

const RENKLER: ColorSetting[] = [
  { key: 'dugun', label: 'Düğün', color: '#00b050' },
  { key: 'kina', label: 'Kına', color: '#ffff00' },
];

function rez(over: Partial<Reservation>): Reservation {
  return {
    id: 'r1', businessId: 'b1', hallId: 'h1', code: '20261',
    customerName: 'Zuhal Rana', customerPhone: '5330000001',
    date: '2026-09-12', slot: 'Gece', organizationType: 'Düğün',
    guestCount: 300, totalAmount: 100000, deposit: 0, currency: 'TL',
    status: 'Kesin Rezervasyon', colorKey: 'dugun', services: [],
    createdAt: '', updatedAt: '', ...over,
  };
}

function cizelge(reservations: Reservation[], from = '2026-09-11', to = '2026-09-13') {
  return buildProgram({ from, to, halls: SALONLAR, reservations, menus: MENULER, colors: RENKLER });
}

describe('programDateLabel', () => {
  it('tarihi gün adıyla yazar', () => {
    expect(programDateLabel('2026-09-12')).toBe('12.09.2026 CUMARTESİ');
    expect(programDateLabel('2026-09-07')).toBe('07.09.2026 PAZARTESİ');
    expect(programDateLabel('2026-09-13')).toBe('13.09.2026 PAZAR');
  });

  it('tek haneli gün ve ayı sıfırla doldurur', () => {
    expect(programDateLabel('2026-01-05')).toBe('05.01.2026 PAZARTESİ');
  });

  it('bozuk girdiyi olduğu gibi döndürür', () => {
    expect(programDateLabel('')).toBe('');
    expect(programDateLabel('gecersiz')).toBe('gecersiz');
  });
});

describe('dateRange', () => {
  it('aralıktaki her günü verir, iki ucu dahil', () => {
    expect(dateRange('2026-09-11', '2026-09-13')).toEqual(['2026-09-11', '2026-09-12', '2026-09-13']);
  });

  it('tek günlük aralıkta tek gün verir', () => {
    expect(dateRange('2026-09-12', '2026-09-12')).toEqual(['2026-09-12']);
  });

  it('ay ve yıl sınırını aşar', () => {
    expect(dateRange('2026-12-30', '2027-01-02')).toEqual(
      ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'],
    );
  });

  it('artık günü atlamaz', () => {
    expect(dateRange('2028-02-28', '2028-03-01')).toEqual(['2028-02-28', '2028-02-29', '2028-03-01']);
  });

  it('ters ya da eksik aralıkta boş döner', () => {
    expect(dateRange('2026-09-13', '2026-09-11')).toEqual([]);
    expect(dateRange('', '2026-09-11')).toEqual([]);
    expect(dateRange('2026-09-11', '')).toEqual([]);
  });

  it('çok uzun aralığı sınırlar', () => {
    // Yanlış girilen bir yıl (2026 yerine 226) tarayıcıyı kilitlememeli.
    expect(dateRange('2026-01-01', '2036-01-01').length).toBe(400);
  });
});

describe('menuLineOf', () => {
  it('menü ve hizmetleri artı ile birleştirir', () => {
    const r = rez({ menuId: 'm1', services: ['Su Böreği', 'Salata'] });
    expect(menuLineOf(r, MENULER)).toBe('MENÜ-2+SU BÖREĞİ+SALATA');
  });

  it('menü yoksa yalnızca hizmetleri yazar', () => {
    expect(menuLineOf(rez({ menuId: undefined, services: ['Orkestra'] }), MENULER)).toBe('ORKESTRA');
  });

  it('ikisi de yoksa boş döner', () => {
    expect(menuLineOf(rez({ menuId: undefined, services: [] }), MENULER)).toBe('');
  });

  it('Türkçe büyük harfi doğru yapar', () => {
    const menu: Menu[] = [{ ...MENULER[0], name: 'İçli Köfteli Ziyafet' }];
    // Locale'siz toUpperCase "i" harfini "I" yapar; "İÇLİ" beklenir.
    expect(menuLineOf(rez({ menuId: 'm1' }), menu)).toBe('İÇLİ KÖFTELİ ZİYAFET');
  });
});

describe('buildProgram', () => {
  it('yalnızca organizasyon olan günler için satır üretir', () => {
    // Aralık aylara yayıldığında boş satırlar dolu günleri gözden
    // kaybettiriyordu.
    const t = cizelge([rez({ date: '2026-09-12' })]);
    expect(t.rows.map((r) => r.date)).toEqual(['2026-09-12']);
  });

  it('aralıktaki gün sayısını ayrıca bildirir', () => {
    // Ekran, "aralık seçilmedi" ile "aralık boş" durumlarını ayırabilmeli.
    expect(cizelge([rez({})]).dayCount).toBe(3);
    expect(cizelge([]).dayCount).toBe(3);
    expect(buildProgram({
      from: '', to: '', halls: SALONLAR, reservations: [], menus: MENULER, colors: RENKLER,
    }).dayCount).toBe(0);
  });

  it('bir salonu boş olan günü atmaz', () => {
    // Sağ sütun boş olsa da o gün salonda tören var.
    const t = cizelge([rez({ hallId: 'h2' })]);
    expect(t.rows.map((r) => r.date)).toEqual(['2026-09-12']);
    expect(t.rows[0].cells[0].events).toEqual([]);
    expect(t.rows[0].cells[1].events).toHaveLength(1);
  });

  it('hiç kayıt yoksa satır kalmaz', () => {
    const t = cizelge([]);
    expect(t.rows).toEqual([]);
    // Sütunlar yine de tanımlıdır: ekran başlıkları çizebilmeli.
    expect(t.halls.map((h) => h.name)).toEqual(['Kristal Salon', 'Zümrüt Salon']);
  });

  it('her salon için bir sütun kurar', () => {
    const t = cizelge([rez({})]);
    expect(t.halls.map((h) => h.name)).toEqual(['Kristal Salon', 'Zümrüt Salon']);
    expect(t.rows[0].cells.map((c) => c.hallName)).toEqual(['Kristal Salon', 'Zümrüt Salon']);
  });

  it('kaydı doğru salon ve güne koyar', () => {
    const t = cizelge([rez({ id: 'a', hallId: 'h2', date: '2026-09-13' })]);
    const satir = t.rows.find((r) => r.date === '2026-09-13')!;
    expect(satir.cells[0].events).toEqual([]);
    expect(satir.cells[1].events.map((e) => e.reservationId)).toEqual(['a']);
  });

  it('tek organizasyonda türü tarih bandına yazar', () => {
    const t = cizelge([rez({ date: '2026-09-12', organizationType: 'Kına', colorKey: 'kina' })]);
    const hucre = t.rows.find((r) => r.date === '2026-09-12')!.cells[0];
    expect(hucre.headerLabel).toBe('12.09.2026 CUMARTESİ KINA');
    expect(hucre.headerColor).toBe('#ffff00');
  });

  it('boş kalan salonun bandında renk olmaz', () => {
    // Gün dolu ama bu salon boş: tarih yazılır, renk verilmez.
    const hucre = cizelge([rez({ hallId: 'h2' })]).rows[0].cells[0];
    expect(hucre.headerLabel).toBe('12.09.2026 CUMARTESİ');
    expect(hucre.headerColor).toBe('');
  });

  it('saat girilmemişse bile gündüz töreni gece töreninden önce gelir', () => {
    // Seansı metin olarak sıralamak "Gece"yi öne atardı: alfabede e, ü'den
    // önce geliyor.
    const t = cizelge([
      rez({ id: 'gece', slot: 'Gece', startTime: undefined, endTime: undefined }),
      rez({ id: 'gunduz', slot: 'Gündüz', startTime: undefined, endTime: undefined }),
    ]);
    const hucre = t.rows.find((r) => r.date === '2026-09-12')!.cells[0];
    expect(hucre.events.map((e) => e.reservationId)).toEqual(['gunduz', 'gece']);
  });

  it('aynı seansta başlangıç saatine göre sıralar', () => {
    const t = cizelge([
      rez({ id: 'gec', slot: 'Gece', startTime: '21:00' }),
      rez({ id: 'erken', slot: 'Gece', startTime: '19:00' }),
    ]);
    const hucre = t.rows.find((r) => r.date === '2026-09-12')!.cells[0];
    expect(hucre.events.map((e) => e.reservationId)).toEqual(['erken', 'gec']);
  });

  it('aynı gün aynı salondaki iki töreni saate göre sıralar', () => {
    const t = cizelge([
      rez({ id: 'gece', slot: 'Gece', startTime: '19:00', endTime: '23:00' }),
      rez({ id: 'gunduz', slot: 'Gündüz', startTime: '13:00', endTime: '17:00' }),
    ]);
    const hucre = t.rows.find((r) => r.date === '2026-09-12')!.cells[0];
    expect(hucre.events.map((e) => e.reservationId)).toEqual(['gunduz', 'gece']);
    expect(hucre.events.map((e) => e.timeLabel)).toEqual(['13:00-17:00', '19:00-23:00']);
  });

  it('birden çok organizasyonda tür başlığa yazılmaz', () => {
    const t = cizelge([
      rez({ id: 'a', slot: 'Gündüz' }),
      rez({ id: 'b', slot: 'Gece' }),
    ]);
    const hucre = t.rows.find((r) => r.date === '2026-09-12')!.cells[0];
    expect(hucre.headerLabel).toBe('12.09.2026 CUMARTESİ');
  });

  it('türler farklıysa band rengi seçilmez', () => {
    // İki ayrı tür tek bir renge sıkıştırılamaz; renk kaydın kendi
    // satırına iner.
    const t = cizelge([
      rez({ id: 'a', slot: 'Gündüz', organizationType: 'Kına', colorKey: 'kina' }),
      rez({ id: 'b', slot: 'Gece', organizationType: 'Düğün', colorKey: 'dugun' }),
    ]);
    const hucre = t.rows.find((r) => r.date === '2026-09-12')!.cells[0];
    expect(hucre.headerColor).toBe('');
    expect(hucre.events.map((e) => e.color)).toEqual(['#ffff00', '#00b050']);
  });

  it('iptal edilen kaydı çizelgeye almaz', () => {
    const t = cizelge([rez({ status: 'İptal' })]);
    expect(programIsEmpty(t)).toBe(true);
  });

  it('ikinci kişi varsa iki adı birlikte yazar', () => {
    const t = cizelge([rez({ customerName: 'Zuhal Rana', secondPersonName: 'Mustafa Sezgin' })]);
    expect(t.rows[0].cells[0].events[0].parties).toBe('ZUHAL RANA / MUSTAFA SEZGİN');
  });

  it('rezervasyon notunu hücreye taşır', () => {
    const t = cizelge([rez({ note: '  Sahne 12:00 kurulacak.  ' })]);
    expect(t.rows[0].cells[0].events[0].note).toBe('Sahne 12:00 kurulacak.');
  });

  it('saat girilmemişse etiket boş kalır', () => {
    const t = cizelge([rez({ startTime: undefined, endTime: undefined })]);
    expect(t.rows[0].cells[0].events[0].timeLabel).toBe('');
  });

  it('yalnızca başlangıç saati varsa tek saat yazar', () => {
    const t = cizelge([rez({ startTime: '19:00', endTime: undefined })]);
    expect(t.rows[0].cells[0].events[0].timeLabel).toBe('19:00');
  });

  it('tanımsız renk anahtarında nötr renk kullanır', () => {
    const t = cizelge([rez({ colorKey: 'bilinmeyen' })]);
    expect(t.rows[0].cells[0].events[0].color).toBe('#e5e7eb');
  });

  it('kapalı salonu ancak kaydı varsa gösterir', () => {
    const kapali: Hall[] = [
      SALONLAR[0],
      { ...SALONLAR[1], isActive: false },
    ];
    const bos = buildProgram({
      from: '2026-09-12', to: '2026-09-12', halls: kapali, reservations: [], menus: MENULER, colors: RENKLER,
    });
    expect(bos.halls.map((h) => h.id)).toEqual(['h1']);

    const dolu = buildProgram({
      from: '2026-09-12', to: '2026-09-12', halls: kapali,
      reservations: [rez({ hallId: 'h2' })], menus: MENULER, colors: RENKLER,
    });
    expect(dolu.halls.map((h) => h.id)).toEqual(['h1', 'h2']);
  });

  it('sözleşme numarasını ve davetli sayısını taşır', () => {
    const t = cizelge([rez({ code: '202612', guestCount: 450 })]);
    const e = t.rows[0].cells[0].events[0];
    expect(e.contractNo).toBe('202612');
    expect(e.guestCount).toBe(450);
  });
});

describe('programIsEmpty', () => {
  it('hiç kayıt yoksa doğrudur', () => {
    expect(programIsEmpty(cizelge([]))).toBe(true);
  });

  it('tek kayıt varsa yanlıştır', () => {
    expect(programIsEmpty(cizelge([rez({})]))).toBe(false);
  });
});
