/**
 * Program raporunun Word çıktısı.
 *
 * Ekrandaki tablo ile birebir aynı düzen: sütunlar salonlar, satırlar
 * günler, hücrenin üstünde renkli tarih bandı. Renkler işletmenin kendi
 * Renk Ayarları'ndan gelir; çıktı ekranda görülenden farklı olmaz.
 */
import { buildDocx, downloadDocx, type DocxBlock, type DocxCell, type DocxParagraph } from './docx';
import { okunakliMetinRengi } from './format';
import type { ProgramEvent, ProgramTable } from './program';

/** "#e8f8ef" -> "E8F8EF"; Word diyez kabul etmez. */
export function toDocxColor(css: string): string {
  const temiz = css.replace('#', '').trim();
  if (/^[0-9a-fA-F]{3}$/.test(temiz)) {
    return temiz.split('').map((c) => c + c).join('').toUpperCase();
  }
  return /^[0-9a-fA-F]{6}$/.test(temiz) ? temiz.toUpperCase() : 'FFFFFF';
}

function bant(text: string, zemin: string): DocxParagraph {
  const dolgu = toDocxColor(zemin || '#ffffff');
  return {
    runs: [{ text, bold: true, size: 9, color: toDocxColor(okunakliMetinRengi(zemin || '#ffffff')) }],
    align: 'center',
    shading: dolgu,
  };
}

function satir(text: string, opts: { bold?: boolean } = {}): DocxParagraph {
  return { runs: [{ text, size: 9, bold: opts.bold }], align: 'center' };
}

/** Bir organizasyonun hücre içindeki satırları. */
export function eventParagraphs(event: ProgramEvent, tekBasina: boolean): DocxParagraph[] {
  const paragraflar: DocxParagraph[] = [];

  // Tek organizasyonda tür zaten tarih bandında yazıyor; ikinci kez yazmak
  // çizelgeyi gereksiz kalabalıklaştırır.
  if (!tekBasina) {
    const saat = event.timeLabel || event.slot.toLocaleUpperCase('tr-TR');
    paragraflar.push(bant(`${saat} ${event.organizationType.toLocaleUpperCase('tr-TR')}`, event.color));
  } else if (event.timeLabel) {
    paragraflar.push(satir(event.timeLabel));
  }

  paragraflar.push(satir(event.parties, { bold: true }));
  paragraflar.push(satir(`${event.guestCount} KİŞİ`));
  if (event.menuLine) paragraflar.push(satir(event.menuLine));
  if (event.note) paragraflar.push(satir(`Not: ${event.note}`));
  return paragraflar;
}

function hucre(headerLabel: string, headerColor: string, events: ProgramEvent[]): DocxCell {
  const paragraflar: DocxParagraph[] = [bant(headerLabel, headerColor)];
  const tek = events.length === 1;
  for (const e of events) paragraflar.push(...eventParagraphs(e, tek));
  return { paragraphs: paragraflar };
}

export interface ProgramDocxMeta {
  businessName: string;
  from: string;
  to: string;
  /** Kullanıcının rapora eklediği serbest notlar */
  notes: string;
}

/** Word belgesinin bloklarını kurar. */
export function programBlocks(table: ProgramTable, meta: ProgramDocxMeta): DocxBlock[] {
  const bloklar: DocxBlock[] = [];

  bloklar.push({
    kind: 'paragraph',
    paragraph: { runs: [{ text: meta.businessName, bold: true, size: 14 }], align: 'center' },
  });
  bloklar.push({
    kind: 'paragraph',
    paragraph: { runs: [{ text: `Program Raporu · ${meta.from} - ${meta.to}`, size: 10 }], align: 'center' },
  });
  bloklar.push({ kind: 'paragraph', paragraph: { runs: [] } });

  // A4 dikey, 1 cm kenar boşluğu: kullanılabilir genişlik 10772 dxa.
  const kullanilabilir = 10772;
  const sutunSayisi = Math.max(1, table.halls.length);
  const genislik = Math.floor(kullanilabilir / sutunSayisi);
  const widths = Array.from({ length: sutunSayisi }, () => genislik);

  const baslik: DocxCell[] = table.halls.length > 0
    ? table.halls.map((h) => ({
        paragraphs: [{
          runs: [{ text: h.name.toLocaleUpperCase('tr-TR'), bold: true, size: 10, color: 'FFFFFF' }],
          align: 'center' as const,
          shading: 'C00000',
        }],
      }))
    : [{ paragraphs: [satir('Salon tanımlı değil')] }];

  // Kâğıda yalnızca dolu günler basılır. Ekranda boş gün satırı işe yarar
  // (o gün salonun boş olduğunu söyler), ama basılı programda arka arkaya
  // onlarca boş satır sayfaları şişirmekten başka bir iş görmez.
  const doluGunler = table.rows.filter((row) => row.cells.some((c) => c.events.length > 0));

  const rows: DocxCell[][] = [baslik];
  for (const row of doluGunler) {
    rows.push(
      row.cells.length > 0
        ? row.cells.map((c) => hucre(c.headerLabel, c.headerColor, c.events))
        : [{ paragraphs: [satir('-')] }],
    );
  }

  bloklar.push({ kind: 'table', widths, rows });

  const notlar = meta.notes.trim();
  if (notlar) {
    bloklar.push({ kind: 'paragraph', paragraph: { runs: [] } });
    bloklar.push({
      kind: 'paragraph',
      paragraph: { runs: [{ text: 'EK NOTLAR', bold: true, size: 11 }] },
    });
    for (const s of notlar.split('\n')) {
      bloklar.push({ kind: 'paragraph', paragraph: { runs: [{ text: s, size: 10 }] } });
    }
  }

  return bloklar;
}

export function buildProgramDocx(table: ProgramTable, meta: ProgramDocxMeta): Uint8Array {
  return buildDocx(programBlocks(table, meta));
}

export function downloadProgramDocx(table: ProgramTable, meta: ProgramDocxMeta): void {
  downloadDocx(`program-raporu-${meta.from}_${meta.to}.docx`, buildProgramDocx(table, meta));
}
