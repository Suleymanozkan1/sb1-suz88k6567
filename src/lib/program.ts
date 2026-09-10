/**
 * Program raporu: salon salon, gün gün organizasyon çizelgesi.
 *
 * Salonun duvarına asılan haftalık program listesinin karşılığıdır.
 * Sütunlar salonlar, satırlar tarih aralığındaki her gün; boş günler de
 * satır olarak durur, çünkü çizelgenin işi "o gün ne var" kadar "o gün
 * boş" bilgisini de vermektir.
 */
import { contractParties } from './reports';
import type { ColorSetting, Hall, Menu, Reservation } from '../types';

export interface ProgramEvent {
  reservationId: string;
  /** Sözleşme numarası */
  contractNo: string;
  /** "AHMET YILMAZ / ELİF KAYA" */
  parties: string;
  organizationType: string;
  guestCount: number;
  /** "MENÜ-2+SU BÖREĞİ+SALATA"; menü ve hizmetler birleşik */
  menuLine: string;
  /** "19:00-23:00"; saat girilmemişse boş */
  timeLabel: string;
  slot: string;
  note: string;
  status: string;
  /** Organizasyon türünün rengi (#rrggbb) */
  color: string;
}

export interface ProgramCell {
  hallId: string;
  hallName: string;
  /** Hücrenin üstündeki tarih bandı: "12.09.2026 CUMARTESİ DÜĞÜN" */
  headerLabel: string;
  /** Band rengi; o gün o salonda kayıt yoksa boş metin */
  headerColor: string;
  events: ProgramEvent[];
}

export interface ProgramRow {
  date: string;
  cells: ProgramCell[];
}

export interface ProgramTable {
  halls: Hall[];
  rows: ProgramRow[];
}

const GUNLER = ['PAZAR', 'PAZARTESİ', 'SALI', 'ÇARŞAMBA', 'PERŞEMBE', 'CUMA', 'CUMARTESİ'];

/** "12.09.2026 CUMARTESİ" */
export function programDateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const gun = GUNLER[new Date(y, m - 1, d).getDay()];
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y} ${gun}`;
}

/** Aralıktaki her günü sırayla verir. Ters aralıkta boş dizi döner. */
export function dateRange(from: string, to: string): string[] {
  if (!from || !to || from > to) return [];
  const gunler: string[] = [];
  const [y, m, d] = from.split('-').map(Number);
  const imlec = new Date(y, m - 1, d);
  // Aralık uzunluğu sınırlanmazsa hatalı bir yıl girişi tarayıcıyı kilitler.
  for (let i = 0; i < 400; i += 1) {
    const iso = `${imlec.getFullYear()}-${String(imlec.getMonth() + 1).padStart(2, '0')}-${String(imlec.getDate()).padStart(2, '0')}`;
    if (iso > to) break;
    gunler.push(iso);
    imlec.setDate(imlec.getDate() + 1);
  }
  return gunler;
}

/**
 * Menü satırı: menü adı ve rezervasyona eklenen hizmetler artı ile birleşir.
 * Örnek çıktı "MENÜ-2+SU BÖREĞİ+SALATA". Menü seçilmemişse yalnızca
 * hizmetler yazılır; ikisi de yoksa satır hiç görünmez.
 */
export function menuLineOf(reservation: Reservation, menus: Menu[]): string {
  const menu = menus.find((m) => m.id === reservation.menuId);
  const parcalar = [menu?.name, ...reservation.services].filter((p): p is string => Boolean(p && p.trim()));
  return parcalar.join('+').toLocaleUpperCase('tr-TR');
}

/** Gündüz 0, gece 1. Çizelgede gündüz töreni her zaman üstte durur. */
function seansSirasi(reservation: Reservation): number {
  return reservation.slot === 'Gündüz' ? 0 : 1;
}

function saatEtiketi(reservation: Reservation): string {
  const bas = (reservation.startTime ?? '').slice(0, 5);
  const bit = (reservation.endTime ?? '').slice(0, 5);
  if (!bas) return '';
  return bit ? `${bas}-${bit}` : bas;
}

function renkBul(reservation: Reservation, colors: ColorSetting[]): string {
  return colors.find((c) => c.key === reservation.colorKey)?.color ?? '#e5e7eb';
}

/**
 * Çizelgeyi kurar.
 *
 * İptal edilen kayıtlar çizelgeye girmez: program listesi o gün salonda ne
 * olacağını söyler, iptal edilmiş bir tören orada değildir.
 */
export function buildProgram(input: {
  from: string;
  to: string;
  halls: Hall[];
  reservations: Reservation[];
  menus: Menu[];
  colors: ColorSetting[];
}): ProgramTable {
  const { from, to, halls, reservations, menus, colors } = input;
  const aktifSalonlar = halls.filter((h) => h.isActive || reservations.some((r) => r.hallId === h.id));

  const gecerli = reservations.filter((r) => r.status !== 'İptal');
  const gunler = dateRange(from, to);

  const rows: ProgramRow[] = gunler.map((date) => ({
    date,
    cells: aktifSalonlar.map((hall) => {
      const kayitlar = gecerli
        .filter((r) => r.hallId === hall.id && r.date === date)
        // Önce seans (gündüz töreni geceden önce gelir), sonra başlangıç
        // saati. Seansı metin olarak sıralamak "Gece"yi "Gündüz"ün önüne
        // atardı: alfabede e, ü'den önce geliyor.
        .sort((a, b) => seansSirasi(a) - seansSirasi(b)
          || (a.startTime ?? '').localeCompare(b.startTime ?? ''));

      const events: ProgramEvent[] = kayitlar.map((r) => ({
        reservationId: r.id,
        contractNo: r.code,
        parties: contractParties(r).toLocaleUpperCase('tr-TR'),
        organizationType: r.organizationType,
        guestCount: r.guestCount,
        menuLine: menuLineOf(r, menus),
        timeLabel: saatEtiketi(r),
        slot: r.slot,
        note: r.note?.trim() ?? '',
        status: r.status,
        color: renkBul(r, colors),
      }));

      const tarih = programDateLabel(date);
      // Tek organizasyonda tür başlığa yazılır ve band o türün rengini alır.
      // Birden çok organizasyonda tür bandı her kaydın kendi satırına iner;
      // farklı türler tek bir renge sıkıştırılamaz.
      const tekTur = events.length === 1 ? ` ${events[0].organizationType.toLocaleUpperCase('tr-TR')}` : '';
      const ayniRenk = events.length > 0 && events.every((e) => e.color === events[0].color);

      return {
        hallId: hall.id,
        hallName: hall.name,
        headerLabel: `${tarih}${tekTur}`,
        headerColor: ayniRenk ? events[0].color : '',
        events,
      };
    }),
  }));

  return { halls: aktifSalonlar, rows };
}

/** Çizelgede hiç organizasyon var mı? Boş çizelgede Word çıktısı önerilmez. */
export function programIsEmpty(table: ProgramTable): boolean {
  return table.rows.every((row) => row.cells.every((c) => c.events.length === 0));
}
