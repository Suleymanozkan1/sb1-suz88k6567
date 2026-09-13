import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Seo from '../../components/Seo';
import Alert from '../../components/Alert';
import { QueryBoundary } from '../../components/QueryState';
import { useAuth } from '../../context/AuthContext';
import { useDeleteSpecialDay, useSaveSpecialDay, useSpecialDays } from '../../lib/queries';
import { kesinlesmedi, ortakGun } from '../../lib/ozelGun';
import { errorMessage } from '../../lib/authHelpers';
import { formatDate, todayIso } from '../../lib/format';
import { uid } from '../../lib/ids';
import { OZEL_GUN_ADI, OZEL_GUN_KAYNAGI, OZEL_GUN_RENGI } from '../../types';
import type { SpecialDay, SpecialDayKind } from '../../types';
import { IconPlus, IconTrash } from '../../components/Icons';

/**
 * Takvimdeki özel günlerin yönetimi (madde 30).
 *
 * İKİ KAYNAK var ve ekranda ayrı duruyorlar:
 *
 *  - ORTAK GÜNLER: resmî tatiller, dini bayramlar, arifeler ve
 *    kandiller. Bunları sunucudaki zamanlanmış görev SAĞLAYICIDAN
 *    ÇEKİYOR (api/ozel-gunler.ts); panelden düzenlenemiyor ve
 *    silinemiyor, çünkü her ay yeniden yazılıyorlar.
 *
 *  - İŞLETMENİN GÜNLERİ: okul açılış/kapanış tarihleri ve salonun kendi
 *    özel günleri. Okul takvimini Millî Eğitim Bakanlığı bir duyuruyla
 *    yayımlıyor, makine okunur bir kaynağı yok; buradan giriliyor.
 *
 * KESİNLEŞMEMİŞ TARİHLER ayrıca işaretleniyor. Uzak yılların dini
 * bayramları ve hesaplanan kandiller için sağlayıcı kesin konuşmuyor;
 * ekran da konuşmamalı. O güne göre rezervasyon kapatan salon sahibi,
 * tarihin değişebileceğini görmeli.
 */
/*
  Elle girilebilen türler. Bayram, arife, kandil ve resmî tatil burada
  YOK: onları sunucu çekiyor ve elle girilen bir kopya, takvimde aynı
  günü iki kez gösterirdi.
*/
const TURLER: SpecialDayKind[] = ['okul', 'ozel'];

export default function OzelGunler() {
  const { user, can } = useAuth();
  const { data: gunler = [], isLoading, error } = useSpecialDays();
  const kaydet = useSaveSpecialDay();
  const sil = useDeleteSpecialDay();

  const [hata, setHata] = useState('');
  const [tarih, setTarih] = useState(todayIso());
  const [ad, setAd] = useState('');
  const [tur, setTur] = useState<SpecialDayKind>('okul');
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
        Neyin otomatik geldiği, neyin elle girildiği ve hangi tarihlerin
        kesin olmadığı ekranda yazıyor. Yazılmasaydı kullanıcı ya eksik
        sanıp elle girer (ve mükerrer kayıt olurdu) ya da kesinleşmemiş
        bir tarihe kesin gibi güvenirdi.
      */}
      <Alert kind="info" className="mb-5">
        Resmî tatiller, dini bayramlar, arifeler ve kandiller <strong>otomatik
        olarak</strong> güncellenir; bu günler panelden değiştirilemez.
        Kandiller hicri takvimden hesaplandığı, uzak yılların bayram tarihleri de
        henüz resmen ilan edilmediği için <strong>kesinleşmedi</strong> olarak
        işaretlenir — bu günleri Diyanet takviminden doğrulayın.
        Okul açılış/kapanış tarihleri Millî Eğitim Bakanlığı'nın duyurusuyla
        belirlendiği için aşağıdan elle eklenir.
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
              <input id="og-ad" className="field-input" placeholder="Örn. Okullar kapanıyor"
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
                      {/*
                        Kesinleşmemiş tarih, ADIN YANINDA duruyor: ayrı
                        bir sütuna konsaydı satırı okuyan gözden kaçardı
                        ve o güne göre rezervasyon kapatılırdı.
                      */}
                      {kesinlesmedi(g) && (
                        <span className="ml-2 whitespace-nowrap rounded bg-[#fef6e7] px-1.5 py-0.5 text-[10px] text-[#92600e]">
                          kesinleşmedi
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-brand-muted">{OZEL_GUN_ADI[g.kind]}</td>
                    <td className="py-2.5 text-xs text-brand-muted">
                      {OZEL_GUN_KAYNAGI[g.source ?? (ortakGun(g) ? 'tohum' : 'isletme')]}
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
