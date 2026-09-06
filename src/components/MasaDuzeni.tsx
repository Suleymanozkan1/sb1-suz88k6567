import { useEffect, useState } from 'react';
import Alert from '../components/Alert';
import { useSaveSeating, useSeating } from '../lib/queries';
import { errorMessage } from '../lib/authHelpers';
import { nextTableNo, suggestTables, summarizeSeating } from '../lib/seating';
import { formatNumber } from '../lib/format';
import { IconPlus, IconTrash } from './Icons';

interface Props {
  reservationId: string;
  guestCount: number;
  canEdit: boolean;
}

interface Row {
  tableNo: number;
  seats: number;
  label: string;
}

/** Rezervasyon detayındaki masa oturma düzeni bölümü. */
export default function MasaDuzeni({ reservationId, guestCount, canEdit }: Props) {
  const { data: saved = [], isLoading } = useSeating(reservationId);
  const saveMutation = useSaveSeating(reservationId);

  const [rows, setRows] = useState<Row[]>([]);
  const [perTable, setPerTable] = useState('10');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);

  // Kayıtlı plan yüklenince forma aktarılır; kullanıcı düzenlemeye başladıysa ezilmez.
  useEffect(() => {
    if (dirty) return;
    setRows(saved.map((t) => ({ tableNo: t.tableNo, seats: t.seats, label: t.label })));
  }, [saved, dirty]);

  const summary = summarizeSeating(
    rows.map((r, i) => ({ id: String(i), reservationId, ...r })),
    guestCount,
  );

  function update(index: number, patch: Partial<Row>) {
    setDirty(true);
    setRows((list) => list.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setDirty(true);
    setRows((list) => [
      ...list,
      {
        tableNo: nextTableNo(list.map((r, i) => ({ id: String(i), reservationId, ...r }))),
        seats: Number(perTable) || 10,
        label: '',
      },
    ]);
  }

  function removeRow(index: number) {
    setDirty(true);
    setRows((list) => list.filter((_, i) => i !== index));
  }

  function autoFill() {
    setDirty(true);
    setError('');
    const suggested = suggestTables(guestCount, Number(perTable) || 10);
    setRows(suggested.map((t) => ({ ...t, label: '' })));
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

  if (isLoading) return <p className="text-sm text-brand-muted">Masa düzeni yükleniyor…</p>;

  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded border border-line bg-surface p-3">
          <span className="block text-xs text-brand-muted">Masa sayısı</span>
          <span className="font-heading text-xl font-bold text-brand">{summary.tableCount}</span>
        </div>
        <div className="rounded border border-line bg-surface p-3">
          <span className="block text-xs text-brand-muted">Toplam koltuk</span>
          <span className="font-heading text-xl font-bold text-brand">{formatNumber(summary.totalSeats)}</span>
        </div>
        <div className="rounded border border-line bg-surface p-3">
          <span className="block text-xs text-brand-muted">
            {summary.isEnough ? 'Fazla koltuk' : 'Eksik koltuk'}
          </span>
          <span className={`font-heading text-xl font-bold ${summary.isEnough ? 'text-brand' : 'text-[#e74c3c]'}`}>
            {formatNumber(summary.isEnough ? summary.spareSeats : summary.missingSeats)}
          </span>
        </div>
      </div>

      {!summary.isEnough && rows.length > 0 && (
        <Alert kind="warning" className="mb-4">
          Masa planı {formatNumber(guestCount)} davetliyi karşılamıyor;
          {' '}{formatNumber(summary.missingSeats)} koltuk eksik.
        </Alert>
      )}
      {error && <Alert kind="error" className="mb-4">{error}</Alert>}

      {canEdit && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="seat-per-table" className="field-label">Masa başına koltuk</label>
            <input id="seat-per-table" inputMode="numeric" className="field-input w-32" value={perTable}
              onChange={(e) => setPerTable(e.target.value)} />
          </div>
          <button type="button" onClick={autoFill} className="btn-outline btn-sm">
            Davetliye göre plan öner
          </button>
          <button type="button" onClick={addRow} className="btn-outline btn-sm">
            <IconPlus size={14} /> Masa ekle
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="rounded border border-dashed border-line p-6 text-center text-sm text-brand-muted">
          Masa düzeni oluşturulmamış. “Davetliye göre plan öner” ile başlayabilirsiniz.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase text-brand-muted">
                <th className="py-2">Masa</th>
                <th className="py-2">Koltuk</th>
                <th className="py-2">Açıklama</th>
                {canEdit && <th className="py-2" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-line">
                  <td className="py-2 pr-3">
                    <input aria-label={`${i + 1}. masa numarası`} inputMode="numeric"
                      className="field-input w-20" value={r.tableNo} disabled={!canEdit}
                      onChange={(e) => update(i, { tableNo: Number(e.target.value) || 0 })} />
                  </td>
                  <td className="py-2 pr-3">
                    <input aria-label={`${i + 1}. masa koltuk sayısı`} inputMode="numeric"
                      className="field-input w-20" value={r.seats} disabled={!canEdit}
                      onChange={(e) => update(i, { seats: Number(e.target.value) || 0 })} />
                  </td>
                  <td className="py-2 pr-3">
                    <input aria-label={`${i + 1}. masa açıklaması`} className="field-input"
                      placeholder="Gelin tarafı, damat tarafı…" value={r.label} disabled={!canEdit}
                      onChange={(e) => update(i, { label: e.target.value })} />
                  </td>
                  {canEdit && (
                    <td className="py-2">
                      <button type="button" onClick={() => removeRow(i)}
                        aria-label={`${i + 1}. masayı sil`}
                        className="rounded p-1 text-brand-muted hover:text-[#e74c3c]">
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

      {canEdit && (
        <div className="mt-4 flex items-center gap-3">
          <button type="button" onClick={() => { void save(); }} disabled={saveMutation.isPending || !dirty}
            className="btn-primary btn-sm text-white hover:text-white">
            {saveMutation.isPending ? 'Kaydediliyor…' : 'Masa düzenini kaydet'}
          </button>
          {dirty && <span className="text-xs text-brand-muted">Kaydedilmemiş değişiklik var.</span>}
        </div>
      )}
    </div>
  );
}
