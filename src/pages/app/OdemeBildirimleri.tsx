import { useEffect, useState } from 'react';
import Seo from '../../components/Seo';
import Alert from '../../components/Alert';
import ConfirmDialog from '../../components/ConfirmDialog';
import { QueryBoundary } from '../../components/QueryState';
import { IconCheck, IconPlus, IconTrash } from '../../components/Icons';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../lib/authHelpers';
import { formatPhone } from '../../lib/format';
import { uid } from '../../lib/ids';
import {
  useDeletePaymentAlertRecipient, usePaymentAlertRecipients, usePaymentAlerts,
  useSavePaymentAlert, useSavePaymentAlertRecipient,
} from '../../lib/queries';
import {
  ODEME_OLAYLARI, ODEME_OLAY_ADI, ODEME_YER_TUTUCULARI,
  type PaymentAlert, type PaymentAlertRecipient,
} from '../../types';

/**
 * Ödeme değişikliklerinde yöneticiye giden bildirimler.
 *
 * İki ayrı şey düzenleniyor ve bu ayrım ekranda da korunuyor:
 *   kural : hangi olayda mesaj gider, metni ne
 *   alıcı : mesaj kime gider
 *
 * Metinler HARD-CODE DEĞİL. Hangi olayda ne yazacağı salondan salona
 * değişiyor ve zamanla değişecek; koda gömülseydi her değişiklik yeni
 * sürüm gerektirirdi.
 *
 * Kuralların hepsi kapalı başlıyor: SMS ücretli, sistemi yeni kuran bir
 * salonun yöneticisine metni okumadan mesaj gitmemeli.
 */
