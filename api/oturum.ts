/**
 * Oturum yenileme ve çıkış.
 *
 * Giriş `/api/login` üzerinden yapılır; bu uç nokta oturumun devamını
 * yönetir:
 *   POST   yenileme jetonunu tazeler, yeni erişim jetonu verir
 *   DELETE oturumu kapatır
 *
 * Erişim jetonu kısa ömürlü ve iptal edilemez; asıl denetim burada.
 * "Çıkış yap" gerçekten çıkış olmalı, jetonun kendiliğinden ölmesini
 * beklemek değil -- bu yüzden yenileme jetonu veritabanından silinir.
 */
import { json } from './_guard';
import { callRpc, isDbConfigured } from './_db';
import {
  ERISIM_OMRU_SANIYE, YENILEME_OMRU_GUN, erisimJetonuUret,
  kimlikYapilandirildiMi, yenilemeJetonuUret, yenilemeKarmasi,
} from './_kimlik';

async function govdedenJeton(request: Request): Promise<string> {
  try {
    const govde = (await request.json()) as { refreshToken?: string };
    return (govde.refreshToken ?? '').trim();
  } catch {
    return '';
  }
}

export default async function handler(request: Request): Promise<Response> {
  if (!kimlikYapilandirildiMi() || !isDbConfigured()) {
    return json({ error: 'Sunucu yapılandırması eksik.' }, 500);
  }

  if (request.method === 'DELETE') {
    const jeton = await govdedenJeton(request);
    // Jeton yoksa da başarı dönülüyor: çıkmak isteyen kullanıcı
    // "çıkamadınız" hatasıyla karşılaşmamalı.
    if (jeton) {
      try {
        await callRpc('oturum_kapat', { p_token_hash: yenilemeKarmasi(jeton) });
      } catch {
        return json({ error: 'Oturum kapatılamadı.' }, 502);
      }
    }
    return json({ ok: true });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Yöntem desteklenmiyor.' }, 405);
  }

  const jeton = await govdedenJeton(request);
  if (!jeton) return json({ error: 'Yenileme jetonu gerekiyor.' }, 400);

  /*
    Dönüşümlü yenileme: eski jeton bu çağrıyla tükeniyor. Çalınan bir
    jeton ikinci kez kullanılamaz; meşru kullanıcı bir sonraki
    yenilemede reddedilince hırsızlık fark edilir.
  */
  const yeni = yenilemeJetonuUret();
  const biter = new Date(Date.now() + YENILEME_OMRU_GUN * 24 * 60 * 60 * 1000);

  let kullaniciId: string | null;
  try {
    kullaniciId = await callRpc<string | null>('oturum_yenile', {
      p_token_hash: yenilemeKarmasi(jeton),
      p_yeni_hash: yenilemeKarmasi(yeni),
      p_expires: biter.toISOString(),
    });
  } catch {
    return json({ error: 'Oturum yenilenemedi.' }, 502);
  }

  // Süresi dolmuş ya da tükenmiş jeton: yeniden giriş gerekiyor.
  if (!kullaniciId) return json({ error: 'Oturumunuzun süresi doldu.' }, 401);

  return json({
    accessToken: erisimJetonuUret(kullaniciId),
    refreshToken: yeni,
    expiresIn: ERISIM_OMRU_SANIYE,
  });
}
