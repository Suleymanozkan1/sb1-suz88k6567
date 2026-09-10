import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildProgramDocx, downloadProgramDocx, eventParagraphs, programBlocks, toDocxColor } from './programDocx';
import { buildProgram } from './program';
import type { ProgramEvent } from './program';
import type { ColorSetting, Hall, Menu, Reservation } from '../types';

/**
 * Program raporunun Word çıktısı.
 *
 * Ekranda görünen ile kâğıda basılan arasındaki fark sessizce oluşur:
 * hücrenin kaybolması, rengin düşmesi ya da notların çıktıya girmemesi
 * ancak kullanıcı dosyayı açtığında fark edilir.
 */

const SALONLAR: Hall[] = [
  { id: 'h1', businessId: 'b1', name: 'Kristal Salon', capacity: 0, note: '', isActive: true, createdAt: '' },
  { id: 'h2', businessId: 'b1', name: 'Zümrüt Salon', capacity: 0, note: '', isActive: true, createdAt: '' },
];
const MENULER: Menu[] = [
  { id: 'm1', businessId: 'b1', name: 'Menü-2', pricing: 'kisi_basi', priceKurus: 1, description: '', isActive: true, createdAt: '' },
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
    guestCount: 300, totalAmount: 1, deposit: 0, currency: 'TL',
    status: 'Kesin Rezervasyon', colorKey: 'dugun', services: [],
    createdAt: '', updatedAt: '', ...over,
  };
}

function cizelge(reservations: Reservation[]) {
  return buildProgram({
    from: '2026-09-12', to: '2026-09-12', halls: SALONLAR, reservations, menus: MENULER, colors: RENKLER,
  });
}

const ETKINLIK: ProgramEvent = {
  reservationId: 'r1', contractNo: '20261', parties: 'ZUHAL RANA / MUSTAFA',
  organizationType: 'Düğün', guestCount: 300, menuLine: 'MENÜ-2+ORKESTRA',
  timeLabel: '19:00-23:00', slot: 'Gece', note: '', status: 'Kesin Rezervasyon',
  color: '#00b050',
};

/** Belgedeki tüm metni tek dizgeye toplar. */
function metin(bytes: Uint8Array): string {
  const cozucu = new TextDecoder();
  const gorunum = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let i = 0;
  while (i + 4 <= bytes.length && gorunum.getUint32(i, true) === 0x04034b50) {
    const adUzunluk = gorunum.getUint16(i + 26, true);
    const ekUzunluk = gorunum.getUint16(i + 28, true);
    const boyut = gorunum.getUint32(i + 22, true);
    const adBaslangic = i + 30;
    const ad = cozucu.decode(bytes.subarray(adBaslangic, adBaslangic + adUzunluk));
    const veri = adBaslangic + adUzunluk + ekUzunluk;
    if (ad === 'word/document.xml') return cozucu.decode(bytes.subarray(veri, veri + boyut));
    i = veri + boyut;
  }
  return '';
}

describe('toDocxColor', () => {
  it('diyezi atar ve büyük harfe çevirir', () => {
    expect(toDocxColor('#00b050')).toBe('00B050');
    expect(toDocxColor('00b050')).toBe('00B050');
  });

  it('üç haneli kısa yazımı açar', () => {
    expect(toDocxColor('#fc0')).toBe('FFCC00');
  });

  it('tanımadığı değerde beyaza düşer', () => {
    // Bozuk bir renk yüzünden belge açılmaz hâle gelmemeli.
    expect(toDocxColor('')).toBe('FFFFFF');
    expect(toDocxColor('mavi')).toBe('FFFFFF');
    expect(toDocxColor('#12345')).toBe('FFFFFF');
  });
});

