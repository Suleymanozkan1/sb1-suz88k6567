import { describe, expect, it } from 'vitest';
import duyurular from './__fixtures__/meb-duyurular.json';
import {
  cumlelereBol, egitimYiliCoz, gunAraligi, metneCevir, takvimiCoz, tarihleriAyikla,
} from './_meb';

/*
  Örnekler MEB'in GERÇEK duyuru metinleri (meb.gov.tr, üç ayrı yıl).
  İfade her yıl değiştiği için çözümleyici üçünde de sınanıyor: tek yıla
  bakılsaydı, bir sonraki yıl cümle değişince tatiller sessizce takvime
  düşmezdi.
*/

describe('metneCevir', () => {
  it('etiketleri ve varlıkları temizler', () => {
    expect(metneCevir('<p>Okul&nbsp;a&#039;ç&amp;ık</p>')).toBe("Okul a'ç&ık");
  });

  it('script ve style içeriğini atar', () => {
    expect(metneCevir('<script>var a=1</script><p>Metin</p>')).toBe('Metin');
  });
});

describe('egitimYiliCoz', () => {
  it('eğitim yılını okur', () => {
    expect(egitimYiliCoz('2026-2027 eğitim öğretim yılı')).toEqual({ ilk: 2026, ikinci: 2027 });
  });

  it('ardışık olmayan yılı reddeder', () => {
    // "2024-2027" gibi bir ifade eğitim yılı değildir.
    expect(egitimYiliCoz('2024-2027 arası')).toBeNull();
  });

  it('yıl yoksa null döner', () => {
    expect(egitimYiliCoz('takvim açıklandı')).toBeNull();
  });
});

describe('tarihleriAyikla', () => {
  const yil = { ilk: 2025, ikinci: 2026 };

  it('tam tarihi okur', () => {
    expect(tarihleriAyikla('16 Ocak 2026 Cuma günü', yil)).toEqual(['2026-01-16']);
  });

  it('yılsız tarihi eğitim yılından tamamlar', () => {
    // Eylül eğitim yılının İLK yılına düşer.
    expect(tarihleriAyikla('8 Eylül Pazartesi başlayacak', yil)).toEqual(['2025-09-08']);
    // Ocak ikinci yıla.
    expect(tarihleriAyikla('19 Ocak Pazartesi', yil)).toEqual(['2026-01-19']);
  });

  it('kısa aralığın İKİ UCUNU da verir', () => {
    /*
      Tek tarih deseni önce çalıştırılsaydı "10-14 Kasım"daki 14'ü
      yakalar, 10'u kaçırırdı ve tatil dört gün eksik görünürdü.
    */
    expect(tarihleriAyikla('10-14 Kasım arasında', yil)).toEqual(['2025-11-10', '2025-11-14']);
  });

  it('yıllı kısa aralığı okur', () => {
    expect(tarihleriAyikla("11-15 Kasım 2024'te", { ilk: 2024, ikinci: 2025 }))
      .toEqual(['2024-11-11', '2024-11-15']);
  });

  it('tarihsiz cümlede boş döner', () => {
    expect(tarihleriAyikla('rehberlik çalışmaları yapılacak', yil)).toEqual([]);
  });
});

describe('gunAraligi', () => {
  it('iki uç dahil tüm günleri üretir', () => {
    expect(gunAraligi('2026-11-16', '2026-11-20')).toEqual([
      '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20',
    ]);
  });

  it('ay sınırını aşan aralığı doğru üretir', () => {
    expect(gunAraligi('2027-01-30', '2027-02-02')).toEqual([
      '2027-01-30', '2027-01-31', '2027-02-01', '2027-02-02',
    ]);
  });

  it('ters aralıkta boş döner', () => {
    expect(gunAraligi('2026-11-20', '2026-11-16')).toEqual([]);
  });

  it('aşırı uzun aralığı kırpar', () => {
    // Bir çözümleme hatası takvimi yüzlerce satırla doldurmasın.
    expect(gunAraligi('2026-01-01', '2026-12-31')).toHaveLength(40);
  });
});

