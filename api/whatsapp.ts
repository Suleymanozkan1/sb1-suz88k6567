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
 *   WHATSAPP_VERIFY_TOKEN        Meta panelinde webhook'u kurarken yazdığınız dize
 *   WHATSAPP_APP_SECRET          Meta uygulamasının App Secret değeri (imza için)
 *   WHATSAPP_BUSINESS_ACCOUNT_ID WABA kimliği. Zorunlu DEĞİL; verilirse gelen
 *                                bildirimin beklenen hesaptan geldiği de
 *                                doğrulanır. Meta panelinde bir uygulamaya
 *                                birden çok WABA bağlanabiliyor.
 *
 * Mesaj GÖNDERMEK için ayrıca WHATSAPP_ACCESS_TOKEN ve WHATSAPP_PHONE_NUMBER_ID gerekir;
 * bu uç nokta yalnızca mesaj ALIR, o yüzden onları istemiyor.
 *
 * İmza neden zorunlu: bu adres herkese açık. İmza doğrulanmazsa isteyen
 * istediği kadar sahte talep yazar; kanal raporu da rezervasyon listesi de
 * çöple dolar.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { insertRow, isDbConfigured, patchRows, selectRows } from './_db';
import { clientIp, enforceRateLimit, json, tooManyRequests } from './_guard';
import { talebiCoz, telefonSadelestir } from '../src/lib/whatsappTalep';
import { otomatikCevapSec } from '../src/lib/whatsappOtomatik';
import type { OtomatikAyar, OtomatikTur } from '../src/lib/whatsappOtomatik';
import { isSendConfigured, metinGonder } from './whatsapp-gonder';

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const APP_SECRET = process.env.WHATSAPP_APP_SECRET;
const WABA_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

/**
 * Mock mod: Meta bağlanmadan sistemi denemek için.
 *
 * Açıkken /api/whatsapp-test uç noktası çalışır ve oturum açmış bir
 * yönetici panelden mesaj yapıştırıp aynı boru hattından geçirebilir.
 * Gerçek webhook'un imza doğrulaması bundan ETKİLENMEZ: mock mod açık
 * diye imzasız bildirim kabul edilseydi, unutulan bir ayar üretimde
 * herkesin sahte talep yazabildiği bir kapı bırakırdı.
 */
export function isMockMode(): boolean {
  return process.env.WHATSAPP_MOCK_MODE === 'true';
}

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

export interface MetaMesaj {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
}

interface MetaGovde {
  object?: string;
  entry?: {
    id?: string;
    changes?: {
      value?: {
        metadata?: { phone_number_id?: string };
        messages?: MetaMesaj[];
      };
    }[];
  }[];
}

interface HesapSatiri {
  business_id: string;
  auto_reply_enabled: boolean;
  welcome_message: string;
  after_hours_enabled: boolean;
  after_hours_message: string;
  work_start: string;
  work_end: string;
  work_days: number[];
}

const HESAP_ALANLARI = 'business_id,auto_reply_enabled,welcome_message,'
  + 'after_hours_enabled,after_hours_message,work_start,work_end,work_days';

function ayaraCevir(hesap: HesapSatiri): OtomatikAyar {
  return {
    autoReplyEnabled: hesap.auto_reply_enabled,
    welcomeMessage: hesap.welcome_message ?? '',
    afterHoursEnabled: hesap.after_hours_enabled,
    afterHoursMessage: hesap.after_hours_message ?? '',
    workStart: hesap.work_start ?? '09:00',
    workEnd: hesap.work_end ?? '19:00',
    workDays: hesap.work_days ?? [1, 2, 3, 4, 5, 6, 7],
  };
}
interface AdaySatiri {
  id: string; name: string; email: string; status: string;
  request_text: string; event_date_text: string; event_date: string | null;
}

/**
 * İşletmenin yeni adayları hangi durumla açtığı.
 *
 * Durumlar artık işletmeye ait satırlar, sabit bir "Aranmadı" değeri yok.
 * Sabit yazılsaydı sahibi başlangıç durumunu yeniden adlandırdığı anda
 * webhook yabancı anahtar hatası alır ve gelen her talep sessizce
 * düşerdi.
 */
