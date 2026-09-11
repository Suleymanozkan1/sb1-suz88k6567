/**
 * WhatsApp Business API webhook'u.
 *
 * Meta, işletmenin WhatsApp numarasına yazılan mesajı bu adrese gönderir.
 * Mesaj bir müşteri adayına çevrilir: aynı numaradan gelen ikinci mesaj
 * YENİ bir aday açmaz, mevcut adayın iletişim geçmişine eklenir.
 *
 * Bu uç nokta yalnızca mesaj ALIR. Mesaj göndermek ayrı bir yoldur ve
 * WhatsApp Web ile karıştırılmamalıdır -- bkz. api/whatsapp-gonder.ts.
 *
 * İki yol var:
 *   GET  Meta'nın adres doğrulaması. hub.verify_token bizimkiyle
 *        eşleşirse hub.challenge düz metin olarak geri döner.
 *   POST Mesaj bildirimi. İmza doğrulanır, mesaj kaydedilir.
 *
 * Gerekli ortam değişkenleri (HEPSİ SUNUCUDA KALIR, VITE_ ÖN EKİ ALMAZ):
 *   WHATSAPP_VERIFY_TOKEN  Meta panelinde webhook'u kurarken yazdığınız dize
 *   WHATSAPP_APP_SECRET    Meta uygulamasının App Secret değeri (imza için)
 *
 * Mesaj GÖNDERMEK için ayrıca WHATSAPP_TOKEN ve WHATSAPP_PHONE_ID gerekir;
 * bu uç nokta yalnızca mesaj ALIR, o yüzden onları istemiyor.
 *
 * İmza neden zorunlu: bu adres herkese açık. İmza doğrulanmazsa isteyen
 * istediği kadar sahte talep yazar; kanal raporu da rezervasyon listesi de
 * çöple dolar.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { insertRow, isDbConfigured, patchRows, selectRows } from './_db';
import { json } from './_guard';
import { talebiCoz, telefonSadelestir } from '../src/lib/whatsappTalep';

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const APP_SECRET = process.env.WHATSAPP_APP_SECRET;

export function isWhatsappConfigured(): boolean {
  return Boolean(VERIFY_TOKEN && APP_SECRET);
}

/**
 * Meta'nın `x-hub-signature-256` başlığını doğrular.
 *
 * Karşılaştırma sabit zamanlı: bayt bayt erken çıkan bir karşılaştırma,
 * saldırganın imzayı deneme yanılmayla bulmasına kapı aralar.
 */
export function imzaDogru(govde: string, baslik: string | null, sir: string): boolean {
  if (!baslik) return false;
  const [tur, imza] = baslik.split('=');
  if (tur !== 'sha256' || !imza) return false;

  const beklenen = createHmac('sha256', sir).update(govde, 'utf8').digest('hex');
  const a = Buffer.from(beklenen, 'hex');
  const b = Buffer.from(imza, 'hex');
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

interface MetaMesaj {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
}

interface MetaGovde {
  object?: string;
  entry?: {
    changes?: {
      value?: {
        metadata?: { phone_number_id?: string };
        messages?: MetaMesaj[];
      };
    }[];
  }[];
}

interface HesapSatiri { phone_number_id: string; business_id: string }
interface AdaySatiri { id: string; name: string; email: string; status: string }

/** Mesajın geldiği numarayı işletmeye bağlar. */
async function isletmeBul(phoneNumberId: string): Promise<string | null> {
  const satirlar = await selectRows<HesapSatiri>(
    `whatsapp_accounts?phone_number_id=eq.${encodeURIComponent(phoneNumberId)}&select=business_id&limit=1`,
  );
  return satirlar[0]?.business_id ?? null;
}

/**
 * Aynı kişiyi bulur.
 *
 * Önce telefon, sonra e-posta. Aynı numaradan ikinci mesaj yeni bir aday
 * AÇMAMALI: konuşmanın tamamı tek kişinin altında toplanmalı, yoksa
 * "bu müşteri daha önce arandı mı" sorusu cevapsız kalır.
 */
async function adayBul(
  businessId: string, telefon: string, eposta: string,
): Promise<AdaySatiri | null> {
  const alan = 'select=id,name,email,status&limit=1';
  if (telefon) {
    const bulunan = await selectRows<AdaySatiri>(
      `customer_leads?business_id=eq.${businessId}&phone=eq.${encodeURIComponent(telefon)}&${alan}`,
    );
    if (bulunan[0]) return bulunan[0];
  }
  if (eposta) {
    const bulunan = await selectRows<AdaySatiri>(
      `customer_leads?business_id=eq.${businessId}&email=eq.${encodeURIComponent(eposta)}&${alan}`,
    );
    if (bulunan[0]) return bulunan[0];
  }
  return null;
}

/** Meta gövdesindeki metin mesajlarını numara kimliğiyle birlikte çıkarır. */
export function mesajlariCikar(govde: MetaGovde): {
  phoneNumberId: string; mesaj: MetaMesaj;
}[] {
  const cikan: { phoneNumberId: string; mesaj: MetaMesaj }[] = [];
  for (const entry of govde.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const phoneNumberId = change.value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;
      for (const mesaj of change.value?.messages ?? []) {
        // Yalnızca metin: fotoğraf, konum ve sesli mesajda çözümlenecek
        // alan yok, kaydetmek yalnızca listeyi şişirirdi.
        if (mesaj.type === 'text' && mesaj.text?.body?.trim()) {
          cikan.push({ phoneNumberId, mesaj });
        }
      }
    }
  }
  return cikan;
}

