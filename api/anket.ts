/**
 * Deneyim anketi gönderimi (zamanlanmış görev, madde 31).
 *
 * Organizasyondan BİR HAFTA sonra çifte e-posta gidiyor. Ertesi gün
 * sorulsaydı çift henüz balayında olurdu; bir ay sonra sorulsaydı
 * ayrıntı hatırlanmazdı.
 *
 * Anket kaydı ile gönderim AYRI adım: önce satır açılıyor (jetonuyla
 * birlikte), sonra posta deneniyor. Sıra tersine olsaydı gönderim
 * hatası anketin kendisini de kaybettirirdi.
 *
 * Bağlantı REZERVASYON KİMLİĞİYLE DEĞİL, anket kaydına ait rastgele bir
 * jetonla açılıyor: kimliği tahmin eden herkes başka çiftin anketini
 * açabilirdi.
 */
import { isAuthorizedCron, isDbConfigured, patchRows, selectRows, insertRow } from './_db';
import { json } from './_guard';
import { epostaGonder, siteKoku } from './_eposta';

interface RezervasyonSatiri {
  id: string;
  business_id: string;
  customer_name: string;
  customer_email: string | null;
  date: string;
}

interface AnketSatiri {
  id: string;
  reservation_id: string;
  token: string;
  sent_at: string | null;
}

/** Organizasyondan bir hafta önce: bugün anketi gidecek olan gün. */
export function anketGunu(bugun: Date, gecikme = 7): string {
  const tarih = new Date(Date.UTC(
    bugun.getUTCFullYear(), bugun.getUTCMonth(), bugun.getUTCDate(),
  ));
  tarih.setUTCDate(tarih.getUTCDate() - gecikme);
  return tarih.toISOString().slice(0, 10);
}

/**
 * Çifte giden posta metni.
 *
 * Puan aralığı metinde AÇIKÇA yazıyor: bağlantıyı açmadan neyin
 * sorulduğunu bilmeyen çoğu kişi tıklamıyor.
 */
export function anketMetni(isletme: string, musteri: string, baglanti: string): string {
  return [
    `Sayın ${musteri},`,
    '',
    `${isletme} olarak organizasyonunuzda bizi tercih ettiğiniz için teşekkür ederiz.`,
    'Deneyiminizi birkaç soruda değerlendirmenizi rica ediyoruz; her soru 1 ile 5 arasında puanlanıyor.',
    '',
    baglanti,
    '',
    'Yanıtlarınız yalnızca hizmetimizi geliştirmek için kullanılacaktır.',
  ].join('\n');
}

