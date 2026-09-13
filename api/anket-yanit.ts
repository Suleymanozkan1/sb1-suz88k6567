/**
 * Deneyim anketinin herkese açık ucu (madde 31).
 *
 * Müşterinin sistemde hesabı yok; ankete e-postayla gelen bağlantıdaki
 * JETONLA giriliyor. Rezervasyon kimliğiyle açılan bir adres, kimliği
 * tahmin eden herkese başka çiftin anketini açardı.
 *
 * İki işlem:
 *   GET  ?jeton=...   anketin durumu ve hangi organizasyona ait olduğu
 *   POST { jeton, puanlar, yorum }   cevabı kaydeder
 *
 * YAZMA YETKİSİ İSTEMCİDE DEĞİL: `surveys` tablosuna yazmak yalnızca
 * `service_role` ile mümkün ve o jeton hiçbir koşulda tarayıcıya
 * inmiyor. Anket cevabı buradan, sunucu üzerinden yazılıyor.
 */
import { clientIp, enforceRateLimit, json, tooManyRequests } from './_guard';
import { isDbConfigured, patchRows, selectRows } from './_db';
import { epostaGonder } from './_eposta';
import { puanlariSuz } from '../src/lib/anket';
import { ANKET_SORULARI } from '../src/types';

interface AnketSatiri {
  id: string;
  business_id: string;
  reservation_id: string;
  answered_at: string | null;
  sent_at: string | null;
}

/**
 * Jeton biçimi.
 *
 * Veritabanında `encode(gen_random_bytes(24), 'hex')` ile üretiliyor:
 * 48 karakter, yalnızca onaltılık. Biçim burada da doğrulanıyor ki
 * uydurma bir değer sorguya hiç ulaşmasın.
 */
const JETON_KALIBI = /^[0-9a-f]{48}$/;

/** Yorum alanının üst sınırı: sınırsız metin depoyu şişirir. */
const EN_UZUN_YORUM = 2000;

async function anketiBul(jeton: string): Promise<AnketSatiri | null> {
  const satirlar = await selectRows<AnketSatiri>(
    `surveys?select=id,business_id,reservation_id,answered_at,sent_at&token=eq.${jeton}`,
  );
  return satirlar[0] ?? null;
}

/**
 * Cevap bildirimini yöneticiye yollar.
 *
 * Adres Ayarlar'dan geliyor (`businesses.survey_email`); tanımlı
 * değilse bildirim gönderilmiyor ve bu bir hata değil -- anket yine
 * kaydedildi, panelden okunuyor.
 */
async function yoneticiyeBildir(
  businessId: string, puanlar: Record<string, number>, yorum: string,
): Promise<void> {
  let isletme: { name: string; survey_email: string } | undefined;
  try {
    const satirlar = await selectRows<{ name: string; survey_email: string }>(
      `businesses?select=name,survey_email&id=eq.${businessId}`,
    );
    isletme = satirlar[0];
  } catch {
    return;
  }

  const adres = (isletme?.survey_email ?? '').trim();
  if (!adres) return;

  const satirlar = ANKET_SORULARI
    .filter((s) => typeof puanlar[s.key] === 'number')
    .map((s) => `${s.label}: ${puanlar[s.key]}/5`);

  await epostaGonder(
    adres,
    `${isletme?.name ?? 'Anket'} - yeni anket cevabı`,
    [...satirlar, '', yorum ? `Yorum: ${yorum}` : 'Yorum yazılmadı.'].join('\n'),
  );
}

