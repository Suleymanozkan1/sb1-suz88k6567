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
import type { SpecialDay, WeatherForecast } from '../../types';
import { hadiseAdi } from '../mgm';
import { KEYS, read, write } from '../storage';

interface Yanit {
  uretim?: string;
  gunler?: { day: string; label: string; kind: string; tentative?: boolean }[];
  hava?: { gun: string; enDusuk: number | null; enYuksek: number | null; hadise?: string }[];
}

export const DEMO_GUN_ADRESI = '/api/demo-gunler';

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

    /*
      HAVA TAHMİNİ. Uç nokta MGM'den çekilmiş gerçek tahmini de
      döndürüyordu ama burada okunmuyordu; tanıtımda hava durumu satırı
      bu yüzden hiç görünmedi. Uydurulmuş değer yazılmıyor: MGM
      ulaşılamazsa liste boş kalıyor ve ekran tahmini hiç çizmiyor.
    */
    const hava = govde.hava ?? [];
    write(KEYS.weather, hava.map((h): WeatherForecast => ({
      businessId: DEMO_ISLETME,
      day: h.gun,
      minC: h.enDusuk ?? undefined,
      maxC: h.enYuksek ?? undefined,
      summary: hadiseAdi(h.hadise ?? ''),
      icon: h.hadise ?? '',
      hadise: h.hadise,
      fetchedAt: govde.uretim ?? new Date().toISOString(),
    })));

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
