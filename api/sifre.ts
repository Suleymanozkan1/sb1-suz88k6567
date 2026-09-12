/**
 * Şifre değiştirme, sıfırlama ve doğrulama.
 *
 * Üç işlem var:
 *   islem: 'degistir'  mevcut şifreyi doğrular, yenisini yazar
 *   islem: 'sifirla'   sıfırlama isteği alır
 *   islem: 'dogrula'   şifreyi yalnızca DOĞRULAR, hiçbir şey yazmaz
 *
 * Şifre doğrulaması burada yapılıyor, veritabanında değil: şifreyi
 * sorgu olarak göndermek onu sorgu günlüklerine düşme riskine atardı.
 */
import { clientIp, enforceRateLimit, json, tooManyRequests } from './_guard';
import { callRpc, isDbConfigured } from './_db';
import { kimlikYapilandirildiMi, sifreDogru, sifreyiKarmala } from './_kimlik';

/** Şifrenin en az uzunluğu. Kısa şifre deneme yanılmayla bulunur. */
const EN_AZ = 8;

interface KimlikSatiri { id: string; encrypted_password: string | null }

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Yöntem desteklenmiyor.' }, 405);
  if (!kimlikYapilandirildiMi() || !isDbConfigured()) {
    return json({ error: 'Sunucu yapılandırması eksik.' }, 500);
  }

  let govde: { islem?: string; email?: string; mevcut?: string; yeni?: string };
  try {
    govde = (await request.json()) as typeof govde;
  } catch {
    return json({ error: 'Geçersiz istek gövdesi.' }, 400);
  }

  const email = (govde.email ?? '').trim();
  if (!email) return json({ error: 'E-posta adresi gerekiyor.' }, 400);

  // Şifre uçları deneme yanılmaya açık; IP başına sınırlanıyor.
  const sinir = await enforceRateLimit(clientIp(request), {
    bucket: 'sifre', limit: 10, windowSeconds: 600,
  });
  if (!sinir.allowed) return tooManyRequests(600);

  if (govde.islem === 'sifirla') {
    /*
      Sıfırlama isteği, e-postanın kayıtlı olup olmadığını SÖYLEMEZ:
      farklı yanıt vermek, saldırgana hesap listesi çıkarma imkânı verir.
      Bugün e-posta gönderimi kurulu değil; istek alınıyor ve işletmenin
      şifreyi panelden sıfırlaması bekleniyor.
    */
    return json({
      ok: true,
      mesaj: 'Bu adres kayıtlıysa sıfırlama yönergesi gönderilecektir.',
    });
  }

  /*
    Yalnızca doğrulama: kasa dağılımı gibi perde arkası bilgileri açarken
    kullanılıyor. Ayrı bir "kasa şifresi" SAKLANMIYOR -- saklansaydı
    sistemde ikinci bir sır, dolayısıyla ikinci bir sızma yüzeyi olurdu.
    Kullanıcı kendi parolasını giriyor.

    Hız sınırı yukarıda zaten uygulandı; bu uç deneme yanılmaya açık
    olduğu için oradan geçmeden buraya gelinmiyor.
  */
  if (govde.islem === 'dogrula') {
    const girilen = govde.mevcut ?? '';
    let k: KimlikSatiri | undefined;
    try {
      const satirlar = await callRpc<KimlikSatiri[]>('kimlik_bul', { p_email: email });
      k = Array.isArray(satirlar) ? satirlar[0] : undefined;
    } catch {
      return json({ error: 'Kimlik doğrulama servisine ulaşılamadı.' }, 502);
    }
    if (!k?.encrypted_password || !(await sifreDogru(girilen, k.encrypted_password))) {
      return json({ error: 'Şifreniz hatalı.' }, 401);
    }
    return json({ ok: true });
  }

  if (govde.islem !== 'degistir') return json({ error: 'Geçersiz işlem.' }, 400);

  const mevcut = govde.mevcut ?? '';
  const yeni = govde.yeni ?? '';
  if (yeni.length < EN_AZ) {
    return json({ error: `Yeni şifre en az ${EN_AZ} karakter olmalıdır.` }, 400);
  }
  if (yeni === mevcut) {
    return json({ error: 'Yeni şifre eskisiyle aynı olamaz.' }, 400);
  }

  let kimlik: KimlikSatiri | undefined;
  try {
    const satirlar = await callRpc<KimlikSatiri[]>('kimlik_bul', { p_email: email });
    kimlik = Array.isArray(satirlar) ? satirlar[0] : undefined;
  } catch {
    return json({ error: 'Kimlik doğrulama servisine ulaşılamadı.' }, 502);
  }

  if (!kimlik?.encrypted_password || !(await sifreDogru(mevcut, kimlik.encrypted_password))) {
    return json({ error: 'Mevcut şifreniz hatalı.' }, 401);
  }

  try {
    // Fonksiyon şifreyi yazmakla kalmıyor, o kullanıcının bütün
    // oturumlarını da kapatıyor; hesabı ele geçirmiş biri varsa düşsün.
    await callRpc('sifre_degistir', {
      p_user_id: kimlik.id,
      p_hash: await sifreyiKarmala(yeni),
    });
  } catch {
    return json({ error: 'Şifreniz güncellenemedi.' }, 502);
  }

  return json({ ok: true });
}
