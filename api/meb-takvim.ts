/**
 * MEB okul takvimi (zamanlanmış görev).
 *
 * Okul tatilleri salon için gerçek bir talep göstergesi: yarıyıl
 * tatilinde aileler seyahat eder, ara tatilde sünnet ve nişan yoğunlaşır.
 * Şimdiye kadar bu tarihler PANELDEN ELLE giriliyordu.
 *
 * MEB takvimi makine okunur biçimde yayımlamıyor; her yıl haziranda bir
 * haber metni çıkıyor. Haber KİMLİKLE çözülüyor, adresteki başlıkla
 * değil (yanlış başlık + doğru kimlik aynı sayfayı açıyor), bu yüzden
 * yıldan adres üretmek mümkün değil.
 *
 * ÇÖZÜM: MEB'in haber arşivi tek bir istekle tamamen alınabiliyor
 * (~2500 kayıt). Arşivde başlığı "egitim-ogretim-yili-takvimi" geçen
 * duyurular bulunuyor, en yenisi çözülüyor. Böylece hiçbir kimlik veya
 * adres koda gömülmüyor ve her yıl kendiliğinden çalışıyor.
 */
import { callRpc, isAuthorizedCron, isDbConfigured } from './_db.js';
import { json } from './_guard.js';
import { metneCevir, takvimiCoz, type OkulGunu } from './_meb.js';

export const MEB_KOKU = process.env.MEB_URL ?? 'https://www.meb.gov.tr';

/** Arşivde takvim duyurusunu tanıyan desen. */
const TAKVIM_DESENI = /egitim-ogretim-yili-takvimi/i;

interface ArsivSatiri {
  BASLIK?: string;
  LINK?: string;
  ISLEMSAAT?: string;
}

/**
 * MEB haber arşivini çeker.
 *
 * Arşiv DataTables uç noktası; arama parametresi sunucuda hata verdiği
 * için ARAMA YAPILMIYOR, liste tamamen alınıp burada süzülüyor. Tek
 * istek, yaklaşık yarım megabayt; yılda birkaç kez çalışan bir görev
 * için sorun değil.
 */
export async function arsiviCek(
  getir: typeof fetch = fetch,
): Promise<ArsivSatiri[]> {
  const govde = new URLSearchParams();
  govde.set('draw', '1');
  govde.set('start', '0');
  govde.set('length', '5000');
  govde.set('search[value]', '');
  govde.set('search[regex]', 'false');
  govde.set('order[0][column]', '0');
  govde.set('order[0][dir]', 'desc');
  // İki sütunlu tablo; sütun tanımları eksik olursa uç nokta 500 dönüyor.
  for (const i of [0, 1]) {
    govde.set(`columns[${i}][data]`, String(i));
    govde.set(`columns[${i}][searchable]`, 'true');
    govde.set(`columns[${i}][orderable]`, 'true');
    govde.set(`columns[${i}][search][value]`, '');
    govde.set(`columns[${i}][search][regex]`, 'false');
  }
  govde.set('kategori', '');
  govde.set('dil', 'tr');

  const yanit = await getir(`${MEB_KOKU}/meb_haberindex_ajax.php`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'x-requested-with': 'XMLHttpRequest',
      referer: `${MEB_KOKU}/meb_haberindex.php?dil=tr`,
    },
    body: govde.toString(),
    signal: AbortSignal.timeout(30_000),
  });
  if (!yanit.ok) throw new Error(`MEB arşivi ${yanit.status} döndü`);
  const veri = (await yanit.json()) as { data?: unknown };
  return Array.isArray(veri.data) ? (veri.data as ArsivSatiri[]) : [];
}

/**
 * Arşivden takvim duyurularını seçer, en yenisi başta.
 *
 * Arşivin kendi sıralamasına güvenilmiyor: tarih alanı metin olarak
 * sıralanıyor ve "30/06/2026", "16/09/2026"dan büyük çıkıyor. Sıralama
 * burada, duyurudaki EĞİTİM YILINA göre yapılıyor.
 */
