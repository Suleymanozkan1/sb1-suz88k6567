import { useEffect, useState } from 'react';
import Alert from './Alert';
import { useSaveTasks, useTasks } from '../lib/queries';
import { errorMessage } from '../lib/authHelpers';
import { sortTasks } from '../lib/plan';
import { IconPlus, IconTrash } from './Icons';

interface Props {
  reservationId: string;
  canEdit: boolean;
}

interface Row { atTime: string; title: string; responsible: string; done: boolean }

/** Yeni bir iş emri için başlangıç satırları; salonların ortak akışı. */
const VARSAYILAN: Row[] = [
  { atTime: '15:00', title: 'Salon temizliği ve kontrol', responsible: '', done: false },
  { atTime: '17:00', title: 'Masa düzeni ve süsleme kurulumu', responsible: '', done: false },
  { atTime: '18:30', title: 'Tedarikçi girişleri', responsible: '', done: false },
  { atTime: '19:00', title: 'Salon açılış ve karşılama', responsible: '', done: false },
  { atTime: '20:00', title: 'Yemek servisi', responsible: '', done: false },
  { atTime: '22:00', title: 'Pasta ve tatlı servisi', responsible: '', done: false },
];

export default function IsEmri({ reservationId, canEdit }: Props) {
  const { data: saved = [], isLoading } = useTasks(reservationId);
  const saveMutation = useSaveTasks(reservationId);

  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (dirty) return;
    setRows(sortTasks(saved).map((t) => ({
      atTime: t.atTime, title: t.title, responsible: t.responsible, done: t.done,
    })));
  }, [saved, dirty]);

  const done = rows.filter((r) => r.done).length;

  function update(index: number, patch: Partial<Row>) {
    setDirty(true);
    setRows((list) => list.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function save() {
    setError('');
    if (rows.some((r) => !r.title.trim())) {
      setError('Başlığı boş bir satır var.');
      return;
    }
    try {
      await saveMutation.mutateAsync(rows);
      setDirty(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (isLoading) return <p className="text-sm text-brand-muted">İş emri yükleniyor…</p>;

  return (
    <div>
      {rows.length > 0 && (
        <p className="mb-4 text-sm text-brand-muted">
          {rows.length} iş, {done} tanesi tamamlandı.
        </p>
      )}
      {error && <Alert kind="error" className="mb-4">{error}</Alert>}

      {canEdit && (
        <div className="mb-4 flex flex-wrap gap-2">
          {rows.length === 0 && (
            <button type="button" className="btn-outline btn-sm"
              onClick={() => { setDirty(true); setRows(VARSAYILAN.map((r) => ({ ...r }))); }}>
              Örnek akışla başla
            </button>
          )}
          <button type="button" className="btn-outline btn-sm"
            onClick={() => { setDirty(true); setRows((l) => [...l, { atTime: '19:00', title: '', responsible: '', done: false }]); }}>
            <IconPlus size={14} /> Satır ekle
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="rounded border border-dashed border-line p-6 text-center text-sm text-brand-muted">
          İş emri oluşturulmamış.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase text-brand-muted">
                <th className="py-2">Saat</th>
                <th className="py-2">İş</th>
                <th className="py-2">Sorumlu</th>
                <th className="py-2">Tamam</th>
                {canEdit && <th className="py-2" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-line">
                  <td className="py-2 pr-3">
                    <input aria-label={`${i + 1}. iş saati`} type="time" className="field-input w-28"
                      value={r.atTime} disabled={!canEdit}
                      onChange={(e) => update(i, { atTime: e.target.value })} />
                  </td>
                  <td className="py-2 pr-3">
                    <input aria-label={`${i + 1}. iş başlığı`} className="field-input"
                      value={r.title} disabled={!canEdit}
                      onChange={(e) => update(i, { title: e.target.value })} />
                  </td>
                  <td className="py-2 pr-3">
                    <input aria-label={`${i + 1}. iş sorumlusu`} className="field-input w-40"
                      placeholder="Servis, mutfak…" value={r.responsible} disabled={!canEdit}
                      onChange={(e) => update(i, { responsible: e.target.value })} />
                  </td>
                  <td className="py-2 pr-3">
                    <input type="checkbox" aria-label={`${i + 1}. iş tamamlandı`}
                      checked={r.done} disabled={!canEdit}
                      onChange={(e) => update(i, { done: e.target.checked })} />
                  </td>
                  {canEdit && (
                    <td className="py-2">
                      <button type="button" aria-label={`${i + 1}. işi sil`}
                        onClick={() => { setDirty(true); setRows((l) => l.filter((_, x) => x !== i)); }}
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

      {canEdit && rows.length > 0 && (
        <div className="mt-4 flex items-center gap-3">
          <button type="button" onClick={() => { void save(); }} disabled={saveMutation.isPending || !dirty}
            className="btn-primary btn-sm text-white hover:text-white">
            {saveMutation.isPending ? 'Kaydediliyor…' : 'İş emrini kaydet'}
          </button>
          {dirty && <span className="text-xs text-brand-muted">Kaydedilmemiş değişiklik var.</span>}
        </div>
      )}
    </div>
  );
}