export default async function handler(request: Request): Promise<Response> {
  if (!isDbConfigured()) return json({ error: 'Sunucu yapılandırması eksik.' }, 500);

  /*
    Herkese açık uç: jeton deneme yanılmayla aranabilir. 48 karakterlik
    onaltılık bir değeri denemekle bulmak pratikte imkânsız, ama sınır
    yine de var -- maliyeti sağlayıcıya değil bize çıkarırdı.
  */
  const sinir = await enforceRateLimit(clientIp(request), {
    bucket: 'anket', limit: 30, windowSeconds: 600,
  });
  if (!sinir.allowed) return tooManyRequests(600);

  if (request.method === 'GET') {
    const jeton = new URL(request.url).searchParams.get('jeton') ?? '';
    if (!JETON_KALIBI.test(jeton)) return json({ error: 'Anket bağlantısı geçersiz.' }, 400);

    let anket: AnketSatiri | null;
    try {
      anket = await anketiBul(jeton);
    } catch (error) {
      return json({ error: 'Anket okunamadı.', detail: String(error) }, 502);
    }
    if (!anket) return json({ error: 'Anket bulunamadı.' }, 404);

    /*
      Rezervasyon bilgisinden yalnızca İŞLETME ADI ve TARİH dönüyor.
      Müşteri adı, telefonu ya da kimlik numarası dönseydi, bağlantıyı
      ele geçiren biri kişisel veriye de ulaşırdı.
    */
    let bilgi: { name: string; date: string } | undefined;
    try {
      const [isletmeler, rezervasyonlar] = await Promise.all([
        selectRows<{ name: string }>(`businesses?select=name&id=eq.${anket.business_id}`),
        selectRows<{ date: string }>(`reservations?select=date&id=eq.${anket.reservation_id}`),
      ]);
      bilgi = { name: isletmeler[0]?.name ?? '', date: rezervasyonlar[0]?.date ?? '' };
    } catch {
      bilgi = { name: '', date: '' };
    }

    return json({
      business: bilgi.name,
      date: bilgi.date,
      answered: Boolean(anket.answered_at),
    });
  }

  if (request.method !== 'POST') return json({ error: 'Yöntem desteklenmiyor.' }, 405);

  let govde: { jeton?: string; puanlar?: unknown; yorum?: string };
  try {
    govde = (await request.json()) as typeof govde;
  } catch {
    return json({ error: 'Geçersiz istek gövdesi.' }, 400);
  }

  const jeton = (govde.jeton ?? '').trim();
  if (!JETON_KALIBI.test(jeton)) return json({ error: 'Anket bağlantısı geçersiz.' }, 400);

  /*
    Puan doğrulaması ARAYÜZLE AYNI modülden geliyor (`src/lib/anket`).
    Ayrı bir kopya olsaydı tarayıcıyı atlayan bir istek 0 ya da 9 puan
    yazabilir, ortalamalar bozulurdu.
  */
  const puanlar = puanlariSuz(govde.puanlar);
  if (!puanlar) return json({ error: 'Puanlar 1 ile 5 arasında olmalı.' }, 400);

  const yorum = (govde.yorum ?? '').trim().slice(0, EN_UZUN_YORUM);

  let anket: AnketSatiri | null;
  try {
    anket = await anketiBul(jeton);
  } catch (error) {
    return json({ error: 'Anket okunamadı.', detail: String(error) }, 502);
  }
  if (!anket) return json({ error: 'Anket bulunamadı.' }, 404);

  /*
    İkinci kez cevaplanamaz: bağlantı e-postada duruyor ve tekrar
    açılabilir. Üzerine yazılsaydı aynı çift ortalamayı istediği kadar
    değiştirebilirdi.
  */
  if (anket.answered_at) return json({ error: 'Bu anket daha önce cevaplanmış.' }, 409);

  try {
    await patchRows(`surveys?id=eq.${anket.id}`, {
      scores: puanlar,
      comment: yorum,
      answered_at: new Date().toISOString(),
    });
  } catch (error) {
    return json({ error: 'Anket kaydedilemedi.', detail: String(error) }, 502);
  }

  // Bildirim gönderilemese bile cevap kaydedildi; istek başarılı döner.
  try {
    await yoneticiyeBildir(anket.business_id, puanlar, yorum);
  } catch {
    /* bildirim gönderilemedi; anket yine de kayıtlı */
  }

  return json({ ok: true });
}