export function takvimDuyurulari(satirlar: ArsivSatiri[]): { link: string; yil: number }[] {
  const sonuc: { link: string; yil: number }[] = [];
  for (const s of satirlar) {
    const link = (s.LINK ?? '').trim();
    if (!link || !TAKVIM_DESENI.test(link)) continue;
    const yil = Number(/(20\d{2})-20\d{2}/.exec(link)?.[1] ?? 0);
    sonuc.push({ link, yil });
  }
  return sonuc.sort((a, b) => b.yil - a.yil);
}

/** Duyuru sayfasını çekip takvim günlerini çözer. */
export async function duyuruyuCoz(
  link: string,
  getir: typeof fetch = fetch,
): Promise<OkulGunu[]> {
  const adres = link.startsWith('http') ? link : `${MEB_KOKU}${link}`;
  const yanit = await getir(adres, { signal: AbortSignal.timeout(30_000) });
  if (!yanit.ok) throw new Error(`MEB duyurusu ${yanit.status} döndü`);
  return takvimiCoz(metneCevir(await yanit.text()));
}

export default async function handler(request: Request): Promise<Response> {
  if (!isAuthorizedCron(request)) return json({ error: 'Yetkisiz.' }, 401);

  /*
    Tanı kipi: MEB'in cümle kalıbı her yıl değişiyor. Yeni duyuru
    çözülemezse sebebin çözümleyicide mi yoksa sayfada mı olduğu tek
    istekle görülebilmeli.
  */
  const url = new URL(request.url);
  const tani = url.searchParams.get('tani') === '1';

  let duyurular: { link: string; yil: number }[];
  try {
    duyurular = takvimDuyurulari(await arsiviCek());
  } catch (error) {
    return json({ error: 'MEB arşivi okunamadı.', detail: String(error) }, 502);
  }
  if (duyurular.length === 0) {
    return json({ error: 'Arşivde takvim duyurusu bulunamadı.' }, 502);
  }

  /*
    SON İKİ eğitim yılı işleniyor. Yalnızca en yenisi alınsaydı, haziran
    öncesinde (yeni takvim henüz yayımlanmamışken) içinde bulunulan yılın
    tatilleri de yazılmazdı.
  */
  const hedefler = duyurular.slice(0, 2);
  const sonuc: { link: string; days: number; detail: string }[] = [];
  const tumGunler: OkulGunu[] = [];

  for (const duyuru of hedefler) {
    try {
      const gunler = await duyuruyuCoz(duyuru.link);
      if (gunler.length === 0) {
        sonuc.push({ link: duyuru.link, days: 0, detail: 'Duyuru çözülemedi (cümle kalıbı değişmiş olabilir).' });
        continue;
      }
      tumGunler.push(...gunler);
      sonuc.push({ link: duyuru.link, days: gunler.length, detail: '' });
    } catch (error) {
      sonuc.push({ link: duyuru.link, days: 0, detail: String(error) });
    }
  }

  if (tani) return json({ duyurular: hedefler, gunler: tumGunler, results: sonuc });

  if (!isDbConfigured()) return json({ error: 'Veritabanı yapılandırması eksik.' }, 500);

  /*
    HİÇBİR GÜN ÇÖZÜLEMEDİYSE YAZILMIYOR. Boş liste gönderilseydi
    `okul_gunlerini_yaz` o yılın kayıtlarını silip yerine hiçbir şey
    koymazdı; MEB'in bir sayfa değişikliği takvimi boşaltırdı.
  */
  if (tumGunler.length === 0) {
    return json({ error: 'Hiçbir duyuru çözülemedi; yazma yapılmadı.', results: sonuc }, 502);
  }

  try {
    const yazilan = await callRpc<number>('okul_gunlerini_yaz', {
      p_gunler: tumGunler.map((g) => ({ day: g.gun, label: g.etiket })),
    });
    return json({ announcements: hedefler.length, written: yazilan, results: sonuc });
  } catch (error) {
    return json({ error: 'Okul günleri yazılamadı.', detail: String(error) }, 502);
  }
}
