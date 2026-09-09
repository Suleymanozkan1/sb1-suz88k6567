import { doldur, olcSms } from '../src/sablon';

/**
 * Bu kurallar web tarafındaki src/lib/sablon.ts ile aynı olmak zorunda:
 * iki uygulamanın aynı taslaktan farklı metin üretmesi, kullanıcının
 * önizlemede gördüğünden başka bir mesajın gitmesi demek.
 */
describe('yer tutucu doldurma', () => {
  it('bilinen adları değiştirir', () => {
    expect(doldur('Sayın {musteri}, {tarih} tarihinde.', { musteri: 'Ayşe', tarih: '16.09.2026' }))
      .toBe('Sayın Ayşe, 16.09.2026 tarihinde.');
  });

  it('bilinmeyen adı olduğu gibi bırakır', () => {
    // Boşa çevirmek "Sayın ," gibi bir mesajın müşteriye gitmesine yol açıyordu.
    expect(doldur('Sayın {musteri}, {yok}.', { musteri: 'Ayşe' })).toBe('Sayın Ayşe, {yok}.');
  });

  it('aynı yer tutucuyu her geçtiği yerde değiştirir', () => {
    expect(doldur('{ad} ve yine {ad}', { ad: 'X' })).toBe('X ve yine X');
  });

  it('değerin içindeki süslü parantezi yeniden işlemez', () => {
    expect(doldur('{a} {tarih}', { a: '{tarih}', tarih: '01.01.2027' }))
      .toBe('{tarih} 01.01.2027');
  });

  it('boş gövdeyi olduğu gibi döndürür', () => {
    expect(doldur('', { a: 'b' })).toBe('');
  });
});

describe('SMS uzunluğu', () => {
  it('yalnızca GSM-7 karakterlerinde 160 sınırını kullanır', () => {
    expect(olcSms('a'.repeat(160))).toEqual({ karakter: 160, parca: 1, turkce: false });
    expect(olcSms('a'.repeat(161)).parca).toBe(2);
  });

  it('tek bir Türkçe harf sınırı 70e düşürür', () => {
    // Faturayı iki katına çıkarabildiği için kullanıcıya gösterilir.
    expect(olcSms('ş' + 'a'.repeat(69))).toEqual({ karakter: 70, parca: 1, turkce: true });
    expect(olcSms('ş' + 'a'.repeat(70)).parca).toBe(2);
  });

  it('çok parçalı mesajda parça başına karakter azalır', () => {
    // Birleştirme başlığı her parçadan yer alır: 160 → 153, 70 → 67.
    expect(olcSms('a'.repeat(306)).parca).toBe(2);
    expect(olcSms('a'.repeat(307)).parca).toBe(3);
  });

  it('boş metin sıfır parçadır', () => {
    expect(olcSms('')).toEqual({ karakter: 0, parca: 0, turkce: false });
  });

  it('Türkçe harfleri sayar, ASCII sanmaz', () => {
    expect(olcSms('İıĞğŞşÇç').turkce).toBe(true);
    expect(olcSms('Merhaba dunya').turkce).toBe(false);
  });
});
