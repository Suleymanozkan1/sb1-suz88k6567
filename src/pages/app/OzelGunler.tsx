import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Seo from '../../components/Seo';
import Alert from '../../components/Alert';
import { QueryBoundary } from '../../components/QueryState';
import { useAuth } from '../../context/AuthContext';
import { useDeleteSpecialDay, useSaveSpecialDay, useSpecialDays } from '../../lib/queries';
import { ortakGun } from '../../lib/ozelGun';
import { errorMessage } from '../../lib/authHelpers';
import { formatDate, todayIso } from '../../lib/format';
import { uid } from '../../lib/ids';
import { OZEL_GUN_ADI, OZEL_GUN_RENGI } from '../../types';
import type { SpecialDay, SpecialDayKind } from '../../types';
import { IconPlus, IconTrash } from '../../components/Icons';

/**
 * Takvimdeki özel günlerin yönetimi (madde 30).
 *
 * İKİ KAYNAK var ve ekranda ayrı duruyorlar:
 *
 *  - ORTAK GÜNLER: sabit tarihli resmî tatiller. Sistem kuruluşta
 *    tohumluyor, düzenlenemiyor ve silinemiyor. Bunlar kanunla belirli
 *    ve her yıl aynı; işletme başına kopyalanmalarının anlamı yok.
 *
 *  - İŞLETMENİN GÜNLERİ: bayram, arife, kandil, okul açılış/kapanış ve
 *    salonun kendi özel günleri. BUNLAR TOHUMLANMIYOR, çünkü dini günler
 *    Diyanet'in yıllık takvimine, okul tarihleri MEB'in kararına bağlı.
 *    Hesaplanmış bir hicri tarih gerçeğinden bir gün sapabilir; o günü
 *    tatil sanıp salonu kapatmak ya da açmak salona zarar verir. Bu
 *    yüzden uydurulmuyor, buradan giriliyor.
 */
const TURLER: SpecialDayKind[] = ['dini_bayram', 'arife', 'kandil', 'okul', 'resmi_tatil', 'ozel'];

