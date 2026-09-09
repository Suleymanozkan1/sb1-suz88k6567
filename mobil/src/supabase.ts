import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Supabase istemcisi ve oturum saklama.
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
  supabaseUrl?: string | null;
  supabaseAnonKey?: string | null;
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

export const SUPABASE_URL = metin(process.env.EXPO_PUBLIC_SUPABASE_URL, ekstra.supabaseUrl);
export const SUPABASE_ANON = metin(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, ekstra.supabaseAnonKey);
/** Sunucu uçları (giriş kilidi, SMS) web ile aynı kökten geçer. */
export const API_KOK = metin(process.env.EXPO_PUBLIC_API_KOK, ekstra.apiKok, 'https://sahratakip.com');

/**
 * Yapılandırma yoksa uygulama tanıtım verisiyle açılır, çökmez.
 * Adres yalnızca https olabilir: düz metin bağlantı üzerinden oturum
 * belirteci taşımak, belirtecin ağda okunabilmesi demektir.
 */
export const yapilandirildi = Boolean(
  SUPABASE_URL.startsWith('https://') && SUPABASE_ANON,
);

export const supabase: SupabaseClient | null = yapilandirildi
  ? createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: {
        storage: depo,
        autoRefreshToken: true,
        persistSession: true,
        // Mobilde adres çubuğu yok; oturum bağlantıdan okunmaz.
        detectSessionInUrl: false,
      },
    })
  : null;
