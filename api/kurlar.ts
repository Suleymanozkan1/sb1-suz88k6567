/**
 * Döviz ve altın kurları (zamanlanmış görev, madde 28).
 *
 * Kur SUNUCUDA çekilip `exchange_rates` tablosuna yazılıyor; panel o
 * tablodan okuyor. Tarayıcıdan çekilseydi sağlayıcının API anahtarı
 * istemciye inerdi (şartname: "API anahtarlarını frontend'e koyma") ve
 * her açılan sekme sağlayıcıya ayrı istek atardı.
 *
 * İKİ SAĞLAYICI destekleniyor:
 *   tcmb       Merkez Bankası'nın günlük kur dosyası. Ücretsiz, anahtar
 *              istemiyor, resmî. Yalnızca DÖVİZ veriyor; altın yok.
 *   collectapi Anahtar gerektiren ticari servis. Döviz ve altını birlikte
 *              veriyor.
 *
 * Varsayılan `tcmb`: kurulum hiçbir hesap açmadan çalışsın. Altın da
 * isteniyorsa `KUR_SAGLAYICI=collectapi` ve `KUR_API_KEY` tanımlanır.
 * Sağlayıcı altın vermiyorsa o satırlar YAZILMIYOR ve ekranda
 * görünmüyor; uydurma bir altın fiyatı yazmak, o rakama bakıp fiyat
 * belirleyen salon sahibini yanıltırdı.
 */
import { isAuthorizedCron, isDbConfigured, upsertRows } from './_db';
import { json } from './_guard';

/** Veritabanındaki `exchange_rates.code` kısıtıyla aynı liste. */
export type KurKodu = 'USD' | 'EUR' | 'GRAM_ALTIN' | 'CEYREK_ALTIN';

export interface KurSatiri {
  code: KurKodu;
  buy: number;
  sell: number;
  quotedAt: string;
}

const TCMB_ADRESI = 'https://www.tcmb.gov.tr/kurlar/today.xml';

/**
 * Sağlayıcıdan gelen sayıyı çözer.
 *
 * Ondalık ayırıcı sağlayıcıya göre değişiyor. Kural:
 *   - VİRGÜL varsa Türkçe yazım kabul ediliyor; nokta binlik ayırıcıdır
 *     ("3.150,45" -> 3150.45). Nokta silinmeseydi altın gramı NaN olur
 *     ve satır sessizce düşerdi.
 *   - Virgül yoksa nokta ondalık ayırıcıdır ("41.2345").
 *
 * Sıfır ve negatif değer REDDEDİLİYOR: bir kur sıfır olamaz, o değer
 * sağlayıcının veriyi bulamadığı anlamına gelir.
 */
function sayi(ham: string | number | undefined | null): number | null {
  if (ham === undefined || ham === null) return null;

  let metin = String(ham).trim().replace(/\s/g, '');
  if (!metin) return null;
  if (metin.includes(',')) metin = metin.replace(/\./g, '').replace(',', '.');

  const deger = Number(metin);
  return Number.isFinite(deger) && deger > 0 ? deger : null;
}

/**
 * TCMB'nin `Tarih="12.09.2026"` biçimi.
 *
 * Dosya günde bir yayımlanıyor ve SAAT içermiyor; günün başlangıcı
 * yazılıyor. Çekildiği an uydurulup saat olarak konsaydı "az önce
 * güncellendi" gibi yanlış bir tazelik izlenimi verirdi -- `fetched_at`
 * zaten o bilgiyi ayrı tutuyor.
 */
export function tcmbTarihi(xml: string): string | null {
  const eslesme = /Tarih="(\d{2})\.(\d{2})\.(\d{4})"/.exec(xml);
  if (!eslesme) return null;
  const [, gun, ay, yil] = eslesme;
  return `${yil}-${ay}-${gun}T00:00:00Z`;
}

/**
 * TCMB günlük kur dosyasını çözer.
 *
 * `ForexBuying`/`ForexSelling` alınıyor; efektif (nakit) kur değil.
 * Ekranda gösterilen "döviz kuru" bankaların da baz aldığı bu değer.
 *
 * Boş gelen alan ATLANIYOR: hafta sonu ve resmî tatillerde bazı
 * satırlar boş yayımlanıyor ve boş bir alan 0 olarak yazılsaydı ekranda
 * "Dolar: 0,00" görünürdü.
 */
export function tcmbCevir(xml: string): KurSatiri[] {
  const tarih = tcmbTarihi(xml);
  if (!tarih) return [];

  const satirlar: KurSatiri[] = [];
  const kalip = /<Currency[^>]*CurrencyCode="(USD|EUR)"[^>]*>([\s\S]*?)<\/Currency>/g;

  let eslesme = kalip.exec(xml);
  while (eslesme) {
    const [, kod, govde] = eslesme;
    const alis = sayi(/<ForexBuying>([^<]*)<\/ForexBuying>/.exec(govde ?? '')?.[1]);
    const satis = sayi(/<ForexSelling>([^<]*)<\/ForexSelling>/.exec(govde ?? '')?.[1]);
    if (alis !== null && satis !== null) {
      satirlar.push({ code: kod as KurKodu, buy: alis, sell: satis, quotedAt: tarih });
    }
    eslesme = kalip.exec(xml);
  }
  return satirlar;
}

/** CollectAPI yanıtlarındaki tek satır; alan adları servise göre değişiyor. */
interface CollectSatiri {
  code?: string;
  name?: string;
  buying?: string | number;
  buyingstr?: string;
  selling?: string | number;
  sellingstr?: string;
}

