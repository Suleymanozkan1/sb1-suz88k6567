import { describe, expect, it } from 'vitest';
import {
  alan, gunlukCoz, merkezSec, merkezleriCoz, saatlikCoz, sayiVeyaNull, sonDurumCoz,
} from './_mgm';

/*
  Örnekler MGM servisinin bilinen yanıt şeklini taşıyor. Bu paket
  ÇÖZÜMLEYİCİYİ sınar, servisin şeklini değil: MGM alan adlarını
  değiştirirse testler geçmeye devam eder ama tahmin boş gelir. O durum
  için uç noktada tanı kipi var (`/api/hava?tani=1`) ve sağlık kontrolü
  bayatlığı bildiriyor.
*/

describe('sayiVeyaNull', () => {
  it('sayıyı geçirir, boşu null yapar', () => {
    expect(sayiVeyaNull(21.5)).toBe(21.5);
    expect(sayiVeyaNull('18')).toBe(18);
    expect(sayiVeyaNull(null)).toBeNull();
    expect(sayiVeyaNull('')).toBeNull();
    expect(sayiVeyaNull('abc')).toBeNull();
  });

  it('MGM eksik ölçüm işaretini (-9999) null sayar', () => {
    /*
      -9999 geçerli bir sayı olduğu için Number.isFinite yakalamaz;
      ekranda "-9999°" yazardı.
    */
    expect(sayiVeyaNull(-9999)).toBeNull();
    expect(sayiVeyaNull(-9999.0)).toBeNull();
    // Gerçek bir eksi sıcaklık elenmemeli.
    expect(sayiVeyaNull(-12.5)).toBe(-12.5);
  });
});

describe('alan', () => {
  it('alan adının büyük/küçük harf farkını tolere eder', () => {
    expect(alan({ istNo: 17244 }, 'istno')).toBe(17244);
    expect(alan({ ISTNO: 5 }, 'istNo')).toBe(5);
  });

  it('sırayla dener, bulamazsa undefined döner', () => {
    expect(alan({ ruzgarHiz: 9 }, 'ruzgarHizi', 'ruzgarHiz')).toBe(9);
    expect(alan({}, 'yok')).toBeUndefined();
  });
});

describe('merkezleriCoz', () => {
  /*
    GERÇEK MGM yanıtı (servis.mgm.gov.tr/web/merkezler?il=Konya).
    Üç istasyon numarasının aynı olmadığını bu kayıt gösterdi: günlük
    94201, saatlik ve son durum 17245.
  */
  const GERCEK = [{
    alternatifHadiseIstNo: null,
    boylam: 32.4713,
    enlem: 37.8687,
    gunlukTahminIstNo: 94201,
    il: 'Konya',
    ilPlaka: 42,
    ilce: 'Meram',
    merkezId: 94201,
    oncelik: 1,
    saatlikTahminIstNo: 17245,
    sondurumIstNo: 17245,
    yukseklik: 1029,
    aciklama: '',
    modelId: 85488,
    gps: 1,
  }];

  it('gerçek yanıttaki üç numarayı ayrı ayrı okur', () => {
    const [m] = merkezleriCoz(GERCEK);
    expect(m).toEqual({
      gunlukNo: '94201',
      saatlikNo: '17245',
      sonDurumNo: '17245',
      il: 'Konya',
      ilce: 'Meram',
      oncelik: 1,
    });
  });

  it('eksik numarayı var olana düşürür', () => {
    // Saatlik numarası olmayan bir merkez, günlük numarayla sorulur.
    const [m] = merkezleriCoz([{ il: 'X', ilce: 'Y', gunlukTahminIstNo: 100 }]);
    expect(m).toMatchObject({ gunlukNo: '100', saatlikNo: '100', sonDurumNo: '100' });
  });

  it('numarasız merkezi atar', () => {
    expect(merkezleriCoz([{ il: 'X', ilce: 'Y' }])).toEqual([]);
  });

  it('önceliği okunamayan kaydı en sona atacak değeri verir', () => {
    const [m] = merkezleriCoz([{ gunlukTahminIstNo: 5 }]);
    expect(m?.oncelik).toBe(99);
  });

  it('dizi olmayan yanıtta boş döner', () => {
    expect(merkezleriCoz(null)).toEqual([]);
    expect(merkezleriCoz({ hata: 'yok' })).toEqual([]);
  });
});

