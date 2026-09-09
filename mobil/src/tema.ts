/**
 * Tasarım değişkenleri.
 *
 * Renkler web uygulamasının paletiyle birebir aynı; kontrast oranları
 * WCAG 2.1 AA'ya göre seçildi (yorumlardaki değer beyaz zemine karşıdır).
 * Mobilde de aynı kural geçerli: açık mavi (`vurgu`) yalnızca dekoratif,
 * metin ve buton zemini için `vurguKoyu` kullanılır.
 */
export const renk = {
  lacivert: '#25365a',
  marka: '#37517e',
  markaKoyu: '#2f4770',
  markaSolgun: '#4b6fab', // 5,05
  vurgu: '#47b2e4', // 2,40, yalnızca dekoratif
  vurguKoyu: '#1876a1', // 5,07, metin ve buton
  vurguDaha: '#146485', // 6,58, basılı hâl
  vurguAcik: '#87cded', // koyu zeminde metin, 4,54
  zemin: '#f3f5fa',
  kart: '#ffffff',
  metin: '#333f55',
  metinSolgun: '#6b7a99',
  cizgi: '#dce3ef',
  cizgiSolgun: '#e8edf5',
  basari: '#0f7f43',
  uyari: '#9b6208',
  tehlike: '#d42c1a',
  beyaz: '#ffffff',
} as const;

/** 4 piksellik ızgara: aradaki her boşluk bu ölçeğin bir adımı. */
export const aralik = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 } as const;

export const yuvarlak = { s: 6, m: 10, l: 14, tam: 999 } as const;

/**
 * Tipografi. Başlıklarda görüntü yazı tipi yerine sistem yazı tipinin
 * ağırlıkları kullanılıyor: hem indirilecek dosya yok hem de her iki
 * platformda da yerel görünüyor.
 */
export const yazi = {
  dev: { fontSize: 30, fontWeight: '700', letterSpacing: -0.5 },
  baslik: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  altBaslik: { fontSize: 17, fontWeight: '600' },
  govde: { fontSize: 15, fontWeight: '400' },
  kucuk: { fontSize: 13, fontWeight: '400' },
  minik: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4 },
  /** Tutarlar: rakam genişlikleri eşit olsun ki sütun hâlinde hizalansın. */
  tutar: { fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },
  tutarDev: { fontSize: 28, fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
} as const;

/** Dokunma hedefi en az 44×44 (iOS HIG) / 48dp (Material). */
export const DOKUNMA_EN_AZ = 44;
