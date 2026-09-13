/**
 * Tanıtım için hava tahmini (Vercel fonksiyonu).
 *
 * NEDEN AYRI UÇ NOKTA. Tahmin önce `/api/demo-gunler` içindeydi ve o uç
 * nokta takvimi de üretiyor: beş yıllık tatil listesi, hicri çevrim ve
 * MEB arşivinin ayrıştırılması. Yerelde bu iş tek başına beş saniye
 * sürüyor ve arşiv kaynağı yavaşladığında daha da uzuyor. Tahmin o
 * zincire bağlı kaldığı sürece, takvim tarafındaki her aksaklık hava
 * durumunu da götürüyordu -- oysa takvimin pakete gömülü bir yedeği var,
 * tahminin yok.
 *
 * BAĞIMLILIĞI YOK. Yalnızca `api/_mgm.ts` içe aktarılıyor; o dosyanın da
 * hiçbir içe aktarması yok. Veritabanı katmanı (`api/_db.ts`) bu pakete
 * hiç girmiyor: tahmin için ne veritabanı ne jeton gerekiyor.
 *
 * ÖNBELLEK. Üç saat. Tahmin gün içinde değişiyor; takvim gibi otuz gün
 * beklenseydi ekranda bayat bir sıcaklık dururdu.
 */
import {
  gunlukCoz, merkezSec, merkezleriCoz, mgmCek, saatlikCoz, sonDurumCoz,
} from '../api/_mgm.js';

/** Tanıtım işletmesinin konumu; tohumdaki salonla aynı il. */
const DEMO_IL = 'Konya';
const DEMO_ILCE = 'Selçuklu';

export interface DemoHava {
  gun: string;
  enDusuk: number | null;
  enYuksek: number | null;
  hadise?: string;
}

export interface DemoHavaSaati {
  saat: string;
  sicaklik: number | null;
  hadise: string;
}

interface VercelYanit {
  status(kod: number): VercelYanit;
  setHeader(ad: string, deger: string): void;
  send(govde: string): void;
}

export default async function handler(_req: unknown, res: VercelYanit): Promise<void> {
  let gunluk: DemoHava[] = [];
  let saatlik: DemoHavaSaati[] = [];
  let simdi: number | null = null;
  let hata = '';
  let saatlikHatasi = '';

  try {
    const merkezler = merkezleriCoz(
      await mgmCek(`/merkezler?il=${encodeURIComponent(DEMO_IL)}&ilce=${encodeURIComponent(DEMO_ILCE)}`),
    );
    const merkez = merkezSec(merkezler, DEMO_ILCE);
    if (!merkez) throw new Error('MGM merkezi bulunamadı.');

    gunluk = (await gunlukCoz(await mgmCek(`/tahminler/gunluk?istno=${merkez.gunlukNo}`)))
      .map((t) => ({ gun: t.gun, enDusuk: t.minC, enYuksek: t.maxC, hadise: t.hadise }));

    /*
      Saatlik tahmin ayrı bir çağrı ve DÜŞEBİLİR: günlük tahmin geldiyse
      ekran zaten çizilebiliyor, saatlik şeridin yokluğu onu götürmemeli.
    */
    try {
      saatlik = saatlikCoz(await mgmCek(`/tahminler/saatlik?istno=${merkez.saatlikNo}`))
        .map((s) => ({ saat: s.saat, sicaklik: s.sicaklikC, hadise: s.hadise }));
    } catch (e) {
      saatlik = [];
      saatlikHatasi = String(e instanceof Error ? e.message : e).slice(0, 200);
    }

    /*
      ANLIK GÖZLEM. MGM'nin günlük tahmini gün içinde YARINDAN başlıyor;
      bugünün satırı hiç gelmiyor. Ekrandaki hava satırı bugünü aradığı
      için tahmin gelse bile hiç çizilmiyordu. "Şu an kaç derece" ayrı bir
      istasyondan geliyor ve bugünün satırını o dolduruyor.
    */
    try {
      simdi = sonDurumCoz(await mgmCek(`/sondurumlar?istNo=${merkez.sonDurumNo}`));
    } catch {
      simdi = null;
    }
  } catch (e) {
    /*
      Hata METİN OLARAK dönüyor: uç nokta sessizce boş liste verseydi
      "MGM ulaşılamadı" ile "kod çöktü" ayırt edilemezdi ve sorun canlıda
      körlemesine aranırdı. Sır içermiyor; yalnızca MGM çağrısının sonucu.
    */
    hata = String(e instanceof Error ? e.message : e).slice(0, 300);
  }

  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader(
    'cache-control',
    gunluk.length > 0 || simdi !== null
      ? 'public, s-maxage=10800, stale-while-revalidate=86400'
      // Başarısız yanıt uzun süre önbellekte kalmamalı.
      : 'public, s-maxage=300',
  );
  res.status(gunluk.length > 0 || simdi !== null ? 200 : 503).send(JSON.stringify({
    uretim: new Date().toISOString(), il: DEMO_IL, ilce: DEMO_ILCE,
    gunluk, saatlik, simdi, hata, saatlikHatasi,
  }));
}
