/**
 * Word (.docx) üretici.
 *
 * Bir .docx, içinde birkaç XML dosyası olan sıradan bir ZIP arşividir.
 * Program raporu renkli bir tablodan ibaret olduğu için hazır bir kitaplık
 * yerine gereken kadarı burada yazıldı: tarayıcıya inen paket yarım megabayt
 * büyümüyor ve çıktının her ayrıntısı elimizde kalıyor.
 *
 * Kapsam bilinçli olarak dar: paragraf, kalın/renkli metin, gölgeli hücre ve
 * tablo. Resim, üstbilgi, stil galerisi yok; program raporunun ihtiyacı bu
 * kadar.
 */

export interface DocxRun {
  text: string;
  bold?: boolean;
  /** RRGGBB, diyez olmadan */
  color?: string;
  /** Yarım punto değil, punto. 10 => 10pt */
  size?: number;
}

export interface DocxParagraph {
  runs: DocxRun[];
  align?: 'left' | 'center' | 'right';
  /** Paragraf zemini (RRGGBB). Renkli tarih bandı böyle çiziliyor. */
  shading?: string;
}

export interface DocxCell {
  paragraphs: DocxParagraph[];
}

export type DocxBlock =
  | { kind: 'paragraph'; paragraph: DocxParagraph }
  | {
      kind: 'table';
      /** Sütun genişlikleri, dxa (1/20 punto). Toplamı sayfa genişliğini vermeli. */
      widths: number[];
      rows: DocxCell[][];
    };

/* ─────────────────────────────────────────────── XML ────────────────── */

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function runXml(run: DocxRun): string {
  const props = [
    run.bold ? '<w:b/>' : '',
    run.color ? `<w:color w:val="${run.color}"/>` : '',
    run.size ? `<w:sz w:val="${run.size * 2}"/><w:szCs w:val="${run.size * 2}"/>` : '',
  ].join('');
  // xml:space="preserve" olmadan baştaki ve sondaki boşluklar Word'de düşer.
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${escapeXml(run.text)}</w:t></w:r>`;
}

function paragraphXml(p: DocxParagraph): string {
  const props = [
    p.align && p.align !== 'left' ? `<w:jc w:val="${p.align}"/>` : '',
    p.shading ? `<w:shd w:val="clear" w:color="auto" w:fill="${p.shading}"/>` : '',
    '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>',
  ].join('');
  const runs = p.runs.length > 0 ? p.runs.map(runXml).join('') : '';
  return `<w:p><w:pPr>${props}</w:pPr>${runs}</w:p>`;
}

function cellXml(cell: DocxCell, width: number): string {
  // Word boş hücreyi çizmez; en az bir paragraf şart.
  const paragraphs = cell.paragraphs.length > 0 ? cell.paragraphs : [{ runs: [] }];
  return (
    `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>` +
    paragraphs.map(paragraphXml).join('') +
    '</w:tc>'
  );
}

function tableXml(widths: number[], rows: DocxCell[][]): string {
  const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map((k) => `<w:${k} w:val="single" w:sz="6" w:space="0" w:color="000000"/>`)
    .join('');
  const grid = widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('');
  const body = rows
    .map((row) => `<w:tr>${row.map((c, i) => cellXml(c, widths[i] ?? widths[0])).join('')}</w:tr>`)
    .join('');
  return (
    '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>' +
    `<w:tblBorders>${borders}</w:tblBorders></w:tblPr>` +
    `<w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>`
  );
}

function documentXml(blocks: DocxBlock[]): string {
  const body = blocks
    .map((b) => (b.kind === 'paragraph' ? paragraphXml(b.paragraph) : tableXml(b.widths, b.rows)))
    .join('');
  // A4 dikey, 1 cm kenar boşluğu (567 dxa ≈ 1 cm).
  const section =
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="567" w:right="567" w:bottom="567" w:left="567" w:header="0" w:footer="0" w:gutter="0"/>' +
    '</w:sectPr>';
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${body}${section}</w:body></w:document>`
  );
}

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ' +
  'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '</Types>';

const ROOT_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" ' +
  'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" ' +
  'Target="word/document.xml"/></Relationships>';

/* ─────────────────────────────────────────────── ZIP ────────────────── */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface ZipEntry { name: string; data: Uint8Array }

/**
 * Sıkıştırmasız (store) ZIP. Word bunu sorunsuz açar; sıkıştırma eklemek
 * tarayıcıya deflate uygulaması taşımak demek olurdu ve rapor dosyaları
 * zaten birkaç on kilobayt.
 */
export function zip(entries: ZipEntry[]): Uint8Array {
  const parcalar: Uint8Array[] = [];
  const merkez: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const ad = new TextEncoder().encode(entry.name);
    const crc = crc32(entry.data);
    const boyut = entry.data.length;

    const yerel = new Uint8Array(30 + ad.length);
    const yg = new DataView(yerel.buffer);
    yg.setUint32(0, 0x04034b50, true);
    yg.setUint16(4, 20, true);
    yg.setUint16(6, 0x0800, true); // dosya adları UTF-8
    yg.setUint16(8, 0, true);      // store
    yg.setUint16(10, 0, true);     // saat
    yg.setUint16(12, 0x21, true);  // tarih: 1980-01-01, çıktı yinelenebilir olsun
    yg.setUint32(14, crc, true);
    yg.setUint32(18, boyut, true);
    yg.setUint32(22, boyut, true);
    yg.setUint16(26, ad.length, true);
    yg.setUint16(28, 0, true);
    yerel.set(ad, 30);

    parcalar.push(yerel, entry.data);

    const md = new Uint8Array(46 + ad.length);
    const mg = new DataView(md.buffer);
    mg.setUint32(0, 0x02014b50, true);
    mg.setUint16(4, 20, true);
    mg.setUint16(6, 20, true);
    mg.setUint16(8, 0x0800, true);
    mg.setUint16(10, 0, true);
    mg.setUint16(12, 0, true);
    mg.setUint16(14, 0x21, true);
    mg.setUint32(16, crc, true);
    mg.setUint32(20, boyut, true);
    mg.setUint32(24, boyut, true);
    mg.setUint16(28, ad.length, true);
    mg.setUint32(42, offset, true);
    md.set(ad, 46);
    merkez.push(md);

    offset += yerel.length + boyut;
  }

  const merkezBoyut = merkez.reduce((t, m) => t + m.length, 0);
  const son = new Uint8Array(22);
  const sg = new DataView(son.buffer);
  sg.setUint32(0, 0x06054b50, true);
  sg.setUint16(8, entries.length, true);
  sg.setUint16(10, entries.length, true);
  sg.setUint32(12, merkezBoyut, true);
  sg.setUint32(16, offset, true);

  const toplam = [...parcalar, ...merkez, son];
  const cikti = new Uint8Array(toplam.reduce((t, p) => t + p.length, 0));
  let konum = 0;
  for (const p of toplam) { cikti.set(p, konum); konum += p.length; }
  return cikti;
}

/** Blokları .docx paketine çevirir. */
export function buildDocx(blocks: DocxBlock[]): Uint8Array {
  const enc = new TextEncoder();
  return zip([
    { name: '[Content_Types].xml', data: enc.encode(CONTENT_TYPES) },
    { name: '_rels/.rels', data: enc.encode(ROOT_RELS) },
    { name: 'word/document.xml', data: enc.encode(documentXml(blocks)) },
  ]);
}

/** Üretilen paketi indirir. */
export function downloadDocx(filename: string, bytes: Uint8Array): void {
  const blob = new Blob([bytes as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
