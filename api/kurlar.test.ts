import { describe, expect, it } from 'vitest';
import { altinKodu, collectApiCevir, tcmbCevir, tcmbTarihi } from './kurlar';

/**
 * Döviz ve altın kurları (madde 28).
 *
 * Çözümleyicinin tek görevi: sağlayıcının verdiğini olduğu gibi
 * aktarmak, veremediğini de HİÇ YAZMAMAK. Boş bir alanı 0 diye yazmak,
 * ekranda "Dolar: 0,00" göstermek ve salon sahibine o rakama göre fiyat
 * belirletmek demek olurdu.
 */
const TCMB_XML = `<?xml version="1.0" encoding="ISO-8859-9"?>
<Tarih_Date Tarih="12.09.2026" Date="09/12/2026" Bulten_No="2026/175">
  <Currency CrossOrder="0" Kod="USD" CurrencyCode="USD">
    <Unit>1</Unit>
    <Isim>ABD DOLARI</Isim>
    <ForexBuying>41.2345</ForexBuying>
    <ForexSelling>41.3087</ForexSelling>
    <BanknoteBuying>41.2056</BanknoteBuying>
  </Currency>
  <Currency CrossOrder="9" Kod="EUR" CurrencyCode="EUR">
    <Unit>1</Unit>
    <Isim>EURO</Isim>
    <ForexBuying>48.1020</ForexBuying>
    <ForexSelling>48.1887</ForexSelling>
  </Currency>
  <Currency CrossOrder="1" Kod="AUD" CurrencyCode="AUD">
    <ForexBuying>27.1000</ForexBuying>
    <ForexSelling>27.2000</ForexSelling>
  </Currency>
</Tarih_Date>`;

describe('tcmbTarihi', () => {
  it('gg.aa.yyyy biçimini ISO güne çevirir', () => {
    expect(tcmbTarihi(TCMB_XML)).toBe('2026-09-12T00:00:00Z');
  });

  it('tarih yoksa null döner', () => {
    expect(tcmbTarihi('<Tarih_Date></Tarih_Date>')).toBeNull();
  });
});

describe('tcmbCevir', () => {
  it('dolar ve euroyu alış/satışıyla çıkarır', () => {
    expect(tcmbCevir(TCMB_XML)).toEqual([
      { code: 'USD', buy: 41.2345, sell: 41.3087, quotedAt: '2026-09-12T00:00:00Z' },
      { code: 'EUR', buy: 48.1020, sell: 48.1887, quotedAt: '2026-09-12T00:00:00Z' },
    ]);
  });

  // Tabloda yeri olmayan bir kod, veritabanı kısıtına takılırdı.
  it('tanınmayan para birimini almaz', () => {
    expect(tcmbCevir(TCMB_XML).some((k) => (k.code as string) === 'AUD')).toBe(false);
  });

  /*
    Hafta sonu ve tatilde bazı satırlar boş yayımlanıyor. Boş alan 0
    olarak yazılsaydı ekranda "0,00" görünürdü.
  */
  it('boş alanlı satırı atlar', () => {
    const xml = `<Tarih_Date Tarih="12.09.2026">
      <Currency CurrencyCode="USD"><ForexBuying></ForexBuying><ForexSelling></ForexSelling></Currency>
      <Currency CurrencyCode="EUR"><ForexBuying>48.10</ForexBuying><ForexSelling>48.18</ForexSelling></Currency>
    </Tarih_Date>`;
    expect(tcmbCevir(xml).map((k) => k.code)).toEqual(['EUR']);
  });

  it('tarih okunamazsa hiç satır üretmez', () => {
    expect(tcmbCevir('<Tarih_Date><Currency CurrencyCode="USD"><ForexBuying>1</ForexBuying><ForexSelling>2</ForexSelling></Currency></Tarih_Date>')).toEqual([]);
  });

  it('boş belgede boş liste döner', () => {
    expect(tcmbCevir('')).toEqual([]);
  });
});

describe('altinKodu', () => {
  it('gram altını tanır', () => {
    expect(altinKodu('Gram Altın')).toBe('GRAM_ALTIN');
    expect(altinKodu('gram altin')).toBe('GRAM_ALTIN');
  });

  it('çeyrek altını tanır', () => {
    expect(altinKodu('Çeyrek Altın')).toBe('CEYREK_ALTIN');
    expect(altinKodu('Ceyrek Altin')).toBe('CEYREK_ALTIN');
  });

  // Tabloda karşılığı olmayan kalemi yazmak kısıt hatası verirdi.
  it('tanımadığı kalemi almaz', () => {
    expect(altinKodu('Yarım Altın')).toBeNull();
    expect(altinKodu('Cumhuriyet Altını')).toBeNull();
    expect(altinKodu('')).toBeNull();
  });
});

describe('collectApiCevir', () => {
  const an = '2026-09-12T09:00:00Z';

  it('döviz yanıtından dolar ve euroyu alır', () => {
    const govde = {
      result: [
        { code: 'USD', buying: '41.20', selling: '41.31' },
        { code: 'EUR', buying: 48.10, selling: 48.19 },
        { code: 'GBP', buying: '55.10', selling: '55.30' },
      ],
    };
    expect(collectApiCevir(govde, an, false)).toEqual([
      { code: 'USD', buy: 41.2, sell: 41.31, quotedAt: an },
      { code: 'EUR', buy: 48.1, sell: 48.19, quotedAt: an },
    ]);
  });

  it('altın yanıtından gram ve çeyreği alır', () => {
    const govde = {
      result: [
        { name: 'Gram Altın', buying: '3.150,45', selling: '3.160,00' },
        { name: 'Yarım Altın', buying: '10.000', selling: '10.100' },
      ],
    };
    const satirlar = collectApiCevir(govde, an, true);
    expect(satirlar.map((s) => s.code)).toEqual(['GRAM_ALTIN']);
  });

  // Virgül ondalık ayırıcı olarak gelebiliyor.
  it('virgüllü sayıyı çevirir', () => {
    const govde = { result: [{ code: 'USD', buying: '41,20', selling: '41,31' }] };
    expect(collectApiCevir(govde, an, false)[0]).toMatchObject({ buy: 41.2, sell: 41.31 });
  });

  it('eksik alanlı satırı atlar', () => {
    const govde = { result: [{ code: 'USD', buying: '41.20' }] };
    expect(collectApiCevir(govde, an, false)).toEqual([]);
  });

  it('sıfır ya da negatif değeri almaz', () => {
    const govde = { result: [{ code: 'USD', buying: '0', selling: '41.31' }] };
    expect(collectApiCevir(govde, an, false)).toEqual([]);
  });

  it('beklenmeyen gövdede boş liste döner', () => {
    expect(collectApiCevir(null, an, false)).toEqual([]);
    expect(collectApiCevir({}, an, false)).toEqual([]);
    expect(collectApiCevir({ result: 'hata' }, an, false)).toEqual([]);
  });
});
