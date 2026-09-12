import { describe, expect, it } from 'vitest';
import { cozulenAlanSayisi, talebiCoz, tarihCoz, telefonSadelestir } from './whatsappTalep';

/**
 * WhatsApp talebi çözümlemesi.
 *
 * Buradaki testlerin çoğu tek bir şeyi koruyor: çözümleyici emin olmadığını
 * UYDURMAMALI. Yanlış bir tarih, salonun o gün dolu sanılmasına; yanlış bir
 * kişi sayısı, yanlış fiyat teklifine yol açar. Boş bırakılan alanı insan
 * tamamlar, yanlış doldurulanı kimse fark etmez.
 */

// Samet Bey'in ilettiği gerçek mesaj.
const ORNEK = `Ömer Ay
p:+905332642537
oay685126@gmail.com
Fiyat tahminen yemekli ve yemeksiz
1000
Mayısın ilk haftası
düğün`;

describe('talebiCoz: gerçek mesaj', () => {
  const t = talebiCoz(ORNEK);

  it('ismi alır', () => expect(t.name).toBe('Ömer Ay'));
  it('telefonu 10 haneye indirir', () => expect(t.phone).toBe('5332642537'));
  it('e-postayı alır', () => expect(t.email).toBe('oay685126@gmail.com'));
  it('kişi sayısını alır', () => expect(t.guestCount).toBe(1000));
  it('türü alır', () => expect(t.organizationType).toBe('Düğün'));

  it('gün taşımayan tarihi UYDURMAZ, tarih ifadesi olarak saklar', () => {
    // "Mayısın ilk haftası" bir gün vermiyor. Uydurulan gün, salonun o gün
    // dolu sanılmasına yol açardı; ifade olduğu gibi duruyor.
    expect(t.date).toBe('');
    expect(t.dateText).toBe('Mayısın ilk haftası');
  });

  it('müşterinin talebini nottan ayrı tutar', () => {
    // Personel kartı açtığında müşterinin NE SORDUĞUNU ilk bakışta görmeli.
    expect(t.request).toBe('Fiyat tahminen yemekli ve yemeksiz');
  });

  it('tarih ifadesini ayrıca nota yazmaz', () => {
    // İki yerde görünürse kart kalabalıklaşır.
    expect(t.note).not.toContain('Mayısın ilk haftası');
  });
});

describe('satır sırası serbesttir', () => {
  it('alanlar yer değiştirince de çözülür', () => {
    // Sıraya güvenen bir çözümleyici burada her alanı bir kaydırırdı.
    const t = talebiCoz(`0533 264 25 37
düğün
Ömer Ay
250
omer@ornek.com
14.07.2029`);
    expect(t).toMatchObject({
      name: 'Ömer Ay', phone: '5332642537', email: 'omer@ornek.com',
      guestCount: 250, date: '2029-07-14', organizationType: 'Düğün',
    });
  });

  it('eksik alanlar boş kalır, gerisi çözülür', () => {
    const t = talebiCoz('Ayşe Yılmaz\n5321112233');
    expect(t).toMatchObject({ name: 'Ayşe Yılmaz', phone: '5321112233', email: '', date: '' });
    expect(t.guestCount).toBeNull();
  });

  it('boş mesaj hiçbir alan üretmez', () => {
    expect(cozulenAlanSayisi(talebiCoz('   \n\n  '))).toBe(0);
  });
});

describe('telefonSadelestir', () => {
  it('ülke kodunu ve baştaki sıfırı atar', () => {
    expect(telefonSadelestir('+905332642537')).toBe('5332642537');
    expect(telefonSadelestir('0090 533 264 25 37')).toBe('5332642537');
    expect(telefonSadelestir('05332642537')).toBe('5332642537');
    expect(telefonSadelestir('533 264 25 37')).toBe('5332642537');
  });

  it('çözemediğini boş bırakır', () => {
    // Eksik numara kaydedilirse müşteriye ulaşılamaz; boş kalması yeğdir.
    expect(telefonSadelestir('12345')).toBe('');
    expect(telefonSadelestir('')).toBe('');
  });
});

