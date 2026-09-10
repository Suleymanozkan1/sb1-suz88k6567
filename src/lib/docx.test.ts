import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDocx, crc32, downloadDocx, escapeXml, zip } from './docx';

/**
 * Word üreticisi.
 *
 * Buradaki testler çıktının Word tarafından açılabilir olmasını korur:
 * ZIP yapısı doğru mu, XML kaçışları yerinde mi, hücre gerçekten boş
 * kalmıyor mu. Bozuk bir .docx sessizce indirilir ve ancak kullanıcı
 * dosyayı açmaya çalıştığında anlaşılır.
 */

/** ZIP'i sözlük olarak açar: {dosyaAdı: içerik} */
function zipiCoz(bytes: Uint8Array): Record<string, string> {
  const gorunum = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const cozucu = new TextDecoder();
  const cikti: Record<string, string> = {};
  let i = 0;
  while (i + 4 <= bytes.length && gorunum.getUint32(i, true) === 0x04034b50) {
    const adUzunluk = gorunum.getUint16(i + 26, true);
    const ekUzunluk = gorunum.getUint16(i + 28, true);
    const boyut = gorunum.getUint32(i + 22, true);
    const adBaslangic = i + 30;
    const ad = cozucu.decode(bytes.subarray(adBaslangic, adBaslangic + adUzunluk));
    const veriBaslangic = adBaslangic + adUzunluk + ekUzunluk;
    cikti[ad] = cozucu.decode(bytes.subarray(veriBaslangic, veriBaslangic + boyut));
    i = veriBaslangic + boyut;
  }
  return cikti;
}

