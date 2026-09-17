/**
 * Alt sekme çubuğu ve geri düğmesi.
 *
 * NEDEN BU TEST VAR. Çubuğun yüksekliği sabit yazılmıştı ve altta
 * güvenli alan boşluğu bırakılmıyordu: Android'de sistemin gezinme
 * çubuğunun (jest çizgisi / üç tuş) üstüne oturuyor, dokunmak için
 * parmağı ekranın en dibine götürmek gerekiyordu ve çoğu zaman sistem
 * tuşu tetikleniyordu. Bu, ekran görüntüsü alınmadan fark edilmeyen
 * ama her dokunuşta yaşanan bir kusur; kaynağa bakan bir test tek
 * ucuz koruma.
 *
 * Sekme etiketleri de artık yalnızca yazı: üstlerindeki tek karakterlik
 * geometrik işaretler (◉ ▦ ≡ ₺ ⋯) hiçbir şey anlatmıyor, etiketin
 * yerini daraltıyordu.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const oku = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('alt sekme çubuğu', () => {
  const kaynak = oku('app/(sekmeler)/_layout.tsx');

  it('alt güvenli alanı hesaba katar', () => {
    // Sabit yükseklik + sıfır alt boşluk = sistem çubuğunun içine girmek.
    expect(kaynak).toContain('useSafeAreaInsets');
    expect(kaynak).toMatch(/paddingBottom:\s*altBosluk/);
    expect(kaynak).toMatch(/height:\s*\d+\s*\+\s*altBosluk/);
  });

  it('sistem çubuğu olmayan cihazda da en az bir pay bırakır', () => {
    expect(kaynak).toMatch(/Math\.max\(kenar\.bottom/);
  });

  it('sekmelerde simge değil yazı gösterir', () => {
    expect(kaynak).toMatch(/tabBarIcon:\s*\(\)\s*=>\s*null/);
    expect(kaynak).toContain("tabBarIconStyle: { display: 'none' }");
    /*
      Eski geometrik işaretlerden hiçbiri KODDA kalmamalı. Yorumlar
      ayıklanıyor: dosyanın başındaki açıklama işaretleri neden
      kaldırdığımızı anlatmak için adlarıyla anıyor.
    */
    const kodsuz = kaynak
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    for (const isaret of ['◉', '▦', '≡', '₺', '⋯']) {
      expect(kodsuz).not.toContain(isaret);
    }
  });

  it('beş sekmenin de başlığı var', () => {
    for (const ad of ['Bugün', 'Takvim', 'Kayıtlar', 'Kasa', 'Daha']) {
      expect(kaynak).toContain(`title: '${ad}'`);
    }
  });
});

describe('geri düğmesi', () => {
  it('gidilecek yer yoksa çizilmez', () => {
    // İşe yaramayan bir ok, dokunup bir şey olmamasından daha kötü.
    expect(oku('src/bilesenler/duzen.tsx')).toMatch(/if \(!yonlendir\.canGoBack\(\)\) return null/);
  });

  it('ok ile birlikte "Geri" yazısı taşır', () => {
    // Tek başına ok küçük bir işaret; yazı hem büyütüyor hem anlatıyor.
    const kaynak = oku('src/bilesenler/duzen.tsx');
    expect(kaynak).toContain('Geri</Text>');
    expect(kaynak).toContain('hitSlop');
  });

  it('yığın başlıklarının soluna konur', () => {
    expect(oku('app/_layout.tsx')).toMatch(/headerLeft:\s*\(\)\s*=>\s*<GeriDugmesi/);
  });

  it('kendi bandını çizen sekme ekranlarında da var', () => {
    // Band bileşenini kullanmayan iki ekran unutulmuştu.
    for (const p of ['app/(sekmeler)/index.tsx', 'app/(sekmeler)/takvim.tsx']) {
      expect(oku(p)).toContain('<GeriDugmesi />');
    }
  });

  it('paylaşılan Band bileşeni geri düğmesini içerir', () => {
    expect(oku('src/bilesenler/duzen.tsx')).toMatch(/\{geri && <GeriDugmesi \/>\}/);
  });
});
