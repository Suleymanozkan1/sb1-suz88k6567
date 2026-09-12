import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  API_KOK, cikisYap as oturumuKapat, gecerliJeton, kullaniciId,
  oturumVarMi, oturumuKaydet, yapilandirildi, type Oturum,
} from './supabase';

/**
 * Oturum yönetimi.
 *
 * Giriş doğrudan Supabase'e değil, web ile aynı `/api/login` ucuna gider.
 * Sebep: art arda hatalı denemede hesabı kilitleyen ve hız sınırını uygulayan
 * mantık orada. İstemci doğrudan Supabase'e gitseydi mobil uygulama bu
 * korumaları atlayan bir yan kapı olurdu.
 *
 * Uç nokta ulaşılamazsa (kurulum yapılmamış) girişe izin verilmez; sessizce
 * daha zayıf bir yola düşmek, korumayı kapatmakla aynı şey olurdu.
 *
 * Tanıtım kipinde oturum yalnızca bellekte tutuluyordu ve uygulama her
 * yeniden yüklendiğinde giriş ekranına düşüyordu. Gerçek oturum yeniden
 * yüklemeye dayandığı için tanıtım oturumu da dayanmalı; bir işaret
 * AsyncStorage'a yazılıyor. Bu bir kimlik belirteci değil, yalnızca
 * "tanıtımda giriş yapılmıştı" bilgisi: güvenlik değeri taşımaz.
 */
const TANITIM_ANAHTARI = 'sahratakip.tanitim.oturum';

interface Kullanici {
  id: string;
  eposta: string;
  ad: string;
  rol: string;
}

interface OturumDurumu {
  kullanici: Kullanici | null;
  yukleniyor: boolean;
  tanitimModu: boolean;
  girisYap: (eposta: string, sifre: string) => Promise<void>;
  cikisYap: () => Promise<void>;
}

const Baglam = createContext<OturumDurumu | null>(null);

const TANITIM_KULLANICI: Kullanici = {
  id: 'tanitim', eposta: 'demo@sahratakip.com', ad: 'Demo Kullanıcı', rol: 'Yönetici',
};

export function OturumSaglayici({ children }: { children: ReactNode }) {
  const [kullanici, setKullanici] = useState<Kullanici | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);

  useEffect(() => {
    if (!yapilandirildi) {
      let iptalTanitim = false;
      void AsyncStorage.getItem(TANITIM_ANAHTARI)
        .then((deger) => {
          if (iptalTanitim) return;
          if (deger === 'acik') setKullanici(TANITIM_KULLANICI);
        })
        .catch(() => { /* depo okunamazsa giriş ekranıyla başlanır */ })
        .finally(() => { if (!iptalTanitim) setYukleniyor(false); });
      return () => { iptalTanitim = true; };
    }
    let iptal = false;

    /*
      Uygulama açılışında saklı oturum varsa kurtarılır. Profil
      bilgisi jetondan değil veritabanından okunuyor: ad ve rol
      değişebilir, jetona gömülü olsaydı eski hâliyle donup kalırdı.
    */
    void (async () => {
      try {
        if (!(await oturumVarMi())) return;
        const jeton = await gecerliJeton();
        const kimlik = kullaniciId(jeton);
        if (iptal || !kimlik) return;

        const { profilOku } = await import('./veri');
        const profil = await profilOku(kimlik);
        if (!iptal && profil) setKullanici(profil);
      } catch {
        // Oturum kurtarılamazsa giriş ekranıyla başlanır.
      } finally {
        if (!iptal) setYukleniyor(false);
      }
    })();

    return () => { iptal = true; };
  }, []);

  const girisYap = useCallback(async (eposta: string, sifre: string) => {
    if (!yapilandirildi) {
      setKullanici(TANITIM_KULLANICI);
      await AsyncStorage.setItem(TANITIM_ANAHTARI, 'acik').catch(() => { /* önemsiz */ });
      return;
    }

    const yanit = await fetch(`${API_KOK}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: eposta.trim().toLowerCase(), password: sifre }),
    });
    const govde = (await yanit.json().catch(() => ({}))) as
      { error?: string } & Partial<Oturum>;

    if (!yanit.ok || !govde.accessToken || !govde.refreshToken) {
      throw new Error(govde.error ?? 'Giriş yapılamadı. Bilgilerinizi kontrol edin.');
    }

    await oturumuKaydet({
      accessToken: govde.accessToken,
      refreshToken: govde.refreshToken,
      expiresIn: govde.expiresIn ?? 3600,
    });

    const kimlik = kullaniciId(govde.accessToken);
    const { profilOku } = await import('./veri');
    const profil = kimlik ? await profilOku(kimlik) : null;
    if (!profil) {
      // Profili olmayan bir hesapla panele girmek, kullanıcıyı hiçbir
      // şey yapamadığı bir ekrana sokardı.
      await oturumuKapat();
      throw new Error('Hesabınıza ait profil bulunamadı.');
    }
    setKullanici(profil);
  }, []);

  const cikisYap = useCallback(async () => {
    await oturumuKapat();
    await AsyncStorage.removeItem(TANITIM_ANAHTARI).catch(() => { /* önemsiz */ });
    setKullanici(null);
  }, []);

  const deger = useMemo<OturumDurumu>(() => ({
    kullanici, yukleniyor, tanitimModu: !yapilandirildi, girisYap, cikisYap,
  }), [kullanici, yukleniyor, girisYap, cikisYap]);

  return <Baglam.Provider value={deger}>{children}</Baglam.Provider>;
}

export function useOturum(): OturumDurumu {
  const d = useContext(Baglam);
  if (!d) throw new Error('useOturum yalnızca OturumSaglayici içinde kullanılabilir.');
  return d;
}