/**
 * CollectAPI'nin altın adlarını bizim kodlarımıza çevirir.
 *
 * Eşleşmeyen kalem (yarım, tam, cumhuriyet...) yok sayılıyor: tabloda
 * yeri yok ve tanımadığımız bir kodu yazmak kısıta takılırdı.
 */
export function altinKodu(ad: string): KurKodu | null {
  const sade = ad.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
  if (sade.startsWith('gram altın') || sade === 'gram altin') return 'GRAM_ALTIN';
  if (sade.startsWith('çeyrek altın') || sade.startsWith('ceyrek altin')) return 'CEYREK_ALTIN';
  return null;
}

/**
 * CollectAPI yanıtını çözer.
 *
 * `quotedAt` sağlayıcıdan gelmiyor; çağıran tarafın verdiği an
 * kullanılıyor. Bu değer "biz ne zaman aldık" demek ve `fetched_at` ile
 * aynı olması bilinçli -- sağlayıcı kendi anını bildirmediği sürece
 * daha kesin bir şey iddia edilemez.
 */
export function collectApiCevir(
  govde: unknown, an: string, altinMi: boolean,
): KurSatiri[] {
  const kok = govde as { result?: unknown };
  const liste = Array.isArray(kok?.result) ? (kok.result as CollectSatiri[]) : [];

  const satirlar: KurSatiri[] = [];
  for (const satir of liste) {
    const kod = altinMi
      ? altinKodu(String(satir.name ?? ''))
      : ((String(satir.code ?? '').toUpperCase() === 'USD' && 'USD')
        || (String(satir.code ?? '').toUpperCase() === 'EUR' && 'EUR')
        || null);
    if (!kod) continue;

    const alis = sayi(satir.buying ?? satir.buyingstr);
    const satis = sayi(satir.selling ?? satir.sellingstr);
    if (alis === null || satis === null) continue;

    satirlar.push({ code: kod as KurKodu, buy: alis, sell: satis, quotedAt: an });
  }
  return satirlar;
}

async function tcmbCek(): Promise<KurSatiri[]> {
  const yanit = await fetch(process.env.KUR_API_URL ?? TCMB_ADRESI, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!yanit.ok) throw new Error(`TCMB ${yanit.status} döndü.`);
  return tcmbCevir(await yanit.text());
}

async function collectApiCek(anahtar: string): Promise<KurSatiri[]> {
  const kok = process.env.KUR_API_URL ?? 'https://api.collectapi.com/economy';
  const basliklar = { authorization: `apikey ${anahtar}`, 'content-type': 'application/json' };
  const an = new Date().toISOString();

  /*
    Döviz ve altın AYRI uç noktalar. Biri hata verirse diğeri yine de
    yazılıyor: altın servisi cevap vermediğinde dolar kurunu da
    kaybetmek gereksiz.
  */
  const [doviz, altin] = await Promise.allSettled([
    fetch(`${kok}/allCurrency`, { headers: basliklar, signal: AbortSignal.timeout(15_000) }),
    fetch(`${kok}/goldPrice`, { headers: basliklar, signal: AbortSignal.timeout(15_000) }),
  ]);

  const satirlar: KurSatiri[] = [];
  if (doviz.status === 'fulfilled' && doviz.value.ok) {
    satirlar.push(...collectApiCevir(await doviz.value.json(), an, false));
  }
  if (altin.status === 'fulfilled' && altin.value.ok) {
    satirlar.push(...collectApiCevir(await altin.value.json(), an, true));
  }
  return satirlar;
}

export default async function handler(request: Request): Promise<Response> {
  // Cron dışı çağrılara kapalı: sağlayıcı kotası herkese açık bir uç
  // noktadan tüketilebilmemeli.
  if (!isAuthorizedCron(request)) return json({ error: 'Yetkisiz.' }, 401);
  if (!isDbConfigured()) return json({ error: 'Veritabanı yapılandırması eksik.' }, 500);

  const saglayici = (process.env.KUR_SAGLAYICI ?? 'tcmb').toLowerCase();
  const anahtar = process.env.KUR_API_KEY;

  if (saglayici === 'collectapi' && !anahtar) {
    return json({ error: 'KUR_API_KEY tanımlı değil.' }, 500);
  }

  let satirlar: KurSatiri[];
  try {
    satirlar = saglayici === 'collectapi'
      ? await collectApiCek(anahtar as string)
      : await tcmbCek();
  } catch (error) {
    return json({ error: 'Kurlar çekilemedi.', detail: String(error) }, 502);
  }

  /*
    Hiç satır gelmediyse ESKİSİ DURUYOR. Tablo temizlenseydi sağlayıcının
    bir dakikalık kesintisi ekrandaki kuru silerdi; eski kur, hiç kur
    olmamasından daha kullanışlı ve `quoted_at` zaten ne kadar eski
    olduğunu söylüyor.
  */
  if (satirlar.length === 0) {
    return json({ provider: saglayici, written: 0, detail: 'Sağlayıcıdan kur gelmedi.' });
  }

  try {
    await upsertRows('exchange_rates', satirlar, 'code');
  } catch (error) {
    return json({ error: 'Kurlar yazılamadı.', detail: String(error) }, 502);
  }

  return json({
    provider: saglayici,
    written: satirlar.length,
    codes: satirlar.map((s) => s.code),
  });
}
