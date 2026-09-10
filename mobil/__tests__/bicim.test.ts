import {
  ayAdi, gorecelıGun, gunAdi, kalanGun, okunakliMetin, tarihKisa, tarihSayisal,
  tarihUzun, telefon, telefonUri, tutar, tutarKisa, yerelIso,
} from '../src/bicim';

/**
 * Biçimlendirme testleri.
 *
 * Bu dosyanın asıl işi web uygulamasıyla aynı çıktıyı ürettiğini korumak.
 * İlk sürümde `Intl.NumberFormat` "currency" biçimiyle "₺210.000,00"
 * üretiyordu; web tarafı "210.000,00 ₺" gösteriyor. Aynı rezervasyonun
 * telefonda ve tarayıcıda farklı yazılması kullanıcı için hatadır.
 */

describe('tutar', () => {
  it('kuruşu Türkçe yazımla, simge sonda gösterir', () => {
    expect(tutar(21_000_000)).toBe('210.000,00 ₺');
    expect(tutar(150_050)).toBe('1.500,50 ₺');
  });

  it('sıfır ve geçersiz değeri sıfır olarak gösterir', () => {
    expect(tutar(0)).toBe('0,00 ₺');
    expect(tutar(Number.NaN)).toBe('0,00 ₺');
  });

  it('kısa gösterimde kuruşu atar', () => {
    expect(tutarKisa(21_000_000)).toBe('210.000 ₺');
  });
});

describe('telefon', () => {
  it('on haneli numarayı gruplar', () => {
    expect(telefon('5321234567')).toBe('0532 123 45 67');
    expect(telefon('05321234567')).toBe('0532 123 45 67');
    expect(telefon('905321234567')).toBe('0532 123 45 67');
  });

  it('tanımadığı biçimi olduğu gibi bırakır', () => {
    expect(telefon('123')).toBe('123');
  });

  it('arama adresini ülke koduyla üretir', () => {
    expect(telefonUri('05321234567')).toBe('tel:+905321234567');
  });
});

describe('tarih', () => {
  it('ISO tarihi yerel güne çevirirken kaydırmaz', () => {
    // Saat dilimi yüzünden bir gün geri kaymamalı.
    expect(tarihUzun('2026-09-26')).toBe('26 Eylül 2026');
    expect(tarihKisa('2026-01-01')).toBe('1 Oca');
  });

  it('Date değerini yerel ISO metne çevirir', () => {
    expect(yerelIso(new Date(2026, 8, 9))).toBe('2026-09-09');
  });

  it('gün farkını hesaplar', () => {
    const bugun = new Date();
    const yarin = new Date(bugun); yarin.setDate(bugun.getDate() + 1);
    expect(kalanGun(yerelIso(bugun))).toBe(0);
    expect(kalanGun(yerelIso(yarin))).toBe(1);
    expect(gorecelıGun(yerelIso(bugun))).toBe('bugün');
    expect(gorecelıGun(yerelIso(yarin))).toBe('yarın');
  });
});

describe('okunakliMetin', () => {
  it('açık zeminde koyu, koyu zeminde açık metin seçer', () => {
    // Bu değerler organizasyon türü varsayılanları; hepsinin üstüne beyaz
    // yazmak WCAG 1.4.3'ün istediği 4,5:1 oranını tutturmuyordu.
    expect(okunakliMetin('#18d26e')).toBe('#111827'); // yeşil: beyazla 2,00
    expect(okunakliMetin('#f39c12')).toBe('#111827'); // turuncu: beyazla 2,19
    expect(okunakliMetin('#8e44ad')).toBe('#ffffff'); // mor: beyazla 5,87
    expect(okunakliMetin('#25365a')).toBe('#ffffff');
  });

  it('bozuk değerde beyaza düşer', () => {
    expect(okunakliMetin('kırmızı')).toBe('#ffffff');
  });
});

describe('hatırlatma tarihi', () => {
  it('gün.ay.yıl biçiminde yazar', () => {
    // Sunucudaki gece görevi de bu biçimi kullanıyor; iki taraf farklı
    // yazınca kullanıcı önizlemede başka, müşteri mesajda başka tarih görüyordu.
    expect(tarihSayisal('2026-09-09')).toBe('09.09.2026');
    expect(tarihSayisal('2027-12-31')).toBe('31.12.2027');
  });

  it('bozuk girdiyi olduğu gibi döndürür', () => {
    expect(tarihSayisal('')).toBe('');
  });
});

describe('gün ve ay adları', () => {
  it('gün adını Türkçe verir', () => {
    // 2026-09-14 pazartesidir.
    expect(gunAdi('2026-09-14')).toBe('Pazartesi');
    expect(gunAdi('2026-09-20')).toBe('Pazar');
  });

  it('ay adını sıfır tabanlı numaradan verir', () => {
    expect(ayAdi(0)).toBe('Ocak');
    expect(ayAdi(8)).toBe('Eylül');
    expect(ayAdi(11)).toBe('Aralık');
  });
});

describe('göreceli gün', () => {
  function gunSonra(n: number): string {
    const t = new Date();
    t.setDate(t.getDate() + n);
    return yerelIso(t);
  }

  it('bugünü, yarını ve dünü ayrı adlandırır', () => {
    expect(gorecelıGun(gunSonra(0))).toBe('bugün');
    expect(gorecelıGun(gunSonra(1))).toBe('yarın');
    expect(gorecelıGun(gunSonra(-1))).toBe('dün');
  });

  it('uzak tarihleri gün sayısıyla anlatır', () => {
    expect(gorecelıGun(gunSonra(5))).toBe('5 gün sonra');
    expect(gorecelıGun(gunSonra(-12))).toBe('12 gün önce');
  });

  it('kalan gün sayısı işaretlidir', () => {
    expect(kalanGun(gunSonra(3))).toBe(3);
    expect(kalanGun(gunSonra(-3))).toBe(-3);
    expect(kalanGun(gunSonra(0))).toBe(0);
  });
});
