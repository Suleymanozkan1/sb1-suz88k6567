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

/** İki haneli sayı; saat ve tarih birleştirmede kullanılıyor. */
function iki(n: number): string {
  return String(n).padStart(2, '0');
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
  let simdiHatasi = '';
  /*
    İstasyon numaraları yanıtta duruyor. MGM üç ayrı numara veriyor
    (günlük, saatlik, anlık) ve biri boş geldiğinde istek 200 dönüp boş
    liste veriyor -- hata da olmadığı için sorun görünmez oluyordu.
  */
  let istasyon: Record<string, string> = {};

  try {
    /*
      İL BAZINDA ARAMA. Önce ilçe adı da geçiriliyordu; MGM o kayıtta
      günlük tahmin veriyor ama saatlik tahmin ve anlık gözlem için BOŞ
      DİZİ dönüyor (canlıda ham yanıtla doğrulandı: Selçuklu 94231/17244,
      ikisi de boş). İstasyonlar her merkezde eşit dolu değil; ilin tamamı
      alınıp veri VEREN merkez seçiliyor.
    */
    const merkezler = merkezleriCoz(
      await mgmCek(`/merkezler?il=${encodeURIComponent(DEMO_IL)}`),
    );
    const merkez = merkezSec(merkezler, DEMO_ILCE);
    if (!merkez) throw new Error(`MGM merkezi bulunamadı (${merkezler.length} kayıt).`);
    istasyon = {
      gunluk: merkez.gunlukNo, saatlik: merkez.saatlikNo, anlik: merkez.sonDurumNo,
    };

    gunluk = (await gunlukCoz(await mgmCek(`/tahminler/gunluk?istno=${merkez.gunlukNo}`)))
      .map((t) => ({ gun: t.gun, enDusuk: t.minC, enYuksek: t.maxC, hadise: t.hadise }));

    /*
      Seçilen merkez başta, ilin geri kalanı arkasında: ilk VERİ VEREN
      istasyonda duruluyor. Sıra sabit (MGM'nin kendi önceliği); her
      çağrıda başka bir ilçeye düşülseydi ekrandaki sıcaklık sebepsiz
      oynardı.

      Saatlik tahmin ayrı bir çağrı ve düşebilir: günlük tahmin geldiyse
      ekran zaten çizilebiliyor, saatlik şeridin yokluğu onu götürmemeli.
    */
    const adaylar = [merkez, ...merkezler.filter((m) => m !== merkez)];

    for (const aday of adaylar) {
      if (saatlik.length > 0 || !aday.saatlikNo) continue;
      try {
        saatlik = saatlikCoz(await mgmCek(`/tahminler/saatlik?istno=${aday.saatlikNo}`))
          .map((s) => ({ saat: s.saat, sicaklik: s.sicaklikC, hadise: s.hadise }));
        if (saatlik.length > 0) istasyon.saatlik = aday.saatlikNo;
      } catch (e) {
        saatlikHatasi = String(e instanceof Error ? e.message : e).slice(0, 200);
      }
    }

    /*
      ANLIK GÖZLEM. MGM'nin günlük tahmini gün içinde YARINDAN başlıyor;
      bugünün satırı hiç gelmiyor. Ekrandaki hava satırı bugünü aradığı
      için tahmin gelse bile hiç çizilmiyordu. "Şu an kaç derece" ayrı bir
      istasyondan geliyor ve bugünün satırını o dolduruyor.
    */
    for (const aday of adaylar) {
      if (simdi !== null || !aday.sonDurumNo) continue;
      try {
        simdi = sonDurumCoz(await mgmCek(`/sondurumlar?istNo=${aday.sonDurumNo}`));
        if (simdi !== null) istasyon.anlik = aday.sonDurumNo;
      } catch (e) {
        simdiHatasi = String(e instanceof Error ? e.message : e).slice(0, 200);
      }
    }

    /*
      GÖZLEM YOKSA SAATLİK TAHMİN. MGM'nin `/sondurumlar` servisi Konya'nın
      hiçbir istasyonunda karşılık vermedi (canlıda ham yanıtla
      doğrulandı: boş dizi). Saatlik tahmin ise dolu ve içinde
      bulunulan saat de var; bugünün sıcaklığı oradan alınıyor.

      Bu bir ÖLÇÜM DEĞİL TAHMİN: ikisi birkaç derece ayrışabilir. Yine de
      MGM'nin kendi verisi ve o saate ait; ekranda boş bırakmaktan
      iyi. Saat dilimi sabit +03 (Türkiye).
    */
    if (simdi === null && saatlik.length > 0) {
      const tr = new Date(Date.now() + 3 * 60 * 60_000);
      const simdiKi = `${tr.getUTCFullYear()}-${iki(tr.getUTCMonth() + 1)}-${iki(tr.getUTCDate())}T${iki(tr.getUTCHours())}:00`;
      // Geçmiş saatlerin en yenisi: MGM üç saatte bir veri veriyor.
      const uygun = saatlik.filter((s) => s.saat <= simdiKi && s.sicaklik !== null);
      const secilen = uygun[uygun.length - 1] ?? saatlik.find((s) => s.sicaklik !== null);
      if (secilen) simdi = secilen.sicaklik;
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
    gunluk, saatlik, simdi, istasyon, hata, saatlikHatasi, simdiHatasi,
  }));
}
