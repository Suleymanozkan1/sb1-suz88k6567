/**
 * Hava durumu görüntüleme kuralları (madde 29).
 *
 * TEK KURAL: kayıt yoksa tahmin de yok. Sağlayıcı (AccuWeather) ücretsiz
 * katmanında yalnızca birkaç günlük tahmin veriyor; bir yıl sonraki
 * düğün için satır hiç yazılmıyor. Eksik satırı "0 derece" diye
 * göstermek, salon sahibine olmayan bir bilgiyi doğruymuş gibi sunardı.
 */
import type { WeatherForecast } from '../types';

export const TAHMIN_YOK_METNI = 'Tahmin henüz mevcut değil';

/** Verilen güne ait tahmin; yoksa null. */
export function tahminBul(
  tahminler: WeatherForecast[], gun: string,
): WeatherForecast | null {
  return tahminler.find((t) => t.day === gun) ?? null;
}

/**
 * Sıcaklık aralığının okunur hâli.
 *
 * Tek bir değer varsa tek değer yazılıyor; ikisi de yoksa boş dönüyor ve
 * çağıran taraf "tahmin yok" mesajını gösteriyor.
 */
export function sicaklikMetni(tahmin: WeatherForecast): string {
  const { minC, maxC } = tahmin;
  const yaz = (n: number) => `${Math.round(n)}°`;

  if (typeof minC === 'number' && typeof maxC === 'number') return `${yaz(minC)} / ${yaz(maxC)}`;
  if (typeof maxC === 'number') return yaz(maxC);
  if (typeof minC === 'number') return yaz(minC);
  return '';
}

/** Ekranda gösterilecek tam satır; tahmin yoksa açık mesaj. */
export function havaMetni(tahmin: WeatherForecast | null): string {
  if (!tahmin) return TAHMIN_YOK_METNI;

  const sicaklik = sicaklikMetni(tahmin);
  const ozet = tahmin.summary.trim();

  if (!sicaklik && !ozet) return TAHMIN_YOK_METNI;
  return [sicaklik, ozet].filter(Boolean).join(' · ');
}

/**
 * Bugünün "şu an" sıcaklığı.
 *
 * Yalnızca bugünün satırında dolu; başka bir günün satırındaki değer
 * (olmaması gerekir ama) yok sayılıyor.
 */
export function guncelSicaklik(
  tahminler: WeatherForecast[], bugun: string,
): number | null {
  const satir = tahminBul(tahminler, bugun);
  return typeof satir?.currentC === 'number' ? satir.currentC : null;
}
