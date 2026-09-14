/**
 * Ekran kapsamı: panelde olan her ekran mobilde de var mı.
 *
 * Mobil, panelin arkasından geliyor. Web tarafına eklenen bir ekran
 * mobile eklenmediğinde hiçbir şey hata vermiyor; fark ancak kullanıcı
 * telefonda aradığını bulamayınca ortaya çıkıyor ve her yeni özellikle
 * büyüyor. Bu test farkı derleme zamanında görünür kılıyor.
 *
 * Kaynak, `src/App.tsx` içindeki gerçek yönlendirme tablosu: elle tutulan
 * bir liste, tam da denetlemesi gereken şeyle birlikte kayardı.
 *
 * Bu testin çalışabilmesi için mobil paketinin kök `npm test` içinde
 * olması gerekiyordu; değildi. Kök vitest yalnızca `src/`, `api/` ve
 * `sunucu/` dizinlerine bakıyor, mobil ayrı jest ile koşuyor. Bu yüzden
 * mobil tarafındaki kırıklar CI'da hiç görünmemişti.
 *
 * DIŞARIDA BIRAKILANLAR aşağıda tek tek gerekçeli duruyor. Boş bir
 * gerekçe yazmak yerine ekranı eklemek gerekiyor; liste kısa kalmalı.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const KOK = join(__dirname, '..', '..');

/**
 * Panel yolu -> mobil dosya adı.
 *
 * Adlar birebir aynı değil: mobilde `[id]` parametresi dosya adında
 * duruyor ve bazı ekranlar tek bir sayfada birleşiyor.
 */
const ESLEME: Record<string, string> = {
  '': '(sekmeler)/index.tsx',
  takvim: '(sekmeler)/takvim.tsx',
  kasa: '(sekmeler)/kasa.tsx',
  rezervasyonlar: '(sekmeler)/kayitlar.tsx',
  'rezervasyonlar/yeni': 'rezervasyon/yeni.tsx',
  'rezervasyonlar/:id': 'rezervasyon/[id].tsx',
  'rezervasyonlar/:id/sozlesme': 'belge/[id].tsx',
  'rezervasyonlar/:id/makbuz': 'belge/[id].tsx',
  'urun-hizmet': 'urun-hizmet.tsx',
  'musteri-adaylari': 'musteri-adaylari/index.tsx',
  'musteri-adaylari/yeni': 'musteri-adaylari/yeni.tsx',
  'musteri-adaylari/:id': 'musteri-adaylari/[id].tsx',
  'musteri-adaylari/durumlar': 'musteri-adaylari/durumlar.tsx',
  'faturalar/:id': 'fatura/[id].tsx',
  'renk-ayarlari': 'renk-ayarlari.tsx',
  'whatsapp-ayarlari': 'whatsapp-ayarlari.tsx',
  'ozel-gunler': 'ozel-gunler.tsx',
  'odeme-bildirimleri': 'odeme-bildirimleri.tsx',
  sms: 'sms.tsx',
};

/** Mobilde bilerek bulunmayan panel yolları ve gerekçeleri. */
const DISARIDA: Record<string, string> = {
  'rezervasyonlar/:id/duzenle':
    'Düzenleme mobilde yok: rezervasyon formu on iki alanlı ve yanlış '
    + 'düzeltilen bir kayıt sözleşmeyi de bozuyor. Yeni kayıt açılabiliyor.',
};

/** `src/App.tsx` içindeki panel alt yollarını okur. */
function panelYollari(): string[] {
  const kaynak = readFileSync(join(KOK, 'src', 'App.tsx'), 'utf8');
  const panel = kaynak.slice(kaynak.indexOf('path="panel"'));

  const yollar: string[] = [];
  const desen = /<Route\s+(index|path="([^"]+)")([^>]*)>/g;
  let esleme: RegExpExecArray | null;
  while ((esleme = desen.exec(panel)) !== null) {
    const [, tamami, yol, kalan] = esleme;
    // `Navigate` yalnızca eski bir yolu yenisine taşıyor; ayrı ekran değil.
    if (kalan?.includes('<Navigate') || kalan?.includes('Navigate')) continue;
    const deger = tamami === 'index' ? '' : (yol ?? '');
    if (deger === '*') continue;
    yollar.push(deger);
  }
  return yollar;
}

const YOLLAR = panelYollari();

describe('ekran kapsamı', () => {
  it('panel yönlendirmeleri okunabiliyor', () => {
    // Ayrıştırıcı bozulursa test sessizce "her şey yerinde" demesin.
    expect(YOLLAR.length).toBeGreaterThan(25);
    expect(YOLLAR).toContain('kasa');
    expect(YOLLAR).toContain('musteri-adaylari/durumlar');
  });

  it('her panel ekranının mobil karşılığı var', () => {
    const eksik = YOLLAR
      .filter((yol) => !(yol in DISARIDA))
      .filter((yol) => {
        const dosya = ESLEME[yol] ?? `${yol}.tsx`;
        return !existsSync(join(KOK, 'mobil', 'app', dosya));
      });

    expect(eksik).toEqual([]);
  });

  it('dışarıda bırakılan her yolun gerekçesi yazılı', () => {
    for (const [yol, gerekce] of Object.entries(DISARIDA)) {
      expect(YOLLAR).toContain(yol);
      expect(gerekce.length).toBeGreaterThan(40);
    }
  });

  it('eşleme tablosunda artık var olmayan yol kalmamış', () => {
    // Panelden bir ekran kalkarsa eşleme satırı da kalkmalı; yoksa tablo
    // zamanla gerçeği anlatmayan bir listeye dönüşür.
    for (const yol of Object.keys(ESLEME)) expect(YOLLAR).toContain(yol);
    for (const yol of Object.keys(DISARIDA)) expect(YOLLAR).toContain(yol);
  });
});
