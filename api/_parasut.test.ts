import { describe, expect, it } from 'vitest';
import {
  ParasutError, buildContactAttributes, buildEArchivePayload, buildEInvoicePayload,
  buildSalesInvoicePayload, describeError, money, splitInvoiceNumber,
} from './_parasut';
import type { InvoiceRow, LineRow } from './_parasut';

function makeInvoice(over: Partial<InvoiceRow> = {}): InvoiceRow {
  return {
    id: 'inv-1',
    invoice_number: 'DGT2026000000042',
    uuid_ettn: '11111111-2222-3333-4444-555555555555',
    kind: 'e-Arsiv',
    issue_date: '2026-09-02',
    buyer_kind: 'bireysel',
    buyer_name: 'Ayşe Yılmaz',
    buyer_tax_id: null,
    buyer_tax_office: null,
    buyer_address: 'Bahçelievler Mah. 12/3',
    buyer_city: 'Ankara',
    buyer_district: 'Çankaya',
    buyer_email: 'ayse@ornek.com',
    base_kurus: 25_000_00,
    vat_kurus: 5_000_00,
    total_kurus: 30_000_00,
    note: null,
    ...over,
  };
}

function makeLine(over: Partial<LineRow> = {}): LineRow {
  return {
    line_no: 1,
    description: 'Düğün salonu kiralama',
    quantity: 1,
    unit: 'ADET',
    unit_price_kurus: 25_000_00,
    discount_rate: 0,
    vat_rate: 20,
    base_kurus: 25_000_00,
    vat_kurus: 5_000_00,
    total_kurus: 30_000_00,
    ...over,
  };
}

describe('kuruş dönüşümü', () => {
  it('kuruşu ondalıklı tutara çevirir', () => {
    expect(money(25_000_00)).toBe(25000);
    expect(money(1)).toBe(0.01);
    expect(money(123_45)).toBe(123.45);
  });

  it('kayan nokta artığı bırakmaz', () => {
    // 1999.99 gibi tutarlar naif bölmede 1999.9899999999998 üretebilir
    expect(money(199_999)).toBe(1999.99);
    expect(String(money(199_999))).not.toContain('9999999');
  });
});

describe('fatura numarası ayrıştırma', () => {
  it('16 haneli numarayı seri ve sıraya böler', () => {
    expect(splitInvoiceNumber('DGT2026000000042')).toEqual({ series: 'DGT', id: 42 });
  });

  it('baştaki sıfırları sayıya çevirir', () => {
    expect(splitInvoiceNumber('ABC2026000000001').id).toBe(1);
    expect(splitInvoiceNumber('ABC2026123456789').id).toBe(123456789);
  });

  it('biçimi bozuk numarayı reddeder', () => {
    for (const bad of ['DGT202600042', 'DG2026000000042', 'dgt2026000000042', '']) {
      expect(() => splitInvoiceNumber(bad)).toThrow(ParasutError);
    }
  });
});

describe('alıcı kaydı', () => {
  it('bireysel alıcıyı kişi olarak işaretler', () => {
    expect(buildContactAttributes(makeInvoice())).toMatchObject({
      name: 'Ayşe Yılmaz', contact_type: 'person', account_type: 'customer',
    });
  });

  it('kurumsal alıcıyı firma olarak işaretler ve vergi bilgisini taşır', () => {
    const attrs = buildContactAttributes(makeInvoice({
      buyer_kind: 'kurumsal', buyer_name: 'Örnek A.Ş.',
      buyer_tax_id: '1234567890', buyer_tax_office: 'Çankaya',
    }));
    expect(attrs).toMatchObject({
      contact_type: 'company', tax_number: '1234567890', tax_office: 'Çankaya',
    });
  });

  it('boş alanları undefined bırakır (null göndermez)', () => {
    const attrs = buildContactAttributes(makeInvoice({ buyer_email: null, buyer_city: null }));
    expect(attrs.email).toBeUndefined();
    expect(attrs.city).toBeUndefined();
  });
});

