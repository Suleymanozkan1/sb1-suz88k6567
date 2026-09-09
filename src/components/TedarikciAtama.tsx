import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Alert from './Alert';
import { useReservationVendors, useSaveReservationVendors, useVendors } from '../lib/queries';
import { errorMessage } from '../lib/authHelpers';
import { vendorCostTotal } from '../lib/plan';
import { formatMoney } from '../lib/format';
import { IconPlus, IconTrash } from './Icons';

interface Props {
  reservationId: string;
  currency: string;
  canEdit: boolean;
}

interface Row { vendorId: string; arriveAt: string; cost: number; note: string }

export default function TedarikciAtama({ reservationId, currency, canEdit }: Props) {
  const { data: vendors = [] } = useVendors();
  const { data: saved = [], isLoading } = useReservationVendors(reservationId);
  const saveMutation = useSaveReservationVendors(reservationId);

  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (dirty) return;
    setRows(saved.map((rv) => ({
      vendorId: rv.vendorId, arriveAt: rv.arriveAt ?? '', cost: rv.cost, note: rv.note,
    })));
  }, [saved, dirty]);

  const total = vendorCostTotal(rows.map((r, i) => ({ id: String(i), reservationId, ...r })));
  const available = vendors.filter((v) => v.isActive || rows.some((r) => r.vendorId === v.id));

  function update(index: number, patch: Partial<Row>) {
    setDirty(true);
    setRows((list) => list.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function save() {
    setError('');
    if (rows.some((r) => !r.vendorId)) { setError('Tedarikçi seçilmemiş satır var.'); return; }
    try {
      await saveMutation.mutateAsync(rows.map((r) => ({
        vendorId: r.vendorId, arriveAt: r.arriveAt || undefined, cost: r.cost, note: r.note,
      })));
      setDirty(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (isLoading) return <p className="text-sm text-brand-muted">Tedarikçiler yükleniyor…</p>;

  if (vendors.length === 0) {
    return (
      <p className="rounded border border-dashed border-line p-6 text-center text-sm text-brand-muted">
        Henüz tedarikçi tanımlanmamış.{' '}
        <Link to="/panel/tedarikciler" className="text-brand underline">Tedarikçiler</Link> ekranından ekleyebilirsiniz.
      </p>
    );
  }

  return (
    <div>
      {rows.length > 0 && (
        <p className="mb-4 text-sm text-brand-muted">
          {rows.length} tedarikçi, toplam maliyet {formatMoney(total, currency)}.
        </p>
      )}
      {error && <Alert kind="error" className="mb-4">{error}</Alert>}

      {canEdit && (
        <button type="button" className="btn-outline btn-sm mb-4"
          onClick={() => { setDirty(true); setRows((l) => [...l, { vendorId: '', arriveAt: '', cost: 0, note: '' }]); }}>
          <IconPlus size={14} /> Tedarikçi ekle
        </button>
      )}

      {rows.length === 0 ? (
        <p className="rounded border border-dashed border-line p-6 text-center text-sm text-brand-muted">
          Bu organizasyona tedarikçi atanmamış.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase text-brand-muted">
                <th className="py-2">Tedarikçi</th>
                <th className="py-2">Geliş saati</th>
                <th className="py-2">Ücret</th>
                <th className="py-2">Not</th>
                {canEdit && <th className="py-2" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-line">
                  <td className="py-2 pr-3">
                    <select aria-label={`${i + 1}. tedarikçi`} className="field-input w-48"
                      value={r.vendorId} disabled={!canEdit}
                      onChange={(e) => update(i, { vendorId: e.target.value })}>
                      <option value="">Seçiniz</option>
                      {available.map((v) => (
                        <option key={v.id} value={v.id}>{v.name} · {v.category}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <input aria-label={`${i + 1}. tedarikçi geliş saati`} type="time" className="field-input w-28"
                      value={r.arriveAt} disabled={!canEdit}
                      onChange={(e) => update(i, { arriveAt: e.target.value })} />
                  </td>
                  <td className="py-2 pr-3">
                    <input aria-label={`${i + 1}. tedarikçi ücreti`} inputMode="decimal" className="field-input w-32"
                      value={r.cost} disabled={!canEdit}
                      onChange={(e) => update(i, { cost: Number(e.target.value) || 0 })} />
                  </td>
                  <td className="py-2 pr-3">
                    <input aria-label={`${i + 1}. tedarikçi notu`} className="field-input"
                      value={r.note} disabled={!canEdit}
                      onChange={(e) => update(i, { note: e.target.value })} />
                  </td>
                  {canEdit && (
                    <td className="py-2">
                      <button type="button" aria-label={`${i + 1}. tedarikçiyi kaldır`}
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
            {saveMutation.isPending ? 'Kaydediliyor…' : 'Tedarikçileri kaydet'}
          </button>
          {dirty && <span className="text-xs text-brand-muted">Kaydedilmemiş değişiklik var.</span>}
        </div>
      )}
    </div>
  );
}
