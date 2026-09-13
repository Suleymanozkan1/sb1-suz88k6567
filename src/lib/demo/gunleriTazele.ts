/**
 * Demo takvimini canlı kaynaktan tazeler.
 *
 * İKİ KATMAN VAR ve ikisi farklı işi yapıyor:
 *
 *   1. `uretilmis-gunler.ts` -- pakete gömülü. Uygulama açılır açılmaz
 *      takvim dolu geliyor; ağ beklenmiyor, uçtan uca testler dış
 *      isteklere kapalı olduğu için orada da bu kullanılıyor.
 *
 *   2. `/api/demo-gunler` -- Vercel fonksiyonu. Ayda bir cron'la
 *      tazelenen canlı veri. Gömülü dosya eskidiğinde ekranı güncel
 *      tutan budur.
 *
 * Sıra önemli: önce gömülü veri yazılıyor (tohum), sonra bu fonksiyon
 * canlı veriyle üzerine yazıyor. Tersi olsaydı ağ yavaş olduğunda
 * takvim bir süre boş görünürdü.
 *
 * Başarısızlık SESSİZ. Fonksiyon yayında değilse ya da kaynak düştüyse
 * gömülü veri kalıyor; tanıtım ekranında hata mesajı çıkarmanın anlamı
 * yok.
 */
import type { ExchangeRate, SpecialDay, WeatherForecast, WeatherHour } from '../../types';
import { hadiseAdi } from '../mgm';
import { KEYS, read, write } from '../storage';

interface Yanit {
  uretim?: string;
  gunler?: { day: string; label: string; kind: string; tentative?: boolean }[];
}

interface HavaYaniti {
  uretim?: string;
  gunluk?: { gun: string; enDusuk: number | null; enYuksek: number | null; hadise?: string }[];
  saatlik?: { saat: string; sicaklik: number | null; hadise: string }[];
  /** Anlık gözlem: "şu an kaç derece". */
  simdi?: number | null;
}

export const DEMO_GUN_ADRESI = '/api/demo-gunler';

/*
  Hava tahmini AYRI uç noktada. Takvim uç noktası beş yıllık tatil
  listesini ve MEB arşivini ayrıştırıyor; yavaş ve kırılgan. Tahmin o
  zincire bağlı kalsaydı takvim tarafındaki her aksaklık hava durumunu da
  götürürdü -- takvimin pakete gömülü yedeği var, tahminin yok.
*/
export const DEMO_HAVA_ADRESI = '/api/demo-hava';

/*
  Döviz kuru da ayrı uç noktada ve ayrı tazeleniyor: TCMB kuru iş günü
  içinde bir kez yayımlanıyor, hava tahmini gün içinde değişiyor. Tek
  çağrıda birleştirilseydi ikisinden hızlı değişene göre önbellek
  kurulur, TCMB boşuna sorulurdu.
*/
export const DEMO_KUR_ADRESI = '/api/demo-kur';

/** Tanıtım işletmesi; tahmin satırları bu kimliğe yazılıyor. */
const DEMO_ISLETME = 'biz_demo';

/**
 * Canlı veriyi çeker ve depoya yazar.
 *
 * `zamanAsimi` veriliyor: tanıtım ekranı, cevap vermeyen bir uç nokta
 * yüzünden beklemede kalmamalı.
 */
