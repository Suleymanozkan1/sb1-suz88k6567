import { useEffect, useState } from 'react';
import Alert from './Alert';
import { useInstallments, useSaveInstallments } from '../lib/queries';
import { errorMessage } from '../lib/authHelpers';
import { buildPlan, splitInstallments } from '../lib/plan';
import { formatDate, formatMoney, todayIso } from '../lib/format';
import { IconPlus, IconTrash } from './Icons';
import type { Payment } from '../types';

interface Props {
  reservationId: string;
  totalAmount: number;
  currency: string;
  payments: Payment[];
  canEdit: boolean;
}

interface Row { seq: number; dueDate: string; amount: number; note: string }

const DURUM: Record<string, { label: string; className: string }> = {
  odendi: { label: 'Ödendi', className: 'bg-[#e6f4ea] text-[#1e7b3c]' },
  gecikti: { label: 'Gecikti', className: 'bg-[#fdecea] text-[#b3261e]' },
  yaklasiyor: { label: 'Yaklaşıyor', className: 'bg-[#fdf0d5] text-[#8a6100]' },
  bekliyor: { label: 'Bekliyor', className: 'bg-[#f2ece4] text-brand-muted' },
};

export default function OdemePlani({ reservationId, totalAmount, currency, payments, canEdit }: Props) {
  const { data: saved = [], isLoading } = useInstallments(reservationId);
  const saveMutation = useSaveInstallments(reservationId);

  const [rows, setRows] = useState<Row[]>([]);
  const [count, setCount] = useState('3');
  const [firstDue, setFirstDue] = useState(todayIso());
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (dirty) return;
    setRows(saved.map((i) => ({ seq: i.seq, dueDate: i.dueDate, amount: i.amount, note: i.note })));
  }, [saved, dirty]);

  const plan = buildPlan(
    rows.map((r, i) => ({ id: String(i), reservationId, ...r })),
    payments,
    totalAmount,
    todayIso(),
  );

  function update(index: number, patch: Partial<Row>) {
    setDirty(true);
    setRows((list) => list.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setDirty(true);
    setRows((list) => [
      ...list,
      { seq: list.reduce((m, r) => Math.max(m, r.seq), 0) + 1, dueDate: firstDue, amount: 0, note: '' },
    ]);
  }

  function autoSplit() {
    setDirty(true);
    setError('');
    const paidSoFar = payments.reduce((sum, p) => sum + p.amount, 0);
    setRows(splitInstallments(totalAmount - paidSoFar, Number(count) || 1, firstDue));
  }

  async function save() {
    setError('');
    try {
      await saveMutation.mutateAsync(rows);
      setDirty(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (isLoading) return <p className="text-sm text-brand-muted">Ödeme planı yükleniyor…</p>;

  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        {[
          ['Planlanan', formatMoney(plan.planned, currency), ''],
          ['Tahsil edilen', formatMoney(plan.paid, currency), ''],
          ['Vadesi geçen', formatMoney(plan.overdue, currency), plan.overdue > 0 ? 'text-danger' : ''],
          ['Plana bağlanmayan', formatMoney(plan.unplanned, currency), ''],
        ].map(([label, value, tone]) => (
          <div key={label} className="rounded border border-line bg-surface p-3">
            <span className="block text-xs text-brand-muted">{label}</span>
            <span className={`font-heading text-lg font-bold ${tone || 'text-brand'}`}>{value}</span>
          </div>
        ))}
      </div>

      {error && <Alert kind="error" className="mb-4">{error}</Alert>}

      {canEdit && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="plan-count" className="field-label">Taksit sayısı</label>
            <input id="plan-count" inputMode="numeric" className="field-input w-28" value={count}
              onChange={(e) => setCount(e.target.value)} />
          </div>
          <div>
            <label htmlFor="plan-first" className="field-label">İlk vade</label>
            <input id="plan-first" type="date" className="field-input" value={firstDue}
              onChange={(e) => setFirstDue(e.target.value)} />
          </div>
          <button type="button" onClick={autoSplit} className="btn-outline btn-sm">
            Kalan tutarı böl
          </button>
          <button type="button" onClick={addRow} className="btn-outline btn-sm">
            <IconPlus size={14} /> Taksit ekle
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="rounded border border-dashed border-line p-6 text-center text-sm text-brand-muted">
          Ödeme planı oluşturulmamış.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase text-brand-muted">
                <th className="py-2">Sıra</th>
                <th className="py-2">Vade</th>
                <th className="py-2">Tutar</th>
                <th className="py-2">Açıklama</th>
                <th className="py-2">Durum</th>
                {canEdit && <th className="py-2" />}
              </tr>
            </thead>
            <tbody>
              {plan.rows.map((row, i) => (
                <tr key={i} className="border-b border-line">
                  <td className="py-2 pr-3 text-brand">{row.seq}</td>
                  <td className="py-2 pr-3">
                    {canEdit ? (
                      <input aria-label={`${row.seq}. taksit vadesi`} type="date" className="field-input w-40"
                        value={row.dueDate} onChange={(e) => update(i, { dueDate: e.target.value })} />
                    ) : formatDate(row.dueDate)}
                  </td>
                  <td className="py-2 pr-3">
                    {canEdit ? (
                      <input aria-label={`${row.seq}. taksit tutarı`} inputMode="decimal" className="field-input w-32"
                        value={row.amount} onChange={(e) => update(i, { amount: Number(e.target.value) || 0 })} />
                    ) : formatMoney(row.amount, currency)}
                  </td>
                  <td className="py-2 pr-3">
                    {canEdit ? (
                      <input aria-label={`${row.seq}. taksit açıklaması`} className="field-input"
                        value={row.note} onChange={(e) => update(i, { note: e.target.value })} />
                    ) : row.note || '—'}
                  </td>
                  <td className="py-2 pr-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${DURUM[row.state].className}`}>
                      {DURUM[row.state].label}
                    </span>
                  </td>
                  {canEdit && (
                    <td className="py-2">
                      <button type="button" aria-label={`${row.seq}. taksiti sil`}
                        onClick={() => { setDirty(true); setRows((l) => l.filter((_, x) => x !== i)); }}
                        className="rounded p-1 text-brand-muted hover:text-danger">
                        <IconTrash size={16} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && rows.length > 0 && (
        <div className="mt-4 flex items-center gap-3">
          <button type="button" onClick={() => { void save(); }} disabled={saveMutation.isPending || !dirty}
            className="btn-primary btn-sm text-white hover:text-white">
            {saveMutation.isPending ? 'Kaydediliyor…' : 'Ödeme planını kaydet'}
          </button>
          {dirty && <span className="text-xs text-brand-muted">Kaydedilmemiş değişiklik var.</span>}
        </div>
      )}
    </div>
  );
}
