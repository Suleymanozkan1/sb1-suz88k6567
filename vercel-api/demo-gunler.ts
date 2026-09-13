/**
 * Demo takvimini besleyen uç nokta (Vercel fonksiyonu).
 *
 * NEDEN SUNUCUDAN. Demo modu tarayıcıda çalışıyor ve bu kaynaklara
 * doğrudan çıkamıyor:
 *   - İçerik güvenlik politikası `connect-src 'self'` (sunucu/basliklar.ts).
 *     Dış köken eklemek, XSS bulan birine veriyi dışarı taşıyacak kapıyı
 *     açardı; tanıtım verisi için ödenecek bir bedel değil.
 *   - meb.gov.tr CORS başlığı GÖNDERMİYOR. Politika gevşetilse bile
 *     tarayıcı o isteği engellerdi; bu bizim değil, kaynağın kararı.
 *
 * Aynı kökenden (`/api/demo-gunler`) sunulunca iki engel de kalkıyor.
 *
 * CANLIDAKİ GÖREVLERLE AYNI KOD. Tatil ve kandil hesabı
 * `api/ozel-gunler.ts`, okul takvimi `api/meb-takvim.ts` içinden
 * çağrılıyor; burada ikinci bir ayrıştırıcı yok. Kaynak biçimi
 * değiştiğinde tek bir yer düzeltiliyor.
 *
 * ÖNBELLEK. Yanıt kenar önbelleğinde otuz gün duruyor: bu veri ayda bir
 * değişiyor ve her ziyaretçi için MEB arşivini yeniden ayrıştırmak hem
 * yavaş hem gereksiz. `vercel.json` içindeki cron ayda bir bu adresi
 * çağırıp önbelleği tazeliyor.
 */
import {
  HICRI_FARKI, kandilleriHesapla, ramazanCipasi, tatilleriCek, type OzelGun,
} from '../api/ozel-gunler';
import { arsiviCek, duyuruyuCoz, takvimDuyurulari } from '../api/meb-takvim';
import { gunlukCoz, merkezSec, merkezleriCoz, mgmCek } from '../api/_mgm';

/** Geçen yıl + bu yıl + 3: demo verisi bugünün iki yanına yayılıyor. */
const GERI_YIL = 1;
const YIL_SAYISI = 5;

export interface DemoGun {
  day: string;
  label: string;
  kind: string;
  tentative?: boolean;
}

export interface DemoHava {
  gun: string;
  enDusuk: number | null;
  enYuksek: number | null;
  hadise?: string;
}

/** Demo işletmesinin konumu; tohumdaki salonla aynı il. */
const DEMO_IL = 'Konya';
const DEMO_ILCE = 'Selçuklu';

/**
 * Hava tahmini (MGM).
 *
 * Tohuma gömülmüyor: sıcaklık bir hafta sonra yanlış olur ve
 * eskimiş bir tahmin, boş bir kutudan daha kötüdür. Yalnızca canlı
 * kaynaktan geliyor; MGM ulaşılamazsa ekran "veri yok" diyor.
 */
async function havaTahmini(): Promise<DemoHava[]> {
  const merkezler = merkezleriCoz(
    await mgmCek(`/merkezler?il=${encodeURIComponent(DEMO_IL)}&ilce=${encodeURIComponent(DEMO_ILCE)}`),
  );
  const merkez = merkezSec(merkezler, DEMO_ILCE);
  if (!merkez) return [];

  const tahminler = gunlukCoz(await mgmCek(`/tahminler/gunluk?istno=${merkez.gunlukNo}`));
  return tahminler.map((t) => ({
    gun: t.gun,
    enDusuk: t.enDusuk,
    enYuksek: t.enYuksek,
    hadise: t.hadise,
  }));
}

async function ozelGunler(yillar: number[]): Promise<DemoGun[]> {
  const tatiller = new Map<number, OzelGun[]>();
  for (const yil of yillar) {
    try {
      tatiller.set(yil, await tatilleriCek(yil));
    } catch {
      // Bir yıl çekilemezse diğerleri yine dönüyor.
    }
  }

  const hicriYillar = new Set<number>();
  for (const yil of tatiller.keys()) {
    hicriYillar.add(yil - HICRI_FARKI);
    hicriYillar.add(yil - HICRI_FARKI + 1);
  }

  const kandiller: OzelGun[] = [];
  for (const hicriYil of hicriYillar) {
    const cipa = ramazanCipasi(tatiller.get(hicriYil + HICRI_FARKI) ?? []);
    // Çapraz doğrulama tutmazsa boş dönüyor; uydurma kandil yazılmıyor.
    kandiller.push(...await kandilleriHesapla(hicriYil, cipa).catch(() => []));
  }

  return [...[...tatiller.values()].flat(), ...kandiller]
    .filter((g) => yillar.includes(Number(g.day.slice(0, 4))))
    .map((g) => ({ day: g.day, label: g.label, kind: g.kind, tentative: g.tentative }));
}

async function okulGunleri(): Promise<DemoGun[]> {
  const duyurular = takvimDuyurulari(await arsiviCek());
  const gunler: DemoGun[] = [];
  // En yeni iki eğitim yılı: demo takvimi bugünün etrafını gösteriyor.
  for (const duyuru of duyurular.slice(0, 2)) {
    const cozulen = await duyuruyuCoz(duyuru.link);
    gunler.push(...cozulen.map((g) => ({ day: g.gun, label: g.etiket, kind: 'okul' })));
  }
  return gunler;
}

export default async function handler(): Promise<Response> {
  const buYil = new Date().getUTCFullYear();
  const yillar = Array.from({ length: YIL_SAYISI }, (_, i) => buYil - GERI_YIL + i);

  /*
    Üç kaynak birbirinden bağımsız: MEB düşerse bayramlar yine dönüyor,
    MGM düşerse takvim yine doluyor. Biri boş gelse bile ekran tümüyle
    boşalmıyor.
  */
  const [gunler, okul, hava] = await Promise.all([
    ozelGunler(yillar).catch(() => [] as DemoGun[]),
    okulGunleri().catch(() => [] as DemoGun[]),
    havaTahmini().catch(() => [] as DemoHava[]),
  ]);

  const tumu = [...gunler, ...okul].sort((a, b) => a.day.localeCompare(b.day));

  return new Response(JSON.stringify({
    uretim: new Date().toISOString(), gunler: tumu, hava,
  }), {
    status: tumu.length === 0 ? 503 : 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // 30 gün kenarda, bayatsa 1 gün daha servis edilip arkada tazeleniyor.
      'cache-control': 'public, s-maxage=2592000, stale-while-revalidate=86400',
    },
  });
}
