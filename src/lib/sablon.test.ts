import { describe, expect, it } from 'vitest';
import { degerler, doldur, olc } from './sablon';
import type { Payment, Reservation } from '../types';

const rezervasyon: Reservation = {
  id: 'r1', businessId: 'b1', code: 'SA-2026-4141',
  customerName: 'Ayşe Yılmaz', customerPhone: '5321234567',
  date: '2026-09-16', slot: 'Gece', organizationType: 'Düğün',
  guestCount: 320, totalAmount: 210000, deposit: 60000, currency: 'TL',
  status: 'Kesin Rezervasyon', colorKey: 'dugun', services: [],
  createdAt: '', updatedAt: '',
} as unknown as Reservation;

const odeme = (amount: number): Payment =>
  ({ id: `p${amount}`, reservationId: 'r1', date: '2026-08-08', amount, method: 'Nakit', createdAt: '' });

describe('yer tutucu doldurma', () => {
  it('bilinen adları değiştirir', () => {
    expect(doldur('Sayın {musteri}, {tarih} tarihinde.', { musteri: 'Ayşe', tarih: '16.09.2026' }))
      .toBe('Sayın Ayşe, 16.09.2026 tarihinde.');
  });

  it('bilinmeyen adı olduğu gibi bırakır', () => {
    // Boşa çevirmek "Sayın ," gibi bir mesajın müşteriye gitmesine yol açıyordu.
    expect(doldur('Sayın {musteri}, {yok}.', { musteri: 'Ayşe' })).toBe('Sayın Ayşe, {yok}.');
  });

  it('aynı yer tutucu birden çok kez geçerse hepsini değiştirir', () => {
    expect(doldur('{ad} ve yine {ad}', { ad: 'X' })).toBe('X ve yine X');
  });

  it('değerin içindeki süslü parantezi yeniden işlemez', () => {
    // Art arda replace çağırmak buradaki {tarih} metnini ikinci turda
    // yeniden değiştiriyordu; tek geçişte doldurulur.
    expect(doldur('{a} {tarih}', { a: '{tarih}', tarih: '01.01.2027' }))
      .toBe('{tarih} 01.01.2027');
  });

  it('boş gövdeyi olduğu gibi döndürür', () => {
    expect(doldur('', { a: 'b' })).toBe('');
  });
});

describe('rezervasyondan değer çıkarma', () => {
  it('kalan alacağı tahsilatlardan hesaplar', () => {
    const d = degerler(rezervasyon, [odeme(60000)], 'Grand Sahra', 'Kristal Salon');
    expect(d['tutar']).toBe('210.000,00');
    expect(d['odenen']).toBe('60.000,00');
    expect(d['kalan']).toBe('150.000,00');
  });

  it('tahsilat toplamı tutarı aşarsa kalan sıfırdır, negatif olmaz', () => {
    const d = degerler(rezervasyon, [odeme(250000)], 'Grand Sahra', 'Kristal Salon');
    expect(d['kalan']).toBe('0,00');
  });

  it('tutarlarda para simgesi bulunmaz', () => {
    // "₺" bazı operatörlerde mesajı Türkçe alfabe moduna düşürüp ikiye bölüyor.
    const d = degerler(rezervasyon, [], 'Grand Sahra', 'Kristal Salon');
    expect(d['tutar']).not.toContain('₺');
  });

  it('tarih ve müşteri bilgisini taşır', () => {
    const d = degerler(rezervasyon, [], 'Grand Sahra', 'Kristal Salon');
    expect(d['musteri']).toBe('Ayşe Yılmaz');
    expect(d['kod']).toBe('SA-2026-4141');
    expect(d['salon']).toBe('Kristal Salon');
    expect(d['seans']).toBe('Gece');
  });
});

describe('mesaj uzunluğu', () => {
  it('yalnızca GSM-7 karakterlerinde 160 sınırını kullanır', () => {
    expect(olc('a'.repeat(160))).toEqual({ karakter: 160, parca: 1, turkce: false });
    expect(olc('a'.repeat(161)).parca).toBe(2);
  });

  it('tek bir Türkçe harf sınırı 70e düşürür', () => {
    // Bu, faturayı iki katına çıkarabildiği için kullanıcıya gösterilir.
    const yetmis = 'ş' + 'a'.repeat(69);
    expect(olc(yetmis)).toEqual({ karakter: 70, parca: 1, turkce: true });
    expect(olc('ş' + 'a'.repeat(70)).parca).toBe(2);
  });

  it('çok parçalı mesajda parça başına karakter azalır', () => {
    // Birleştirme başlığı her parçadan 7 bit yer alır: 160 → 153, 70 → 67.
    expect(olc('a'.repeat(306)).parca).toBe(2);
    expect(olc('a'.repeat(307)).parca).toBe(3);
  });

  it('boş metin sıfır parçadır', () => {
    expect(olc('')).toEqual({ karakter: 0, parca: 0, turkce: false });
  });

  it('Türkçe harfleri sayar, ASCII sanmaz', () => {
    expect(olc('İıĞğŞşÖöÇçÜü').turkce).toBe(true);
    expect(olc('Merhaba dunya').turkce).toBe(false);
  });
});