/**
 * Bir mesajı adaya çevirir.
 *
 * Yeni aday "Aranmadı" ile açılır. Mevcut aday varsa alanları EZİLMEZ:
 * personelin elle düzelttiği bir adı, gelen mesajdaki çözümleme yanlışıyla
 * bozmak kaydı kötüleştirirdi. Yalnızca boş alanlar doldurulur.
 */
async function mesajiIsle(businessId: string, mesaj: MetaMesaj): Promise<'yeni' | 'eklendi'> {
  const metin = mesaj.text?.body ?? '';
  const cozum = talebiCoz(metin);
  const saniye = Number(mesaj.timestamp);
  const zaman = Number.isFinite(saniye)
    ? new Date(saniye * 1000).toISOString()
    : new Date().toISOString();

  // Mesajı gönderen numara, metinde yazandan daha güvenilir.
  const telefon = telefonSadelestir(mesaj.from ?? '') || cozum.phone;
  const mevcut = await adayBul(businessId, telefon, cozum.email);

  let leadId: string;
  let sonuc: 'yeni' | 'eklendi';

  if (mevcut) {
    leadId = mevcut.id;
    sonuc = 'eklendi';
    const eksikler: Record<string, unknown> = { last_contact_at: zaman };
    if (!mevcut.name && cozum.name) eksikler.name = cozum.name;
    if (!mevcut.email && cozum.email) eksikler.email = cozum.email;
    await patchRows(`customer_leads?id=eq.${leadId}`, eksikler);
  } else {
    const acilan = await insertRow<{ id: string }[]>('customer_leads', {
      business_id: businessId,
      name: cozum.name,
      phone: telefon,
      email: cozum.email,
      guest_count: cozum.guestCount,
      event_date: cozum.date || null,
      event_date_text: cozum.date ? '' : cozum.note.split('\n').find((s) => /\d|hafta|ay/i.test(s)) ?? '',
      organization_type: cozum.organizationType,
      source: 'WhatsApp',
      source_detail: '',
      status: 'Aranmadı',
      note: cozum.note,
      last_contact_at: zaman,
    });
    leadId = Array.isArray(acilan) ? acilan[0]!.id : (acilan as unknown as { id: string }).id;
    sonuc = 'yeni';
  }

  await insertRow('customer_lead_messages', {
    business_id: businessId,
    lead_id: leadId,
    direction: 'gelen',
    channel: 'whatsapp',
    body: metin,
    wa_message_id: mesaj.id ?? null,
    created_at: zaman,
  });

  return sonuc;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const mod = url.searchParams.get('hub.mode');
    const jeton = url.searchParams.get('hub.verify_token');
    const meydan = url.searchParams.get('hub.challenge');

    if (!VERIFY_TOKEN) return json({ error: 'WhatsApp yapılandırılmamış.' }, 503);
    if (mod !== 'subscribe' || jeton !== VERIFY_TOKEN) {
      return json({ error: 'Doğrulama başarısız.' }, 403);
    }
    // Meta bu yanıtı düz metin bekliyor; JSON gönderilirse kurulum tamamlanmaz.
    return new Response(meydan ?? '', {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Yöntem desteklenmiyor.' }, 405);
  }

  if (!APP_SECRET || !isDbConfigured()) {
    return json({ error: 'WhatsApp yapılandırılmamış.' }, 503);
  }

  // İmza ham gövde üzerinden hesaplanıyor; JSON'a çevirip geri yazmak
  // boşlukları değiştirir ve imzayı bozar.
  const ham = await request.text();
  if (!imzaDogru(ham, request.headers.get('x-hub-signature-256'), APP_SECRET)) {
    return json({ error: 'İmza doğrulanamadı.' }, 401);
  }

  let govde: MetaGovde;
  try {
    govde = JSON.parse(ham) as MetaGovde;
  } catch {
    return json({ error: 'Gövde okunamadı.' }, 400);
  }

  let yeniAday = 0;
  let eklenen = 0;
  let atlanan = 0;

  for (const { phoneNumberId, mesaj } of mesajlariCikar(govde)) {
    const businessId = await isletmeBul(phoneNumberId);
    // Tanımadığımız numaraya gelen mesaj kaydedilmez: hangi işletmeye ait
    // olduğu bilinmeden yazılan satır kimsenin göremeyeceği bir kayıt olur.
    if (!businessId) { atlanan += 1; continue; }

    try {
      const sonuc = await mesajiIsle(businessId, mesaj);
      if (sonuc === 'yeni') yeniAday += 1; else eklenen += 1;
    } catch {
      // Aynı mesaj iki kez gelirse benzersizlik kısıtı düşürür; bu bir hata
      // değil, Meta'nın yeniden denemesidir. 200 dönmezsek sonsuza kadar
      // yeniden dener ve kuyruk tıkanır.
      atlanan += 1;
    }
  }

  return json({ ok: true, yeniAday, eklenen, atlanan });
}
