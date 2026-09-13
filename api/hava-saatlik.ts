/**
 * Saatlik hava tahmini (zamanlanmış görev).
 *
 * SAATTE BİR çalışır. Günlük tahmin (`api/hava.ts`) günde bir kez
 * çekiliyor; saatlik veri ondan ayrı, çünkü "düğün saatinde yağmur var
 * mı" sorusunun cevabı gün ortalamasında yok: 30 derece sıcak bir günün
 * 19:00'unda sağanak olabilir.
 *
 * İSTASYON ARANMIYOR. Günlük görev `businesses.weather_station` alanını
 * dolduruyor; burası yalnızca dolu olanları işliyor. İki görev de arama
 * yapsaydı MGM'ye gereksiz yere iki kat istek giderdi ve yeni bir salon
 * eklendiğinde iki farklı istasyona düşme ihtimali doğardı.
 *
 * GEÇMİŞ SAATLER TEMİZLENİYOR: saatte bir yazılan satırlar
 * temizlenmeseydi tablo işletme başına yılda ~9 bin satır büyürdü.
 */
import { callRpc, isAuthorizedCron, isDbConfigured, selectRows, upsertRows } from './_db.js';
import { json } from './_guard.js';
import { mgmCek, saatlikCoz } from './_mgm.js';

interface IsletmeSatiri {
  id: string;
  name: string;
  /*
    SAATLİK istasyon; günlükten farklı olabiliyor (Konya/Meram: günlük
    94201, saatlik 17245). Günlük numarayla sorulsaydı saatlik tahmin
    boş dönerdi. Eski kayıtta boşsa günlüğe düşülüyor.
  */
  weather_station: string;
  weather_station_hourly: string;
}

export interface SaatlikSatir {
  business_id: string;
  hour: string;
  temp_c: number | null;
  feels_c: number | null;
  humidity: number | null;
  wind_kmh: number | null;
  hadise: string;
}

export default async function handler(request: Request): Promise<Response> {
  if (!isAuthorizedCron(request)) return json({ error: 'Yetkisiz.' }, 401);
  if (!isDbConfigured()) return json({ error: 'Veritabanı yapılandırması eksik.' }, 500);

  let isletmeler: IsletmeSatiri[];
  try {
    isletmeler = await selectRows<IsletmeSatiri>(
      'businesses?select=id,name,weather_station,weather_station_hourly&weather_station=neq.',
    );
  } catch (error) {
    return json({ error: 'İşletmeler okunamadı.', detail: String(error) }, 502);
  }

  const sonuc: { business: string; hours: number; detail: string }[] = [];

  for (const isletme of isletmeler) {
    const istno = isletme.weather_station_hourly.trim() || isletme.weather_station.trim();
    let satirlar: SaatlikSatir[];

    try {
      const tahminler = saatlikCoz(
        await mgmCek(`/tahminler/saatlik?istno=${encodeURIComponent(istno)}`),
      );
      satirlar = tahminler.map((t) => ({
        business_id: isletme.id,
        hour: t.saat,
        temp_c: t.sicaklikC,
        feels_c: t.hissedilenC,
        humidity: t.nem,
        wind_kmh: t.ruzgarKmh,
        hadise: t.hadise,
      }));
    } catch (error) {
      sonuc.push({ business: isletme.id, hours: 0, detail: String(error) });
      continue;
    }

    if (satirlar.length === 0) {
      sonuc.push({ business: isletme.id, hours: 0, detail: 'MGM saatlik tahmin vermedi.' });
      continue;
    }

    try {
      await upsertRows('weather_hourly', satirlar, 'business_id,hour');
      sonuc.push({ business: isletme.id, hours: satirlar.length, detail: '' });
    } catch (error) {
      sonuc.push({ business: isletme.id, hours: 0, detail: String(error) });
    }
  }

  /*
    Temizlik başarısızlığı görevi düşürmüyor: tahminler yazıldıysa iş
    görülmüştür, eski satırlar bir sonraki saatte de silinebilir.
  */
  let silinen = 0;
  try {
    silinen = await callRpc<number>('saatlik_havayi_temizle', {});
  } catch {
    /* temizlik yapılamadı; bir sonraki çalışmada denenir */
  }

  return json({ businesses: isletmeler.length, cleaned: silinen, results: sonuc });
}