describe('merkezSec', () => {
  const merkezler = merkezleriCoz([
    { il: 'Konya', ilce: 'Ereğli', gunlukTahminIstNo: 17902, saatlikTahminIstNo: 17903, oncelik: 3 },
    { il: 'Konya', ilce: 'Meram', gunlukTahminIstNo: 94201, saatlikTahminIstNo: 17245, oncelik: 1 },
  ]);

  it('tam ilçe eşleşmesini seçer', () => {
    expect(merkezSec(merkezler, 'Ereğli')?.gunlukNo).toBe('17902');
  });

  it('ilçe bulunamazsa MGM önceliğine bakar', () => {
    /*
      "Merkez" adlı ilçe her ilde yok: Konya'nın birincil merkezi Meram.
      Yalnızca "Merkez" aranıp ilk kayda düşülseydi Ereğli'nin havası
      gösterilebilirdi.
    */
    expect(merkezSec(merkezler, 'Çumra')?.ilce).toBe('Meram');
  });

  it('ilçe verilmezse de önceliği yükseği seçer', () => {
    expect(merkezSec(merkezler, '')?.ilce).toBe('Meram');
  });

  it('öncelik yoksa Merkez adlı ilçeye düşer', () => {
    const oncelisiz = merkezleriCoz([
      { il: 'X', ilce: 'Aaa', gunlukTahminIstNo: 1 },
      { il: 'X', ilce: 'Merkez', gunlukTahminIstNo: 2 },
    ]);
    expect(merkezSec(oncelisiz, 'Bbb')?.ilce).toBe('Merkez');
  });

  it('boş listede null döner', () => {
    expect(merkezSec([], 'Merkez')).toBeNull();
  });
});

describe('gunlukCoz', () => {
  const ornek = [{
    istNo: 17244,
    tarihGun1: '2026-09-13T00:00:00', enDusukGun1: 14, enYuksekGun1: 30,
    enYuksekNemGun1: 55, ruzgarHizGun1: 12, hadiseGun1: 'A',
    tarihGun2: '2026-09-14T00:00:00', enDusukGun2: 15, enYuksekGun2: 28,
    enYuksekNemGun2: 60, ruzgarHizGun2: 9, hadiseGun2: 'PB',
    tarihGun3: '2026-09-15T00:00:00', enDusukGun3: -9999, enYuksekGun3: -9999,
    hadiseGun3: 'HY',
  }];

  it('düzleştirilmiş günleri satıra çevirir', () => {
    const gunler = gunlukCoz(ornek);
    expect(gunler).toHaveLength(3);
    expect(gunler[0]).toEqual({
      gun: '2026-09-13', minC: 14, maxC: 30, nem: 55, ruzgarKmh: 12, hadise: 'A',
    });
  });

  it('eksik ölçümlü günü hadise varsa yine yazar', () => {
    const gunler = gunlukCoz(ornek);
    expect(gunler[2]).toMatchObject({ gun: '2026-09-15', minC: null, maxC: null, hadise: 'HY' });
  });

  it('ne sıcaklık ne hadise olan günü ATAR', () => {
    // Yarım bir tahmin, hiç tahmin olmamasından kötü.
    const gunler = gunlukCoz([{ tarihGun1: '2026-09-13T00:00:00' }]);
    expect(gunler).toEqual([]);
  });

  it('geçersiz tarihi atar', () => {
    expect(gunlukCoz([{ tarihGun1: 'bozuk', enYuksekGun1: 20 }])).toEqual([]);
  });

  it('boş yanıtta boş döner', () => {
    expect(gunlukCoz([])).toEqual([]);
    expect(gunlukCoz(null)).toEqual([]);
  });
});

describe('saatlikCoz', () => {
  const ornek = [{
    istNo: 17244,
    baslangicZamani: '2026-09-13T12:00:00',
    tahmin: [
      { tarih: '2026-09-13T12:00:00', hadise: 'A', sicaklik: 28, hissedilenSicaklik: 27, nem: 30, ruzgarHizi: 10 },
      { tarih: '2026-09-13T13:00:00', hadise: 'PB', sicaklik: 29, hissedilenSicaklik: 28, nem: 28, ruzgarHizi: 11 },
      { tarih: 'bozuk', hadise: 'A', sicaklik: 20 },
    ],
  }];

  it('saatleri yerel metin olarak tutar', () => {
    const saatler = saatlikCoz(ornek);
    expect(saatler).toHaveLength(2);
    /*
      Date'e çevrilip yeniden yazılsaydı sunucunun saat dilimine göre
      kayar ve "19:00'da yağmur" başka bir saate düşerdi.
    */
    expect(saatler[0]).toEqual({
      saat: '2026-09-13T12:00', sicaklikC: 28, hissedilenC: 27,
      nem: 30, ruzgarKmh: 10, hadise: 'A',
    });
  });

  it('boşluklu tarih biçimini de okur', () => {
    const saatler = saatlikCoz([{ tahmin: [{ tarih: '2026-09-13 15:00:00', sicaklik: 25, hadise: 'A' }] }]);
    expect(saatler[0]?.saat).toBe('2026-09-13T15:00');
  });

  it('ne sıcaklık ne hadise olan saati atar', () => {
    expect(saatlikCoz([{ tahmin: [{ tarih: '2026-09-13T12:00:00' }] }])).toEqual([]);
  });

  it('tahmin dizisi yoksa boş döner', () => {
    expect(saatlikCoz([{ istNo: 1 }])).toEqual([]);
    expect(saatlikCoz([])).toEqual([]);
  });
});

describe('sonDurumCoz', () => {
  it('o anki sıcaklığı verir', () => {
    expect(sonDurumCoz([{ istNo: 17244, sicaklik: 27.6 }])).toBe(27.6);
  });

  it('eksik ölçümde null döner', () => {
    expect(sonDurumCoz([{ sicaklik: -9999 }])).toBeNull();
    expect(sonDurumCoz([])).toBeNull();
    expect(sonDurumCoz(null)).toBeNull();
  });
});
