import { describe, expect, it } from 'vitest';
import { kasayaGirdiMi, odemeMetni, odemeOlaylari } from './odemeOlayi';
import type { Payment } from '../types';

/**
 * Tahsilat olayları.
 *
 * Aynı kural veritabanı tetikleyicisinde de duruyor (`payment_olay_yaz`).
 * İkisi ayrışırsa kullanıcı ekranda gördüğü uyarının karşılığını kayıtta
 * bulamaz; bu testler ve 18 numaralı SQL paketi aynı örnekleri sınıyor.
 */

function odeme(over: Partial<Payment> = {}): Payment {
  return {
    id: 'p1', reservationId: 'r1', date: '2026-09-12', amount: 50000,
    method: 'Nakit', createdAt: '2026-09-12T09:00:00.000Z', ...over,
  };
}

describe('kasayaGirdiMi', () => {
  it('nakit, kart ve havaleyi kasaya girmiş sayar', () => {
    expect(kasayaGirdiMi('Nakit')).toBe(true);
    expect(kasayaGirdiMi('Kredi Kartı')).toBe(true);
    expect(kasayaGirdiMi('Havale/EFT')).toBe(true);
  });

  /*
    Çek ve senet tahsil edilmemiş bir vaattir. Kasadaki parayla
    toplanırsa kasa olduğundan büyük görünür ve gerçekte olmayan bir
    paraya göre karar alınır.
  */
  it('çek ve senedi kasaya girmemiş sayar', () => {
    expect(kasayaGirdiMi('Çek')).toBe(false);
    expect(kasayaGirdiMi('Senet')).toBe(false);
  });
});

describe('odemeOlaylari', () => {
  it('yeni tahsilatta ekleme olayı üretir', () => {
    expect(odemeOlaylari(null, odeme())).toEqual(['tahsilat_eklendi']);
  });

  it('çekle alınan tahsilatta ayrıca kasaya girmedi olayı üretir', () => {
    expect(odemeOlaylari(null, odeme({ method: 'Çek' })))
      .toEqual(['tahsilat_eklendi', 'kasaya_girmedi']);
  });

  it('silmede silme olayı üretir', () => {
    expect(odemeOlaylari(odeme(), null)).toEqual(['tahsilat_silindi']);
  });

  /*
    Tek bir "güncellendi" olayı yazılsaydı NEYİN değiştiği kaybolurdu;
    yöneticiye giden mesaj da "bir şey değişti" demekten öteye gitmezdi.
  */
  it('tutar ve tip birlikte değişince iki olay üretir', () => {
    expect(odemeOlaylari(odeme(), odeme({ amount: 60000, method: 'Havale/EFT' })))
      .toEqual(['tutar_degisti', 'tip_degisti']);
  });

  it('tipi çeke çevirmek ayrıca kasaya girmedi olayı üretir', () => {
    expect(odemeOlaylari(odeme(), odeme({ method: 'Senet' })))
      .toEqual(['tip_degisti', 'kasaya_girmedi']);
  });

  it('tarih değişikliğini ayrı olay sayar', () => {
    expect(odemeOlaylari(odeme(), odeme({ date: '2026-09-20' })))
      .toEqual(['tarih_degisti']);
  });

  // Rakam değişmediyse kayıt şişmemeli: açıklama düzeltmesi olay değildir.
  it('yalnızca açıklama değişince olay üretmez', () => {
    expect(odemeOlaylari(odeme(), odeme({ note: 'düzeltme' }))).toEqual([]);
  });

  it('hiçbir şey değişmediyse olay üretmez', () => {
    expect(odemeOlaylari(odeme(), odeme())).toEqual([]);
  });

  it('iki taraf da boşsa olay üretmez', () => {
    expect(odemeOlaylari(null, null)).toEqual([]);
  });
});

describe('odemeMetni', () => {
  it('bilinen yer tutucuları doldurur', () => {
    expect(odemeMetni('{kod}: {tutar} alindi', { kod: '2026-135', tutar: '55.500,00 TL' }))
      .toBe('2026-135: 55.500,00 TL alindi');
  });

  it('aynı yer tutucu birden çok geçiyorsa hepsini doldurur', () => {
    expect(odemeMetni('{kod} / {kod}', { kod: 'A' })).toBe('A / A');
  });

  /*
    Bilinmeyen ad boşa ÇEVRİLMİYOR: "Sayin ," diye giden bir mesaj
    yerine yer tutucunun kendisi görünsün ve hata fark edilsin.
  */
  it('bilinmeyen yer tutucuyu olduğu gibi bırakır', () => {
    expect(odemeMetni('{kod} {yok}', { kod: 'A' })).toBe('A {yok}');
  });
});
