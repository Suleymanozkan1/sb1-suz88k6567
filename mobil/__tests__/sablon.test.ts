import { doldur, hazirla, olcSms, sadelestir } from '../src/sablon';

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

describe('GSM-7 sadeleştirme', () => {
  it('GSM-7 dışındaki Türkçe harfleri indirger', () => {
    expect(sadelestir('şŞğĞıİç')).toBe('sSgGiIc');
  });

  it('GSM-7 içindeki harflere dokunmaz', () => {
    expect(sadelestir('öüÖÜÇ')).toBe('öüÖÜÇ');
    expect(sadelestir('Gündüz')).toBe('Gündüz');
  });

  it('hazirla önce doldurur sonra sadeleştirir', () => {
    expect(hazirla('Sayin {musteri}', { musteri: 'Ayşe Yıldız' })).toBe('Sayin Ayse Yildiz');
  });
});

describe('varsayılan hatırlatma metinleri', () => {
  const SABLONLAR = [
    'Sayin {musteri}, {tarih} {seans} rezervasyonunuz alinmistir. Sorgu kodu: {kod}',
    'Sayin {musteri}, {tarih} tarihli organizasyonunuz yaklasiyor. {salon}',
    'Sayin {musteri}, {tarih} organizasyonunuz icin kalan tutar {kalan} TL',
    'Sayin {musteri}, {odenen} TL odemeniz alinmistir. Kalan {kalan} TL',
    'Sayin {musteri}, bugun {seans} seansinda {salon} sizi bekliyor',
    'Sayin {musteri}, bizi tercih ettiginiz icin tesekkur ederiz',
    'Sayin {musteri}, sezon fiyatlarimiz icin bizi arayabilirsiniz',
  ];

  const ENKOTU = {
    musteri: 'Şeyma Nur & Muhammed Çağatay Yıldırım',
    tarih: '16.09.2026', seans: 'Gündüz', salon: 'Zümrüt Balo Salonu',
    kod: 'SA-2026-4141', tutar: '210.000,00', odenen: '60.000,00', kalan: '150.000,00',
  };

  it.each(SABLONLAR)('tek SMSe sığar: %s', (govde) => {
    const olcum = olcSms(hazirla(govde, ENKOTU));
    expect(olcum.turkce).toBe(false);
    expect(olcum.parca).toBe(1);
  });
});
