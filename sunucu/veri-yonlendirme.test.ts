import { describe, expect, it } from 'vitest';
import { faturaKaynagiMi, hedefKok, kaynakAdi } from './veri-yonlendirme';

const ANA = 'http://yurtdisi:3000';
const TR = 'http://turkiye:3000';

describe('kaynakAdi', () => {
  it('tablo adını çıkarır', () => {
    expect(kaynakAdi('/veri/invoices?select=*')).toBe('invoices');
    expect(kaynakAdi('/veri/reservations')).toBe('reservations');
  });

  it('rpc çağrısını ad alanıyla birlikte verir', () => {
    // rpc/next_invoice_number ile rpc/kasa_ozeti aynı kaynağa düşmemeli.
    expect(kaynakAdi('/veri/rpc/next_invoice_number')).toBe('rpc/next_invoice_number');
    expect(kaynakAdi('/veri/rpc/kasa_ozeti')).toBe('rpc/kasa_ozeti');
  });

  it('/veri ön eki olmadan da çalışır', () => {
    // api/_db.ts PostgREST'e doğrudan konuşuyor, yolunda /veri yok.
    expect(kaynakAdi('invoices?id=eq.1')).toBe('invoices');
    expect(kaynakAdi('rpc/next_invoice_number')).toBe('rpc/next_invoice_number');
    expect(kaynakAdi('reservations?select=*')).toBe('reservations');
  });

  it('kök yolda boş döner', () => {
    expect(kaynakAdi('/veri')).toBe('');
    expect(kaynakAdi('/veri/')).toBe('');
  });
});

describe('faturaKaynagiMi', () => {
  it('fatura tablolarını tanır', () => {
    expect(faturaKaynagiMi('/veri/invoices?id=eq.1')).toBe(true);
    expect(faturaKaynagiMi('/veri/invoice_lines')).toBe(true);
    // Numara sırası faturayla AYNI veritabanında olmalı.
    expect(faturaKaynagiMi('/veri/invoice_series')).toBe(true);
    expect(faturaKaynagiMi('/veri/rpc/next_invoice_number')).toBe(true);
  });

  it('diğer tabloları fatura saymaz', () => {
    expect(faturaKaynagiMi('/veri/reservations')).toBe(false);
    expect(faturaKaynagiMi('/veri/payments')).toBe(false);
    expect(faturaKaynagiMi('/veri/profiles')).toBe(false);
  });

  it('ADI FATURAYLA BAŞLAYAN başka tabloyu yanlışlıkla almaz', () => {
    /*
      Ön ek eşleşmesi yapılsaydı ileride eklenecek "invoices_arsiv" gibi
      bir tablo da Türkiye'ye düşerdi. Tam ad karşılaştırılıyor.
    */
    expect(faturaKaynagiMi('/veri/invoices_arsiv')).toBe(false);
    expect(faturaKaynagiMi('/veri/invoice_lines_eski')).toBe(false);
  });
});

describe('hedefKok', () => {
  it('bölme yapılmışsa faturayı Türkiye’ye yollar', () => {
    expect(hedefKok('/veri/invoices', ANA, TR)).toBe(TR);
    expect(hedefKok('/veri/reservations', ANA, TR)).toBe(ANA);
  });

  it('sunucu içi çağrıyı da aynı yere yollar', () => {
    // Aynı tablo, iki farklı yol biçimi -> aynı sunucu.
    expect(hedefKok('invoices?id=eq.1', ANA, TR)).toBe(TR);
    expect(hedefKok('rpc/next_invoice_number', ANA, TR)).toBe(TR);
    expect(hedefKok('rpc/kasa_ozeti', ANA, TR)).toBe(ANA);
  });

  it('bölme YAPILMAMIŞSA her şey ana veritabanına gider', () => {
    // Tek sunuculu kurulum bu dosyadan etkilenmemeli.
    expect(hedefKok('/veri/invoices', ANA, undefined)).toBe(ANA);
    expect(hedefKok('/veri/invoices', ANA, '')).toBe(ANA);
  });
});
