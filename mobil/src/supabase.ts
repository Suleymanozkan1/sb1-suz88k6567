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
export const API_KOK = metin(process.env.EXPO_PUBLIC_API_KOK, ekstra.apiKok, 'https://sahratakip.com');

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

/** Oturumdaki kullanıcının kimliği; jeton gövdesinden okunur. */
export function kullaniciId(jeton: string | null): string | null {
  if (!jeton) return null;
  const parcalar = jeton.split('.');
  if (parcalar.length !== 3) return null;
  try {
    const govde = JSON.parse(
      Buffer.from(parcalar[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    ) as { sub?: string };
    return govde.sub ?? null;
  } catch {
    return null;
  }
}