describe('eventParagraphs', () => {
  it('tek organizasyonda tür bandını yinelemez', () => {
    // Tür zaten tarih bandında yazıyor.
    const p = eventParagraphs(ETKINLIK, true);
    expect(p.some((x) => x.runs.some((r) => r.text.includes('DÜĞÜN')))).toBe(false);
    expect(p[0].runs[0].text).toBe('19:00-23:00');
  });

  it('birden çok organizasyonda saat ve tür bandı çizer', () => {
    const p = eventParagraphs(ETKINLIK, false);
    expect(p[0].runs[0].text).toBe('19:00-23:00 DÜĞÜN');
    expect(p[0].shading).toBe('00B050');
  });

  it('saat yoksa seans adını yazar', () => {
    const p = eventParagraphs({ ...ETKINLIK, timeLabel: '' }, false);
    expect(p[0].runs[0].text).toBe('GECE DÜĞÜN');
  });

  it('taraf, kişi ve menü satırlarını sırayla verir', () => {
    const p = eventParagraphs(ETKINLIK, true).map((x) => x.runs.map((r) => r.text).join(''));
    expect(p).toEqual(['19:00-23:00', 'ZUHAL RANA / MUSTAFA', '300 KİŞİ', 'MENÜ-2+ORKESTRA']);
  });

  it('menü boşsa o satırı hiç yazmaz', () => {
    const p = eventParagraphs({ ...ETKINLIK, menuLine: '' }, true);
    expect(p.map((x) => x.runs.map((r) => r.text).join(''))).not.toContain('');
    expect(p.length).toBe(3);
  });

  it('notu çıktıya taşır', () => {
    const p = eventParagraphs({ ...ETKINLIK, note: 'Sahne 12:00' }, true);
    const satirlar = p.map((x) => x.runs.map((r) => r.text).join(''));
    expect(satirlar[satirlar.length - 1]).toBe('Not: Sahne 12:00');
  });
});

describe('programBlocks', () => {
  const meta = { businessName: 'Grand Sahra', from: '2026-09-12', to: '2026-09-12', notes: '' };

  it('başlıkta işletme adını ve aralığı yazar', () => {
    const b = programBlocks(cizelge([]), meta);
    const ilk = b[0];
    expect(ilk.kind).toBe('paragraph');
    expect(ilk.kind === 'paragraph' && ilk.paragraph.runs[0].text).toBe('Grand Sahra');
    const ikinci = b[1];
    expect(ikinci.kind === 'paragraph' && ikinci.paragraph.runs[0].text)
      .toBe('Program Raporu · 2026-09-12 - 2026-09-12');
  });

  it('salon sayısı kadar sütun kurar', () => {
    const tablo = programBlocks(cizelge([]), meta).find((b) => b.kind === 'table');
    expect(tablo?.kind === 'table' && tablo.widths.length).toBe(2);
  });

  it('başlık satırı salon adlarını taşır', () => {
    const tablo = programBlocks(cizelge([]), meta).find((b) => b.kind === 'table');
    if (tablo?.kind !== 'table') throw new Error('tablo yok');
    const baslik = tablo.rows[0].map((c) => c.paragraphs[0].runs[0].text);
    expect(baslik).toEqual(['KRİSTAL SALON', 'ZÜMRÜT SALON']);
  });

  it('yalnızca dolu günler için satır ekler', () => {
    // Ekranda boş gün satırı işe yarar; basılı programda arka arkaya
    // onlarca boş satır sayfaları şişirmekten başka bir iş görmez.
    const t3 = buildProgram({
      from: '2026-09-11', to: '2026-09-13', halls: SALONLAR, menus: MENULER, colors: RENKLER,
      reservations: [rez({ date: '2026-09-12' })],
    });
    const tablo = programBlocks(t3, meta).find((b) => b.kind === 'table');
    if (tablo?.kind !== 'table') throw new Error('tablo yok');

    // 1 başlık + yalnızca 12 Eylül
    expect(tablo.rows.length).toBe(2);
    expect(tablo.rows[1][0].paragraphs[0].runs[0].text).toBe('12.09.2026 CUMARTESİ DÜĞÜN');
  });

  it('bir salonu dolu olan günü atmaz', () => {
    // Sağ sütunu boş olsa da o gün salonda tören var; satır kalmalı.
    const t = buildProgram({
      from: '2026-09-12', to: '2026-09-12', halls: SALONLAR, menus: MENULER, colors: RENKLER,
      reservations: [rez({ hallId: 'h2' })],
    });
    const tablo = programBlocks(t, meta).find((b) => b.kind === 'table');
    if (tablo?.kind !== 'table') throw new Error('tablo yok');
    expect(tablo.rows.length).toBe(2);
    expect(tablo.rows[1]).toHaveLength(2);
  });

  it('hiç kayıt yoksa yalnızca başlık satırı kalır', () => {
    const tablo = programBlocks(cizelge([]), meta).find((b) => b.kind === 'table');
    expect(tablo?.kind === 'table' && tablo.rows.length).toBe(1);
  });

  it('ek notları ayrı bir bölüm olarak ekler', () => {
    const b = programBlocks(cizelge([]), { ...meta, notes: 'Birinci satır\nİkinci satır' });
    const metinler = b.flatMap((x) => (x.kind === 'paragraph' ? x.paragraph.runs.map((r) => r.text) : []));
    expect(metinler).toContain('EK NOTLAR');
    expect(metinler).toContain('Birinci satır');
    expect(metinler).toContain('İkinci satır');
  });

  it('not yoksa EK NOTLAR bölümü hiç açılmaz', () => {
    const b = programBlocks(cizelge([]), { ...meta, notes: '   ' });
    const metinler = b.flatMap((x) => (x.kind === 'paragraph' ? x.paragraph.runs.map((r) => r.text) : []));
    expect(metinler).not.toContain('EK NOTLAR');
  });

  it('salon tanımlı değilse tabloyu yine de kurar', () => {
    const bos = buildProgram({
      from: '2026-09-12', to: '2026-09-12', halls: [], reservations: [], menus: MENULER, colors: RENKLER,
    });
    const tablo = programBlocks(bos, meta).find((b) => b.kind === 'table');
    expect(tablo?.kind === 'table' && tablo.widths.length).toBe(1);
    expect(tablo?.kind === 'table' && tablo.rows[0][0].paragraphs[0].runs[0].text).toBe('Salon tanımlı değil');
  });
});

