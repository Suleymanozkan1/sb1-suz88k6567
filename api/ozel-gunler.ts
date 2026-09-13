/**
 * Özel günleri sağlayıcıdan çeker (zamanlanmış görev, madde 30).
 *
 * Resmî tatiller, dini bayramlar ve arife günleri artık ELLE
 * GİRİLMİYOR: yılda bir çalışan bu görev içinde bulunulan yıl ve
 * sonraki üç yıl için takvimi kuruyor.
 *
 * Üç ayrı kalem, üç ayrı güven düzeyi:
 *
 *   1. TATİL VE BAYRAM -- sağlayıcıdan olduğu gibi alınıyor. Hesap
 *      yapılmıyor; gelen tarih neyse o yazılıyor. Sağlayıcı uzak
 *      yılları "kesinleşmedi" diye işaretliyor, o bilgi de saklanıyor.
 *
 *   2. ARİFE -- bayramın bir gün öncesi. Bu bir tahmin değil, tanım:
 *      arife bayramdan önceki gündür. Bayram tarihi sağlayıcıdan
 *      geldiği için arife de onun kadar kesin.
 *
 *   3. KANDİL -- sağlayıcıda yok; hicri takvimden hesaplanıyor. Burası
 *      riskli bölge ve bu yüzden ÇAPRAZ DOĞRULAMA var: hicri takvim
 *      servisinin verdiği 1 Şevval ve 10 Zilhicce tarihleri, tatil
 *      servisinden gelen Ramazan ve Kurban Bayramı tarihleriyle
 *      TUTMUYORSA kandil hiç yazılmıyor. İki bağımsız kaynak aynı
 *      takvimi göstermiyorsa hesaplanmış bir kandil tarihi uydurma
 *      olurdu.
 *
 * OKUL TARİHLERİ ÇEKİLMİYOR: Millî Eğitim Bakanlığı yıllık çalışma
 * takvimini bir duyuruyla yayımlıyor, makine okunur bir kaynağı yok.
 * Panelden giriliyor ve ekranda sebebi yazılı.
 *
 * Sağlayıcılar ücretsiz ve anahtar istemiyor; adresleri ortam
 * değişkeniyle değiştirilebiliyor.
 */
import { callRpc, isAuthorizedCron, isDbConfigured } from './_db';
import { json } from './_guard';

/** Kaç yıl ileri kurulacak: bu yıl + 3. Rezervasyonlar bu kadar ileriye alınıyor. */
const YIL_SAYISI = 4;

const TATIL_KOKU = 'https://date.nager.at/api/v3/PublicHolidays';
const HICRI_KOKU = 'https://api.aladhan.com/v1';

/** Veritabanındaki `special_day_kind` ile aynı liste. */
type GunTuru = 'resmi_tatil' | 'dini_bayram' | 'arife' | 'kandil' | 'okul' | 'ozel';

export interface OzelGun {
  day: string;
  label: string;
  kind: GunTuru;
  tentative: boolean;
}

interface TatilSatiri {
  date?: string;
  localName?: string;
  name?: string;
}

/**
 * Sağlayıcı kesinleşmemiş tarihleri adın sonuna yazıyor:
 * "Ramazan Bayramı 1. Gün (Tentative Date)".
 *
 * Etiket temizleniyor ama bilgi KAYBEDİLMİYOR; `tentative` alanına
 * geçiyor ve ekranda ayrıca belirtiliyor.
 */
export function etiketiAyikla(ham: string): { label: string; tentative: boolean } {
  const tentative = /\(tentative[^)]*\)/i.test(ham);
  return { label: ham.replace(/\s*\([^)]*tentative[^)]*\)/i, '').trim(), tentative };
}

/** Ramazan ve Kurban bayramı dini, geri kalanı resmî tatil. */
export function gunTuru(label: string): GunTuru {
  return /ramazan bayram|kurban bayram/i.test(label) ? 'dini_bayram' : 'resmi_tatil';
}

