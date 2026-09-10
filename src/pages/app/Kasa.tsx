import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Seo from '../../components/Seo';
import Alert from '../../components/Alert';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../lib/authHelpers';
import {
  useAddCashFlow, useAddSafeMovement, useCashFlow, useDeleteCashFlow,
  useDeleteSafeMovement, useReservationsWithBalances, useSafeMovements,
} from '../../lib/queries';
import { QueryBoundary } from '../../components/QueryState';
import { formatDate, formatMoney, todayIso } from '../../lib/format';
import { downloadCsv, reservationIncome, toCsv, withinRange } from '../../lib/reports';
import type { ReservationIncomeRow } from '../../lib/reports';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../../data/constants';
import {
  IconDownload, IconPlus, IconSafe, IconSafeIn, IconSafeOut, IconTrash, IconWallet,
} from '../../components/Icons';
import StatCard from '../../components/StatCard';
import {
  hasMovement, makeSafeMovement, naturalDirection, safeAllows, safeBalance, safeTotals, sourceNet,
} from '../../lib/celikKasa';
import type { CashFlowEntry, CashFlowKind, SafeDirection, SafeMovement } from '../../types';

/**
 * Kasa tablosunun tek satırı. `kaynak` alanı satırın nereden geldiğini
 * söyler: elle girilen kayıt silinebilir, rezervasyondan türeyen satır
 * silinemez.
 */
type KasaSatiri =
  | {
      id: string; date: string; kind: CashFlowKind; category: string;
      description: string; amount: number; kaynak: 'elle'; entry: CashFlowEntry;
    }
  | {
      id: string; date: string; kind: CashFlowKind; category: string;
      description: string; amount: number; kaynak: 'rezervasyon'; row: ReservationIncomeRow;
    };

