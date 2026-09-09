import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Güvenlik denetimleri.
 *
 * Mobil uygulama mağazadan indirilen bir paket; içindeki her şey
 * okunabilir. Bu testler, paketin içine girmemesi gereken şeylerin
 * girmediğini ve oturum belirtecinin doğru yerde saklandığını doğrular.
 */

const KOK = path.resolve(__dirname, '..');

function kaynakDosyalari(dizin: string, toplanan: string[] = []): string[] {
  for (const ad of readdirSync(dizin)) {
    if (ad === 'node_modules' || ad === '.expo' || ad.startsWith('dist')) continue;
    const tam = path.join(dizin, ad);
    if (statSync(tam).isDirectory()) kaynakDosyalari(tam, toplanan);
    else if (/\.(ts|tsx|js|json)$/.test(ad)) toplanan.push(tam);
  }
  return toplanan;
}

/** Bu dosyanın kendisi yasak dizeleri listeliyor; taramadan çıkarılır. */
const DOSYALAR = kaynakDosyalari(KOK).filter((d) => !d.endsWith('guvenlik.test.ts'));

describe('sır sızıntısı', () => {
  it('kaynak ağacında sunucu sırrı bulunmuyor', () => {
    // Bunlar yalnızca sunucuda durur; istemciye girerlerse RLS'i atlayan
    // ya da sağlayıcı hesabını ele geçirmeye yarayan anahtarlar olurlar.
    const yasak = [
      'SUPABASE_SERVICE_ROLE_KEY', 'service_role', 'NETGSM_PASS', 'OTP_SECRET',
      'PARASUT_CLIENT_SECRET', 'PARASUT_PASSWORD', 'IYS_PASSWORD', 'CRON_SECRET',
    ];
    const bulunan: string[] = [];
    for (const d of DOSYALAR) {
      const icerik = readFileSync(d, 'utf-8');
      for (const y of yasak) if (icerik.includes(y)) bulunan.push(`${path.relative(KOK, d)}: ${y}`);
    }
    expect(bulunan).toEqual([]);
  });

  it('koda gömülü JWT ya da uzun anahtar yok', () => {
    const bulunan: string[] = [];
    for (const d of DOSYALAR) {
      const icerik = readFileSync(d, 'utf-8');
      // Supabase anahtarları eyJ ile başlayan bir JWT'dir.
      if (/eyJ[A-Za-z0-9_-]{20,}/.test(icerik)) bulunan.push(path.relative(KOK, d));
    }
    expect(bulunan).toEqual([]);
  });
});

describe('taşıma güvenliği', () => {
  it('kaynakta düz metin http adresi yok', () => {
    const bulunan: string[] = [];
    for (const d of DOSYALAR) {
      const icerik = readFileSync(d, 'utf-8');
      // Yerel geliştirme adresleri (127.0.0.1, localhost) hariç.
      const eslesme = icerik.match(/http:\/\/(?!localhost|127\.0\.0\.1)[\w.-]+/g);
      if (eslesme) bulunan.push(`${path.relative(KOK, d)}: ${eslesme.join(', ')}`);
    }
    expect(bulunan).toEqual([]);
  });

  it('uygulama yapılandırması düz metin trafiğe kapalı', () => {
    const app = JSON.parse(readFileSync(path.join(KOK, 'app.json'), 'utf-8')) as {
      expo: {
        android: { usesCleartextTraffic: boolean };
        ios: { infoPlist: { NSAllowsArbitraryLoads: boolean } };
      };
    };
    expect(app.expo.android.usesCleartextTraffic).toBe(false);
    expect(app.expo.ios.infoPlist.NSAllowsArbitraryLoads).toBe(false);
  });
});

describe('oturum saklama', () => {
  const kaynak = readFileSync(path.join(KOK, 'src/supabase.ts'), 'utf-8');

  it('mobilde belirteç SecureStore ile saklanır', () => {
    // AsyncStorage düz metin bir dosyadır; köklenmiş cihazda ya da yedek
    // dökümünde okunur. Belirteç oradan alınırsa oturum devralınabilir.
    expect(kaynak).toContain('expo-secure-store');
    expect(kaynak).toMatch(/Platform\.OS === 'web' \? AsyncStorage : guvenliDepo/);
  });

  it('yalnızca https adresli sunucu kabul edilir', () => {
    expect(kaynak).toContain("SUPABASE_URL.startsWith('https://')");
  });

  it('oturum adres çubuğundan okunmaz', () => {
    // detectSessionInUrl mobilde açık kalırsa, uygulamaya gelen bir derin
    // bağlantı içindeki belirteç oturum olarak kabul edilebilir.
    expect(kaynak).toContain('detectSessionInUrl: false');
  });
});

describe('giriş akışı', () => {
  const kaynak = readFileSync(path.join(KOK, 'src/oturum.tsx'), 'utf-8');

  it('giriş sunucu ucundan geçer, doğrudan Supabase\'e gitmez', () => {
    // Hesap kilidi ve hız sınırı /api/login içindedir. İstemci doğrudan
    // signInWithPassword çağırsaydı mobil uygulama bu korumaları atlayan
    // bir yan kapı olurdu.
    expect(kaynak).toContain('/api/login');
    expect(kaynak).not.toContain('signInWithPassword');
  });
});

/**
 * Derlenmiş paket taraması.
 *
 * Kaynak temiz olsa bile bir bağımlılık ya da yanlış bir ortam değişkeni
 * sırrı pakete taşıyabilir. Bu yüzden `npm run paket` ile üretilen iOS ve
 * Android paketleri de taranır. Paket yoksa test atlanır — CI'da
 * "npm run paket && npm test" sırasıyla çalıştırılmalı.
 */
const PAKET = path.join(KOK, 'dist-paket');
const paketVar = (() => { try { return statSync(PAKET).isDirectory(); } catch { return false; } })();

(paketVar ? describe : describe.skip)('derlenmiş paket', () => {
  function paketDosyalari(dizin: string, toplanan: string[] = []): string[] {
    for (const ad of readdirSync(dizin)) {
      const tam = path.join(dizin, ad);
      if (statSync(tam).isDirectory()) paketDosyalari(tam, toplanan);
      else if (ad.endsWith('.js')) toplanan.push(tam);
    }
    return toplanan;
  }

  it('iOS ve Android paketleri üretilmiş', () => {
    const dosyalar = paketDosyalari(PAKET);
    expect(dosyalar.some((d) => d.includes('/ios/'))).toBe(true);
    expect(dosyalar.some((d) => d.includes('/android/'))).toBe(true);
  });

  it('pakette sunucu sırrı yok', () => {
    const yasak = [
      'SUPABASE_SERVICE_ROLE_KEY', 'NETGSM_PASS', 'OTP_SECRET',
      'PARASUT_CLIENT_SECRET', 'PARASUT_PASSWORD', 'IYS_PASSWORD', 'CRON_SECRET',
    ];
    const bulunan: string[] = [];
    for (const d of paketDosyalari(PAKET)) {
      const icerik = readFileSync(d, 'utf-8');
      for (const y of yasak) if (icerik.includes(y)) bulunan.push(`${path.basename(d)}: ${y}`);
    }
    expect(bulunan).toEqual([]);
  });
});
