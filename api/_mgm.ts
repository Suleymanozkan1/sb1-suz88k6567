/**
 * Meteoroloji Genel Müdürlüğü servis istemcisi.
 *
 * MGM'nin kendi sitesinin kullandığı servis (servis.mgm.gov.tr)
 * ANAHTAR İSTEMİYOR; yalnızca isteğin MGM sitesinden geldiğini gösteren
 * başlıkları bekliyor. AccuWeather yerine bunun seçilmesinin sebebi bu:
 * kota yok, ücret yok, veri resmî kaynaktan geliyor.
 *
 * ÇÖZÜMLEYİCİLER SAVUNMACI. Servis belgelenmiş bir API değil; MGM alan
 * adını değiştirdiğinde kod çökmek yerine "veri gelmedi" demeli ve
 * görev günlüğüne sebebini yazmalı. Bu yüzden her alan tek tek
 * kontrol ediliyor ve eksik satır ATILIYOR -- yarım bir tahmin,
 * hiç tahmin olmamasından kötüdür.
 */

/** Servis kökü; test ve olası adres değişikliği için ortamdan geçersiz kılınabilir. */
export const MGM_KOKU = process.env.MGM_API_URL ?? 'https://servis.mgm.gov.tr/web';

/**
 * MGM servisi isteğin kendi sitesinden geldiğini bekliyor.
 * Başlıklar gönderilmezse 403 dönüyor.
 */
export const MGM_BASLIKLARI: Record<string, string> = {
  Origin: 'https://www.mgm.gov.tr',
  Referer: 'https://www.mgm.gov.tr/',
  Accept: 'application/json',
};

export function sayiVeyaNull(deger: unknown): number | null {
  if (deger === null || deger === undefined || deger === '') return null;
  const n = Number(deger);
  /*
    MGM eksik ölçümü -9999 ile gösteriyor. Sayı olarak geçerli olduğu
    için Number.isFinite yakalamaz; ekranda "-9999°" yazardı.
  */
  if (!Number.isFinite(n) || n <= -999) return null;
  return n;
}

/** Alan adı büyük/küçük harf değişse de okunsun (istNo / istno). */
export function alan(kayit: Record<string, unknown>, ...adlar: string[]): unknown {
  for (const ad of adlar) {
    if (kayit[ad] !== undefined) return kayit[ad];
    const bulunan = Object.keys(kayit).find((k) => k.toLowerCase() === ad.toLowerCase());
    if (bulunan) return kayit[bulunan];
  }
  return undefined;
}

export interface Merkez {
  /** Günlük tahmin istasyonu (`gunlukTahminIstNo`). */
  gunlukNo: string;
  /** Saatlik tahmin istasyonu (`saatlikTahminIstNo`). */
  saatlikNo: string;
  /** Anlık gözlem istasyonu (`sondurumIstNo`). */
  sonDurumNo: string;
  il: string;
  ilce: string;
  /** MGM'nin kendi sıralaması; 1 = ilin birincil merkezi. */
  oncelik: number;
}

/**
 * `/merkezler` yanıtından istasyon numaralarını çıkarır.
 *
 * ÜÇ AYRI NUMARA var ve aynı olmak zorunda değiller. Konya/Meram
 * kaydında günlük 94201, saatlik ve son durum 17245. Tek numara
 * saklansaydı saatlik tahmin boş dönerdi -- gerçek veriyle doğrulandı.
 */
export function merkezleriCoz(govde: unknown): Merkez[] {
  const liste = Array.isArray(govde) ? govde : [];
  const sonuc: Merkez[] = [];
  for (const ham of liste as Record<string, unknown>[]) {
    const gunluk = alan(ham, 'gunlukTahminIstNo');
    const saatlik = alan(ham, 'saatlikTahminIstNo');
    const sonDurum = alan(ham, 'sondurumIstNo');

    const metin = (deger: unknown, yedek: unknown): string => {
      const d = deger ?? yedek;
      return d === undefined || d === null ? '' : String(d).trim();
    };

    const gunlukNo = metin(gunluk, saatlik);
    if (!gunlukNo) continue;

    sonuc.push({
      gunlukNo,
      saatlikNo: metin(saatlik, gunluk),
      sonDurumNo: metin(sonDurum, saatlik ?? gunluk),
      il: String(alan(ham, 'il') ?? '').trim(),
      ilce: String(alan(ham, 'ilce') ?? '').trim(),
      oncelik: Number(alan(ham, 'oncelik') ?? 99) || 99,
    });
  }
  return sonuc;
}

/**
 * İl/ilçeye en uygun merkezi seçer.
 *
 * Sıra: tam ilçe eşleşmesi -> MGM'nin kendi önceliği (1 = ilin birincil
 * merkezi) -> "Merkez" adlı ilçe -> listedeki ilk kayıt.
 *
 * Önceliğe bakılmasının sebebi: `?il=Konya` sorgusu ilin BİRİNCİL
 * merkezini döndürüyor (Meram), "Merkez" adında bir ilçe yok. Yalnızca
 * "Merkez" aranıp ilk kayda düşülseydi, çok merkezli illerde rastgele
 * bir ilçenin havası gösterilebilirdi.
 */