export default async function handler(request: Request): Promise<Response> {
  // Cron dışı çağrılara kapalı: müşterilere yetkisiz posta gitmemeli.
  if (!isAuthorizedCron(request)) return json({ error: 'Yetkisiz.' }, 401);
  if (!isDbConfigured()) return json({ error: 'Veritabanı yapılandırması eksik.' }, 500);

  const kok = siteKoku();
  if (!kok) {
    /*
      Adres bilinmeden bağlantı üretilemez. Tahmin edilen bir alan adı,
      müşteriye açılmayan bir bağlantı göndermek olurdu; bu yüzden görev
      sessizce başarılı dönmüyor.
    */
    return json({ error: 'SITE_URL tanımlı değil; anket bağlantısı üretilemiyor.' }, 500);
  }

  const gun = anketGunu(new Date());

  /* ---------------------------------------------------------------
     1. ADIM: bugün bir haftasını dolduran organizasyonlar için anket
     kaydı aç. Kayıt açmakla posta göndermek ayrı adımlar; gönderim
     hatası kaydın kendisini kaybettirmemeli.
     --------------------------------------------------------------- */
  let rezervasyonlar: RezervasyonSatiri[];
  try {
    /*
      İptal edilen organizasyona anket gitmez: olmamış bir gün için
      "nasıldı" diye sormak, müşteriyi ikinci kez rahatsız etmek olurdu.
      E-postası olmayan da dışarıda; anket yalnızca e-posta ile gidiyor.
    */
    rezervasyonlar = await selectRows<RezervasyonSatiri>(
      'reservations?select=id,business_id,customer_name,customer_email,date'
      + `&date=eq.${gun}&status=neq.${encodeURIComponent('İptal')}`
      + '&customer_email=not.is.null&customer_email=neq.',
    );
  } catch (error) {
    return json({ error: 'Rezervasyonlar okunamadı.', detail: String(error) }, 502);
  }

  let acilan = 0;
  for (const rezervasyon of rezervasyonlar) {
    try {
      /*
        Rezervasyon başına tek anket: tekillik kısıtı ikinci kaydı
        reddediyor, böylece görev günde birkaç kez çalışsa da aynı çifte
        ikinci anket açılmıyor.
      */
      await insertRow('surveys', {
        business_id: rezervasyon.business_id,
        reservation_id: rezervasyon.id,
      });
      acilan += 1;
    } catch {
      /* zaten açılmış; sessizce geçiliyor */
    }
  }

  /* ---------------------------------------------------------------
     2. ADIM: HENÜZ GÖNDERİLMEMİŞ bütün anketleri gönder.
     Yalnızca bu koşuda açılanlar denenseydi, sağlayıcının kesintiye
     uğradığı gün açılan anketler bir daha hiç gönderilmezdi.
     --------------------------------------------------------------- */
  let bekleyenler: AnketSatiri[];
  try {
    bekleyenler = await selectRows<AnketSatiri>(
      'surveys?select=id,reservation_id,token,sent_at&sent_at=is.null&order=created_at',
    );
  } catch (error) {
    return json({ error: 'Anketler okunamadı.', detail: String(error) }, 502);
  }

  if (bekleyenler.length === 0) {
    return json({ day: gun, opened: acilan, count: 0, results: [] });
  }

  /*
    Rezervasyon ve işletme bilgileri TOPLU okunuyor: anket başına ayrı
    istek atılsaydı yüz anketlik bir birikim yüzlerce sorgu olurdu.
  */
  const rezervasyonKimlikleri = [...new Set(bekleyenler.map((a) => a.reservation_id))];
  let kayitlar: RezervasyonSatiri[];
  try {
    kayitlar = await selectRows<RezervasyonSatiri>(
      'reservations?select=id,business_id,customer_name,customer_email,date'
      + `&id=in.(${rezervasyonKimlikleri.join(',')})`,
    );
  } catch (error) {
    return json({ error: 'Rezervasyonlar okunamadı.', detail: String(error) }, 502);
  }
  const rezervasyonHaritasi = new Map(kayitlar.map((r) => [r.id, r]));

  const isletmeAdlari = new Map<string, string>();
  try {
    const kimlikler = [...new Set(kayitlar.map((r) => r.business_id))];
    if (kimlikler.length > 0) {
      const isletmeler = await selectRows<{ id: string; name: string }>(
        `businesses?select=id,name&id=in.(${kimlikler.join(',')})`,
      );
      isletmeler.forEach((i) => isletmeAdlari.set(i.id, i.name));
    }
  } catch (error) {
    return json({ error: 'İşletmeler okunamadı.', detail: String(error) }, 502);
  }

  const sonuc: { survey: string; status: string; detail: string }[] = [];

  for (const anket of bekleyenler) {
    const rezervasyon = rezervasyonHaritasi.get(anket.reservation_id);
    const adres = (rezervasyon?.customer_email ?? '').trim();
    if (!rezervasyon || !adres) {
      sonuc.push({ survey: anket.id, status: 'atlandi', detail: 'Müşteri e-postası yok.' });
      continue;
    }

    const isletme = isletmeAdlari.get(rezervasyon.business_id) ?? 'Organizasyon';
    const baglanti = `${kok}/anket?jeton=${anket.token}`;
    const gonderim = await epostaGonder(
      adres,
      `${isletme} - deneyiminizi değerlendirin`,
      anketMetni(isletme, rezervasyon.customer_name, baglanti),
    );

    if (!gonderim.sent) {
      /*
        Gönderilemeyen anket SİLİNMİYOR: satır duruyor ve `sent_at` boş
        kalıyor, bir sonraki koşuda yeniden deneniyor.
      */
      sonuc.push({ survey: anket.id, status: 'beklemede', detail: gonderim.detail });
      continue;
    }

    try {
      await patchRows(`surveys?id=eq.${anket.id}`, { sent_at: new Date().toISOString() });
      sonuc.push({ survey: anket.id, status: 'gonderildi', detail: '' });
    } catch (error) {
      // Posta gitti ama işaret konamadı; bir sonraki koşuda tekrar gider.
      sonuc.push({ survey: anket.id, status: 'gonderildi', detail: String(error) });
    }
  }

  return json({ day: gun, opened: acilan, count: sonuc.length, results: sonuc });
}
