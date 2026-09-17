import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Veri istemcisi ve oturum saklama.
 *
 * Veriye kendi sunucumuzdaki PostgREST üzerinden gidiliyor; web paneliyle
 * aynı yol, aynı RLS politikaları.
 *
 * Oturum belirteci cihazda AsyncStorage yerine SecureStore'da tutulur:
 * AsyncStorage düz metin bir dosyadır ve köklenmiş/jailbreak bir cihazda
 * ya da yedek dökümünde okunabilir. SecureStore iOS'ta Keychain, Android'de
 * EncryptedSharedPreferences kullanır.
 *
 * Web (Expo web) tarafında SecureStore yoktur; orada AsyncStorage'a düşülür.
 * Bu yalnızca geliştirme ve ekran görüntüsü içindir, yayınlanan mobil
 * uygulama her zaman güvenli depoyu kullanır.
 */

/** SecureStore anahtarları yalnızca harf, rakam, ".", "-" ve "_" kabul eder. */
const guvenliAd = (anahtar: string) => anahtar.replace(/[^A-Za-z0-9._-]/g, '_');

/** SecureStore tek değerde 2 KB sınırı koyar; belirteç daha uzun olabilir. */
const PARCA_BOYU = 1800;

const guvenliDepo = {
  async getItem(anahtar: string): Promise<string | null> {
    const ad = guvenliAd(anahtar);
    const bas = await SecureStore.getItemAsync(ad);
    if (bas === null) return null;
    if (!bas.startsWith('__parcali__')) return bas;

    const adet = Number(bas.slice('__parcali__'.length));
    const parcalar: string[] = [];
    for (let i = 0; i < adet; i += 1) {
      const p = await SecureStore.getItemAsync(`${ad}__${i}`);
      if (p === null) return null;
      parcalar.push(p);
    }
    return parcalar.join('');
  },

  async setItem(anahtar: string, deger: string): Promise<void> {
    const ad = guvenliAd(anahtar);
    if (deger.length <= PARCA_BOYU) {
      await SecureStore.setItemAsync(ad, deger);
      return;
    }
    const adet = Math.ceil(deger.length / PARCA_BOYU);
    for (let i = 0; i < adet; i += 1) {
      await SecureStore.setItemAsync(`${ad}__${i}`, deger.slice(i * PARCA_BOYU, (i + 1) * PARCA_BOYU));
    }
    await SecureStore.setItemAsync(ad, `__parcali__${adet}`);
  },

  async removeItem(anahtar: string): Promise<void> {
    const ad = guvenliAd(anahtar);
    const bas = await SecureStore.getItemAsync(ad);
    if (bas?.startsWith('__parcali__')) {
      const adet = Number(bas.slice('__parcali__'.length));
      for (let i = 0; i < adet; i += 1) await SecureStore.deleteItemAsync(`${ad}__${i}`);
    }
    await SecureStore.deleteItemAsync(ad);
  },
};

const depo = Platform.OS === 'web' ? AsyncStorage : guvenliDepo;

const ekstra = (Constants.expoConfig?.extra ?? {}) as {
  apiKok?: string;
};

/**
 * Değerler üç yerden gelebilir: ortam değişkeni, app.json'daki `extra` ve
 * varsayılan. Hepsi metne indirgenir: app.json'da `null` yazınca
 * createClient "trim is not a function" ile patlıyordu.
 */
function metin(...adaylar: unknown[]): string {
  for (const a of adaylar) if (typeof a === 'string' && a.trim()) return a.trim();
  return '';
}

/** Sunucu kökü: hem /api/* uçları hem de /veri (PostgREST) buradan geçer. */
/*
  VARSAYILAN ADRES YAYINDAKİ DAĞITIM.

  Önce `https://sahratakip.com` yazılıydı; sistem orada değil, Vercel
  dağıtımında çalışıyor. Bu hâliyle derlenen bir APK hiçbir veriye
  ulaşamaz, kullanıcı da sebebini göremez -- uygulama sessizce tanıtım
  verisine düşer. Kendi alan adınıza geçtiğinizde burayı (ya da
  `EXPO_PUBLIC_API_KOK` değişkenini) güncelleyin.
*/
export const API_KOK = metin(
  process.env.EXPO_PUBLIC_API_KOK, ekstra.apiKok, 'https://sahratakip.vercel.app',
);

