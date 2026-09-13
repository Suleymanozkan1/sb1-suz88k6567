/**
 * Meteoroloji Genel Müdürlüğü hava olayı ("hadise") kodları.
 *
 * MGM tahminlerinde hava durumu iki-üç harflik bir kodla geliyor
 * (A = açık, PB = parçalı bulutlu...). Kod ekranda ham hâliyle
 * bırakılsaydı salon sahibi "KKY" yazısına bakıp ne olduğunu
 * anlamazdı.
 *
 * Bu tablo hem sunucuda (tahmin yazılırken) hem panelde kullanılıyor;
 * iki yerde ayrı yazılsaydı biri güncellenip diğeri unutulurdu.
 */
export const HADISE_ADLARI: Record<string, string> = {
  A: 'Açık',
  AB: 'Az bulutlu',
  PB: 'Parçalı bulutlu',
  CB: 'Çok bulutlu',
  HY: 'Hafif yağmurlu',
  Y: 'Yağmurlu',
  KY: 'Kuvvetli yağmurlu',
  KKY: 'Kısa süreli yağmurlu',
  SY: 'Sağanak yağışlı',
  KSY: 'Kuvvetli sağanak yağışlı',
  MSY: 'Mevzii sağanak yağışlı',
  DY: 'Dolu',
  GSY: 'Gök gürültülü sağanak yağışlı',
  KGY: 'Kuvvetli gök gürültülü sağanak yağışlı',
  SG: 'Sisli',
  PUS: 'Puslu',
  DMN: 'Dumanlı',
  KF: 'Karla karışık yağmurlu',
  K: 'Kar yağışlı',
  KKAR: 'Kuvvetli kar yağışlı',
  AKAR: 'Aralıklı kar yağışlı',
  HKAR: 'Hafif kar yağışlı',
  SCK: 'Sıcak',
  SGK: 'Soğuk',
  GKR: 'Güneyli kuvvetli rüzgâr',
  KKR: 'Kuzeyli kuvvetli rüzgâr',
  KGY_: 'Kuvvetli gök gürültülü sağanak yağışlı',
  TO: 'Toz veya kum fırtınası',
  R: 'Rüzgârlı',
  HSY: 'Hafif sağanak yağışlı',
  YGN: 'Yağışlı',
};

/**
 * Hava olayı kodunun okunur adı.
 *
 * Tanınmayan kod ATILMIYOR, olduğu gibi gösteriliyor: MGM yeni bir kod
 * eklediğinde satır boş görünmesin, hiç değilse ham kod okunsun.
 */
export function hadiseAdi(kod: string): string {
  const temiz = kod.trim().toLocaleUpperCase('tr');
  if (!temiz) return '';
  return HADISE_ADLARI[temiz] ?? temiz;
}

/**
 * Kodun kaba sınıfı; ekranda simge seçmek için.
 *
 * Yağış/kar/açık ayrımı yeter: her kod için ayrı bir simge çizmek,
 * elli kodun ellisini de tasarlamak demekti.
 */
export type HavaSinifi = 'acik' | 'bulutlu' | 'yagmur' | 'kar' | 'firtina' | 'sis' | 'bilinmiyor';

export function hadiseSinifi(kod: string): HavaSinifi {
  const k = kod.trim().toLocaleUpperCase('tr');
  if (!k) return 'bilinmiyor';
  if (k === 'A') return 'acik';
  if (k === 'AB' || k === 'PB' || k === 'CB') return 'bulutlu';
  if (k.startsWith('G')) return 'firtina';
  if (k === 'SG' || k === 'PUS' || k === 'DMN' || k === 'TO') return 'sis';
  if (k.includes('KAR') || k === 'K' || k === 'KF' || k === 'DY') return 'kar';
  if (k.includes('Y')) return 'yagmur';
  return 'bilinmiyor';
}

const SINIF_SIMGESI: Record<HavaSinifi, string> = {
  acik: '☀',
  bulutlu: '☁',
  yagmur: '🌧',
  kar: '❄',
  firtina: '⛈',
  sis: '🌫',
  bilinmiyor: '',
};

export function hadiseSimgesi(kod: string): string {
  return SINIF_SIMGESI[hadiseSinifi(kod)];
}
