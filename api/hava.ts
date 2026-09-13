/**
 * Hava durumu tahmini (zamanlanmış görev, madde 29).
 *
 * Sağlayıcı: Meteoroloji Genel Müdürlüğü (servis.mgm.gov.tr).
 * AccuWeather'dan buraya geçildi çünkü MGM anahtar istemiyor, kotası
 * yok ve veri resmî kaynaktan geliyor.
 *
 * GÜNDE BİR KEZ çalışır ve çekebildiği BÜTÜN günleri yazar. Saatlik
 * tahmin ayrı bir görevde (`api/hava-saatlik.ts`), saatte bir.
 *
 * KONUM ELLE GİRİLMİYOR. İşletmenin il/ilçesinden MGM istasyonu
 * bulunup `businesses.weather_station` alanına yazılıyor; bir sonraki
 * çalışmada arama tekrarlanmıyor. Yeni bir salon eklendiğinde alan boş
 * gelir ve ilk çalışmada kendiliğinden dolar.
 *
 * UZAK TARİHLER İÇİN SATIR YAZILMIYOR. MGM'nin tahmini beş gün; bir yıl
 * sonraki düğün için hiçbir sağlayıcıda veri yok. Boş bir satır
 * yazılsaydı ekranda "0°" görünür, salon sahibi olmayan bir tahmine
 * bakardı. Satır olmadığında arayüz "Tahmin henüz mevcut değil" diyor.
 */
import { isAuthorizedCron, isDbConfigured, patchRows, selectRows, upsertRows } from './_db';
import { json } from './_guard';
import {
  gunlukCoz, merkezSec, merkezleriCoz, mgmCek, sonDurumCoz, type Merkez,
} from './_mgm';

interface IsletmeSatiri {
  id: string;
  name: string;
  city: string;
  district: string;
  weather_station: string;
  weather_station_hourly: string;
  weather_station_current: string;
}

/** Bir işletmenin MGM istasyon numaraları. */
export interface Istasyonlar {
  gunluk: string;
  saatlik: string;
  sonDurum: string;
  /** Bu çalışmada yeni bulunduysa veritabanına yazılacak. */
  yeni: boolean;
}

export interface HavaSatiri {
  business_id: string;
  day: string;
  min_c: number | null;
  max_c: number | null;
  current_c: number | null;
  summary: string;
  icon: string;
  humidity: number | null;
  wind_kmh: number | null;
  hadise: string;
}

