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
 *   WHATSAPP_TOKEN     Kalıcı erişim jetonu
 *   WHATSAPP_PHONE_ID  Gönderen numaranın kimliği
 */
import { insertRow, isDbConfigured, selectRows } from './_db';
import { json } from './_guard';

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
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

interface AdaySatiri { id: string; business_id: string; phone: string }
interface MesajSatiri { created_at: string }

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Yöntem desteklenmiyor.' }, 405);
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

  const adaylar = await selectRows<AdaySatiri>(
    `customer_leads?id=eq.${encodeURIComponent(govde.leadId)}&select=id,business_id,phone&limit=1`,
  );
  const aday = adaylar[0];
  if (!aday?.phone) return json({ error: 'Adayın telefon numarası yok.' }, 404);

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

  const yanit = await fetch(`https://graph.facebook.com/${SURUM}/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: `90${aday.phone}`,
      type: 'text',
      text: { body: govde.body },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!yanit.ok) {
    return json({ error: `WhatsApp gönderimi başarısız (${yanit.status}).` }, 502);
  }

  const sonuc = (await yanit.json()) as { messages?: { id?: string }[] };
  await insertRow('customer_lead_messages', {
    business_id: aday.business_id,
    lead_id: aday.id,
    direction: 'giden',
    channel: 'whatsapp',
    body: govde.body,
    wa_message_id: sonuc.messages?.[0]?.id ?? null,
  });

  return json({ ok: true, waMessageId: sonuc.messages?.[0]?.id ?? null });
}
