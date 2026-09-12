/**
 * Aylık kullanıcı raporu (zamanlanmış görev, madde 24).
 *
 * Ayın ilk günü çalışır ve BİTEN ayın özetini çıkarır: 1 Eylül'de
 * 1-31 Ağustos raporu. Rapor, aylık raporu açık olan kullanıcısı bulunan
 * her işletme için üretilir.
 *
 * Üretim ile gönderim AYRI: rapor önce kayda yazılıyor, sonra
 * gönderilmeye çalışılıyor. Sıra tersine olsaydı gönderim hatası raporun
 * kendisini de kaybettirirdi -- yönetici "gitmedi" diyemez, "hiç
 * üretilmedi" derdi.
 *
 * E-POSTA SAĞLAYICISI TANIMLI DEĞİLSE rapor üretilmeye devam ediyor ve
 * kaydı "beklemede" kalıyor; panelden okunabiliyor. Sessizce atlansaydı
 * ay sonu verisi hiç oluşmazdı.
 */
import { callRpc, isAuthorizedCron, isDbConfigured, insertRow, selectRows } from './_db';
import { json } from './_guard';
/*
  Gönderim ortak modülde: anket e-postası (madde 31) da aynı kapıdan
  çıkıyor. İki kopya olsaydı biri düzeltilip diğeri unutulurdu.
*/
import { epostaGonder } from './_eposta';

interface IsletmeSatiri {
  id: string;
  name: string;
  report_email: string;
}

interface Ozet {
  rezervasyon: number;
  davetli: number;
  ciro: number;
  tahsilat: number;
  kalan: number;
  gider: number;
  aday: number;
  donusen: number;
}

/** Biten ay: çalıştığı günün bir önceki ayı. */
export function oncekiAy(bugun: Date): string {
  const y = bugun.getUTCFullYear();
  const m = bugun.getUTCMonth(); // 0-11; bir önceki ay m-1
  const tarih = new Date(Date.UTC(y, m - 1, 1));
  return `${tarih.getUTCFullYear()}-${String(tarih.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Rapor metni. Tutarlar noktasız/virgüllü Türkçe yazımla. */
export function raporMetni(isletme: string, donem: string, o: Ozet): string {
  const para = (n: number) => new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n);

  return [
    `${isletme} - ${donem} ayı özeti`,
    '',
    `Organizasyon sayısı : ${o.rezervasyon}`,
    `Davetli sayısı      : ${o.davetli}`,
    `Ciro                : ${para(o.ciro)} TL`,
    `Tahsil edilen       : ${para(o.tahsilat)} TL`,
    `Kalan alacak        : ${para(o.kalan)} TL`,
    `Düğün içi gider     : ${para(o.gider)} TL`,
    `Görüşülen müşteri   : ${o.aday}`,
    `Rezervasyona dönen  : ${o.donusen}`,
  ].join('\n');
}

export default async function handler(request: Request): Promise<Response> {
  // Cron dışı çağrılara kapalı: rapor yetkisiz üretilip gönderilmemeli.
  if (!isAuthorizedCron(request)) return json({ error: 'Yetkisiz.' }, 401);
  if (!isDbConfigured()) return json({ error: 'Veritabanı yapılandırması eksik.' }, 500);

  const donem = oncekiAy(new Date());

  /*
    Yalnızca aylık raporu AÇIK bir kullanıcısı olan işletmeler. Hepsine
    gönderilseydi, hiç istememiş bir salonun yöneticisine her ay posta
    giderdi.
  */
  let acikSahipler: { owner_id: string }[];
  try {
    acikSahipler = await selectRows<{ owner_id: string }>(
      'profiles?select=owner_id&monthly_report=is.true',
    );
  } catch (error) {
    return json({ error: 'Kullanıcı ayarları okunamadı.', detail: String(error) }, 502);
  }

  const ownerIds = [...new Set(acikSahipler.map((p) => p.owner_id))].filter(Boolean);
  if (ownerIds.length === 0) return json({ period: donem, count: 0, results: [] });

  let isletmeler: IsletmeSatiri[];
  try {
    isletmeler = await selectRows<IsletmeSatiri>(
      `businesses?select=id,name,report_email&owner_id=in.(${ownerIds.join(',')})&order=name`,
    );
  } catch (error) {
    return json({ error: 'İşletmeler okunamadı.', detail: String(error) }, 502);
  }

  const sonuc: { business: string; period: string; status: string; detail: string }[] = [];

  for (const isletme of isletmeler) {
    let ozet: Ozet;
    try {
      const rows = await callRpc<Ozet[]>('aylik_ozet', {
        p_business: isletme.id, p_period: donem,
      });
      ozet = Array.isArray(rows) ? rows[0] : (rows as unknown as Ozet);
    } catch (error) {
      sonuc.push({ business: isletme.id, period: donem, status: 'hata', detail: String(error) });
      continue;
    }
    if (!ozet) continue;

    const metin = raporMetni(isletme.name, donem, ozet);
    const alici = isletme.report_email.trim();
    const gonderim = alici
      ? await epostaGonder(alici, `${isletme.name} - ${donem} ayı raporu`, metin)
      : { sent: false, detail: 'Rapor e-posta adresi tanımlı değil.' };

    try {
      /*
        Aynı ayın raporu bir kez yazılır; tekillik kısıtı ikinci çağrıyı
        reddediyor ve görev günde birkaç kez çalışsa da rapor
        tekrarlanmıyor.
      */
      await insertRow('monthly_report_log', {
        business_id: isletme.id,
        period: donem,
        recipient: alici,
        status: gonderim.sent ? 'gonderildi' : 'beklemede',
        detail: gonderim.detail,
        payload: { ...ozet, metin },
      });
      sonuc.push({
        business: isletme.id, period: donem,
        status: gonderim.sent ? 'gonderildi' : 'beklemede', detail: gonderim.detail,
      });
    } catch (error) {
      // Kısıt hatası "zaten üretilmiş" demek; hata değil.
      sonuc.push({ business: isletme.id, period: donem, status: 'atlandi', detail: String(error) });
    }
  }

  return json({ period: donem, count: sonuc.length, results: sonuc });
}
