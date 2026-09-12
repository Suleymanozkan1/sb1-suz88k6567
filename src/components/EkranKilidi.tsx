import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBusinesses } from '../lib/queries';
import { errorMessage } from '../lib/authHelpers';
import { IconShield } from './Icons';

/**
 * Ekran otomatik kilidi (madde 27).
 *
 * İşlem yapılmadığında ekranı örter ve devam etmek için şifre ister.
 * Süre işletme ayarından geliyor; 0 = kapalı.
 *
 * OTURUM KAPATILMIYOR, ekran ÖRTÜLÜYOR. Kapatılsaydı yarım kalmış bir
 * form, yazılmakta olan bir not kaybolurdu; salonun resepsiyonunda
 * bilgisayar başında olmadan geçen beş dakika sık.
 *
 * Şifre doğrulaması SUNUCUDA: tarayıcıda karşılaştırılsaydı şifrenin bir
 * kopyasını istemciye göndermek gerekirdi.
 */
export default function EkranKilidi() {
  const { user } = useAuth();
  const { data: businesses = [] } = useBusinesses();
  const isletme = businesses.find((b) => b.id === user?.activeBusinessId) ?? businesses[0];
  const sure = isletme?.lockSeconds ?? 0;

  const [kilitli, setKilitli] = useState(false);
  const [sifre, setSifre] = useState('');
  const [hata, setHata] = useState('');
  const [bekliyor, setBekliyor] = useState(false);
  const zamanlayici = useRef<number | undefined>(undefined);

  const kilitle = useCallback(() => setKilitli(true), []);

  useEffect(() => {
    if (!user || sure <= 0 || kilitli) return undefined;

    const sifirla = () => {
      window.clearTimeout(zamanlayici.current);
      zamanlayici.current = window.setTimeout(kilitle, sure * 1000);
    };

    /*
      Klavye ve fare dışında dokunma ve kaydırma da sayılıyor: tablette
      listeyi kaydırarak çalışan personelin ekranı elinin altında
      kilitlenmemeli.
    */
    const olaylar = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const;
    olaylar.forEach((o) => window.addEventListener(o, sifirla, { passive: true }));
    sifirla();

    return () => {
      window.clearTimeout(zamanlayici.current);
      olaylar.forEach((o) => window.removeEventListener(o, sifirla));
    };
  }, [user, sure, kilitli, kilitle]);

  async function ac(e: React.FormEvent) {
    e.preventDefault();
    setBekliyor(true);
    setHata('');
    try {
      const yanit = await fetch('/api/sifre', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ islem: 'dogrula', email: user?.email, mevcut: sifre }),
      });
      if (yanit.ok) {
        setKilitli(false);
        setSifre('');
      } else {
        const govde = (await yanit.json()) as { error?: string };
        setHata(govde.error ?? 'Şifre doğrulanamadı.');
      }
    } catch (err) {
      setHata(errorMessage(err));
    } finally {
      setBekliyor(false);
    }
  }

  if (!kilitli || !user) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-brand/95 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kilit-baslik"
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center">
        <IconShield size={32} className="mx-auto mb-3 text-brand-muted" />
        <h2 id="kilit-baslik" className="font-heading text-lg font-bold text-brand">
          Ekran kilitlendi
        </h2>
        <p className="mb-4 mt-1 text-sm text-brand-muted">
          {sure} saniye işlem yapılmadı. Devam etmek için şifrenizi giriniz.
        </p>

        <form onSubmit={(e) => { void ac(e); }}>
          <label htmlFor="kilit-sifre" className="sr-only">Şifreniz</label>
          <input
            id="kilit-sifre"
            type="password"
            className="field-input mb-3"
            autoComplete="current-password"
            autoFocus
            value={sifre}
            onChange={(e) => { setSifre(e.target.value); setHata(''); }}
          />
          {hata && <p className="mb-2 text-xs text-danger" role="alert">{hata}</p>}
          <button type="submit" className="btn-primary w-full text-white hover:text-white"
            disabled={bekliyor || !sifre}>
            {bekliyor ? 'Kontrol ediliyor…' : 'Kilidi aç'}
          </button>
        </form>

        <p className="mt-3 text-xs text-brand-muted">
          Oturumunuz kapanmadı; açtığınız formlar ve yazdıklarınız duruyor.
        </p>
      </div>
    </div>
  );
}
