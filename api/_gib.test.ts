import { afterEach, describe, expect, it } from 'vitest';
import {
  durumBasarili, durumKalici, dogrudanGider, faturayiKur, isConfigured,
  senaryoSec, zarfDurumu, type InvoiceRow, type LineRow,
} from './_gib';
import { pemGovdesi, verenAdiniBicimle } from './_gib_imza';

const ESKI = { ...process.env };
afterEach(() => { process.env = { ...ESKI }; });

function invoice(over: Partial<InvoiceRow> = {}): InvoiceRow {
  return {
    id: 'i1', business_id: 'b1', invoice_number: 'SAH2026000000001',
    uuid_ettn: 'A1B2C3D4-E5F6-4A5B-9C8D-7E6F5A4B3C2D', issue_date: '2026-09-13',
    buyer_kind: 'bireysel', buyer_name: 'Ahmet Yılmaz', buyer_tax_id: '12345678901',
    buyer_tax_office: null, buyer_address: 'Test Mah.', buyer_city: 'Konya',
    buyer_district: 'Meram', buyer_email: null, buyer_phone: null,
    gross_kurus: 100_000, discount_kurus: 0, base_kurus: 100_000,
    vat_kurus: 20_000, total_kurus: 120_000, currency: 'TRY', note: null,
    ...over,
  };
}

const SATICI = {
  vkn: '1234567890', unvan: 'Sahra Yazılım A.Ş.', vergiDairesi: 'Selçuk',
  adres: 'Test Mah.', ilce: 'Selçuklu', il: 'Konya',
};

describe('isConfigured', () => {
  it('eksik yapılandırmada false döner', () => {
    delete process.env.GIB_VKN;
    expect(isConfigured()).toBe(false);
  });

  it('mali mühür yoksa false döner', () => {
    /*
      Mühür olmadan tek bir fatura bile imzalanamaz; yapılandırılmış
      sayılsaydı her gönderim imzalama adımında düşerdi.
    */
    process.env.GIB_VKN = '1234567890';
    process.env.GIB_KULLANICI = 'k';
    process.env.GIB_PAROLA = 'p';
    delete process.env.GIB_MUHUR_SERTIFIKA;
    expect(isConfigured()).toBe(false);
  });

  it('hepsi varsa true döner', () => {
    process.env.GIB_VKN = '1234567890';
    process.env.GIB_KULLANICI = 'k';
    process.env.GIB_PAROLA = 'p';
    process.env.GIB_MUHUR_SERTIFIKA = '/x/c.pem';
    process.env.GIB_MUHUR_ANAHTAR = '/x/k.pem';
    expect(isConfigured()).toBe(true);
  });
});

describe('dogrudanGider', () => {
  it('yalnızca KENDİ VKN’si için doğrudan yol seçilir', () => {
    /*
      Doğrudan entegrasyon izni izni alan mükellefin kendi faturaları
      içindir. Başka bir salonun faturası bu yoldan gitseydi, özel
      entegratör lisansı olmadan başkası adına fatura kesilmiş olurdu.
    */
    process.env.GIB_VKN = '1234567890';
    expect(dogrudanGider('1234567890')).toBe(true);
    expect(dogrudanGider('9876543210')).toBe(false);
  });

  it('VKN tanımsızsa hiçbir faturayı doğrudan göndermez', () => {
    delete process.env.GIB_VKN;
    expect(dogrudanGider('1234567890')).toBe(false);
  });
});

describe('senaryoSec', () => {
  it('mükellef olmayan alıcıda e-Arşiv seçer', () => {
    // Düğün müşterileri şahıs; pratikte hemen her fatura buraya düşüyor.
    expect(senaryoSec(false)).toBe('EARSIVFATURA');
    expect(senaryoSec(true)).toBe('TEMELFATURA');
  });
});

