/**
 * Hava durumu tahmini (zamanlanmış görev, madde 29).
 *
 * Sağlayıcı AccuWeather. İşletmenin `weather_location` alanındaki konum
 * anahtarı için günlük tahmin çekilip `weather_forecasts` tablosuna
 * yazılıyor; panel o tablodan okuyor.
 *
 * Anahtar SUNUCUDA: `ACCUWEATHER_API_KEY`. Tarayıcıdan çekilseydi
 * anahtar istemciye inerdi ve her açılan sekme sağlayıcının günlük
 * kotasından yerdi.
 *
 * UZAK TARİHLER İÇİN SATIR YAZILMIYOR. Ücretsiz katman yalnızca birkaç
 * günlük tahmin veriyor; bir yıl sonraki düğün için sağlayıcıda veri
 * yok. Boş bir satır yazılsaydı ekranda "0°" görünür, salon sahibi
 * olmayan bir tahmine bakardı. Satır olmadığında arayüz "Tahmin henüz
 * mevcut değil" diyor.
 */
import { isAuthorizedCron, isDbConfigured, selectRows, upsertRows } from './_db';
import { json } from './_guard';

interface IsletmeSatiri {
  id: string;
  name: string;
  weather_location: string;
}

export interface HavaSatiri {
  business_id: string;
  day: string;
  min_c: number | null;
  max_c: number | null;
  current_c: number | null;
  summary: string;
  icon: string;
}

const ACCU_KOK = 'https://dataservice.accuweather.com';

function sayiVeyaNull(deger: unknown): number | null {
  const n = Number(deger);
  return Number.isFinite(n) ? n : null;
}

/**
 * AccuWeather günlük tahmin yanıtını çözer.
 *
 * Sıcaklık `Metric` altından okunuyor; istek `metric=true` ile
 * atılıyor. `Imperial` okunsaydı Fahrenheit değerler Celsius sanılıp
 * yazılırdı ve 68° bir yaz günü gibi görünürdü.
 *
 * `EpochDate` yerine `Date` alanının ilk 10 karakteri kullanılıyor:
 * epoch, sunucunun saat dilimine göre bir gün kayabiliyor.
 */
export function accuweatherCevir(govde: unknown, businessId: string): HavaSatiri[] {
  const kok = govde as { DailyForecasts?: unknown };
  const liste = Array.isArray(kok?.DailyForecasts) ? kok.DailyForecasts : [];

  const satirlar: HavaSatiri[] = [];
  for (const ham of liste as Record<string, unknown>[]) {
    const gun = String(ham.Date ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(gun)) continue;

    const sicaklik = (ham.Temperature ?? {}) as Record<string, Record<string, unknown>>;
    const gunduz = (ham.Day ?? {}) as Record<string, unknown>;

    const min = sayiVeyaNull(sicaklik.Minimum?.Value);
    const max = sayiVeyaNull(sicaklik.Maximum?.Value);
    const ozet = String(gunduz.IconPhrase ?? '').trim();

    /*
      Ne sıcaklık ne özet varsa satır yazılmıyor: içi boş bir kayıt,
      "tahmin var ama bilinmiyor" gibi görünürdü.
    */
    if (min === null && max === null && !ozet) continue;

    satirlar.push({
      business_id: businessId,
      day: gun,
      min_c: min,
      max_c: max,
      current_c: null,
      summary: ozet,
      icon: gunduz.Icon === undefined || gunduz.Icon === null ? '' : String(gunduz.Icon),
    });
  }
  return satirlar;
}

/**
 * AccuWeather anlık gözlem yanıtından o anki sıcaklığı çıkarır.
 *
 * Ayrı bir tabloya yazılmıyor; bugünün tahmin satırına işleniyor.
 * Gözlem alınamazsa null dönüyor ve o alan boş kalıyor -- tahmin yine
 * de gösteriliyor, yalnızca "şu an" satırı görünmüyor.
 */
