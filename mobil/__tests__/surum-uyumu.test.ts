/**
 * Expo SDK ile araç zinciri sürümlerinin uyumu.
 *
 * NEDEN VAR. `babel-preset-expo` bir kez `^57.0.11`e kaymıştı; proje ise
 * Expo SDK 54. Görünürde her şey çalışıyordu -- `expo start` açılıyor,
 * `tsc` temiz, bütün testler geçiyordu. Bozulan tek şey, kimsenin her gün
 * çalıştırmadığı şeydi: sürüm derlemesi.
 *
 * Sebep şu: 57 serisi "Hermes V1" (SDK 56+) hedefler ve o motor `#ozel`
 * sınıf alanlarını desteklediği için babel bu alanları DÖNÜŞTÜRMEZ. SDK
 * 54'ün Hermes'i ise desteklemez. React Native'in kendi `DOMRect`
 * kaynağı `#x` kullandığından, `hermesc` paketi derlerken
 * "private properties are not supported" deyip düşüyordu:
 *
 *   Execution failed for task ':app:createBundleReleaseJsAndAssets'
 *
 * Yani APK hiç üretilemiyordu. Geliştirme akışında hiçbir belirti
 * vermediği için de ancak sürüm derlemesi denendiğinde ortaya çıktı.
 *
 * Bu test o sessiz kaymayı yakalar: araç zinciri, kurulu Expo SDK ile
 * aynı ana sürümde olmalı.
 */
function anaSurum(paket: string): number {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { version } = require(`${paket}/package.json`) as { version: string };
  const ana = Number(version.split('.')[0]);
  expect(Number.isFinite(ana)).toBe(true);
  return ana;
}

describe('araç zinciri sürümleri Expo SDK ile uyumlu', () => {
  it('babel-preset-expo, Expo ile aynı ana sürümde', () => {
    /*
      Ana sürümler birebir eşleşir: babel-preset-expo 54.x <-> expo 54.x.
      Eşleşmediğinde hata mesajı sebebi de söylesin; "sürüm farklı"
      demek, neden önemli olduğunu anlatmıyor.
    */
    expect({
      'babel-preset-expo': anaSurum('babel-preset-expo'),
      aciklama: 'Expo SDK ile aynı ana sürüm olmalı; farklıysa Hermes sürüm derlemesi kırılır.',
    }).toEqual({
      'babel-preset-expo': anaSurum('expo'),
      aciklama: 'Expo SDK ile aynı ana sürüm olmalı; farklıysa Hermes sürüm derlemesi kırılır.',
    });
  });

  it('Hermes, RN kaynağındaki özel sınıf alanlarını derleyebiliyor olmalı', () => {
    /*
      Asıl kural bu: paket içinde `#ozel` alan KALMAMALI. Sürüm
      eşleşmesi bunun aracı; burada sonucu doğrudan sınıyoruz.

      React Native'in `DOMRect` kaynağı özel alan kullanıyor. Babel bunu
      dönüştürmezse paket `hermesc`'ten geçmez.
    */
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const babel = require('@babel/core') as typeof import('@babel/core');
    const sonuc = babel.transformSync('class R { #x = 0; oku() { return this.#x; } }', {
      filename: 'DOMRect.js',
      babelrc: false,
      configFile: false,
      presets: ['babel-preset-expo'],
      caller: {
        name: 'metro',
        // @ts-expect-error -- Metro'nun gerçek çağrı bağlamı; tip tanımında yok.
        platform: 'android',
        isDev: false,
        unstable_transformProfile: 'hermes-stable',
        supportsStaticESM: true,
      },
    });

    expect(sonuc?.code).toBeTruthy();
    expect(sonuc!.code).not.toMatch(/#\w/);
  });
});