/**
 * Yapılandırma yoksa uygulama tanıtım verisiyle açılır, çökmez.
 * Adres yalnızca https olabilir: düz metin bağlantı üzerinden oturum
 * belirteci taşımak, belirtecin ağda okunabilmesi demektir.
 */
export const yapilandirildi = API_KOK.startsWith('https://');

/* ------------------------------------------------------------ oturum */

const ERISIM = 'sahra-erisim-jetonu';
const YENILEME = 'sahra-yenileme-jetonu';
const BITIS = 'sahra-jeton-bitis';

/** Jeton bu kadar kalanla yenilenir; son saniyeye bırakılırsa istek yolda ölür. */
const ERKEN_YENILE_SANIYE = 120;

export interface Oturum {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

let erisimOnbellek: string | null = null;

export async function oturumuKaydet(oturum: Oturum): Promise<void> {
  erisimOnbellek = oturum.accessToken;
  await depo.setItem(ERISIM, oturum.accessToken);
  await depo.setItem(YENILEME, oturum.refreshToken);
  await depo.setItem(BITIS, String(Date.now() + oturum.expiresIn * 1000));
}

export async function oturumuTemizle(): Promise<void> {
  erisimOnbellek = null;
  await depo.removeItem(ERISIM);
  await depo.removeItem(YENILEME);
  await depo.removeItem(BITIS);
}

export async function oturumVarMi(): Promise<boolean> {
  return Boolean(await depo.getItem(YENILEME));
}

/**
 * Geçerli erişim jetonu; gerekiyorsa yeniler.
 *
 * Aynı anda birden çok istek yenilemeyi tetiklerse tek çağrı yapılır:
 * dönüşümlü yenileme yüzünden ikinci çağrı reddedilir ve kullanıcı
 * sebepsiz yere dışarı atılırdı.
 */
let bekleyen: Promise<string | null> | null = null;

export async function gecerliJeton(): Promise<string | null> {
  const yenileme = await depo.getItem(YENILEME);
  if (!yenileme) return null;

  const bitis = Number(await depo.getItem(BITIS));
  const tazelemeGerek = !Number.isFinite(bitis) || bitis === 0
    || Date.now() >= bitis - ERKEN_YENILE_SANIYE * 1000;

  if (!tazelemeGerek) {
    erisimOnbellek = erisimOnbellek ?? (await depo.getItem(ERISIM));
    return erisimOnbellek;
  }
  if (bekleyen) return bekleyen;

  bekleyen = (async () => {
    try {
      const yanit = await fetch(`${API_KOK}/api/oturum`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: yenileme }),
      });
      if (!yanit.ok) {
        await oturumuTemizle();
        return null;
      }
      const yeni = (await yanit.json()) as Oturum;
      await oturumuKaydet(yeni);
      return yeni.accessToken;
    } catch {
      // Ağ hatası oturumu SİLMEZ: geçici kopukluk kullanıcıyı dışarı atmamalı.
      return depo.getItem(ERISIM);
    } finally {
      bekleyen = null;
    }
  })();

  return bekleyen;
}

/** Sunucudaki oturumu da kapatır. */
export async function cikisYap(): Promise<void> {
  const yenileme = await depo.getItem(YENILEME);
  await oturumuTemizle();
  if (!yenileme) return;
  try {
    await fetch(`${API_KOK}/api/oturum`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: yenileme }),
    });
  } catch {
    // Yerel kayıt silindi; sunucudaki satır süresi dolunca düşer.
  }
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * base64url -> metin.
 *
 * `Buffer` KULLANILMIYOR. `Buffer` bir Node.js API'si; Hermes'te (yani
 * yayınlanan uygulamada) tanımlı değil ve ona dokunmak `ReferenceError`
 * fırlatıyor. Bu hata `kullaniciId` içindeki `catch` tarafından
 * yutulduğu için fonksiyon sessizce `null` dönüyordu: giriş başarılı
 * oluyor, ardından profil hiç okunmadan "Hesabınıza ait profil
 * bulunamadı." hatası veriliyordu. Uygulamaya hiç girilemiyordu.
 *
 * Node'da (testte, geliştirmede) `Buffer` VAR olduğu için bu hata
 * yalnızca gerçek cihazda görünüyordu -- en zor fark edilen tür.
 *
 * `atob` da tercih edilmedi: Hermes sürümlerine göre var/yok değişiyor
 * ve UTF-8'i kendi başına çözmüyor. Aşağısı saf JavaScript, her yerde
 * aynı çalışıyor.
 */