export default function Kasa() {
  const { user, can } = useAuth();
  const businessId = user?.activeBusinessId ?? '';
  const { data: cashData, isLoading, error: loadError } = useCashFlow();
  const { reservations, payments } = useReservationsWithBalances();
  const addMutation = useAddCashFlow();
  const deleteMutation = useDeleteCashFlow();
  const { data: safeData } = useSafeMovements();
  const addSafeMutation = useAddSafeMovement();
  const deleteSafeMutation = useDeleteSafeMovement();
  const [safeError, setSafeError] = useState('');
  const [safeToDelete, setSafeToDelete] = useState<SafeMovement | null>(null);
  const [kindFilter, setKindFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [toDelete, setToDelete] = useState<CashFlowEntry | null>(null);
  const currency = user?.currency ?? 'TL';

  const [form, setForm] = useState({
    kind: 'Gelir' as CashFlowKind,
    date: todayIso(),
    category: INCOME_CATEGORIES[0],
    amount: '',
    description: '',
  });
  const [error, setError] = useState('');

  const entries = useMemo(() => cashData ?? [], [cashData]);
  const safeMovements = useMemo(() => safeData ?? [], [safeData]);
  const safeTotal = useMemo(() => safeBalance(safeMovements), [safeMovements]);
  const safeSums = useMemo(() => safeTotals(safeMovements), [safeMovements]);

  /*
    Kasa iki kaynağı birlikte gösterir:
      * elle girilen gelir/gider kayıtları
      * rezervasyonlardan gelen tahsilatlar (kapora dahil)

    İkincisi kasa tablosuna yazılmaz, rezervasyondan türetilir. Yazılsaydı
    tutar düzeltildiğinde ya da tahsilat silindiğinde kasa rezervasyondan
    kopar ve aynı para iki kez görünürdü. Türetilmiş satır bu yüzden
    silinemez; düzeltme rezervasyon ekranından yapılır.
  */
  const rezervasyonSatirlari = useMemo(
    () => reservationIncome(reservations, payments),
    [reservations, payments],
  );

  const birlesik: KasaSatiri[] = useMemo(() => [
    ...entries.map((e) => ({
      id: e.id,
      date: e.date,
      kind: e.kind,
      category: e.category,
      description: e.description ?? '',
      amount: e.amount,
      kaynak: 'elle' as const,
      entry: e,
    })),
    ...rezervasyonSatirlari.map((r) => ({
      id: r.id,
      date: r.date,
      kind: 'Gelir' as CashFlowKind,
      category: r.category,
      // Sözleşme numarası ve taraflar: kasadaki satır hangi sözleşmeye
      // ait olduğunu kendi başına anlatmalı.
      description: `${r.contractNo} · ${r.parties}${r.method ? ` · ${r.method}` : ''}`,
      amount: r.amount,
      kaynak: 'rezervasyon' as const,
      row: r,
    })),
  ], [entries, rezervasyonSatirlari]);

  const filtered = useMemo(
    () =>
      birlesik
        .filter((e) => (kindFilter ? e.kind === kindFilter : true))
        .filter((e) => withinRange(e.date, { from, to }))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [birlesik, kindFilter, from, to],
  );

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, e) => ({
          income: acc.income + (e.kind === 'Gelir' ? e.amount : 0),
          expense: acc.expense + (e.kind === 'Gider' ? e.amount : 0),
        }),
        { income: 0, expense: 0 },
      ),
    [filtered],
  );

  const categories = form.kind === 'Gelir' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const amount = Number(form.amount);
    if (!form.amount || !Number.isFinite(amount) || amount <= 0) {
      setError('Geçerli bir tutar giriniz.');
      return;
    }
    if (!form.date) {
      setError('Tarih seçiniz.');
      return;
    }
    try {
      await addMutation.mutateAsync({
        id: crypto.randomUUID(),
        businessId,
        kind: form.kind,
        date: form.date,
        category: form.category,
        amount,
        description: form.description.trim() || undefined,
        createdAt: new Date().toISOString(),
      });
      setForm({ kind: form.kind, date: todayIso(), category: categories[0], amount: '', description: '' });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  /**
   * Satırı çelik kasaya işler.
   *
   * Tutar satırın kendi tutarıdır: kısmi giriş, satırın anlamını
   * bulanıklaştırır ve kasadaki parayı gelir/gider kaydından koparırdı.
   *
   * Yön çağıran hücreden geliyor ve satırın türüne bağlı: gelir kasaya
   * girer, gider kasadan çıkar. Satır bir tur döndükten sonra yeniden
   * işlenebilir; engellenen tek şey aynı hareketi arka arkaya iki kez
   * yazmak. Aynı kuralı depo katmanı ve veritabanı tetikleyicisi de
   * ayrıca uyguluyor.
   */
  async function kasayaIsle(satir: KasaSatiri, direction: SafeDirection) {
    setSafeError('');
    try {
      await addSafeMutation.mutateAsync(makeSafeMovement({
        businessId,
        date: satir.date,
        direction,
        amount: satir.amount,
        // Defterdeki satır kendi başına okunabilmeli: hangi türden hangi
        // kayıttan doğduğu yazmazsa "Personel Maaş / Giriş" gibi anlamsız
        // görünen bir satır kalır.
        description: `${satir.kind} · ${satir.category}${satir.description ? ` · ${satir.description}` : ''}`,
        sourceKind: satir.kaynak === 'elle' ? 'cash_flow' : 'reservation',
        sourceId: satir.id,
      }));
    } catch (err) {
      setSafeError(errorMessage(err));
    }
  }

  const kasaHareketiVarMi = (sourceId: string) =>
    safeMovements.some((m) => m.sourceId === sourceId);

  async function kasaHareketiSil() {
    if (!safeToDelete) return;
    const hedef = safeToDelete;
    setSafeToDelete(null);
    setSafeError('');
    try {
      await deleteSafeMutation.mutateAsync(hedef.id);
    } catch (err) {
      setSafeError(errorMessage(err));
    }
  }

  async function remove() {
    if (!toDelete) return;
    const target = toDelete;
    setToDelete(null);
    try {
      await deleteMutation.mutateAsync(target.id);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function exportCsv() {
    const csv = toCsv(
      ['Tarih', 'Tür', 'Kategori', 'Sözleşme No', 'Taraflar', 'Açıklama', 'Tutar', 'Kaynak', 'Çelik kasa'],
      filtered.map((e) => [
        formatDate(e.date), e.kind, e.category,
        e.kaynak === 'rezervasyon' ? e.row.contractNo : '',
        e.kaynak === 'rezervasyon' ? e.row.parties : '',
        e.description,
        e.amount,
        e.kaynak === 'rezervasyon' ? 'Rezervasyon' : 'Elle girilen',
        // Kasaya girip bankaya yatırılan satırda net 0 çıkar; hareket
        // olmayan satırda sütun boş kalır.
        kasaHareketiVarMi(e.id) ? sourceNet(safeMovements, e.id) : '',
      ]),
    );
    downloadCsv(`gelir-gider-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  if (!can('kasa.goruntule')) {
    return <Alert kind="error">Gelir / gider kayıtlarını görüntüleme yetkiniz bulunmuyor.</Alert>;
  }

  return (
    <QueryBoundary isLoading={isLoading} error={loadError}>
      <Seo title="Gelir Gider Kayıtları - Sahra Takip Panel" noindex />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-brand">Gelir Gider Kayıtları</h1>
          <p className="mt-1 text-sm text-brand-muted">
            Rezervasyonlardan gelen tahsilatlar (kapora dahil) sözleşme numarası ve taraflarla birlikte
            burada kendiliğinden görünür; düzeltme rezervasyon ekranından yapılır. Çelik kasadaki
            gerçek para ayrı tutulur: her satırdaki düğmelerle kasaya eklenir ya da kasadan çıkarılır.
          </p>
        </div>
        <button type="button" onClick={exportCsv} className="btn-outline btn-sm" disabled={filtered.length === 0}>
          <IconDownload size={16} /> CSV indir
        </button>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Toplam Gelir" value={formatMoney(totals.income, currency)} icon={IconWallet} tone="success" />
        <StatCard label="Toplam Gider" value={formatMoney(totals.expense, currency)} icon={IconWallet} tone="danger" />
        <StatCard
          label="Kasa Bakiyesi"
          value={formatMoney(totals.income - totals.expense, currency)}
          icon={IconWallet}
          tone={totals.income - totals.expense >= 0 ? 'success' : 'danger'}
        />
        {/*
          Çelik kasa ayrı bir defterdir ve yukarıdaki bakiyeye karışmaz.
          Kendi simgesi ve çerçevesiyle duruyor ki üç muhasebe kartıyla
          aynı şey sanılmasın.
        */}
        <div className="rounded-xl border-2 border-dashed border-brand/30 bg-brand/[0.03] p-0.5">
          <StatCard
            label="Çelik Kasa"
            value={formatMoney(safeTotal, currency)}
            hint={`Giren ${formatMoney(safeSums.in, currency)} · Çıkan ${formatMoney(safeSums.out, currency)}`}
            icon={IconSafe}
            tone="brand"
          />
        </div>
      </div>

      {can('kasa.duzenle') && (
        <form onSubmit={(e) => { void submit(e); }} noValidate className="card mb-6 grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-6">
          <div>
            <label htmlFor="cf-kind" className="field-label">Tür</label>
            <select
              id="cf-kind"
              className="field-input"
              value={form.kind}
              onChange={(e) => {
                const kind = e.target.value as CashFlowKind;
                setForm((f) => ({ ...f, kind, category: (kind === 'Gelir' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES)[0] }));
              }}
            >
              <option value="Gelir">Gelir</option>
              <option value="Gider">Gider</option>
            </select>
          </div>
          <div>
            <label htmlFor="cf-date" className="field-label">Tarih</label>
            <input id="cf-date" type="date" className="field-input" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          </div>
          <div>
            <label htmlFor="cf-category" className="field-label">Kategori</label>
            <select id="cf-category" className="field-input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="cf-amount" className="field-label">Tutar</label>
            <input id="cf-amount" inputMode="decimal" className="field-input" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} aria-invalid={Boolean(error)} />
          </div>
          <div>
            <label htmlFor="cf-desc" className="field-label">Açıklama</label>
            <input id="cf-desc" className="field-input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="flex items-end">
            <button type="submit" className="btn-primary w-full text-white hover:text-white">
              <IconPlus size={16} /> Kaydet
            </button>
          </div>
          {error && <p className="text-xs text-danger md:col-span-2 lg:col-span-6" role="alert">{error}</p>}
        </form>
      )}

      <form className="card mb-5 grid gap-3 p-4 sm:grid-cols-3" onSubmit={(e) => e.preventDefault()}>
        <div>
          <label htmlFor="cf-filter-kind" className="field-label">Tür filtresi</label>
          <select id="cf-filter-kind" className="field-input" value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
            <option value="">Tümü</option>
            <option value="Gelir">Gelir</option>
            <option value="Gider">Gider</option>
          </select>
        </div>
        <div>
          <label htmlFor="cf-from" className="field-label">Başlangıç</label>
          <input id="cf-from" type="date" className="field-input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label htmlFor="cf-to" className="field-label">Bitiş</label>
          <input id="cf-to" type="date" className="field-input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </form>

      <div className="card overflow-x-auto">
        {filtered.length === 0 ? (
          <p className="p-10 text-center text-sm text-brand-muted">Kayıt bulunamadı.</p>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">Gelir ve gider kayıtları</caption>
            <thead>
              <tr className="border-b border-line bg-surface text-left text-xs uppercase text-brand-muted">
                <th className="px-4 py-3 font-medium">Tarih</th>
                <th className="px-4 py-3 font-medium">Tür</th>
                <th className="px-4 py-3 font-medium">Kategori</th>
                <th className="px-4 py-3 font-medium">Açıklama</th>
                <th className="px-4 py-3 text-right font-medium">Tutar</th>
                <th className="px-4 py-3 text-center font-medium">Çelik Kasa</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="border-b border-line/60 last:border-0 hover:bg-surface/60">
                  <td className="px-4 py-3 text-brand">{formatDate(e.date)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs ${e.kind === 'Gelir' ? 'bg-[#e8f8ef] text-[#15803d]' : 'bg-[#fdecea] text-[#b91c1c]'}`}>
                      {e.kind}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-brand">{e.category}</td>
                  <td className="px-4 py-3 text-brand-muted">
                    {e.kaynak === 'rezervasyon' ? (
                      <Link to={`/panel/rezervasyonlar/${e.row.reservationId}`} className="hover:text-accent-ink">
                        <span className="font-mono text-brand">{e.row.contractNo}</span>
                        {' · '}{e.row.parties}
                        {e.row.method ? ` · ${e.row.method}` : ''}
                      </Link>
                    ) : (e.description || '-')}
                  </td>
                  <td className={`px-4 py-3 text-right font-medium ${e.kind === 'Gelir' ? 'text-[#15803d]' : 'text-[#b91c1c]'}`}>
                    {e.kind === 'Gelir' ? '+' : '−'} {formatMoney(e.amount, currency)}
                  </td>
                  <td className="px-4 py-3">
                    <CelikKasaHucresi
                      satir={e}
                      hareketler={safeMovements}
                      currency={currency}
                      duzenlenebilir={can('kasa.duzenle')}
                      isle={(yon) => { void kasayaIsle(e, yon); }}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {e.kaynak === 'rezervasyon' ? (
                      <span className="rounded-full bg-surface px-2 py-1 text-[11px] text-brand-muted" title="Bu satır rezervasyondan gelir; düzeltme rezervasyon ekranından yapılır.">
                        Rezervasyon
                      </span>
                    ) : can('kasa.duzenle') && (
                      <button type="button" onClick={() => setToDelete(e.entry)} aria-label="Kaydı sil" className="rounded p-1 text-brand-muted hover:text-danger">
                        <IconTrash size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {safeError && <Alert kind="error" className="mt-4">{safeError}</Alert>}

      <CelikKasaDefteri
        hareketler={safeMovements}
        currency={currency}
        duzenlenebilir={can('kasa.duzenle')}
        sil={setSafeToDelete}
      />

      <ConfirmDialog
        open={Boolean(safeToDelete)}
        title="Çelik kasa hareketini silmek istiyor musunuz?"
        description={safeToDelete
          ? `${formatDate(safeToDelete.date)} · ${safeToDelete.direction} · ${formatMoney(safeToDelete.amount, currency)}`
          : ''}
        confirmLabel="Evet, sil"
        onConfirm={() => { void kasaHareketiSil(); }}
        onCancel={() => setSafeToDelete(null)}
      />

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Kaydı silmek istiyor musunuz?"
        description={toDelete ? `${formatDate(toDelete.date)} · ${toDelete.category} · ${formatMoney(toDelete.amount, currency)}` : ''}
        confirmLabel="Evet, sil"
        onConfirm={() => { void remove(); }}
        onCancel={() => setToDelete(null)}
      />
    </QueryBoundary>
  );
}

/**
 * Bir gelir/gider satırının çelik kasa hücresi.
 *
 * İki düğme her satırda durur: para kasaya girmiş olabilir (nakit tahsilat)
 * ya da kasadan çıkmış olabilir (bankaya yatırılan tutar, kasadan ödenen
 * gider). Aynı satır aynı yönde ikinci kez işlenemez; iki kez tıklamaktan
 * doğan çift sayım kasadaki parayı olduğundan farklı gösterirdi.
 */
function CelikKasaHucresi({
  satir, hareketler, currency, duzenlenebilir, isle,
}: {
  satir: KasaSatiri;
  hareketler: SafeMovement[];
  currency: string;
  duzenlenebilir: boolean;
  isle: (yon: SafeDirection) => void;
}) {
  const net = sourceNet(hareketler, satir.id);
  const islenmis = hasMovement(hareketler, satir.id);
  const gider = satir.kind === 'Gider';

  /*
    Yön satırın türünden geliyor: nakit tahsilat kasaya girer, nakit ödenen
    gider kasadan çıkar. Yönü kullanıcıya bırakmak, maaş ödemesini kasaya
    para giriyormuş gibi işlemeye izin veriyordu.

    Bu yüzden düğmelerin ne yazdığı da satıra göre değişiyor: soldaki
    düğme satırın doğal hareketi, sağdaki onun karşı hareketi.
  */
  const dogal = naturalDirection(satir.kind);
  const karsi: SafeDirection = dogal === 'Giriş' ? 'Çıkış' : 'Giriş';
  const dogalAcik = safeAllows(hareketler, satir.id, dogal, satir.kind);
  const karsiAcik = safeAllows(hareketler, satir.id, karsi, satir.kind);

  if (!duzenlenebilir) {
    return islenmis
      ? <p className="text-center text-xs text-brand">{formatMoney(net, currency)}</p>
      : <p className="text-center text-xs text-brand-muted">-</p>;
  }

  const dogalEtiket = gider ? 'Öde' : 'Ekle';
  const dogalAd = gider ? `Çelik kasadan öde: ${satir.category}` : `Çelik kasaya ekle: ${satir.category}`;
  const dogalIpucu = gider
    ? (dogalAcik ? 'Bu gideri çelik kasadan öde' : 'Bu gider çelik kasadan zaten düşülmüş; önce geri alın.')
    : (dogalAcik ? 'Çelik kasaya ekle' : 'Bu kayıt şu an çelik kasada duruyor; önce kasadan çıkarın.');

  const karsiEtiket = gider ? 'Geri al' : 'Çıkar';
  const karsiAd = gider ? `Çelik kasaya geri al: ${satir.category}` : `Çelik kasadan çıkar: ${satir.category}`;
  const karsiIpucu = gider
    ? (karsiAcik ? 'Kasadan ödenen gideri geri al' : 'Bu gider çelik kasadan düşülmemiş; geri alınacak bir şey yok.')
    : (karsiAcik ? 'Çelik kasadan çıkar' : 'Bu kayıt çelik kasada değil; önce kasaya ekleyin.');

  /*
    Düğmeler yazıyla etiketli: bu genişlikte iki ok simgesi birbirinden
    ayırt edilemiyordu ve yanlış yöne basmak kasadaki parayı bozar.
  */
  const bicim = (vurgu: string) => 'inline-flex items-center gap-1 rounded border border-line px-1.5 py-1 '
    + 'text-[11px] leading-none text-brand-muted disabled:cursor-not-allowed disabled:opacity-40 '
    + vurgu;
  const yesil = 'enabled:hover:border-[#15803d] enabled:hover:text-[#15803d]';
  const kirmizi = 'enabled:hover:border-[#b91c1c] enabled:hover:text-[#b91c1c]';

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => isle(dogal)}
          disabled={!dogalAcik}
          title={dogalIpucu}
          aria-label={dogalAd}
          className={bicim(gider ? kirmizi : yesil)}
        >
          {gider ? <IconSafeOut size={12} /> : <IconSafeIn size={12} />} {dogalEtiket}
        </button>
        <button
          type="button"
          onClick={() => isle(karsi)}
          disabled={!karsiAcik}
          title={karsiIpucu}
          aria-label={karsiAd}
          className={bicim(gider ? yesil : kirmizi)}
        >
          {gider ? <IconSafeIn size={12} /> : <IconSafeOut size={12} />} {karsiEtiket}
        </button>
      </div>
      {islenmis && (
        <span className="text-[11px] font-medium text-brand">{formatMoney(net, currency)}</span>
      )}
    </div>
  );
}

/**
 * Çelik kasa hareket defteri.
 *
 * Yanlış işlenen bir hareket buradan silinir; gelir/gider kaydına
 * dokunulmaz. Kasadaki para ile kayıtlar arasındaki bağ her satırda
 * görünür durur.
 */
function CelikKasaDefteri({
  hareketler, currency, duzenlenebilir, sil,
}: {
  hareketler: SafeMovement[];
  currency: string;
  duzenlenebilir: boolean;
  sil: (m: SafeMovement) => void;
}) {
  if (hareketler.length === 0) {
    return (
      <section className="card mt-6 p-5">
        <h2 className="mb-1 font-heading text-lg font-bold text-brand">Çelik Kasa Hareketleri</h2>
        <p className="text-sm text-brand-muted">
          Henüz hareket yok. Yukarıdaki tabloda bir kaydın çelik kasa sütunundaki
          düğmelerle parayı kasaya ekleyebilir ya da kasadan çıkarabilirsiniz.
        </p>
      </section>
    );
  }

  return (
    <section className="card mt-6 overflow-x-auto">
      <div className="p-5 pb-3">
        <h2 className="font-heading text-lg font-bold text-brand">Çelik Kasa Hareketleri</h2>
        <p className="mt-1 text-sm text-brand-muted">
          Kasadaki gerçek para. Gelir/gider bakiyesine karışmaz; havaleyle gelen tahsilat
          kasaya girmez, kasadan bankaya yatırılan para kasadan çıkar ama gelir kaydı yerinde kalır.
        </p>
      </div>
      <table className="w-full min-w-[560px] text-sm">
        <caption className="sr-only">Çelik kasa hareketleri</caption>
        <thead>
          <tr className="border-b border-line bg-surface text-left text-xs uppercase text-brand-muted">
            <th className="px-4 py-3 font-medium">Tarih</th>
            <th className="px-4 py-3 font-medium">Yön</th>
            <th className="px-4 py-3 font-medium">Açıklama</th>
            <th className="px-4 py-3 text-right font-medium">Tutar</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {hareketler.map((m) => (
            <tr key={m.id} className="border-b border-line/60 last:border-0 hover:bg-surface/60">
              <td className="px-4 py-3 text-brand">{formatDate(m.date)}</td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2.5 py-1 text-xs ${m.direction === 'Giriş' ? 'bg-[#e8f8ef] text-[#15803d]' : 'bg-[#fdecea] text-[#b91c1c]'}`}>
                  {m.direction}
                </span>
              </td>
              <td className="px-4 py-3 text-brand-muted">{m.description || '-'}</td>
              <td className={`px-4 py-3 text-right font-medium ${m.direction === 'Giriş' ? 'text-[#15803d]' : 'text-[#b91c1c]'}`}>
                {m.direction === 'Giriş' ? '+' : '−'} {formatMoney(m.amount, currency)}
              </td>
              <td className="px-4 py-3 text-right">
                {duzenlenebilir && (
                  <button
                    type="button"
                    onClick={() => sil(m)}
                    aria-label="Çelik kasa hareketini sil"
                    className="rounded p-1 text-brand-muted hover:text-danger"
                  >
                    <IconTrash size={15} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