describe('crc32', () => {
  it('bilinen değerleri üretir', () => {
    // Referans değerler: zlib.crc32
    expect(crc32(new TextEncoder().encode(''))).toBe(0);
    expect(crc32(new TextEncoder().encode('a'))).toBe(0xe8b7be43);
    expect(crc32(new TextEncoder().encode('abc'))).toBe(0x352441c2);
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('tek bitlik değişikliği yakalar', () => {
    const a = crc32(new TextEncoder().encode('Sahra'));
    const b = crc32(new TextEncoder().encode('Sahrb'));
    expect(a).not.toBe(b);
  });
});

describe('escapeXml', () => {
  it('XML anlamı olan işaretleri kaçırır', () => {
    expect(escapeXml('a & b')).toBe('a &amp; b');
    expect(escapeXml('<w:t>')).toBe('&lt;w:t&gt;');
    expect(escapeXml('"tırnak"')).toBe('&quot;tırnak&quot;');
    expect(escapeXml("O'nun")).toBe('O&apos;nun');
  });

  it('Türkçe harflere dokunmaz', () => {
    expect(escapeXml('ŞEVVAL ERDEM ÇİĞDEM ÖZGÜR')).toBe('ŞEVVAL ERDEM ÇİĞDEM ÖZGÜR');
  });

  it('ampersandı iki kez kaçırmaz', () => {
    // Önce & sonra < değiştirilmezse "&amp;lt;" gibi bozuk çıktı doğar.
    expect(escapeXml('<a & b>')).toBe('&lt;a &amp; b&gt;');
  });
});

describe('zip', () => {
  it('dosya adlarını ve içeriği geri verir', () => {
    const enc = new TextEncoder();
    const paket = zip([
      { name: 'bir.txt', data: enc.encode('merhaba') },
      { name: 'klasor/iki.xml', data: enc.encode('<x/>') },
    ]);
    expect(zipiCoz(paket)).toEqual({ 'bir.txt': 'merhaba', 'klasor/iki.xml': '<x/>' });
  });

  it('merkez dizin girdi sayısını doğru yazar', () => {
    const paket = zip([
      { name: 'a', data: new Uint8Array([1]) },
      { name: 'b', data: new Uint8Array([2]) },
      { name: 'c', data: new Uint8Array([3]) },
    ]);
    const son = new DataView(paket.buffer, paket.byteLength - 22, 22);
    expect(son.getUint32(0, true)).toBe(0x06054b50);
    expect(son.getUint16(8, true)).toBe(3);
    expect(son.getUint16(10, true)).toBe(3);
  });

  it('boş arşiv de geçerli bir ZIP üretir', () => {
    const paket = zip([]);
    expect(paket.length).toBe(22);
    expect(new DataView(paket.buffer).getUint32(0, true)).toBe(0x06054b50);
  });

  it('aynı girdi için aynı baytları üretir', () => {
    // Tarih alanı sabit; çıktı yinelenebilir olmalı ki testler kararlı kalsın.
    const yap = () => zip([{ name: 'a.txt', data: new TextEncoder().encode('x') }]);
    expect(Array.from(yap())).toEqual(Array.from(yap()));
  });
});

describe('buildDocx', () => {
  it('Word paketinin üç parçasını içerir', () => {
    const parcalar = zipiCoz(buildDocx([]));
    expect(Object.keys(parcalar).sort()).toEqual(
      ['[Content_Types].xml', '_rels/.rels', 'word/document.xml'],
    );
  });

  it('paragrafı ve kalın metni yazar', () => {
    const x = zipiCoz(buildDocx([
      { kind: 'paragraph', paragraph: { runs: [{ text: 'Başlık', bold: true, size: 14 }] } },
    ]))['word/document.xml'];
    expect(x).toContain('<w:b/>');
    expect(x).toContain('<w:sz w:val="28"/>'); // punto yarım punto olarak yazılır
    expect(x).toContain('Başlık');
  });

  it('paragraf zeminini ve hizasını yazar', () => {
    const x = zipiCoz(buildDocx([
      { kind: 'paragraph', paragraph: { runs: [{ text: 'x' }], align: 'center', shading: 'FFFF00' } },
    ]))['word/document.xml'];
    expect(x).toContain('<w:jc w:val="center"/>');
    expect(x).toContain('w:fill="FFFF00"');
  });

  it('tabloyu sütun genişlikleriyle kurar', () => {
    const x = zipiCoz(buildDocx([
      {
        kind: 'table',
        widths: [5000, 5000],
        rows: [[{ paragraphs: [{ runs: [{ text: 'A' }] }] }, { paragraphs: [{ runs: [{ text: 'B' }] }] }]],
      },
    ]))['word/document.xml'];
    expect(x).toContain('<w:tbl>');
    expect(x).toContain('<w:gridCol w:w="5000"/>');
    expect((x.match(/<w:tc>/g) ?? []).length).toBe(2);
  });

  it('boş hücreye bir paragraf koyar', () => {
    // Word paragrafsız hücreyi çizmez; tablo kayar.
    const x = zipiCoz(buildDocx([
      { kind: 'table', widths: [1000], rows: [[{ paragraphs: [] }]] },
    ]))['word/document.xml'];
    expect(x).toContain('<w:tc>');
    expect(x).toMatch(/<w:tc>.*<w:p>.*<\/w:tc>/s);
  });

  it('metindeki XML işaretlerini kaçırır', () => {
    const x = zipiCoz(buildDocx([
      { kind: 'paragraph', paragraph: { runs: [{ text: 'Ahmet & Elif <Yılmaz>' }] } },
    ]))['word/document.xml'];
    expect(x).toContain('Ahmet &amp; Elif &lt;Yılmaz&gt;');
    expect(x).not.toContain('<Yılmaz>');
  });

  it('boşlukları koruyacak biçimde yazar', () => {
    const x = zipiCoz(buildDocx([
      { kind: 'paragraph', paragraph: { runs: [{ text: ' başta boşluk' }] } },
    ]))['word/document.xml'];
    expect(x).toContain('xml:space="preserve"');
  });

  it('sayfa boyutunu belgeye ekler', () => {
    const x = zipiCoz(buildDocx([]))['word/document.xml'];
    expect(x).toContain('<w:pgSz w:w="11906" w:h="16838"/>'); // A4 dikey
  });
});

describe('downloadDocx', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('Word MIME türüyle indirmeyi tetikler', () => {
    const url = 'blob:ornek/docx';
    const olustur = vi.fn((_blob: Blob) => url);
    const serbestBirak = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL: olustur, revokeObjectURL: serbestBirak });

    const tiklamalar: HTMLAnchorElement[] = [];
    const gercekOlustur = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((etiket: string) => {
      const el = gercekOlustur(etiket) as HTMLAnchorElement;
      if (etiket === 'a') el.click = () => { tiklamalar.push(el); };
      return el;
    });

    downloadDocx('program.docx', buildDocx([]));

    expect(tiklamalar).toHaveLength(1);
    expect(tiklamalar[0].download).toBe('program.docx');
    expect(tiklamalar[0].href).toContain(url);
    // Yanlış MIME türünde Word dosyayı tanımaz.
    const blob = olustur.mock.calls[0][0];
    expect(blob.type).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    // Bağlantı DOM'da bırakılmamalı, nesne adresi serbest bırakılmalı.
    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
    expect(serbestBirak).toHaveBeenCalledWith(url);
  });
});
