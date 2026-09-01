/**
 * İYS (İleti Yönetim Sistemi) senkronizasyonu.
 *
 * İki yönlü çalışır:
 *   push — sistemde alınmış yeni onayları İYS'ye aktarır
 *          (mevzuat: yeni onaylar 3 iş günü içinde aktarılmalıdır)
 *   pull — İYS'de verilen ret kayıtlarını sisteme çeker
 *          (mevzuat: ret en geç 3 iş günü içinde uygulanmalıdır)
 *
 * Gerekli ortam değişkenleri:
 *   IYS_BASE_URL     Varsayılan: https://api.iys.org.tr
 *   IYS_USERNAME     İYS entegrasyon kullanıcı adı
 *   IYS_PASSWORD     İYS entegrasyon şifresi
 *   IYS_CODE         Hizmet sağlayıcı İYS kodu
 *   IYS_BRAND_CODE   Marka kodu
 *
 * NOT: Uç nokta adresleri ve alan adları İYS entegrasyon dokümanınıza göre
 * doğrulanmalıdır. Bazı firmalar İYS'ye doğrudan değil, SMS sağlayıcıları
 * (ör. Netgsm) üzerinden bağlanır; o durumda bu dosya devre dışı bırakılıp
 * onay aktarımı sağlayıcı panelinden yapılır.
 */
import { isAuthorizedCron, isDbConfigured, patchRows, selectRows } from './_db';
import { json } from './_guard';

const BASE = process.env.IYS_BASE_URL ?? 'https://api.iys.org.tr';
const USERNAME = process.env.IYS_USERNAME;
const PASSWORD = process.env.IYS_PASSWORD;
const IYS_CODE = process.env.IYS_CODE;
const BRAND_CODE = process.env.IYS_BRAND_CODE;

export function isIysConfigured(): boolean {
  return Boolean(USERNAME && PASSWORD && IYS_CODE && BRAND_CODE);
}

interface ConsentRow {
  id: string;
  business_id: string;
  phone: string;
  status: 'ONAY' | 'RET';
  source: string;
  consent_date: string;
}

/** OAuth erişim jetonu alır. */
async function getToken(): Promise<string> {
  const response = await fetch(`${BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD, grant_type: 'password' }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`İYS kimlik doğrulaması başarısız (${response.status})`);
  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('İYS jetonu alınamadı.');
  return data.access_token;
}

/** Telefonu İYS biçimine çevirir: 5321234567 -> +905321234567 */
function toIysRecipient(phone: string): string {
  return `+90${phone}`;
}

/** Bekleyen onayları İYS'ye aktarır. */
async function pushConsents(token: string): Promise<{ pushed: number; failed: number }> {
  const pending = await selectRows<ConsentRow>(
    'sms_consents?iys_synced_at=is.null&select=id,business_id,phone,status,source,consent_date&limit=100',
  );

  let pushed = 0;
  let failed = 0;

  for (const row of pending) {
    try {
      const response = await fetch(`${BASE}/sps/${IYS_CODE}/brands/${BRAND_CODE}/consents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          consentDate: row.consent_date.slice(0, 19).replace('T', ' '),
          source: row.source,
          recipient: toIysRecipient(row.phone),
          recipientType: 'BIREYSEL',
          status: row.status,
          type: 'MESAJ',
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (response.ok) {
        await patchRows(`sms_consents?id=eq.${row.id}`, {
          iys_synced_at: new Date().toISOString(), iys_error: null,
        });
        pushed += 1;
      } else {
        await patchRows(`sms_consents?id=eq.${row.id}`, {
          iys_error: `İYS reddetti (${response.status}): ${(await response.text()).slice(0, 300)}`,
        });
        failed += 1;
      }
    } catch (error) {
      await patchRows(`sms_consents?id=eq.${row.id}`, { iys_error: String(error).slice(0, 300) });
      failed += 1;
    }
  }

  return { pushed, failed };
}

/**
 * İYS'de yapılan değişiklikleri (özellikle ret) çeker ve yerel kayda işler.
 * Ret kaydı, ticari ileti gönderimini anında engeller.
 */
async function pullChanges(token: string): Promise<{ applied: number }> {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const response = await fetch(
    `${BASE}/sps/${IYS_CODE}/brands/${BRAND_CODE}/consents/changes?source=IYS&after=${since}&limit=1000`,
    { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) },
  );
  if (!response.ok) throw new Error(`İYS değişiklikleri alınamadı (${response.status})`);

  const data = (await response.json()) as {
    list?: { recipient: string; status: 'ONAY' | 'RET'; consentDate: string; source: string }[];
  };
  const changes = data.list ?? [];
  let applied = 0;

  for (const change of changes) {
    const phone = change.recipient.replace(/\D/g, '').replace(/^90/, '');
    if (!/^5\d{9}$/.test(phone)) continue;

    // İYS'de kayıtlı her işletme için durumu güncelle
    const existing = await selectRows<{ id: string; business_id: string }>(
      `sms_consents?phone=eq.${phone}&select=id,business_id`,
    );
    for (const row of existing) {
      await patchRows(`sms_consents?id=eq.${row.id}`, {
        status: change.status,
        source: change.source,
        iys_synced_at: new Date().toISOString(),
      });
      applied += 1;
    }
  }

  return { applied };
}

export default async function handler(request: Request): Promise<Response> {
  if (!isAuthorizedCron(request)) return json({ error: 'Yetkisiz.' }, 401);
  if (!isDbConfigured()) return json({ error: 'Veritabanı yapılandırması eksik.' }, 500);
  if (!isIysConfigured()) return json({ synced: false, reason: 'iys_not_configured' });

  try {
    const token = await getToken();
    const push = await pushConsents(token);
    const pull = await pullChanges(token);
    return json({ synced: true, ...push, ...pull });
  } catch (error) {
    return json({ synced: false, error: String(error).slice(0, 300) }, 502);
  }
}