async function baslangicDurumu(businessId: string): Promise<string> {
  const satirlar = await selectRows<{ code: string }>(
    `lead_statuses?business_id=eq.${businessId}&is_initial=is.true&select=code&limit=1`,
  );
  if (satirlar[0]?.code) return satirlar[0].code;

  // Başlangıç işaretli durum yoksa sıradaki ilk durum kullanılıyor:
  // talebi kaybetmektense yanlış kutuya koymak yeğdir.
  const ilk = await selectRows<{ code: string }>(
    `lead_statuses?business_id=eq.${businessId}&select=code&order=sort_order.asc&limit=1`,
  );
  if (ilk[0]?.code) return ilk[0].code;
  throw new Error('İşletmenin tanımlı müşteri adayı durumu yok.');
}

/** Mesajın geldiği numarayı işletmeye ve o numaranın ayarlarına bağlar. */
async function hesabiBul(phoneNumberId: string): Promise<HesapSatiri | null> {
  const satirlar = await selectRows<HesapSatiri>(
    `whatsapp_accounts?phone_number_id=eq.${encodeURIComponent(phoneNumberId)}`
    + `&select=${HESAP_ALANLARI}&limit=1`,
  );
  return satirlar[0] ?? null;
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
  const alan = 'select=id,name,email,status,request_text,event_date_text,event_date&limit=1';
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
export function mesajlariCikar(govde: MetaGovde, wabaId?: string): {
  phoneNumberId: string; mesaj: MetaMesaj;
}[] {
  const cikan: { phoneNumberId: string; mesaj: MetaMesaj }[] = [];
  for (const entry of govde.entry ?? []) {
    // WABA kimliği verilmişse eşleşmeyen bildirim atlanıyor. entry.id,
    // bildirimin hangi WhatsApp Business hesabından geldiğini söyler.
    if (wabaId && entry.id && entry.id !== wabaId) continue;
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
export async function mesajiIsle(
  businessId: string, mesaj: MetaMesaj,
): Promise<{ leadId: string; telefon: string; zaman: string; sonuc: 'yeni' | 'eklendi' }> {
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
    if (!mevcut.request_text && cozum.request) eksikler.request_text = cozum.request;
    if (!mevcut.event_date_text && !mevcut.event_date && cozum.dateText) {
      eksikler.event_date_text = cozum.dateText;
    }
    await patchRows(`customer_leads?id=eq.${leadId}`, eksikler);
  } else {
    const acilan = await insertRow<{ id: string }[]>('customer_leads', {
      business_id: businessId,
      name: cozum.name,
      phone: telefon,
      email: cozum.email,
      guest_count: cozum.guestCount,
      event_date: cozum.date || null,
      event_date_text: cozum.dateText,
      organization_type: cozum.organizationType,
      source: 'WhatsApp',
      source_detail: '',
      status: await baslangicDurumu(businessId),
      request_text: cozum.request,
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

  return { leadId, telefon, zaman, sonuc };
}

/**
 * Karşılama ya da mesai dışı bilgilendirmesi gönderir.
 *
 * Gönderilen mesaj geçmişe `auto_kind` ile yazılıyor: personel müşteriye
 * ne söylendiğini görmeden arayamaz, ve aynı adaya ikinci bir karşılama
 * gönderilmemesi bu kayda bakılarak sağlanıyor.
 *
 * Hiçbir hata webhook'u düşürmemeli: Meta 200 almazsa aynı mesajı
 * yeniden gönderir, kuyruk tıkanır ve aday iki kez açılır. Gönderim
 * başarısızsa mesaj kaydedilmez -- gönderilmemiş bir mesajı geçmişe
 * yazmak, personele gitmemiş bir cevabı gitmiş gösterirdi.
 */
async function otomatikCevapVer(
  hesap: HesapSatiri,
  aday: { leadId: string; telefon: string; yeniAday: boolean },
  /*
    Karar müşterinin mesajı YAZDIĞI ana göre veriliyor, sunucunun o anki
    saatine göre değil. Geçmişteki otomatik mesajlar da aynı damgayla
    kaydediliyor; ikisi ayrı zaman ekseninde olsaydı "12 saatte bir"
    kuralı kendi kaydıyla tutarsız çalışırdı.
  */
  zaman: Date,
): Promise<OtomatikTur | null> {
  const ayar = ayaraCevir(hesap);
  if (!ayar.autoReplyEnabled && !ayar.afterHoursEnabled) return null;
  if (!aday.telefon || !isSendConfigured()) return null;

  const gecmis = await selectRows<{ auto_kind: OtomatikTur; created_at: string }>(
    `customer_lead_messages?lead_id=eq.${aday.leadId}&auto_kind=not.is.null`
    + '&select=auto_kind,created_at&order=created_at.desc&limit=20',
  );

  const secim = otomatikCevapSec(ayar, {
    yeniAday: aday.yeniAday,
    gecmis: gecmis.map((g) => ({ kind: g.auto_kind, at: g.created_at })),
    zaman,
  });
  if (!secim) return null;

  const waMessageId = await metinGonder(aday.telefon, secim.body);
  await insertRow('customer_lead_messages', {
    business_id: hesap.business_id,
    lead_id: aday.leadId,
    direction: 'giden',
    channel: 'whatsapp',
    body: secim.body,
    auto_kind: secim.kind,
    wa_message_id: waMessageId,
    // Gelen mesajla aynı eksende: "12 saatte bir" kuralı kendi kaydını okuyor.
    created_at: zaman.toISOString(),
  });
  return secim.kind;
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

  /*
    Hız sınırı imza doğrulamasından ÖNCE.

    İmza asıl kapı, ama imzasız istek de bedava değil: her biri bir HMAC
    hesabı ve bir veritabanı turu demek. Sınır olmadan bu adrese saniyede
    binlerce çöp istek atıp sunucuyu meşgul etmek mümkün.

    Sınır yüksek tutuluyor: Meta bir kerede yığın bildirim gönderebiliyor
    ve sınıra takılan gerçek bir bildirim, 200 alamadığı için tekrar
    tekrar denenir. Amaç kötüye kullanımı kesmek, normal trafiği değil.
  */
  const sinir = await enforceRateLimit(clientIp(request), {
    bucket: 'whatsapp_webhook', limit: 600, windowSeconds: 60,
  });
  if (!sinir.allowed) return tooManyRequests(60);

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
  let otomatik = 0;

  for (const { phoneNumberId, mesaj } of mesajlariCikar(govde, WABA_ID)) {
    const hesap = await hesabiBul(phoneNumberId);
    // Tanımadığımız numaraya gelen mesaj kaydedilmez: hangi işletmeye ait
    // olduğu bilinmeden yazılan satır kimsenin göremeyeceği bir kayıt olur.
    if (!hesap) { atlanan += 1; continue; }

    try {
      const kayit = await mesajiIsle(hesap.business_id, mesaj);
      if (kayit.sonuc === 'yeni') yeniAday += 1; else eklenen += 1;

      // Otomatik cevap ayrı bir try içinde: gönderim hatası mesajın
      // kaydedilmesini geri almamalı. Müşterinin talebi durur, yalnızca
      // otomatik cevap gitmemiş olur.
      try {
        const tur = await otomatikCevapVer(hesap, {
          leadId: kayit.leadId,
          telefon: kayit.telefon,
          yeniAday: kayit.sonuc === 'yeni',
        }, new Date(kayit.zaman));
        if (tur) otomatik += 1;
      } catch {
        // yutuluyor: aşağıdaki 200 yanıtı korunmalı
      }
    } catch {
      // Aynı mesaj iki kez gelirse benzersizlik kısıtı düşürür; bu bir hata
      // değil, Meta'nın yeniden denemesidir. 200 dönmezsek sonsuza kadar
      // yeniden dener ve kuyruk tıkanır.
      atlanan += 1;
    }
  }

  return json({ ok: true, yeniAday, eklenen, atlanan, otomatik });
}