export async function gunleriTazele(zamanAsimi = 6_000): Promise<boolean> {
  try {
    const yanit = await fetch(DEMO_GUN_ADRESI, {
      signal: AbortSignal.timeout(zamanAsimi),
    });
    if (!yanit.ok) return false;

    const govde = (await yanit.json()) as Yanit;

    const gelen = govde.gunler ?? [];
    if (gelen.length === 0) return false;

    /*
      İşletmeye özel günler korunuyor: kullanıcının demo sırasında elle
      eklediği bir gün, canlı veri geldi diye silinmemeli. Yalnızca
      sağlayıcıdan gelen kayıtlar değiştiriliyor.
    */
    const mevcut = read<SpecialDay[]>(KEYS.specialDays, []);
    const elleEklenen = mevcut.filter((g) => g.source === 'isletme');

    const yeni: SpecialDay[] = gelen.map((g, i) => ({
      id: `ozelgun_canli_${i}`,
      day: g.day,
      label: g.label,
      kind: g.kind as SpecialDay['kind'],
      source: 'saglayici',
      tentative: g.tentative,
      createdAt: new Date().toISOString(),
    }));

    write(KEYS.specialDays, [...yeni, ...elleEklenen]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Hava tahminini çeker ve depoya yazar.
 *
 * Tahminin pakete gömülü bir yedeği YOK ve olmamalı: bir hafta önce
 * çekilmiş sıcaklık, boş bir kutudan daha kötüdür -- salon sahibi ona
 * bakarak bahçe kurulumuna karar verir. MGM'ye ulaşılamazsa liste boş
 * kalıyor ve ekran tahmini hiç çizmiyor.
 */
export async function havayiTazele(zamanAsimi = 6_000): Promise<boolean> {
  try {
    const yanit = await fetch(DEMO_HAVA_ADRESI, { signal: AbortSignal.timeout(zamanAsimi) });
    if (!yanit.ok) return false;

    const govde = (await yanit.json()) as HavaYaniti;
    const gunluk = govde.gunluk ?? [];
    const simdi = govde.simdi ?? null;
    if (gunluk.length === 0 && simdi === null) return false;
    const cekilme = govde.uretim ?? new Date().toISOString();

    const satirlar = gunluk.map((h): WeatherForecast => ({
      businessId: DEMO_ISLETME,
      day: h.gun,
      minC: h.enDusuk ?? undefined,
      maxC: h.enYuksek ?? undefined,
      // Ekranda "A" değil "Açık" yazmalı; kod okunur ada çevriliyor.
      summary: hadiseAdi(h.hadise ?? ''),
      icon: h.hadise ?? '',
      hadise: h.hadise,
      fetchedAt: cekilme,
    }));

    /*
      BUGÜNÜN SATIRI. MGM'nin günlük tahmini gün içinde yarından başlıyor
      ve ekrandaki hava satırı bugünü arıyor; bugün olmadan tahmin gelse
      bile hiç çizilmiyordu. Anlık gözlem varsa bugünün satırı ondan
      doluyor -- uydurma değil, o anki ölçüm.
    */
    if (simdi !== null) {
      const bugun = new Date();
      const bugunIso = `${bugun.getFullYear()}-${String(bugun.getMonth() + 1).padStart(2, '0')}-${String(bugun.getDate()).padStart(2, '0')}`;
      const mevcut = satirlar.find((s) => s.day === bugunIso);
      if (mevcut) mevcut.currentC = simdi;
      else {
        satirlar.unshift({
          businessId: DEMO_ISLETME,
          day: bugunIso,
          currentC: simdi,
          summary: '',
          icon: '',
          fetchedAt: cekilme,
        });
      }
    }

    write(KEYS.weather, satirlar);

    write(KEYS.weatherHours, (govde.saatlik ?? []).map((s): WeatherHour => ({
      businessId: DEMO_ISLETME,
      hour: s.saat,
      tempC: s.sicaklik ?? undefined,
      hadise: s.hadise,
    })));

    return true;
  } catch {
    return false;
  }
}

interface KurYaniti {
  uretim?: string;
  tarih?: string | null;
  kurlar?: { code: string; buy: number; sell: number; quotedAt: string }[];
}

/**
 * Döviz kurunu çeker ve depoya yazar.
 *
 * Uydurma kur YOK: TCMB'ye ulaşılamazsa liste boş kalıyor ve şerit hiç
 * çizilmiyor. Örnek bir rakam konsaydı salon sahibi ona bakarak fiyat
 * verirdi.
 */
export async function kurlariTazele(zamanAsimi = 6_000): Promise<boolean> {
  try {
    const yanit = await fetch(DEMO_KUR_ADRESI, { signal: AbortSignal.timeout(zamanAsimi) });
    if (!yanit.ok) return false;

    const govde = (await yanit.json()) as KurYaniti;
    const gelen = govde.kurlar ?? [];
    if (gelen.length === 0) return false;

    write(KEYS.exchangeRates, gelen.map((k): ExchangeRate => ({
      code: k.code as ExchangeRate['code'],
      buy: k.buy,
      sell: k.sell,
      quotedAt: k.quotedAt,
      fetchedAt: govde.uretim ?? new Date().toISOString(),
    })));
    return true;
  } catch {
    return false;
  }
}