describe('cumlelereBol', () => {
  it('noktadan böler, boşları atar', () => {
    expect(cumlelereBol('Bir. İki.  Üç.')).toEqual(['Bir.', 'İki.', 'Üç.']);
  });
});

describe('takvimiCoz — gerçek MEB duyuruları', () => {
  const gunler = (yil: keyof typeof duyurular) => takvimiCoz(duyurular[yil]);
  const etiketli = (liste: { gun: string; etiket: string }[], etiket: string) =>
    liste.filter((g) => g.etiket === etiket).map((g) => g.gun);

  it('2026-2027 duyurusunu çözer', () => {
    const g = gunler('2026-2027');
    expect(etiketli(g, 'Okullar açılıyor')).toEqual(['2026-09-14']);
    expect(etiketli(g, '1. ara tatil')).toEqual([
      '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20',
    ]);
    // Yarıyıl tatili iki hafta: 25 Ocak - 5 Şubat 2027.
    const yariyil = etiketli(g, 'Yarıyıl tatili');
    expect(yariyil[0]).toBe('2027-01-25');
    expect(yariyil[yariyil.length - 1]).toBe('2027-02-05');
    expect(yariyil).toHaveLength(12);
    expect(etiketli(g, '2. ara tatil')).toEqual([
      '2027-03-08', '2027-03-09', '2027-03-10', '2027-03-11', '2027-03-12',
    ]);
    expect(etiketli(g, 'Okullar kapanıyor')).toEqual(['2027-06-25']);
  });

  it('2025-2026 duyurusunu çözer (yılsız tarih ve kısa aralık)', () => {
    const g = gunler('2025-2026');
    // "8 Eylül Pazartesi" -- yıl yazılmamış.
    expect(etiketli(g, 'Okullar açılıyor')).toEqual(['2025-09-08']);
    // "10-14 Kasım arasında yapılacak" -- kısa aralık, yıl yok.
    expect(etiketli(g, '1. ara tatil')).toEqual([
      '2025-11-10', '2025-11-11', '2025-11-12', '2025-11-13', '2025-11-14',
    ]);
    const yariyil = etiketli(g, 'Yarıyıl tatili');
    expect(yariyil[0]).toBe('2026-01-19');
    expect(yariyil[yariyil.length - 1]).toBe('2026-01-30');
    expect(etiketli(g, '2. ara tatil')).toEqual([
      '2026-03-16', '2026-03-17', '2026-03-18', '2026-03-19', '2026-03-20',
    ]);
    // Yıl bitişi ikinci dönem cümlesinin SONUNDA geçiyor.
    expect(etiketli(g, 'Okullar kapanıyor')).toEqual(['2026-06-26']);
  });

  it('2024-2025 duyurusunu çözer', () => {
    const g = gunler('2024-2025');
    expect(etiketli(g, 'Okullar açılıyor')).toEqual(['2024-09-09']);
    expect(etiketli(g, '1. ara tatil')).toEqual([
      '2024-11-11', '2024-11-12', '2024-11-13', '2024-11-14', '2024-11-15',
    ]);
    const yariyil = etiketli(g, 'Yarıyıl tatili');
    expect(yariyil[0]).toBe('2025-01-20');
    expect(yariyil[yariyil.length - 1]).toBe('2025-01-31');
    // "31 Mart 2025 Pazartesi başlayıp, 4 Nisan 2025 Cuma" -- ay sınırını aşıyor.
    expect(etiketli(g, '2. ara tatil')).toEqual([
      '2025-03-31', '2025-04-01', '2025-04-02', '2025-04-03', '2025-04-04',
    ]);
    expect(etiketli(g, 'Okullar kapanıyor')).toEqual(['2025-06-20']);
  });

  it('günleri tarihe göre sıralı verir', () => {
    const g = gunler('2026-2027');
    const sirali = [...g].sort((a, b) => a.gun.localeCompare(b.gun));
    expect(g).toEqual(sirali);
  });

  it('eğitim yılı yazmayan metinde boş döner', () => {
    expect(takvimiCoz('Okullar yakında açılıyor.')).toEqual([]);
  });
});