describe('buildProgramDocx', () => {
  const meta = { businessName: 'Grand Sahra', from: '2026-09-12', to: '2026-09-12', notes: 'Sahne erken kurulacak.' };

  it('çizelgedeki bilgileri belgeye yazar', () => {
    const x = metin(buildProgramDocx(
      cizelge([rez({ menuId: 'm1', secondPersonName: 'Mustafa Sezgin', startTime: '19:00', endTime: '23:00' })]),
      meta,
    ));
    expect(x).toContain('12.09.2026 CUMARTESİ DÜĞÜN');
    expect(x).toContain('ZUHAL RANA / MUSTAFA SEZGİN');
    expect(x).toContain('300 KİŞİ');
    expect(x).toContain('MENÜ-2');
    expect(x).toContain('Sahne erken kurulacak.');
  });

  it('renk bilgisi belgeye iner', () => {
    const x = metin(buildProgramDocx(cizelge([rez({ organizationType: 'Kına', colorKey: 'kina' })]), meta));
    expect(x).toContain('w:fill="FFFF00"');
  });

  it('boş çizelgede bile geçerli belge üretir', () => {
    const x = metin(buildProgramDocx(cizelge([]), { ...meta, notes: '' }));
    expect(x).toContain('<w:document');
    // Salon başlıkları durur, boş gün satırı basılmaz.
    expect(x).toContain('KRİSTAL SALON');
    expect(x).not.toContain('12.09.2026');
  });

  it('boş günleri çıktıya basmaz', () => {
    const hafta = buildProgram({
      from: '2026-09-11', to: '2026-09-13', halls: SALONLAR, menus: MENULER, colors: RENKLER,
      reservations: [rez({ date: '2026-09-12' })],
    });
    const x = metin(buildProgramDocx(hafta, { ...meta, notes: '' }));
    expect(x).toContain('12.09.2026');
    expect(x).not.toContain('11.09.2026');
    expect(x).not.toContain('13.09.2026');
  });
});

describe('downloadProgramDocx', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('dosya adına tarih aralığını yazar', () => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined });
    const tiklamalar: HTMLAnchorElement[] = [];
    const gercekOlustur = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((etiket: string) => {
      const el = gercekOlustur(etiket) as HTMLAnchorElement;
      if (etiket === 'a') el.click = () => { tiklamalar.push(el); };
      return el;
    });

    downloadProgramDocx(cizelge([rez({})]), {
      businessName: 'Grand Sahra', from: '2026-09-07', to: '2026-09-13', notes: '',
    });

    // Aralık dosya adında olmazsa indirilen raporlar birbirine karışır.
    expect(tiklamalar).toHaveLength(1);
    expect(tiklamalar[0].download).toBe('program-raporu-2026-09-07_2026-09-13.docx');
  });
});
