import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Seo from '../../components/Seo';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../lib/authHelpers';
import { useDeleteReservation, useReservationsWithBalances } from '../../lib/queries';
import { QueryBoundary } from '../../components/QueryState';
import Alert from '../../components/Alert';
import { formatDate, formatMoney, formatPhone, normalizeTr } from '../../lib/format';
import { downloadCsv, toCsv, withinRange } from '../../lib/reports';
import { ORGANIZATION_TYPES } from '../../data/constants';
import { IconDownload, IconEdit, IconPlus, IconSearch, IconTrash } from '../../components/Icons';
import ConfirmDialog from '../../components/ConfirmDialog';
import type { Reservation, ReservationStatus } from '../../types';

const STATUSES: ReservationStatus[] = ['Ön Rezervasyon', 'Kesin Rezervasyon', 'Tamamlandı', 'İptal'];

const STATUS_STYLES: Record<ReservationStatus, string> = {
  'Ön Rezervasyon': 'bg-[#fef6e7] text-[#92600e]',
  'Kesin Rezervasyon': 'bg-[#e7f5fb] text-[#0c5e8a]',
  Tamamlandı: 'bg-[#e8f8ef] text-[#15803d]',
  İptal: 'bg-[#fdecea] text-[#b91c1c]',
};

export default function Rezervasyonlar() {
  const { reservations, colors, balance, isLoading, error } = useReservationsWithBalances();
  const { can } = useAuth();
  const deleteMutation = useDeleteReservation();
  const [deleteError, setDeleteError] = useState('');

  const [query, setQuery] = useState('');
  const [org, setOrg] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<'date-desc' | 'date-asc' | 'amount-desc' | 'remaining-desc'>('date-desc');
  const [pendingDelete, setPendingDelete] = useState<Reservation | null>(null);

  const filtered = useMemo(() => {
    const q = normalizeTr(query);
    const rows = reservations.filter((r) => {
      if (org && r.organizationType !== org) return false;
      if (status && r.status !== status) return false;
      if (!withinRange(r.date, { from, to })) return false;
      if (q && !normalizeTr(`${r.customerName} ${r.customerPhone} ${r.code}`).includes(q)) return false;
      return true;
    });

    return [...rows].sort((a, b) => {
      switch (sort) {
        case 'date-asc':
          return a.date.localeCompare(b.date);
        case 'amount-desc':
          return b.totalAmount - a.totalAmount;
        case 'remaining-desc':
          return balance.remaining(b) - balance.remaining(a);
        default:
          return b.date.localeCompare(a.date);
      }
    });
  }, [reservations, query, org, status, from, to, sort, balance]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, r) => ({
          total: acc.total + r.totalAmount,
          paid: acc.paid + balance.paid(r),
          remaining: acc.remaining + balance.remaining(r),
        }),
        { total: 0, paid: 0, remaining: 0 },
      ),
    [filtered, balance],
  );

  function exportCsv() {
    const csv = toCsv(
      ['Kod', 'Tarih', 'Seans', 'Müşteri', 'Telefon', 'Organizasyon', 'Davetli', 'Toplam', 'Ödenen', 'Kalan', 'Durum'],
      filtered.map((r) => [
        r.code, formatDate(r.date), r.slot, r.customerName, formatPhone(r.customerPhone),
        r.organizationType, r.guestCount, r.totalAmount, balance.paid(r), balance.remaining(r), r.status,
      ]),
    );
    downloadCsv(`rezervasyonlar-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteError('');
    try {
      await deleteMutation.mutateAsync(pendingDelete.id);
      setPendingDelete(null);
    } catch (e) {
      setDeleteError(errorMessage(e));
      setPendingDelete(null);
    }
  }

  const clearFilters = () => {
    setQuery(''); setOrg(''); setStatus(''); setFrom(''); setTo('');
  };

  return (
    <QueryBoundary isLoading={isLoading} error={error}>
      <Seo title="Rezervasyonlar - Düğün Takip Panel" noindex />
      {deleteError && <Alert kind="error" className="mb-5">{deleteError}</Alert>}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold text-brand">Rezervasyonlar</h1>
        <div className="flex gap-2">
          <button type="button" onClick={exportCsv} className="btn-outline btn-sm" disabled={filtered.length === 0}>
            <IconDownload size={16} /> CSV indir
          </button>
          {can('rezervasyon.duzenle') && (
            <Link to="/panel/rezervasyonlar/yeni" className="btn-primary btn-sm text-white hover:text-white">
              <IconPlus size={16} /> Yeni Rezervasyon
            </Link>
          )}
        </div>
      </div>

      <form className="card mb-5 grid gap-3 p-4 md:grid-cols-3 lg:grid-cols-6" onSubmit={(e) => e.preventDefault()} role="search">
        <div className="md:col-span-3 lg:col-span-2">
          <label htmlFor="rz-q" className="field-label">İsim / telefon / kod</label>
          <div className="relative">
            <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
            <input id="rz-q" type="search" className="field-input pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Detaylı kayıt arama" />
          </div>
        </div>
        <div>
          <label htmlFor="rz-org" className="field-label">Organizasyon</label>
          <select id="rz-org" className="field-input" value={org} onChange={(e) => setOrg(e.target.value)}>
            <option value="">Tümü</option>
            {ORGANIZATION_TYPES.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="rz-status" className="field-label">Durum</label>
          <select id="rz-status" className="field-input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tümü</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="rz-from" className="field-label">Başlangıç</label>
          <input id="rz-from" type="date" className="field-input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label htmlFor="rz-to" className="field-label">Bitiş</label>
          <input id="rz-to" type="date" className="field-input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="md:col-span-3 lg:col-span-6 flex flex-wrap items-end justify-between gap-3">
          <div className="w-full sm:w-56">
            <label htmlFor="rz-sort" className="field-label">Sıralama</label>
            <select id="rz-sort" className="field-input" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="date-desc">Tarihe göre (yeni → eski)</option>
              <option value="date-asc">Tarihe göre (eski → yeni)</option>
              <option value="amount-desc">Tutara göre</option>
              <option value="remaining-desc">Kalan alacağa göre</option>
            </select>
          </div>
          <button type="button" className="btn-outline btn-sm" onClick={clearFilters}>Filtreleri temizle</button>
        </div>
      </form>

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Mini label="Kayıt" value={String(filtered.length)} />
        <Mini label="Toplam" value={formatMoney(totals.total)} />
        <Mini label="Tahsil edilen" value={formatMoney(totals.paid)} />
        <Mini label="Kalan alacak" value={formatMoney(totals.remaining)} />
      </div>

      <div className="card overflow-x-auto">
        {filtered.length === 0 ? (
          <p className="p-10 text-center text-sm text-brand-muted">Kriterlere uygun rezervasyon kaydı bulunamadı.</p>
        ) : (
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-line bg-surface text-left text-xs uppercase text-brand-muted">
                <th className="px-4 py-3 font-medium">Kod</th>
                <th className="px-4 py-3 font-medium">Tarih / Seans</th>
                <th className="px-4 py-3 font-medium">Müşteri</th>
                <th className="px-4 py-3 font-medium">Organizasyon</th>
                <th className="px-4 py-3 text-right font-medium">Toplam</th>
                <th className="px-4 py-3 text-right font-medium">Kalan</th>
                <th className="px-4 py-3 font-medium">Durum</th>
                <th className="px-4 py-3 text-right font-medium">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const color = colors.find((c) => c.key === r.colorKey)?.color ?? '#47b2e4';
                return (
                  <tr key={r.id} className="border-b border-line/60 last:border-0 hover:bg-surface/60">
                    <td className="px-4 py-3 font-mono text-xs text-brand-muted">{r.code}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-brand">
                      {formatDate(r.date)}
                      <span className="ml-1.5 text-xs text-brand-muted">{r.slot}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/panel/rezervasyonlar/${r.id}`} className="font-medium">{r.customerName}</Link>
                      <span className="block text-xs text-brand-muted">{formatPhone(r.customerPhone)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-brand">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                        {r.organizationType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-brand">{formatMoney(r.totalAmount, r.currency)}</td>
                    <td className="px-4 py-3 text-right font-medium text-brand">{formatMoney(balance.remaining(r), r.currency)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs ${STATUS_STYLES[r.status]}`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {can('rezervasyon.duzenle') && (
                          <Link to={`/panel/rezervasyonlar/${r.id}/duzenle`} aria-label={`${r.customerName} kaydını düzenle`} className="rounded p-1.5 text-brand-muted hover:bg-surface hover:text-accent">
                            <IconEdit size={16} />
                          </Link>
                        )}
                        {can('rezervasyon.sil') && (
                          <button type="button" onClick={() => setPendingDelete(r)} aria-label={`${r.customerName} kaydını sil`} className="rounded p-1.5 text-brand-muted hover:bg-surface hover:text-[#e74c3c]">
                            <IconTrash size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Rezervasyon kaydını silmek istiyor musunuz?"
        description={
          pendingDelete
            ? `${pendingDelete.customerName} · ${formatDate(pendingDelete.date)} kaydı ve ilgili tahsilatlar kalıcı olarak silinecektir.`
            : ''
        }
        confirmLabel="Evet, sil"
        onConfirm={() => { void confirmDelete(); }}
        onCancel={() => setPendingDelete(null)}
      />
    </QueryBoundary>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs text-brand-muted">{label}</p>
      <p className="mt-0.5 font-heading font-bold text-brand">{value}</p>
    </div>
  );
}