describe('tarihCoz', () => {
  it('üç yazımı da okur', () => {
    expect(tarihCoz('14.07.2029')).toBe('2029-07-14');
    expect(tarihCoz('14/07/2029')).toBe('2029-07-14');
    expect(tarihCoz('2029-07-14')).toBe('2029-07-14');
    expect(tarihCoz('14 Temmuz 2029')).toBe('2029-07-14');
  });

  it('ay adını Türkçe harflerle de okur', () => {
    expect(tarihCoz('3 Ağustos 2030')).toBe('2030-08-03');
    expect(tarihCoz('3 agustos 2030')).toBe('2030-08-03');
  });

  it('yıl yazılmamışsa içinde bulunulan yılı alır', () => {
    expect(tarihCoz('12 Eylül', new Date('2026-01-01'))).toBe('2026-09-12');
  });

  it('olmayan tarihi reddeder', () => {
    // 31 Şubat bir tarih değil; Date onu 3 Mart'a kaydırırdı.
    expect(tarihCoz('31.02.2029')).toBe('');
    expect(tarihCoz('40.01.2029')).toBe('');
  });

  it('gün taşımayan ifadeyi çözmez', () => {
    expect(tarihCoz('Mayısın ilk haftası')).toBe('');
    expect(tarihCoz('yaz aylarında')).toBe('');
  });
});

describe('tür çözümlemesi', () => {
  it('türkçe karakterli ve sade yazımı tanır', () => {
    expect(talebiCoz('sünnet').organizationType).toBe('Sünnet');
    expect(talebiCoz('sunnet').organizationType).toBe('Sünnet');
    expect(talebiCoz('NİKAH').organizationType).toBe('Nikâh');
    expect(talebiCoz('doğum günü').organizationType).toBe('Doğum Günü');
  });

  it('cümle içindeki türü alır ama cümleyi talep olarak da tutar', () => {
    // "Düğün için fiyat nedir" hem tür bilgisi hem de müşterinin sorusu.
    const t = talebiCoz('Düğün için fiyat listesi gönderir misiniz');
    expect(t.organizationType).toBe('Düğün');
    expect(t.request).toContain('fiyat listesi');
  });

  it('tür olarak tanınan cümleyi tarih ifadesi saymaz', () => {
    /*
      "nisan" hem bir ay adı hem de bir organizasyon türü ("Nişan").
      Bayrak olmasaydı bu cümle etkinlik tarihinin yerine yazılırdı.
    */
    const t = talebiCoz('nişan yapacağız salon arıyoruz');
    expect(t.organizationType).toBe('Nişan');
    expect(t.dateText).toBe('');
    expect(t.request).toContain('nişan yapacağız');
  });

  it('tanımadığı türü boş bırakır', () => {
    expect(talebiCoz('mevlüt').organizationType).toBe('');
  });
});

describe('kişi sayısı', () => {
  it('sayı satırını ve "kişi" ekini okur', () => {
    expect(talebiCoz('Ali Veli\n300').guestCount).toBe(300);
    expect(talebiCoz('Ali Veli\n300 kişi').guestCount).toBe(300);
  });

  it('telefonu kişi sayısı sanmaz', () => {
    // 5332642537 on haneli bir sayı; sıra telefondan sonra geldiği için
    // kişi sayısı olarak okunmamalı.
    const t = talebiCoz('5332642537');
    expect(t.phone).toBe('5332642537');
    expect(t.guestCount).toBeNull();
  });

  it('yılı kişi sayısı sanmaz', () => {
    const t = talebiCoz('14.07.2029\n300');
    expect(t.date).toBe('2029-07-14');
    expect(t.guestCount).toBe(300);
  });
});

describe('isim çözümlemesi', () => {
  it('rakam ya da @ taşıyan satırı isim saymaz', () => {
    const t = talebiCoz('bilgi@ornek.com\nAyşe Yılmaz');
    expect(t.name).toBe('Ayşe Yılmaz');
  });

  it('uzun cümleyi isim saymaz', () => {
    const t = talebiCoz('merhaba acaba önümüzdeki hafta müsait misiniz');
    expect(t.name).toBe('');
    // "hafta" geçiyor: cümle tarih ifadesi olarak sınıflanıyor.
    expect(`${t.dateText}${t.request}${t.note}`).toContain('merhaba');
  });
});

describe('cozulenAlanSayisi', () => {
  it('dolu alanları sayar', () => {
    expect(cozulenAlanSayisi(talebiCoz(ORNEK))).toBe(5);
    expect(cozulenAlanSayisi(talebiCoz('Ayşe Yılmaz'))).toBe(1);
  });
});