/** yyyy-mm-dd tarihine gün ekler/çıkarır. */
export function gunKaydir(iso: string, adim: number): string {
  const t = new Date(`${iso}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + adim);
  return t.toISOString().slice(0, 10);
}

/**
 * Tatil listesini bizim satırlarımıza çevirir ve arifeleri türetir.
 *
 * Arife YALNIZCA bayramın ilk gününden üretiliyor: "Kurban Bayramı
 * 2. Gün"den de üretilseydi bayramın ortasına arife düşerdi.
 */
export function tatilleriCevir(govde: unknown): OzelGun[] {
  const liste = Array.isArray(govde) ? (govde as TatilSatiri[]) : [];
  const gunler: OzelGun[] = [];

  for (const satir of liste) {
    const gun = String(satir.date ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(gun)) continue;

    const ham = String(satir.localName ?? satir.name ?? '').trim();
    if (!ham) continue;

    const { label, tentative } = etiketiAyikla(ham);
    if (!label) continue;

    gunler.push({ day: gun, label, kind: gunTuru(label), tentative });

    /*
      Bayram arifesi. Salon için asıl önemli gün çoğu zaman budur:
      arife akşamı düğün yapılmaz, bayramın ilk günü yapılır.
    */
    const arifeAdi = /^(ramazan|kurban) bayramı 1\. gün$/i.exec(label);
    if (arifeAdi) {
      gunler.push({
        day: gunKaydir(gun, -1),
        label: `${arifeAdi[1]![0]!.toUpperCase()}${arifeAdi[1]!.slice(1).toLowerCase()} Bayramı arifesi`,
        kind: 'arife',
        tentative,
      });
    }
    if (/^cumhuriyet bayramı$/i.test(label)) {
      gunler.push({
        day: gunKaydir(gun, -1),
        label: 'Cumhuriyet Bayramı arifesi',
        kind: 'arife',
        tentative,
      });
    }
  }

  return gunler;
}

/* ------------------------------------------------------------ kandil */

/**
 * Kandil geceleri, hicri ay ve gün olarak.
 *
 * Kandil, hicri günün BAŞLADIĞI AKŞAM idrak ediliyor ve hicri gün güneş
 * batışıyla başlıyor. Yani "27 Recep gecesi", miladi takvimde 27
 * Recep'e denk gelen günün BİR ÖNCEKİ akşamıdır; tarih bir gün geriye
 * alınıyor.
 */
const KANDILLER: { ay: number; gun: number; ad: string }[] = [
  { ay: 3, gun: 12, ad: 'Mevlid Kandili' },
  { ay: 7, gun: 27, ad: 'Miraç Kandili' },
  { ay: 8, gun: 15, ad: 'Berat Kandili' },
  { ay: 9, gun: 27, ad: 'Kadir Gecesi' },
];

/** Hicri yıl ile miladi yıl arasındaki kaba fark. */
const HICRI_FARKI = 579;

interface HicriYanit {
  data?: { gregorian?: { date?: string } };
}

/** "20-03-2026" -> "2026-03-20" */
export function hicriTarihiCevir(ham: unknown): string | null {
  const metin = String((ham as HicriYanit | undefined)?.data?.gregorian?.date ?? '');
  const e = /^(\d{2})-(\d{2})-(\d{4})$/.exec(metin);
  return e ? `${e[3]}-${e[2]}-${e[1]}` : null;
}

/** İki yyyy-mm-dd arasındaki gün farkı. */
export function gunFarki(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000,
  );
}

/**
 * Kandil tarihini BAYRAMA GÖRE hesaplar.
 *
 * Neden doğrudan hicri servisin verdiği tarih kullanılmıyor: iki
 * bağımsız takvim (tatil sağlayıcısı ve hicri servis) uzak yıllarda bir
 * gün kayabiliyor -- ölçüldü, 2027-2030 arası Ramazan Bayramı'nda tam
 * olarak bu oluyor. Mutlak tarih alınsaydı kandil, bayrama göre yanlış
 * yerde dururdu: Kadir Gecesi bayramdan 4 gün önce olması gerekirken 5
 * gün önce görünürdü.
 *
 * Bunun yerine YALNIZCA FARK kullanılıyor. Fark takvimin kendi içinde
 * sabit; takvim bir gün kaysa bile iki tarih arasındaki mesafe
 * değişmiyor. Çıpa olarak sağlayıcının verdiği bayram tarihi alınıyor,
 * yani resmî olan.
 */
export function kandilTarihi(
  bayram: string, sevvalServis: string, kandilServis: string,
): string {
  const mesafe = gunFarki(sevvalServis, kandilServis);
  // Gece, hicri günün başladığı akşam: bir gün daha geriye.
  return gunKaydir(bayram, -mesafe - 1);
}

async function hicridenMiladiye(gun: number, ay: number, yil: number): Promise<string | null> {
  const kok = process.env.HICRI_API_URL ?? HICRI_KOKU;
  const adres = `${kok}/hToG/${String(gun).padStart(2, '0')}-${String(ay).padStart(2, '0')}-${yil}`;
  try {
    const yanit = await fetch(adres, { signal: AbortSignal.timeout(15_000) });
    if (!yanit.ok) return null;
    return hicriTarihiCevir(await yanit.json());
  } catch {
    return null;
  }
}

/**
 * Bir hicri yılın kandilleri.
 *
 * `bayram` o hicri yılın Ramazan Bayramı 1. günü (1 Şevval) -- tatil
 * sağlayıcısından gelen, resmî tarih. ÇIPA YOKSA HİÇBİR ŞEY
 * HESAPLANMIYOR: çıpasız bir hesap, doğrulanmamış bir tarih demek.
 */
async function kandilleriHesapla(hicriYil: number, bayram: string | null): Promise<OzelGun[]> {
  if (!bayram) return [];

  const sevval = await hicridenMiladiye(1, 10, hicriYil);
  if (!sevval) return [];

  const gunler: OzelGun[] = [];
  for (const k of KANDILLER) {
    const servis = await hicridenMiladiye(k.gun, k.ay, hicriYil);
    if (!servis) continue;

    const mesafe = gunFarki(sevval, servis);
    /*
      Akıl sağlığı denetimi: kandiller Ramazan Bayramı'ndan önceki bir
      yıl içinde. Servis beklenmedik bir şey döndürürse (yanlış yıl,
      bozuk tarih) satır yazılmıyor.
    */
    if (mesafe < 0 || mesafe > 400) continue;

    gunler.push({
      day: kandilTarihi(bayram, sevval, servis),
      label: k.ad,
      kind: 'kandil',
      /*
        Kandiller HESAPLANIYOR, ilan edilmiş bir listeden gelmiyor.
        Çıpa resmî olsa da işaret duruyor: salon sahibi Diyanet
        takvimiyle karşılaştırabilsin.
      */
      tentative: true,
    });
  }
  return gunler;
}

/* ----------------------------------------------------------- işleyici */

async function tatilleriCek(yil: number): Promise<OzelGun[]> {
  const kok = process.env.TATIL_API_URL ?? TATIL_KOKU;
  const yanit = await fetch(`${kok}/${yil}/TR`, { signal: AbortSignal.timeout(15_000) });
  if (!yanit.ok) throw new Error(`Sağlayıcı ${yanit.status} döndü.`);
  return tatilleriCevir(await yanit.json());
}

/** Listedeki Ramazan Bayramı 1. günü; kandil hesabının çıpası. */
export function ramazanCipasi(gunler: OzelGun[]): string | null {
  return gunler.find((g) => /^ramazan bayramı 1\. gün$/i.test(g.label))?.day ?? null;
}

export default async function handler(request: Request): Promise<Response> {
  if (!isAuthorizedCron(request)) return json({ error: 'Yetkisiz.' }, 401);
  if (!isDbConfigured()) return json({ error: 'Veritabanı yapılandırması eksik.' }, 500);

  const buYil = new Date().getUTCFullYear();
  const yillar = Array.from({ length: YIL_SAYISI }, (_, i) => buYil + i);

  /*
    ÖNCE bütün yılların tatilleri çekiliyor, sonra kandiller. Sebep:
    bir hicri yılın kandilleri iki ayrı miladi yıla dağılabiliyor
    (Mevlid hicri yılın başında, Kadir sonunda). Yıl yıl ilerlenseydi
    yıl sınırına düşen kandil hiçbir yıla yazılmazdı.
  */
  const tatiller = new Map<number, OzelGun[]>();
  const hatalar = new Map<number, string>();

  for (const yil of yillar) {
    try {
      tatiller.set(yil, await tatilleriCek(yil));
    } catch (error) {
      // Bir yıl çekilemezse diğerleri yine kuruluyor.
      hatalar.set(yil, String(error));
    }
  }

  /*
    Kandiller hicri yıl başına hesaplanıp miladi yıla dağıtılıyor. Bir
    önceki hicri yıl da hesaplanıyor: o yılın Mevlid'i bu miladi yıla
    düşebiliyor.
  */
  const kandiller = new Map<number, OzelGun[]>();
  const hicriYillar = new Set<number>();
  for (const yil of tatiller.keys()) {
    hicriYillar.add(yil - HICRI_FARKI);
    hicriYillar.add(yil - HICRI_FARKI + 1);
  }

  for (const hicriYil of hicriYillar) {
    // Çıpa, o hicri yılın Ramazan Bayramı'nın düştüğü miladi yıldan.
    const cipaYili = hicriYil + HICRI_FARKI;
    const cipa = ramazanCipasi(tatiller.get(cipaYili) ?? []);
    const hesaplanan = await kandilleriHesapla(hicriYil, cipa);

    for (const kandil of hesaplanan) {
      const yil = Number(kandil.day.slice(0, 4));
      if (!tatiller.has(yil)) continue; // yazmadığımız bir yıla düştü
      kandiller.set(yil, [...(kandiller.get(yil) ?? []), kandil]);
    }
  }

  const sonuc: { year: number; written: number; kandil: number; detail: string }[] = [];

  for (const yil of yillar) {
    const hata = hatalar.get(yil);
    if (hata) {
      sonuc.push({ year: yil, written: 0, kandil: 0, detail: hata });
      continue;
    }

    const gunler = tatiller.get(yil) ?? [];
    const yilinKandilleri = kandiller.get(yil) ?? [];
    const tumu = [...gunler, ...yilinKandilleri];

    try {
      const yazilan = await callRpc<number>('ozel_gunleri_yaz', {
        p_yil: yil, p_gunler: tumu,
      });
      sonuc.push({
        year: yil,
        written: typeof yazilan === 'number' ? yazilan : tumu.length,
        kandil: yilinKandilleri.length,
        detail: yilinKandilleri.length === 0 ? 'Kandil hesaplanamadı; yalnızca tatiller yazıldı.' : '',
      });
    } catch (error) {
      sonuc.push({ year: yil, written: 0, kandil: 0, detail: String(error) });
    }
  }

  return json({ years: sonuc.length, results: sonuc });
}