export function guncelSicakligiCoz(govde: unknown): number | null {
  const liste = Array.isArray(govde) ? govde : [];
  const ilk = liste[0] as Record<string, unknown> | undefined;
  if (!ilk) return null;
  const sicaklik = (ilk.Temperature ?? {}) as Record<string, Record<string, unknown>>;
  return sayiVeyaNull(sicaklik.Metric?.Value);
}

/** Bugünün tarihi (UTC). Sunucu Türkiye'de de olsa gün sınırı aynı kalsın. */
function bugun(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function handler(request: Request): Promise<Response> {
  // Cron dışı çağrılara kapalı: sağlayıcı kotası herkese açık bir uç
  // noktadan tüketilebilmemeli.
  if (!isAuthorizedCron(request)) return json({ error: 'Yetkisiz.' }, 401);
  if (!isDbConfigured()) return json({ error: 'Veritabanı yapılandırması eksik.' }, 500);

  const anahtar = process.env.ACCUWEATHER_API_KEY;
  if (!anahtar) {
    /*
      Sessizce başarılı dönmüyor: hava durumu boş kaldığında sebebinin
      "sağlayıcı tanımlı değil" olduğu görev günlüğünden okunabilmeli.
    */
    return json({ error: 'ACCUWEATHER_API_KEY tanımlı değil.' }, 500);
  }

  let isletmeler: IsletmeSatiri[];
  try {
    isletmeler = await selectRows<IsletmeSatiri>(
      'businesses?select=id,name,weather_location&weather_location=neq.',
    );
  } catch (error) {
    return json({ error: 'İşletmeler okunamadı.', detail: String(error) }, 502);
  }

  const gun = bugun();
  const sonuc: { business: string; days: number; detail: string }[] = [];

  for (const isletme of isletmeler) {
    const konum = encodeURIComponent(isletme.weather_location.trim());
    let satirlar: HavaSatiri[];

    try {
      const yanit = await fetch(
        `${ACCU_KOK}/forecasts/v1/daily/5day/${konum}?apikey=${encodeURIComponent(anahtar)}&language=tr-tr&metric=true`,
        { signal: AbortSignal.timeout(15_000) },
      );
      if (!yanit.ok) {
        sonuc.push({ business: isletme.id, days: 0, detail: `Sağlayıcı ${yanit.status} döndü.` });
        continue;
      }
      satirlar = accuweatherCevir(await yanit.json(), isletme.id);
    } catch (error) {
      sonuc.push({ business: isletme.id, days: 0, detail: String(error) });
      continue;
    }

    /*
      Anlık gözlem ayrı bir istek ve BAŞARISIZLIĞI tahminin yazılmasını
      engellemiyor: "şu an kaç derece" bilgisi olmadan da düğün günü
      tahmini işe yarıyor.
    */
    try {
      const yanit = await fetch(
        `${ACCU_KOK}/currentconditions/v1/${konum}?apikey=${encodeURIComponent(anahtar)}&language=tr-tr`,
        { signal: AbortSignal.timeout(15_000) },
      );
      if (yanit.ok) {
        const simdi = guncelSicakligiCoz(await yanit.json());
        const bugunSatiri = satirlar.find((s) => s.day === gun);
        if (bugunSatiri && simdi !== null) bugunSatiri.current_c = simdi;
      }
    } catch {
      /* gözlem alınamadı; tahmin yine de yazılıyor */
    }

    if (satirlar.length === 0) {
      sonuc.push({ business: isletme.id, days: 0, detail: 'Sağlayıcı tahmin vermedi.' });
      continue;
    }

    try {
      await upsertRows('weather_forecasts', satirlar, 'business_id,day');
      sonuc.push({ business: isletme.id, days: satirlar.length, detail: '' });
    } catch (error) {
      sonuc.push({ business: isletme.id, days: 0, detail: String(error) });
    }
  }

  return json({ businesses: isletmeler.length, results: sonuc });
}