export function merkezSec(merkezler: Merkez[], ilce: string): Merkez | null {
  if (merkezler.length === 0) return null;

  const hedef = ilce.trim().toLocaleLowerCase('tr');
  if (hedef) {
    const tam = merkezler.find((m) => m.ilce.toLocaleLowerCase('tr') === hedef);
    if (tam) return tam;
  }

  const sirali = [...merkezler].sort((a, b) => a.oncelik - b.oncelik);
  if (sirali[0]!.oncelik < 99) return sirali[0]!;

  const merkezIlce = merkezler.find((m) => m.ilce.toLocaleLowerCase('tr') === 'merkez');
  return merkezIlce ?? merkezler[0]!;
}

export interface GunlukTahmin {
  gun: string;
  minC: number | null;
  maxC: number | null;
  nem: number | null;
  ruzgarKmh: number | null;
  hadise: string;
}

/**
 * `/tahminler/gunluk` yanıtını çözer.
 *
 * MGM günleri AYRI ALANLARDA veriyor: `tarihGun1`, `enDusukGun1`,
 * `enYuksekGun1`... beşinci güne kadar. Dizi değil, düzleştirilmiş bir
 * kayıt; bu yüzden 1..5 arası dönülüyor.
 */
export function gunlukCoz(govde: unknown): GunlukTahmin[] {
  const liste = Array.isArray(govde) ? govde : [];
  const kayit = liste[0] as Record<string, unknown> | undefined;
  if (!kayit) return [];

  const sonuc: GunlukTahmin[] = [];
  for (let i = 1; i <= 5; i += 1) {
    const tarih = String(alan(kayit, `tarihGun${i}`) ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tarih)) continue;

    const min = sayiVeyaNull(alan(kayit, `enDusukGun${i}`));
    const max = sayiVeyaNull(alan(kayit, `enYuksekGun${i}`));
    const hadise = String(alan(kayit, `hadiseGun${i}`) ?? '').trim();

    // Ne sıcaklık ne hava olayı varsa satır yazılmıyor.
    if (min === null && max === null && !hadise) continue;

    sonuc.push({
      gun: tarih,
      minC: min,
      maxC: max,
      nem: sayiVeyaNull(alan(kayit, `enYuksekNemGun${i}`)),
      ruzgarKmh: sayiVeyaNull(alan(kayit, `ruzgarHizGun${i}`)),
      hadise,
    });
  }
  return sonuc;
}

export interface SaatlikTahmin {
  saat: string;
  sicaklikC: number | null;
  hissedilenC: number | null;
  nem: number | null;
  ruzgarKmh: number | null;
  hadise: string;
}

/**
 * `/tahminler/saatlik` yanıtını çözer.
 *
 * Saat YEREL olarak metin hâlinde saklanıyor (yyyy-mm-ddTHH:00). Date'e
 * çevrilip yeniden yazılsaydı sunucunun saat dilimine göre kayar ve
 * "19:00'da yağmur var" bilgisi başka bir saate düşerdi.
 */
export function saatlikCoz(govde: unknown): SaatlikTahmin[] {
  const liste = Array.isArray(govde) ? govde : [];
  const kayit = liste[0] as Record<string, unknown> | undefined;
  if (!kayit) return [];
  const tahminler = alan(kayit, 'tahmin', 'tahminler');
  if (!Array.isArray(tahminler)) return [];

  const sonuc: SaatlikTahmin[] = [];
  for (const ham of tahminler as Record<string, unknown>[]) {
    const zaman = String(alan(ham, 'tarih', 'zaman') ?? '');
    const eslesme = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec(zaman);
    if (!eslesme) continue;

    const sicaklik = sayiVeyaNull(alan(ham, 'sicaklik'));
    const hadise = String(alan(ham, 'hadise') ?? '').trim();
    if (sicaklik === null && !hadise) continue;

    sonuc.push({
      saat: `${eslesme[1]}T${eslesme[2]}:00`,
      sicaklikC: sicaklik,
      hissedilenC: sayiVeyaNull(alan(ham, 'hissedilenSicaklik')),
      nem: sayiVeyaNull(alan(ham, 'nem')),
      ruzgarKmh: sayiVeyaNull(alan(ham, 'ruzgarHizi', 'ruzgarHiz')),
      hadise,
    });
  }
  return sonuc;
}

/** `/sondurumlar` yanıtından o anki sıcaklık. */
export function sonDurumCoz(govde: unknown): number | null {
  const liste = Array.isArray(govde) ? govde : [];
  const kayit = liste[0] as Record<string, unknown> | undefined;
  if (!kayit) return null;
  return sayiVeyaNull(alan(kayit, 'sicaklik'));
}

/** MGM'den JSON çeker; başlıkları ve zaman aşımını tek yerde tutar. */
export async function mgmCek(yol: string): Promise<unknown> {
  const yanit = await fetch(`${MGM_KOKU}${yol}`, {
    headers: MGM_BASLIKLARI,
    signal: AbortSignal.timeout(15_000),
  });
  if (!yanit.ok) throw new Error(`MGM ${yanit.status} döndü (${yol})`);
  return yanit.json();
}
