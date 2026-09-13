import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import Alert from './Alert';
import { IconAlert, IconClose } from './Icons';
import { errorMessage } from '../lib/authHelpers';
import { useAddErrorReport } from '../lib/queries';

/**
 * Hata bildirimi (madde 32).
 *
 * Ekranın sağ alt köşesinde sabit duruyor. Kullanıcı yalnızca NE OLDUĞUNU
 * yazıyor; kim, ne zaman ve hangi sayfada olduğu kendiliğinden
 * kaydediliyor -- elle sorulsaydı çoğu bildirim "çalışmıyor" diye gelir
 * ve hiçbiri incelenemezdi.
 *
 * Yol (path) kaydı bilinçli: aynı cümle iki farklı ekranda iki farklı
 * hatayı anlatabiliyor.
 */
export default function HataBildir() {
  const { pathname } = useLocation();
  const gonder = useAddErrorReport();

  const [acik, setAcik] = useState(false);
  const [metin, setMetin] = useState('');
  const [hata, setHata] = useState('');
  const [gonderildi, setGonderildi] = useState(false);

  async function kaydet(e: React.FormEvent) {
    e.preventDefault();
    setHata('');
    const aciklama = metin.trim();
    if (!aciklama) { setHata('Ne olduğunu kısaca yazınız.'); return; }

    try {
      await gonder.mutateAsync({
        path: pathname,
        message: aciklama,
        userAgent: navigator.userAgent,
      });
      setMetin('');
      setGonderildi(true);
    } catch (err) {
      setHata(errorMessage(err));
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setAcik(true); setGonderildi(false); }}
        className="no-print fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-brand px-4 py-2.5 text-sm text-white shadow-lg hover:bg-brand-dark"
      >
        <IconAlert size={16} /> Hata Bildir
      </button>

      {acik && (
        <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/30 p-4 sm:items-center sm:justify-center"
          role="dialog" aria-modal="true" aria-labelledby="hata-baslik">
          <div className="w-full max-w-md rounded-xl bg-white p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <h2 id="hata-baslik" className="font-heading text-lg font-bold text-brand">
                Hata Bildir
              </h2>
              <button type="button" onClick={() => setAcik(false)} aria-label="Kapat"
                className="rounded p-1 text-brand-muted hover:text-brand">
                <IconClose size={18} />
              </button>
            </div>

            {gonderildi ? (
              <>
                <Alert kind="success" className="mb-4">
                  Bildiriminiz kaydedildi. Teşekkür ederiz.
                </Alert>
                <button type="button" className="btn-outline w-full" onClick={() => setAcik(false)}>
                  Kapat
                </button>
              </>
            ) : (
              <form onSubmit={(e) => { void kaydet(e); }} noValidate>
                <p className="mb-3 text-sm text-brand-muted">
                  Bulunduğunuz sayfa (<span className="font-mono text-xs">{pathname}</span>),
                  kullanıcı adınız ve saat kendiliğinden kaydedilir.
                </p>
                {hata && <Alert kind="error" className="mb-3">{hata}</Alert>}
                <label htmlFor="hata-metin" className="field-label">Ne oldu?</label>
                <textarea id="hata-metin" rows={4} className="field-input" value={metin}
                  onChange={(e) => setMetin(e.target.value)} />
                <button type="submit" className="btn-primary mt-3 w-full text-white hover:text-white"
                  disabled={gonder.isPending}>
                  {gonder.isPending ? 'Gönderiliyor…' : 'Gönder'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