describe('satış faturası gövdesi', () => {
  it('numarayı seri ve sıra olarak gönderir', () => {
    const payload = buildSalesInvoicePayload(makeInvoice(), [makeLine()], 'contact-9');
    expect(payload.data.attributes).toMatchObject({
      invoice_series: 'DGT', invoice_id: 42, item_type: 'invoice',
    });
  });

  it('Türk lirasını Paraşüt kodu TRL ile gönderir', () => {
    const payload = buildSalesInvoicePayload(makeInvoice(), [makeLine()], 'c1');
    expect(payload.data.attributes.currency).toBe('TRL');
  });

  it('alıcıyı ilişki olarak bağlar', () => {
    const payload = buildSalesInvoicePayload(makeInvoice(), [makeLine()], 'contact-9');
    expect(payload.data.relationships.contact.data).toEqual({ id: 'contact-9', type: 'contacts' });
  });

  it('kalemleri satır numarasına göre sıralar', () => {
    const lines = [
      makeLine({ line_no: 3, description: 'Üçüncü' }),
      makeLine({ line_no: 1, description: 'Birinci' }),
      makeLine({ line_no: 2, description: 'İkinci' }),
    ];
    const payload = buildSalesInvoicePayload(makeInvoice(), lines, 'c1');
    expect(payload.data.relationships.details.data.map((d) => d.attributes.description))
      .toEqual(['Birinci', 'İkinci', 'Üçüncü']);
  });

  it('girdi dizisini bozmaz', () => {
    const lines = [makeLine({ line_no: 2 }), makeLine({ line_no: 1 })];
    buildSalesInvoicePayload(makeInvoice(), lines, 'c1');
    expect(lines[0].line_no).toBe(2);
  });

  it('birim fiyatı ve indirimi kalem düzeyinde taşır', () => {
    const payload = buildSalesInvoicePayload(
      makeInvoice(), [makeLine({ unit_price_kurus: 1_500_50, discount_rate: 10, vat_rate: 10 })], 'c1',
    );
    expect(payload.data.relationships.details.data[0].attributes).toMatchObject({
      unit_price: 1500.5, vat_rate: 10, discount_type: 'percentage', discount_value: 10,
    });
  });
});

describe('e-belge gövdeleri', () => {
  it('e-Arşiv gövdesi satış faturasına bağlanır', () => {
    const payload = buildEArchivePayload('si-7', makeInvoice());
    expect(payload.data.type).toBe('e_archives');
    expect(payload.data.relationships.sales_invoice.data)
      .toEqual({ id: 'si-7', type: 'sales_invoices' });
  });

  it('e-Fatura gövdesi GİB posta kutusunu taşır', () => {
    const payload = buildEInvoicePayload('si-7', 'urn:mail:defaultpk@ornek.com.tr');
    expect(payload.data.type).toBe('e_invoices');
    expect(payload.data.attributes.to).toBe('urn:mail:defaultpk@ornek.com.tr');
  });
});

describe('hata çözümleme', () => {
  it('JSON:API hata listesini okunur metne çevirir', () => {
    const body = JSON.stringify({
      errors: [{ title: 'Invalid', detail: 'invoice_id zaten kullanılmış' }],
    });
    expect(describeError(422, body)).toBe('Paraşüt (422): invoice_id zaten kullanılmış');
  });

  it('birden çok hatayı birleştirir', () => {
    const body = JSON.stringify({ errors: [{ detail: 'Bir' }, { detail: 'İki' }] });
    expect(describeError(422, body)).toContain('Bir; İki');
  });

  it('OAuth hata biçimini de anlar', () => {
    const body = JSON.stringify({ error: 'invalid_grant', error_description: 'Şifre hatalı' });
    expect(describeError(401, body)).toBe('Paraşüt (401): Şifre hatalı');
  });

  it('JSON olmayan gövdeyi ham hâliyle gösterir', () => {
    expect(describeError(500, '<html>Gateway Error</html>')).toContain('Gateway Error');
  });

  it('çok uzun gövdeyi kısaltır (veritabanı alanı taşmasın)', () => {
    expect(describeError(500, 'x'.repeat(5000)).length).toBeLessThanOrEqual(300);
  });
});
