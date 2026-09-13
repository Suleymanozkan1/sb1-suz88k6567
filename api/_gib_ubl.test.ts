import { describe, expect, it } from 'vitest';
import {
  birimKodu, miktar, tutar, ublFaturaUret, xmlKacis, type GibFatura,
} from './_gib_ubl';

function fatura(over: Partial<GibFatura> = {}): GibFatura {
  return {
    ettn: 'A1B2C3D4-E5F6-4A5B-9C8D-7E6F5A4B3C2D',
    faturaNo: 'SAH2026000000001',
    tarih: '2026-09-13',
    saat: '14:30:00',
    senaryo: 'TEMELFATURA',
    paraBirimi: 'TRY',
    satici: {
      vknTckn: '1234567890', unvan: 'Sahra Yazılım A.Ş.',
      vergiDairesi: 'Selçuk', adres: 'Test Mah. 1. Sok. No:1',
      ilce: 'Selçuklu', il: 'Konya',
    },
    alici: { unvan: 'Ahmet Yılmaz', vknTckn: '12345678901', bireysel: true },
    satirlar: [{
      siraNo: 1, aciklama: 'Salon kirası', miktar: 1, birim: 'Adet',
      birimFiyatKurus: 100_000, iskontoKurus: 0, kdvOrani: 20,
      matrahKurus: 100_000, kdvKurus: 20_000,
    }],
    brutKurus: 100_000, iskontoKurus: 0, matrahKurus: 100_000,
    kdvKurus: 20_000, toplamKurus: 120_000,
    ...over,
  };
}

describe('tutar', () => {
  it('kuruşu iki ondalıkla yazar', () => {
    expect(tutar(100_000)).toBe('1000.00');
    expect(tutar(12_345)).toBe('123.45');
    expect(tutar(5)).toBe('0.05');
    expect(tutar(0)).toBe('0.00');
  });

  it('ondalık aritmetiğe DÜŞMEZ', () => {
    /*
      Kuruş üzerinden hesaplanmasaydı 0.1 + 0.2 = 0.30000000000000004
      gibi bir değer GİB şema doğrulamasından dönerdi.
    */
    expect(tutar(10 + 20)).toBe('0.30');
  });

  it('eksi tutarı işaretiyle yazar', () => {
    expect(tutar(-12_345)).toBe('-123.45');
  });
});

describe('miktar', () => {
  it('gereksiz sıfırları atar', () => {
    expect(miktar(1)).toBe('1');
    expect(miktar(2.5)).toBe('2.5');
    expect(miktar(1.250)).toBe('1.25');
  });

  it('üç ondalığa yuvarlar', () => {
    expect(miktar(1.23456)).toBe('1.235');
  });
});

describe('xmlKacis', () => {
  it('XML özel karakterlerini kaçırır', () => {
    // "Öz & Kardeşler" kaçışsız yazılsaydı belge bozulur, zarf reddedilirdi.
    expect(xmlKacis('Öz & Kardeşler')).toBe('Öz &amp; Kardeşler');
    expect(xmlKacis('<x>"a"</x>')).toBe('&lt;x&gt;&quot;a&quot;&lt;/x&gt;');
  });
});

describe('birimKodu', () => {
  it('Türkçe birimi UN/ECE koduna çevirir', () => {
    expect(birimKodu('Adet')).toBe('C62');
    expect(birimKodu('kg')).toBe('KGM');
    expect(birimKodu('Litre')).toBe('LTR');
    expect(birimKodu('Kişi')).toBe('C62');
  });

  it('tanınmayan birimi adede düşürür', () => {
    // Faturayı reddettirmek yerine düzeltilebilir bir sonuç bırakılıyor.
    expect(birimKodu('uydurma')).toBe('C62');
  });
});