/** Bugünün tarihi (UTC). Sunucu Türkiye'de de olsa gün sınırı aynı kalsın. */
function bugun(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * İşletmenin MGM istasyon numaralarını bulur.
 *
 * Kayıtlı numara varsa yeniden aranmıyor: her çalışmada arama yapmak,
 * MGM'ye işletme başına fazladan bir istek demekti.
 *
 * İlçe biliniyorsa ÖNCE ilçeyle soruluyor. `?il=Konya` sorgusu ilin
 * yalnızca birincil merkezini (Meram) döndürüyor; ilçesi Ereğli olan bir
 * salon o listede hiç yok ve il merkezinin havasını görürdü.
 */
export async function istasyonBul(
  isletme: IsletmeSatiri,
  cek: (yol: string) => Promise<unknown> = mgmCek,
): Promise<Istasyonlar | null> {
  const kayitli = isletme.weather_station.trim();
  if (kayitli) {
    return {
      gunluk: kayitli,
      // Eski kayıtta yalnızca günlük numara olabilir; ona düşülüyor.
      saatlik: isletme.weather_station_hourly.trim() || kayitli,
      sonDurum: isletme.weather_station_current.trim()
        || isletme.weather_station_hourly.trim() || kayitli,
      yeni: false,
    };
  }

  const il = isletme.city.trim();
  if (!il) return null;
  const ilce = isletme.district.trim();

  const sorgular = ilce
    ? [`/merkezler?il=${encodeURIComponent(il)}&ilce=${encodeURIComponent(ilce)}`,
       `/merkezler?il=${encodeURIComponent(il)}`]
    : [`/merkezler?il=${encodeURIComponent(il)}`];

  for (const yol of sorgular) {
    let merkezler: Merkez[];
    try {
      merkezler = merkezleriCoz(await cek(yol));
    } catch {
      continue;
    }
    const secilen = merkezSec(merkezler, ilce);
    if (secilen) {
      return {
        gunluk: secilen.gunlukNo,
        saatlik: secilen.saatlikNo,
        sonDurum: secilen.sonDurumNo,
        yeni: true,
      };
    }
  }
  return null;
}

export default async function handler(request: Request): Promise<Response> {
  // Cron dışı çağrılara kapalı: sağlayıcıya herkese açık bir uç
  // noktadan yük bindirilememeli.
  if (!isAuthorizedCron(request)) return json({ error: 'Yetkisiz.' }, 401);
  if (!isDbConfigured()) return json({ error: 'Veritabanı yapılandırması eksik.' }, 500);

  /*
    Tanı kipi: MGM belgelenmiş bir API değil. Alan adları değişirse
    tahmin sessizce boş kalır. `?tani=1` ile ham yanıt dönüyor, böylece
    sorunun kaynağı tek istekle görülebiliyor.
  */
  const url = new URL(request.url);
  if (url.searchParams.get('tani') === '1') {
    const istno = url.searchParams.get('istno');
    const il = url.searchParams.get('il');
    try {
      const yol = istno
        ? `/tahminler/gunluk?istno=${encodeURIComponent(istno)}`
        : `/merkezler?il=${encodeURIComponent(il ?? 'Ankara')}`;
      return json({ yol, ham: await mgmCek(yol) });
    } catch (error) {
      return json({ error: 'MGM yanıt vermedi.', detail: String(error) }, 502);
    }
  }

  let isletmeler: IsletmeSatiri[];
  try {
    isletmeler = await selectRows<IsletmeSatiri>(
      'businesses?select=id,name,city,district,weather_station,weather_station_hourly,weather_station_current',
    );
  } catch (error) {
    return json({ error: 'İşletmeler okunamadı.', detail: String(error) }, 502);
  }

  const gun = bugun();
  const sonuc: { business: string; days: number; station: string; detail: string }[] = [];

  for (const isletme of isletmeler) {
    const istasyon = await istasyonBul(isletme);
    if (!istasyon) {
      /*
        İli boş bir işletme için sessizce geçilmiyor: hava durumunun
        neden görünmediği görev günlüğünden okunabilmeli.
      */
      sonuc.push({
        business: isletme.id, days: 0, station: '',
        detail: isletme.city.trim() ? 'MGM istasyonu bulunamadı.' : 'İşletmenin ili girilmemiş.',
      });
      continue;
    }

    // Bulunan numaralar kaydediliyor: bir dahaki sefere arama yapılmasın.
    if (istasyon.yeni) {
      try {
        await patchRows(`businesses?id=eq.${isletme.id}`, {
          weather_station: istasyon.gunluk,
          weather_station_hourly: istasyon.saatlik,
          weather_station_current: istasyon.sonDurum,
        });
      } catch {
        /* yazılamadıysa tahmin yine çekiliyor; yalnızca arama tekrarlanır */
      }
    }

    let satirlar: HavaSatiri[];
    try {
      const tahminler = gunlukCoz(
        await mgmCek(`/tahminler/gunluk?istno=${encodeURIComponent(istasyon.gunluk)}`),
      );
      satirlar = tahminler.map((t) => ({
        business_id: isletme.id,
        day: t.gun,
        min_c: t.minC,
        max_c: t.maxC,
        current_c: null,
        /*
          `summary` hadise kodunun kendisini taşıyor; okunur adı
          istemcide üretiliyor (src/lib/mgm.ts). Sunucuda çevrilseydi
          ad değiştiğinde geçmiş satırlar eski adla kalırdı.
        */
        summary: t.hadise,
        icon: t.hadise,
        humidity: t.nem,
        wind_kmh: t.ruzgarKmh,
        hadise: t.hadise,
      }));
    } catch (error) {
      sonuc.push({ business: isletme.id, days: 0, station: istasyon.gunluk, detail: String(error) });
      continue;
    }

    /*
      Anlık gözlem AYRI bir istek ve başarısızlığı tahminin yazılmasını
      engellemiyor: "şu an kaç derece" olmadan da düğün günü tahmini işe
      yarıyor.
    */
    try {
      const simdi = sonDurumCoz(
        await mgmCek(`/sondurumlar?istNo=${encodeURIComponent(istasyon.sonDurum)}`),
      );
      const bugunSatiri = satirlar.find((s) => s.day === gun);
      if (bugunSatiri && simdi !== null) bugunSatiri.current_c = simdi;
    } catch {
      /* gözlem alınamadı; tahmin yine de yazılıyor */
    }

    if (satirlar.length === 0) {
      sonuc.push({
        business: isletme.id, days: 0, station: istasyon.gunluk,
        detail: 'MGM tahmin vermedi.',
      });
      continue;
    }

    try {
      await upsertRows('weather_forecasts', satirlar, 'business_id,day');
      sonuc.push({ business: isletme.id, days: satirlar.length, station: istasyon.gunluk, detail: '' });
    } catch (error) {
      sonuc.push({ business: isletme.id, days: 0, station: istasyon.gunluk, detail: String(error) });
    }
  }

  return json({ businesses: isletmeler.length, results: sonuc });
}
