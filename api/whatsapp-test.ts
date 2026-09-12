/**
 * Mock mod: Meta'ya bağlanmadan test mesajı besler.
 *
 * Gerçek API bilgileri girilmeden önce sistemin çalıştığını görebilmek
 * için. Panelden bir WhatsApp mesajı yapıştırılıyor, mesaj GERÇEK
 * webhook'un kullandığı boru hattının aynısından geçiyor: aynı
 * çözümleyici, aynı "aynı numara ikinci kayıt açmaz" kuralı, aynı
 * geçmiş kaydı. Ayrı bir taklit akış yazılsaydı burada çalışan şeyin
 * üretimde de çalışacağının garantisi olmazdı.
 *
 * Üç kapı birden geçilmeden hiçbir şey yazılmıyor:
 *   1. WHATSAPP_MOCK_MODE=true olmalı. Üretimde kapalıdır.
 *   2. Çağıran, geçerli erişim jetonu taşımalı (oturum açmış olmalı).
 *   3. Kullanıcı, mesajı yazdığı işletmenin sahibi/personeli olmalı.
 *
 * Üçüncüsü şart: yalnızca ortam değişkenine bakan bir uç nokta,
 * yanlışlıkla açık bırakıldığında herkesin herhangi bir işletmeye kayıt
 * açabildiği bir kapı olurdu.
 *
 * Gerçek webhook'un imza doğrulaması bundan ETKİLENMEZ; mock mod açık
 * diye imzasız bildirim kabul edilmiyor.
 */
import { insertRow, isDbConfigured, selectRows } from './_db';
import { enforceRateLimit, json, tooManyRequests } from './_guard';
import { jetonuCoz, kimlikYapilandirildiMi } from './_kimlik';
import { isMockMode, mesajiIsle } from './whatsapp';

interface Govde {
  businessId?: string;
  /** Müşterinin yazdığı metin. */
  text?: string;
  /** Gönderen numara. Boşsa metinden çözülene düşülür. */
  from?: string;
}

/** İstek sahibinin kullanıcı kimliği; jeton geçersizse boş. */
function kullaniciId(request: Request): string {
  const baslik = request.headers.get('authorization') ?? '';
  const jeton = baslik.startsWith('Bearer ') ? baslik.slice(7).trim() : '';
  if (!jeton) return '';
  return jetonuCoz(jeton)?.sub ?? '';
}

/** Kullanıcı bu işletmeye erişebiliyor mu? */
async function isletmeyeErisebilir(kullanici: string, businessId: string): Promise<boolean> {
  const satirlar = await selectRows<{ id: string }>(
    `profiles?id=eq.${encodeURIComponent(kullanici)}`
    + `&business_id=eq.${encodeURIComponent(businessId)}&select=id&limit=1`,
  );
  return satirlar.length > 0;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Yöntem desteklenmiyor.' }, 405);
  }
  if (!isMockMode()) {
    return json({ error: 'Test modu kapalı. WHATSAPP_MOCK_MODE=true yapın.' }, 403);
  }
  if (!kimlikYapilandirildiMi() || !isDbConfigured()) {
    return json({ error: 'Sunucu yapılandırması eksik.' }, 503);
  }

  const kullanici = kullaniciId(request);
  if (!kullanici) return json({ error: 'Oturum gerekli.' }, 401);

  // Test uç noktası da sınırsız değil: elle yapıştırılan bir mesaj için
  // dakikada 20 fazlasıyla yeter, otomatik bir döngüyü ise keser.
  const sinir = await enforceRateLimit(`test:${kullanici}`, {
    bucket: 'whatsapp_test', limit: 20, windowSeconds: 60,
  });
  if (!sinir.allowed) return tooManyRequests(60);

  let govde: Govde;
  try {
    govde = (await request.json()) as Govde;
  } catch {
    return json({ error: 'Gövde okunamadı.' }, 400);
  }

  const businessId = (govde.businessId ?? '').trim();
  const metin = (govde.text ?? '').trim();
  if (!businessId) return json({ error: 'İşletme seçilmedi.' }, 400);
  if (!metin) return json({ error: 'Mesaj metni boş.' }, 400);

  if (!(await isletmeyeErisebilir(kullanici, businessId))) {
    return json({ error: 'Bu işletmeye erişiminiz yok.' }, 403);
  }

  /*
    Mesaj kimliği "test-" ile başlıyor. Gerçek Meta kimlikleriyle
    karışmasın diye: geçmişe bakan biri hangi satırın denemeden geldiğini
    görebilmeli. Zaman damgası da benzersizliği sağlıyor, aynı metin iki
    kez yapıştırılabilsin.
  */
  const mesajId = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const kayit = await mesajiIsle(businessId, {
      id: mesajId,
      from: (govde.from ?? '').trim() || undefined,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: 'text',
      text: { body: metin },
    });

    // Mock modda otomatik cevap GÖNDERİLMİYOR: test amacıyla yazılan bir
    // mesaj yüzünden gerçek bir numaraya WhatsApp mesajı gitmemeli.
    await insertRow('customer_lead_messages', {
      business_id: businessId,
      lead_id: kayit.leadId,
      direction: 'olay',
      channel: 'sistem',
      body: 'Bu kayıt test modunda elle girilen bir WhatsApp mesajından oluşturuldu.',
      created_at: kayit.zaman,
    });

    return json({ ok: true, leadId: kayit.leadId, sonuc: kayit.sonuc });
  } catch (err) {
    return json({ error: (err as Error).message || 'Mesaj işlenemedi.' }, 500);
  }
}