export default function OzelGunler() {
  const { user, can } = useAuth();
  const { data: gunler = [], isLoading, error } = useSpecialDays();
  const kaydet = useSaveSpecialDay();
  const sil = useDeleteSpecialDay();

  const [hata, setHata] = useState('');
  const [tarih, setTarih] = useState(todayIso());
  const [ad, setAd] = useState('');
  const [tur, setTur] = useState<SpecialDayKind>('dini_bayram');
  const [silinecek, setSilinecek] = useState<SpecialDay | null>(null);

  const duzenlenebilir = can('ayarlar.duzenle');

  /*
    Geçmiş günler VARSAYILAN OLARAK gizli: liste yıllar geçtikçe
    büyüyor ve bu ekranda sorulan soru "bu yıl hangi günler var".
  */
  const [gecmisiGoster, setGecmisiGoster] = useState(false);
  const bugun = todayIso();

  const gorunen = useMemo(
    () => gunler
      .filter((g) => gecmisiGoster || g.day >= bugun)
      .sort((a, b) => a.day.localeCompare(b.day) || a.label.localeCompare(b.label, 'tr')),
    [gunler, gecmisiGoster, bugun],
  );

  const gecmisSayisi = gunler.filter((g) => g.day < bugun).length;

  async function ekle(e: React.FormEvent) {
    e.preventDefault();
    setHata('');

    const etiket = ad.trim();
    if (!etiket) { setHata('Gün adını giriniz.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tarih)) { setHata('Geçerli bir tarih seçiniz.'); return; }

    try {
      await kaydet.mutateAsync({
        id: uid('ozel-gun'),
        businessId: user?.activeBusinessId ?? '',
        day: tarih,
        label: etiket,
        kind: tur,
        createdAt: new Date().toISOString(),
      });
      setAd('');
    } catch (err) {
      setHata(errorMessage(err));
    }
  }

  async function kaldir() {
    if (!silinecek) return;
    const hedef = silinecek;
    setSilinecek(null);
    setHata('');
    try {
      await sil.mutateAsync(hedef.id);
    } catch (err) {
      setHata(errorMessage(err));
    }
  }

  return (
    <QueryBoundary isLoading={isLoading} error={error}>
      <Seo title="Özel Günler - Sahra Takip Panel" noindex />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-brand">Özel Günler</h1>
          <p className="text-sm text-brand-muted">
            Takvimde işaretlenen günler. <Link to="/panel/takvim">Rezervasyon Takvimi</Link>
          </p>
        </div>
      </div>

      {hata && <Alert kind="error" className="mb-4">{hata}</Alert>}

      {/*
        Dini günlerin ve okul tarihlerinin neden hazır gelmediği ekranda
        yazıyor. Yazılmasaydı kullanıcı eksik sanıp bekler, girmezdi.
      */}
      <Alert kind="info" className="mb-5">
        Resmî tatiller (yılbaşı, 23 Nisan, 29 Ekim...) hazır gelir ve değiştirilemez.
        Bayram, arife, kandil ve okul tarihleri her yıl Diyanet ile Millî Eğitim
        Bakanlığı'nın açıkladığı takvime göre değiştiği için hazır gelmez;
        aşağıdan eklenir.
      </Alert>

      {duzenlenebilir && (
        <form onSubmit={(e) => { void ekle(e); }} className="card mb-6 p-5">
          <h2 className="mb-4 font-heading text-lg font-bold text-brand">Gün ekle</h2>
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <label htmlFor="og-tarih" className="field-label">Tarih</label>
              <input id="og-tarih" type="date" className="field-input"
                value={tarih} onChange={(e) => setTarih(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="og-ad" className="field-label">Gün adı</label>
              <input id="og-ad" className="field-input" placeholder="Örn. Ramazan Bayramı 1. Gün"
                value={ad} onChange={(e) => setAd(e.target.value)} />
            </div>
            <div>
              <label htmlFor="og-tur" className="field-label">Tür</label>
              <select id="og-tur" className="field-input"
                value={tur} onChange={(e) => setTur(e.target.value as SpecialDayKind)}>
                {TURLER.map((t) => (
                  <option key={t} value={t}>{OZEL_GUN_ADI[t]}</option>
                ))}
              </select>
            </div>
          </div>
          <button type="submit" className="btn-primary mt-4 text-white hover:text-white"
            disabled={kaydet.isPending}>
            <IconPlus size={18} /> Ekle
          </button>
        </form>
      )}

      <section className="card p-5" aria-labelledby="og-liste-baslik">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 id="og-liste-baslik" className="font-heading text-lg font-bold text-brand">
            Günler
          </h2>
          {gecmisSayisi > 0 && (
            <button type="button" className="text-xs text-brand-muted underline hover:text-brand"
              onClick={() => setGecmisiGoster((g) => !g)}>
              {gecmisiGoster ? 'Geçmiş günleri gizle' : `Geçmiş ${gecmisSayisi} günü göster`}
            </button>
          )}
        </div>

        {gorunen.length === 0 ? (
          <p className="py-8 text-center text-sm text-brand-muted">
            Gösterilecek gün bulunmuyor.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <caption className="sr-only">Takvimde işaretlenen özel günler</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase text-brand-muted">
                  <th className="pb-2 font-medium">Tarih</th>
                  <th className="pb-2 font-medium">Gün</th>
                  <th className="pb-2 font-medium">Tür</th>
                  <th className="pb-2 font-medium">Kaynak</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {gorunen.map((g) => (
                  <tr key={g.id} className="border-b border-line/60 last:border-0">
                    <td className="whitespace-nowrap py-2.5 text-brand">{formatDate(g.day)}</td>
                    <td className="py-2.5">
                      <span className="inline-flex items-center gap-2 text-brand">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: OZEL_GUN_RENGI[g.kind] }} />
                        {g.label}
                      </span>
                    </td>
                    <td className="py-2.5 text-brand-muted">{OZEL_GUN_ADI[g.kind]}</td>
                    <td className="py-2.5 text-xs text-brand-muted">
                      {ortakGun(g) ? 'Sistem' : 'İşletme'}
                    </td>
                    <td className="py-2.5 text-right">
                      {/*
                        Ortak günlerde silme düğmesi HİÇ ÇIZİLMİYOR. Pasif
                        bir düğme konsaydı kullanıcı tıklayıp hata alır ve
                        neden silinemediğini anlamazdı; "Sistem" etiketi
                        zaten sebebi söylüyor.
                      */}
                      {duzenlenebilir && !ortakGun(g) && (
                        <button type="button"
                          className="text-danger hover:opacity-80"
                          aria-label={`${g.label} gününü sil`}
                          onClick={() => setSilinecek(g)}>
                          <IconTrash size={18} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {silinecek && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog" aria-modal="true" aria-labelledby="og-sil-baslik">
          <div className="card w-full max-w-sm p-5">
            <h2 id="og-sil-baslik" className="mb-2 font-heading text-lg font-bold text-brand">
              Gün silinsin mi?
            </h2>
            <p className="mb-4 text-sm text-brand-muted">
              <strong className="text-brand">{silinecek.label}</strong> ({formatDate(silinecek.day)})
              takvimden kaldırılacak.
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn-primary text-white hover:text-white"
                onClick={() => { void kaldir(); }}>
                Sil
              </button>
              <button type="button" className="btn-outline" onClick={() => setSilinecek(null)}>
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      )}
    </QueryBoundary>
  );
}