export default function OdemeBildirimleri() {
  const { can } = useAuth();
  const duzenleyebilir = can('ayarlar.duzenle');

  const { data: kurallar = [], isLoading, error: yuklemeHatasi } = usePaymentAlerts();
  const { data: alicilar = [] } = usePaymentAlertRecipients();
  const kuralKaydet = useSavePaymentAlert();
  const aliciKaydet = useSavePaymentAlertRecipient();
  const aliciSil = useDeletePaymentAlertRecipient();

  const [taslak, setTaslak] = useState<Record<string, string>>({});
  const [hata, setHata] = useState('');
  const [kaydedilen, setKaydedilen] = useState('');
  const [silinecek, setSilinecek] = useState<PaymentAlertRecipient | null>(null);
  const [yeniAlici, setYeniAlici] = useState({ name: '', phone: '' });

  // Sunucudan gelen metinler forma bir kez aktarılır; kullanıcı yazarken
  // her yeniden getirmede yazdığı silinmesin.
  useEffect(() => {
    setTaslak((onceki) => {
      const yeni = { ...onceki };
      for (const k of kurallar) if (yeni[k.id] === undefined) yeni[k.id] = k.body;
      return yeni;
    });
  }, [kurallar]);

  async function metinKaydet(kural: PaymentAlert) {
    setHata(''); setKaydedilen('');
    const govde = (taslak[kural.id] ?? '').trim();
    if (!govde) { setHata('Mesaj metni boş olamaz.'); return; }
    try {
      await kuralKaydet.mutateAsync({ ...kural, body: govde });
      setKaydedilen(kural.id);
    } catch (e) { setHata(errorMessage(e)); }
  }

  async function acKapat(kural: PaymentAlert) {
    setHata(''); setKaydedilen('');
    try {
      await kuralKaydet.mutateAsync({ ...kural, enabled: !kural.enabled });
    } catch (e) { setHata(errorMessage(e)); }
  }

  async function aliciEkle(e: React.FormEvent) {
    e.preventDefault();
    setHata('');
    const ad = yeniAlici.name.trim();
    if (!ad) { setHata('Alıcının adını giriniz.'); return; }

    /*
      Numara burada normalize ediliyor: veritabanı 5XXXXXXXXX bekliyor ve
      "0533 100 00 11" biçiminde girilen bir numara kısıta takılıp
      anlaşılmaz bir hata veriyordu.
    */
    const numara = yeniAlici.phone.replace(/\D/g, '').replace(/^90/, '').replace(/^0/, '');
    if (!/^5\d{9}$/.test(numara)) {
      setHata('Geçerli bir cep telefonu numarası giriniz (5XX XXX XX XX).');
      return;
    }
    if (alicilar.some((a) => a.phone === numara)) {
      setHata('Bu numara listede zaten var.');
      return;
    }

    try {
      await aliciKaydet.mutateAsync({
        id: uid('odeme-alici'), businessId: '', name: ad, phone: numara, enabled: true,
      });
      setYeniAlici({ name: '', phone: '' });
    } catch (err) { setHata(errorMessage(err)); }
  }

  async function aliciAcKapat(alici: PaymentAlertRecipient) {
    setHata('');
    try {
      await aliciKaydet.mutateAsync({ ...alici, enabled: !alici.enabled });
    } catch (e) { setHata(errorMessage(e)); }
  }

  async function aliciKaldir() {
    if (!silinecek) return;
    const hedef = silinecek;
    setSilinecek(null);
    try {
      await aliciSil.mutateAsync(hedef.id);
    } catch (e) { setHata(errorMessage(e)); }
  }

  const sirali = ODEME_OLAYLARI
    .map((olay) => kurallar.find((k) => k.event === olay))
    .filter((k): k is PaymentAlert => Boolean(k));

  return (
    <QueryBoundary isLoading={isLoading} error={yuklemeHatasi}>
      <Seo title="Ödeme Bildirimleri - Düğün Takip Panel" noindex />
      <h1 className="mb-1 font-heading text-2xl font-bold text-brand">Ödeme Bildirimleri</h1>
      <p className="mb-6 max-w-3xl text-sm text-brand-muted">
        Tahsilatlarda rakam içeren bir değişiklik olduğunda yöneticilere SMS gönderilir.
        Hangi olayda mesaj gideceğini ve metnini buradan belirlersiniz.
      </p>

      {hata && <Alert kind="error" className="mb-4">{hata}</Alert>}

      {/* ------------------------------------------------------- alıcılar */}
      <section className="card mb-6 p-5" aria-labelledby="alici-baslik">
        <h2 id="alici-baslik" className="mb-1 font-heading text-lg font-bold text-brand">
          Bildirimi alacak yöneticiler
        </h2>
        <p className="mb-4 text-sm text-brand-muted">
          Numara sistemdeki bir kullanıcıya bağlı değil: salon sahibinin ikinci hattı ya da
          dışarıdan çalışan muhasebeci de bu listeye girebilir.
        </p>

        {alicilar.length === 0 ? (
          <p className="py-5 text-center text-sm text-brand-muted">
            Alıcı eklenmemiş. Alıcı yokken kurallar açık olsa da mesaj gitmez.
          </p>
        ) : (
          <ul className="mb-4 divide-y divide-line">
            {alicilar.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-brand">{a.name}</p>
                  <p className="text-xs text-brand-muted">{formatPhone(a.phone)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-brand-muted">
                    <input
                      type="checkbox"
                      checked={a.enabled}
                      disabled={!duzenleyebilir}
                      onChange={() => { void aliciAcKapat(a); }}
                    />
                    Mesaj alsın
                  </label>
                  {duzenleyebilir && (
                    <button type="button" onClick={() => setSilinecek(a)}
                      aria-label={`${a.name} alıcısını sil`}
                      className="rounded p-1 text-brand-muted hover:text-danger">
                      <IconTrash size={15} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {duzenleyebilir && (
          <form onSubmit={(e) => { void aliciEkle(e); }} noValidate
            className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <div>
              <label htmlFor="al-ad" className="field-label">Ad</label>
              <input id="al-ad" className="field-input" value={yeniAlici.name}
                onChange={(e) => setYeniAlici((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="al-tel" className="field-label">Cep telefonu</label>
              <input id="al-tel" type="tel" className="field-input" placeholder="5XX XXX XX XX"
                value={yeniAlici.phone}
                onChange={(e) => setYeniAlici((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="flex items-end">
              <button type="submit" className="btn-primary w-full text-white hover:text-white"
                disabled={aliciKaydet.isPending}>
                <IconPlus size={16} /> Ekle
              </button>
            </div>
          </form>
        )}
      </section>

      {/* --------------------------------------------------------- kurallar */}
      <section className="card mb-6 p-5" aria-labelledby="yer-tutucu-baslik">
        <h2 id="yer-tutucu-baslik" className="mb-2 font-heading text-base font-bold text-brand">
          Metinde kullanabileceğiniz alanlar
        </h2>
        <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-4">
          {ODEME_YER_TUTUCULARI.map(([ad, aciklama]) => (
            <div key={ad} className="flex gap-2">
              <dt className="font-mono text-brand">{ad}</dt>
              <dd className="text-brand-muted">{aciklama}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="space-y-4">
        {sirali.map((kural) => (
          <section key={kural.id} className="card p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-heading text-base font-bold text-brand">
                {ODEME_OLAY_ADI[kural.event]}
              </h2>
              <label className="flex items-center gap-2 text-sm text-brand-muted">
                <input
                  type="checkbox"
                  checked={kural.enabled}
                  disabled={!duzenleyebilir}
                  onChange={() => { void acKapat(kural); }}
                  aria-label={`${ODEME_OLAY_ADI[kural.event]} bildirimi`}
                />
                Bu olayda mesaj gönder
              </label>
            </div>

            <label htmlFor={`kural-${kural.id}`} className="field-label">Mesaj metni</label>
            <textarea
              id={`kural-${kural.id}`}
              className="field-input min-h-[80px]"
              value={taslak[kural.id] ?? ''}
              disabled={!duzenleyebilir}
              onChange={(e) => setTaslak((t) => ({ ...t, [kural.id]: e.target.value }))}
            />

            {duzenleyebilir && (
              <div className="mt-2 flex items-center gap-3">
                <button type="button" className="btn-secondary"
                  onClick={() => { void metinKaydet(kural); }}
                  disabled={kuralKaydet.isPending}>
                  Metni kaydet
                </button>
                {kaydedilen === kural.id && (
                  <span className="flex items-center gap-1 text-xs text-[#15803d]">
                    <IconCheck size={14} /> Kaydedildi
                  </span>
                )}
              </div>
            )}
          </section>
        ))}
      </div>

      <ConfirmDialog
        open={Boolean(silinecek)}
        title="Alıcıyı silmek istiyor musunuz?"
        description={silinecek ? `${silinecek.name} · ${formatPhone(silinecek.phone)}` : ''}
        confirmLabel="Evet, sil"
        onConfirm={() => { void aliciKaldir(); }}
        onCancel={() => setSilinecek(null)}
      />
    </QueryBoundary>
  );
}