describe('zarf durum kodları', () => {
  it('kodu okunur metne çevirir', () => {
    expect(zarfDurumu('1110')).toBe('Zarf başarıyla işlendi');
    expect(zarfDurumu('1230')).toBe('Zarf hatalı, alıcıya ulaştırılamadı');
  });

  it('bilinmeyen kodu ham hâliyle bildirir', () => {
    expect(zarfDurumu('9999')).toContain('9999');
    expect(zarfDurumu('')).toContain('-');
  });

  it('kalıcı hataları beklemeden ayırır', () => {
    // 1100 "işleniyor": beklenmeli. 1140 şema hatası: beklemek boşuna.
    expect(durumKalici('1100')).toBe(false);
    expect(durumKalici('1140')).toBe(true);
    expect(durumKalici('1220')).toBe(true);
  });

  it('başarılı durumları ayırır', () => {
    expect(durumBasarili('1110')).toBe(true);
    expect(durumBasarili('1200')).toBe(true);
    expect(durumBasarili('1100')).toBe(false);
  });
});

describe('faturayiKur', () => {
  const lines: LineRow[] = [
    {
      line_no: 2, description: 'İkinci', quantity: 1, unit: 'Adet',
      unit_price_kurus: 20_000, discount_rate: 0, vat_rate: 20,
      gross_kurus: 20_000, base_kurus: 20_000, vat_kurus: 4_000,
    },
    {
      line_no: 1, description: 'Birinci', quantity: 2, unit: 'Kişi',
      unit_price_kurus: 40_000, discount_rate: 10, vat_rate: 20,
      gross_kurus: 80_000, base_kurus: 72_000, vat_kurus: 14_400,
    },
  ];

  it('satırları sıra numarasına göre dizer', () => {
    // Veritabanı sırası garanti değil; UBL'de sıra anlamlı.
    const f = faturayiKur(invoice(), lines, SATICI, false);
    expect(f.satirlar.map((s) => s.siraNo)).toEqual([1, 2]);
  });

  it('iskontoyu ORAN değil TUTAR olarak hesaplar', () => {
    /*
      Veritabanında oran duruyor, GİB tutar istiyor. Oran yazılsaydı
      belge toplamıyla satır toplamı tutmaz ve zarf reddedilirdi.
    */
    const f = faturayiKur(invoice(), lines, SATICI, false);
    expect(f.satirlar[0]?.iskontoKurus).toBe(8_000);
    expect(f.satirlar[1]?.iskontoKurus).toBe(0);
  });

  it('bireysel alıcıyı işaretler', () => {
    expect(faturayiKur(invoice(), lines, SATICI, false).alici.bireysel).toBe(true);
    expect(
      faturayiKur(invoice({ buyer_kind: 'kurumsal' }), lines, SATICI, false).alici.bireysel,
    ).toBe(false);
  });

  it('boş alanları undefined bırakır, boş metin yazmaz', () => {
    const f = faturayiKur(invoice({ buyer_address: null, buyer_email: null }), lines, SATICI, false);
    expect(f.alici.adres).toBeUndefined();
    expect(f.alici.eposta).toBeUndefined();
  });

  it('para birimi boşsa TRY kullanır', () => {
    expect(faturayiKur(invoice({ currency: '' }), lines, SATICI, false).paraBirimi).toBe('TRY');
  });
});

describe('mali mühür yardımcıları', () => {
  it('PEM gövdesini başlıksız verir', () => {
    const pem = '-----BEGIN CERTIFICATE-----\nQUJD\nREVG\n-----END CERTIFICATE-----\n';
    expect(pemGovdesi(pem)).toBe('QUJDREVG');
  });

  it('veren adını XAdES sırasına çevirir', () => {
    /*
      Node satır satır veriyor; XAdES virgülle ayrılmış TERS sıra
      bekliyor. Ters çevrilmezse bazı doğrulayıcılar sertifikayı
      bulamıyor.
    */
    expect(verenAdiniBicimle('C=TR\nO=KamuSM\nCN=Mali Mühür'))
      .toBe('CN=Mali Mühür,O=KamuSM,C=TR');
  });
});
