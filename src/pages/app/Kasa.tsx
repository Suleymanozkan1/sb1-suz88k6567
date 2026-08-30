import { useMemo, useState } from 'react';
import Seo from '../../components/Seo';
import Alert from '../../components/Alert';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useAuth } from '../../context/AuthContext';
import { useBusinessData } from '../../hooks/useBusinessData';
import { deleteCashFlow, getCashFlow, uid, upsertCashFlow } from '../../lib/db';
import { formatDate, formatMoney, todayIso } from '../../lib/format';
import { downloadCsv, toCsv, withinRange } from '../../lib/reports';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../../data/constants';
import { IconDownload, IconPlus, IconTrash } from '../../components/Icons';
import StatCard from '../../components/StatCard';
import { IconWallet } from '../../components/Icons';
import type { CashFlowEntry, CashFlowKind } from '../../types';

export default function Kasa() {
  const { user, can } = useAuth();
  const { businessId } = useBusinessData();
  const [version, setVersion] = useState(0);
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

  // Depo React state'i olmadığından her render'da yeniden okunur; `version` yazma sonrası render tetikler.
  void version;
  const entries = getCashFlow(businessId);

  const filtered = useMemo(
    () =>
      entries
        .filter((e) => (kindFilter ? e.kind === kindFilter : true))
        .filter((e) => withinRange(e.date, { from, to }))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [entries, kindFilter, from, to],
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

  function submit(e: React.FormEvent) {
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
    upsertCashFlow({
      id: uid('cf'),
      businessId,
      kind: form.kind,
      date: form.date,
      category: form.category,
      amount,
      description: form.description.trim() || undefined,
      createdAt: new Date().toISOString(),
    });
    setForm({ kind: form.kind, date: todayIso(), category: categories[0], amount: '', description: '' });
    setVersion((v) => v + 1);
  }

  function remove() {
    if (!toDelete) return;
    deleteCashFlow(toDelete.id);
    setToDelete(null);
    setVersion((v) => v + 1);
  }

  function exportCsv() {
    const csv = toCsv(
      ['Tarih', 'Tür', 'Kategori', 'Açıklama', 'Tutar'],
      filtered.map((e) => [formatDate(e.date), e.kind, e.category, e.description ?? '', e.amount]),
    );
    downloadCsv(`gelir-gider-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  if (!can('kasa.goruntule')) {
    return <Alert kind="error">Gelir / gider kayıtlarını görüntüleme yetkiniz bulunmuyor.</Alert>;
  }

  return (
    <>
      <Seo title="Gelir Gider Kayıtları - Düğün Takip Panel" noindex />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold text-brand">Gelir Gider Kayıtları</h1>
        <button type="button" onClick={exportCsv} className="btn-outline btn-sm" disabled={filtered.length === 0}>
          <IconDownload size={16} /> CSV indir
        </button>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Toplam Gelir" value={formatMoney(totals.income, currency)} icon={IconWallet} tone="success" />
        <StatCard label="Toplam Gider" value={formatMoney(totals.expense, currency)} icon={IconWallet} tone="danger" />
        <StatCard
          label="Kasa Bakiyesi"
          value={formatMoney(totals.income - totals.expense, currency)}
          icon={IconWallet}
          tone={totals.income - totals.expense >= 0 ? 'success' : 'danger'}
        />
      </div>

      {can('kasa.duzenle') && (
        <form onSubmit={submit} noValidate className="card mb-6 grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-6">
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
          {error && <p className="text-xs text-[#e74c3c] md:col-span-2 lg:col-span-6" role="alert">{error}</p>}
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
            <thead>
              <tr className="border-b border-line bg-surface text-left text-xs uppercase text-brand-muted">
                <th className="px-4 py-3 font-medium">Tarih</th>
                <th className="px-4 py-3 font-medium">Tür</th>
                <th className="px-4 py-3 font-medium">Kategori</th>
                <th className="px-4 py-3 font-medium">Açıklama</th>
                <th className="px-4 py-3 text-right font-medium">Tutar</th>
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
                  <td className="px-4 py-3 text-brand-muted">{e.description || '—'}</td>
                  <td className={`px-4 py-3 text-right font-medium ${e.kind === 'Gelir' ? 'text-[#15803d]' : 'text-[#b91c1c]'}`}>
                    {e.kind === 'Gelir' ? '+' : '−'} {formatMoney(e.amount, currency)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {can('kasa.duzenle') && (
                      <button type="button" onClick={() => setToDelete(e)} aria-label="Kaydı sil" className="rounded p-1 text-brand-muted hover:text-[#e74c3c]">
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

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Kaydı silmek istiyor musunuz?"
        description={toDelete ? `${formatDate(toDelete.date)} · ${toDelete.category} · ${formatMoney(toDelete.amount, currency)}` : ''}
        confirmLabel="Evet, sil"
        onConfirm={remove}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}
