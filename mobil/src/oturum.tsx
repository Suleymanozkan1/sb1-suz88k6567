import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_KOK, supabase, yapilandirildi } from './supabase';

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
 * "tanıtımda giriş yapılmıştı" bilgisi — güvenlik değeri taşımaz.
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
    if (!yapilandirildi || !supabase) {
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

    supabase.auth.getSession().then(({ data }) => {
      if (iptal) return;
      const o = data.session?.user;
      if (o) {
        setKullanici({
          id: o.id,
          eposta: o.email ?? '',
          ad: (o.user_metadata?.['name'] as string | undefined) ?? o.email ?? '',
          rol: (o.user_metadata?.['role'] as string | undefined) ?? 'Personel',
        });
      }
      setYukleniyor(false);
    });

    const { data: abone } = supabase.auth.onAuthStateChange((_olay, oturum) => {
      const o = oturum?.user;
      setKullanici(o ? {
        id: o.id,
        eposta: o.email ?? '',
        ad: (o.user_metadata?.['name'] as string | undefined) ?? o.email ?? '',
        rol: (o.user_metadata?.['role'] as string | undefined) ?? 'Personel',
      } : null);
    });

    return () => { iptal = true; abone.subscription.unsubscribe(); };
  }, []);

  const girisYap = useCallback(async (eposta: string, sifre: string) => {
    if (!yapilandirildi || !supabase) {
      setKullanici(TANITIM_KULLANICI);
      await AsyncStorage.setItem(TANITIM_ANAHTARI, 'acik').catch(() => { /* önemsiz */ });
      return;
    }

    const yanit = await fetch(`${API_KOK}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: eposta.trim().toLowerCase(), password: sifre }),
    });
    const govde = (await yanit.json().catch(() => ({}))) as { error?: string; session?: { access_token: string; refresh_token: string } };

    if (!yanit.ok || !govde.session) {
      throw new Error(govde.error ?? 'Giriş yapılamadı. Bilgilerinizi kontrol edin.');
    }

    const { error } = await supabase.auth.setSession({
      access_token: govde.session.access_token,
      refresh_token: govde.session.refresh_token,
    });
    if (error) throw new Error(error.message);
  }, []);

  const cikisYap = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
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