describe('ublFaturaUret', () => {
  it('UBL-TR sürüm ve özelleştirme bilgisini yazar', () => {
    const xml = ublFaturaUret(fatura());
    expect(xml).toContain('<cbc:UBLVersionID>2.1</cbc:UBLVersionID>');
    expect(xml).toContain('<cbc:CustomizationID>TR1.2</cbc:CustomizationID>');
    expect(xml).toContain('<cbc:ProfileID>TEMELFATURA</cbc:ProfileID>');
  });

  it('ETTN’i KÜÇÜK HARFE çevirir', () => {
    // GİB büyük harfli UUID'yi reddediyor.
    const xml = ublFaturaUret(fatura());
    expect(xml).toContain('<cbc:UUID>a1b2c3d4-e5f6-4a5b-9c8d-7e6f5a4b3c2d</cbc:UUID>');
  });

  it('bireysel alıcıda Person, kurumsalda PartyName yazar', () => {
    const bireysel = ublFaturaUret(fatura());
    expect(bireysel).toContain('<cac:Person><cbc:FirstName>Ahmet Yılmaz</cbc:FirstName></cac:Person>');
    expect(bireysel).toContain('schemeID="TCKN"');

    const kurumsal = ublFaturaUret(fatura({
      alici: {
        unvan: 'Test Ltd. Şti.', vknTckn: '9876543210',
        vergiDairesi: 'Meram', bireysel: false,
      },
    }));
    expect(kurumsal).toContain('<cac:PartyName><cbc:Name>Test Ltd. Şti.</cbc:Name></cac:PartyName>');
    expect(kurumsal).toContain('schemeID="VKN"');
    // İkisi birden yazılırsa GİB şahıs/tüzel kişi ayrımını yapamıyor.
    expect(kurumsal).not.toContain('<cac:Person>');
  });

  it('KDV toplamını ORANA GÖRE gruplar', () => {
    /*
      Her satır için ayrı TaxSubtotal yazılsaydı GİB aynı oranı birden
      çok kez görür ve belgeyi reddederdi.
    */
    const xml = ublFaturaUret(fatura({
      satirlar: [
        { siraNo: 1, aciklama: 'A', miktar: 1, birim: 'Adet', birimFiyatKurus: 10_000, iskontoKurus: 0, kdvOrani: 20, matrahKurus: 10_000, kdvKurus: 2_000 },
        { siraNo: 2, aciklama: 'B', miktar: 1, birim: 'Adet', birimFiyatKurus: 20_000, iskontoKurus: 0, kdvOrani: 20, matrahKurus: 20_000, kdvKurus: 4_000 },
        { siraNo: 3, aciklama: 'C', miktar: 1, birim: 'Adet', birimFiyatKurus: 5_000, iskontoKurus: 0, kdvOrani: 10, matrahKurus: 5_000, kdvKurus: 500 },
      ],
      matrahKurus: 35_000, kdvKurus: 6_500, toplamKurus: 41_500, brutKurus: 35_000,
    }));
    // Belge düzeyinde iki alt toplam: %10 ve %20.
    const belgeVergisi = xml.slice(xml.indexOf('<cac:TaxTotal>'), xml.indexOf('<cac:LegalMonetaryTotal>'));
    expect(belgeVergisi.match(/<cbc:Percent>/g)).toHaveLength(2);
    expect(belgeVergisi).toContain('<cbc:Percent>10</cbc:Percent>');
    expect(belgeVergisi).toContain('<cbc:Percent>20</cbc:Percent>');
    // %20 grubunun matrahı iki satırın toplamı.
    expect(belgeVergisi).toContain('<cbc:TaxableAmount currencyID="TRY">300.00</cbc:TaxableAmount>');
  });

  it('satır sayısını yazar', () => {
    const xml = ublFaturaUret(fatura());
    expect(xml).toContain('<cbc:LineCountNumeric>1</cbc:LineCountNumeric>');
  });

  it('toplamları tutarlı yazar', () => {
    const xml = ublFaturaUret(fatura());
    expect(xml).toContain('<cbc:TaxExclusiveAmount currencyID="TRY">1000.00</cbc:TaxExclusiveAmount>');
    expect(xml).toContain('<cbc:TaxInclusiveAmount currencyID="TRY">1200.00</cbc:TaxInclusiveAmount>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="TRY">1200.00</cbc:PayableAmount>');
  });

  it('iskonto yoksa iskonto bloğu yazmaz', () => {
    const xml = ublFaturaUret(fatura());
    expect(xml).not.toContain('<cac:AllowanceCharge>');
  });

  it('iskonto varsa tutarı yazar', () => {
    const xml = ublFaturaUret(fatura({ iskontoKurus: 5_000 }));
    expect(xml).toContain('<cbc:ChargeIndicator>false</cbc:ChargeIndicator>');
    expect(xml).toContain('<cbc:AllowanceTotalAmount currencyID="TRY">50.00</cbc:AllowanceTotalAmount>');
  });

  it('imza bloğu için yer BIRAKIR ama imza koymaz', () => {
    // İmzalama ayrı adım; burada üretilen belge imzalanmaya hazır ham belge.
    const xml = ublFaturaUret(fatura());
    expect(xml).toContain('<ext:UBLExtensions>');
    expect(xml).not.toContain('<ds:Signature');
  });

  it('boş alanları etiketsiz bırakır', () => {
    const xml = ublFaturaUret(fatura({
      alici: { unvan: 'Adsız', bireysel: true },
    }));
    // Yalnızca ALICI bloğuna bakılıyor: satıcının VKN'si meşru olarak var.
    const aliciBlogu = xml.slice(
      xml.indexOf('<cac:AccountingCustomerParty>'),
      xml.indexOf('</cac:AccountingCustomerParty>'),
    );
    expect(aliciBlogu).not.toContain('<cac:PartyIdentification>');
    expect(aliciBlogu).not.toContain('<cbc:Telephone>');
    expect(aliciBlogu).toContain('<cbc:FirstName>Adsız</cbc:FirstName>');
  });

  it('geçerli XML üretir', () => {
    const xml = ublFaturaUret(fatura({
      satici: { ...fatura().satici, unvan: 'Öz & Kardeşler A.Ş.' },
    }));
    // Kaçış yapılmamış & kalmamalı.
    expect(/&(?!(amp|lt|gt|quot|apos);)/.test(xml)).toBe(false);
    // Açılan her etiket kapanmalı (kaba denetim).
    expect(xml.split('<Invoice').length).toBe(2);
    expect(xml).toContain('</Invoice>');
  });
});