function base64UrlCoz(girdi: string): string {
  /*
    BOZUK GİRDİ ONARILMIYOR, REDDEDİLİYOR. Önce alfabe dışı karakterler
    siliniyordu; bu, gövdesine çöp eklenmiş bir jetonu sessizce geçerli
    saymak demekti (sonuna "!" konmuş jeton aynı `sub`'ı döndürüyordu).
    Jeton gövdesi RFC 4648 base64url alfabesinde ve 4'e bölümünden kalanı
    1 olmayan uzunlukta olmak zorunda. `kullaniciId` bu hatayı yakalayıp
    `null` dönüyor.
  */
  if (!/^[A-Za-z0-9_-]*$/.test(girdi) || girdi.length % 4 === 1) {
    throw new Error('Geçersiz base64url');
  }
  const temiz = girdi.replace(/-/g, '+').replace(/_/g, '/');
  const baytlar: number[] = [];
  for (let i = 0; i < temiz.length; i += 4) {
    const d = [0, 1, 2, 3].map((k) => B64.indexOf(temiz[i + k] ?? 'A'));
    const parca = (d[0] << 18) | (d[1] << 12) | (d[2] << 6) | d[3];
    baytlar.push((parca >> 16) & 0xff);
    if (temiz[i + 2] !== undefined) baytlar.push((parca >> 8) & 0xff);
    if (temiz[i + 3] !== undefined) baytlar.push(parca & 0xff);
  }

  /*
    Baytlar UTF-8; jetonda Türkçe harf geçebilir (ad, e-posta).

    ÇÖZÜCÜ KATI. Önce devam baytları hiç denetlenmiyor, eksik baytlar
    sıfır sayılıyordu: E2 28 A1 gibi bozuk bir dizi hata vermek yerine
    düzgün görünen bir harfe dönüşüyordu. Böyle bir gövde `JSON.parse`'ı
    da geçebiliyor ve `kullaniciId` bozuk jeton için kimlik döndürüyor,
    `oturum.tsx` de o kimlikle profil okumaya gidiyordu. Aşağısı
    WHATWG'nin UTF-8 kurallarını uyguluyor: eksik/fazla devam baytı,
    gereğinden uzun kodlama, vekil (surrogate) kod noktası ve
    U+10FFFF üstü değer -- hepsi hata.
  */
  let cikti = '';
  for (let i = 0; i < baytlar.length;) {
    const b = baytlar[i];
    let kod: number;
    let uzunluk: number;
    let enAz: number;
    if (b < 0x80) { kod = b; uzunluk = 1; enAz = 0x00; }
    else if ((b & 0xe0) === 0xc0) { kod = b & 0x1f; uzunluk = 2; enAz = 0x80; }
    else if ((b & 0xf0) === 0xe0) { kod = b & 0x0f; uzunluk = 3; enAz = 0x800; }
    else if ((b & 0xf8) === 0xf0) { kod = b & 0x07; uzunluk = 4; enAz = 0x10000; }
    else throw new Error('Geçersiz UTF-8 baş baytı');

    if (i + uzunluk > baytlar.length) throw new Error('UTF-8 dizisi yarım');
    for (let k = 1; k < uzunluk; k += 1) {
      const devam = baytlar[i + k];
      if ((devam & 0xc0) !== 0x80) throw new Error('Geçersiz UTF-8 devam baytı');
      kod = (kod << 6) | (devam & 0x3f);
    }
    // Gereğinden uzun kodlama: aynı harfin daha kısa yazımı varken uzunu.
    if (kod < enAz) throw new Error('Gereğinden uzun UTF-8 kodlaması');
    if (kod >= 0xd800 && kod <= 0xdfff) throw new Error('Vekil kod noktası');
    if (kod > 0x10ffff) throw new Error('Unicode aralığı dışında');

    cikti += String.fromCodePoint(kod);
    i += uzunluk;
  }
  return cikti;
}

/** Oturumdaki kullanıcının kimliği; jeton gövdesinden okunur. */
export function kullaniciId(jeton: string | null): string | null {
  if (!jeton) return null;
  const parcalar = jeton.split('.');
  if (parcalar.length !== 3) return null;
  try {
    const govde = JSON.parse(base64UrlCoz(parcalar[1])) as { sub?: string };
    return govde.sub ?? null;
  } catch {
    return null;
  }
}
