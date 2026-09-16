/**
 * WhatsApp Cloud API ile mesaj GÖNDERME.
 *
 * Bu, panel kartındaki "WhatsApp'ta Aç" düğmesinden BAŞKA bir yoldur ve
 * ikisi karıştırılmamalıdır:
 *
 *   WhatsApp Web (wa.me)        Cloud API (bu dosya)
 *   ------------------------    --------------------------------------
 *   Tarayıcıda konuşmayı açar   Sunucudan mesaj gönderir
 *   Mesajı personel yazar       Mesajı program gönderir
 *   Ücretsiz                    Konuşma başına ücretli
 *   Zaman kısıtı yok            24 SAATLİK HİZMET PENCERESİ geçerli
 *   Kurulum gerekmez            Meta onayı ve kalıcı jeton gerekir
 *
 * 24 saat kuralı: müşterinin son mesajından sonraki 24 saat içinde serbest
 * metin gönderilebilir. Pencere kapandıysa YALNIZCA Meta'nın onayladığı bir
 * şablon gönderilebilir; serbest metin denemesi Meta tarafından reddedilir.
 * Bu yüzden pencere burada kontrol ediliyor ve kapalıysa istek çağırana
 * açıkça bildiriliyor -- sessizce düşen bir mesaj, gönderildi sanılır.
 *
 * Gerekli ortam değişkenleri (SUNUCUDA KALIR):
 *   WHATSAPP_ACCESS_TOKEN     Kalıcı erişim jetonu
 *   WHATSAPP_PHONE_NUMBER_ID  Gönderen numaranın kimliği
 */
import { insertRow, isDbConfigured, selectRows } from './_db.js';
import { cagiran, json } from './_guard.js';

const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const SURUM = process.env.WHATSAPP_API_VERSION ?? 'v21.0';

export function isSendConfigured(): boolean {
  return Boolean(TOKEN && PHONE_ID);
}

/** Meta'nın hizmet penceresi: müşterinin son mesajından sonraki 24 saat. */
export const PENCERE_SAAT = 24;

export function pencereAcikMi(sonGelenIso: string | null, simdi = new Date()): boolean {
  if (!sonGelenIso) return false;
  const fark = simdi.getTime() - new Date(sonGelenIso).getTime();
  return fark >= 0 && fark < PENCERE_SAAT * 60 * 60 * 1000;
}

/**
 * Ham gönderim: numaraya metin yollar, Meta'nın mesaj kimliğini döndürür.
 *
 * Pencere kontrolü BURADA yapılmaz -- çağıranın işidir. Webhook'tan
 * gelen otomatik cevapta pencere zaten müşterinin o anki mesajıyla
 * açılmış olur; burada ikinci kez sorgulamak boşuna bir veritabanı
 * turu demekti.
 */
export async function metinGonder(telefon: string, metin: string): Promise<string | null> {
  const yanit = await fetch(`https://graph.facebook.com/${SURUM}/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: `90${telefon}`,
      type: 'text',
      text: { body: metin },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!yanit.ok) throw new Error(`WhatsApp gönderimi başarısız (${yanit.status}).`);
  const sonuc = (await yanit.json()) as { messages?: { id?: string }[] };
  return sonuc.messages?.[0]?.id ?? null;
}

interface AdaySatiri { id: string; business_id: string; phone: string }
interface MesajSatiri { created_at: string }

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Yöntem desteklenmiyor.' }, 405);

  /*
    YETKİ VE KİRACI ŞARTI.

    Bu uç hiçbir kimlik doğrulaması yapmıyordu; `/api/sms` ile aynı
    açık, ama iki yönden daha ağırı:

      1. Gönderim ücretli. İnternetteki herkes işletmenin Meta
         hesabından, işletmenin numarasıyla mesaj attırabilirdi --
         faturası da marka sorumluluğu da işletmeye kalırdı.
      2. Uç, `leadId` alıp o adayın TELEFONUNU veritabanından
         service_role ile okuyordu. Kiracı kontrolü olmadığı için
         bu aynı zamanda bir sorgulama penceresiydi: elindeki
         kimlikle HANGİ işletmenin adayı olursa olsun mesaj
         gönderilebilir, 404/409 ayrımından kaydın varlığı
         öğrenilebilirdi.

    Bu yüzden iki AYRI soru soruluyor: "bu işlemi yapabilir mi"
    (`mesaj.duzenle`) ve "bu kayıt onun mu" (aşağıdaki kapsam
    kontrolü). Yetki tek başına yetmez; `mesaj.duzenle` yetkisi olan
    bir personel, o yetkiyle başka işletmenin müşterisine yazmamalı.
  */
  const kisi = await cagiran(request);
  if (!kisi) return json({ error: 'Yetkisiz.' }, 401);
  if (!kisi.sahipMi && !kisi.yetkiler.includes('mesaj.duzenle')) {
    return json({ error: 'Bu işlem için yetkiniz yok.' }, 403);
  }

  if (!isSendConfigured() || !isDbConfigured()) {
    return json({ error: 'WhatsApp gönderimi yapılandırılmamış.' }, 503);
  }

  let govde: { leadId?: string; body?: string };
  try {
    govde = (await request.json()) as typeof govde;
  } catch {
    return json({ error: 'Gövde okunamadı.' }, 400);
  }
  if (!govde.leadId || !govde.body?.trim()) {
    return json({ error: 'Müşteri adayı ve mesaj metni gerekiyor.' }, 400);
  }

  /*
    KİRACI KONTROLÜ, ADAY SORGUSUNUN İÇİNDE.

    Önce çağıranın işletmeleri alınıyor, sonra aday YALNIZCA o
    işletmelerle sınırlı sorgulanıyor. Kapsam, veritabanındaki
    `owner_scope()` ile aynı kural: yönetici kendi kimliği, personel
    bağlı olduğu yöneticinin kimliği.

    NEDEN TEK SORGU. Önce aday çekilip sonra ayrı bir `businesses`
    sorgusuyla kapsam denetlense, iki durum FARKLI sayıda veritabanı
    turu yapardı: var olmayan aday tek sorgudan sonra döner, kapsam
    dışı aday ikinci sorguyu da çalıştırırdı. Yanıtların metni aynı
    olsa bile bu süre farkı, yeterli tekrarla "bu kimlikte başka bir
    işletmede gerçek bir aday var" bilgisini verirdi. İki durum artık
    aynı boş sonuçtan, aynı yoldan üretiliyor.

    Kapsam dışı aday için 403 DEĞİL "yok" yanıtı veriliyor: "yetkin
    yok" demek de o kaydın VAR olduğunu doğrulardı.

    İşletmesi olmayan çağıranda liste boş kalır; `in.()` hiçbir satır
    eşleştirmez, sonuç yine "yok" olur.
  */
  const isletmeler = await selectRows<{ id: string }>(
    `businesses?owner_id=eq.${encodeURIComponent(kisi.kapsam)}&select=id`,
  );
  const kapsamListesi = isletmeler
    .map((b) => encodeURIComponent(`"${b.id}"`))
    .join(',');

  const adaylar = await selectRows<AdaySatiri>(
    `customer_leads?id=eq.${encodeURIComponent(govde.leadId)}`
    + `&business_id=in.(${kapsamListesi})&select=id,business_id,phone&limit=1`,
  );
  const aday = adaylar[0];
  if (!aday) return json({ error: 'Müşteri adayı bulunamadı.' }, 404);

  // Buradan sonrası çağıranın KENDİ adayı; eksik telefonu söylemek sızıntı değil.
  if (!aday.phone) return json({ error: 'Adayın telefon numarası yok.' }, 404);

  // Son GELEN mesaj penceresi belirler; giden mesaj pencereyi açmaz.
  const sonGelen = await selectRows<MesajSatiri>(
    `customer_lead_messages?lead_id=eq.${aday.id}&direction=eq.gelen`
    + '&select=created_at&order=created_at.desc&limit=1',
  );
  if (!pencereAcikMi(sonGelen[0]?.created_at ?? null)) {
    return json({
      error: '24 saatlik hizmet penceresi kapalı. Serbest metin gönderilemez; '
        + 'Meta onaylı bir şablon kullanılmalı ya da WhatsApp Web üzerinden yazılmalı.',
      pencere: 'kapali',
    }, 409);
  }

  let waMessageId: string | null;
  try {
    waMessageId = await metinGonder(aday.phone, govde.body);
  } catch (err) {
    return json({ error: (err as Error).message }, 502);
  }

  await insertRow('customer_lead_messages', {
    business_id: aday.business_id,
    lead_id: aday.id,
    direction: 'giden',
    channel: 'whatsapp',
    body: govde.body,
    wa_message_id: waMessageId,
  });

  return json({ ok: true, waMessageId });
}
