import { useState } from 'react';
import Seo from '../../components/Seo';
import Alert from '../../components/Alert';
import ConfirmDialog from '../../components/ConfirmDialog';
import { QueryBoundary } from '../../components/QueryState';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../lib/authHelpers';
import { useDeleteHall, useHalls, useReservations, useSaveHall } from '../../lib/queries';
import { uid } from '../../lib/ids';
import { formatNumber } from '../../lib/format';
import { IconBuilding, IconEdit, IconPlus, IconTrash } from '../../components/Icons';
import type { Hall } from '../../types';

const EMPTY = { name: '', capacity: '', note: '', isActive: true };

export default function Salonlar() {
  const { user, can } = useAuth();
  const businessId = user?.activeBusinessId ?? '';
  const { data: halls = [], isLoading, error: loadError } = useHalls();
  const { data: reservations = [] } = useReservations();
  const saveMutation = useSaveHall();
  const deleteMutation = useDeleteHall();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Hall | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [toDelete, setToDelete] = useState<Hall | null>(null);

  /** Salona bağlı aktif rezervasyon sayısı — silme uyarısında kullanılır. */
  function usageOf(hallId: string): number {
    return reservations.filter((r) => r.hallId === hallId && r.status !== 'İptal').length;
  }

  function openNew() {
    setEditing(null); setForm(EMPTY); setError(''); setShowForm(true);
  }

  function openEdit(hall: Hall) {
    setEditing(hall);
    setForm({
      name: hall.name, capacity: String(hall.capacity || ''),
      note: hall.note, isActive: hall.isActive,
    });
    setError(''); setShowForm(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('Salon adı giriniz.'); return; }
    const capacity = Number(form.capacity || 0);
    if (!Number.isFinite(capacity) || capacity < 0) { setError('Kapasite negatif olamaz.'); return; }

    try {
      await saveMutation.mutateAsync({
        id: editing?.id ?? uid('hall'),
        businessId,
        name: form.name.trim(),
        capacity: Math.floor(capacity),
        note: form.note.trim(),
        isActive: form.isActive,
        createdAt: editing?.createdAt,
      });
      setShowForm(false);
    } catch (err) {
      setError(errorMessage(err));
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

  if (!can('ayarlar.duzenle')) {
    return <Alert kind="error">Salon tanımlarını yalnızca yetkili kullanıcı düzenleyebilir.</Alert>;
  }

  return (
    <QueryBoundary isLoading={isLoading} error={loadError}>
      <Seo title="Salonlar - Düğün Takip Panel" noindex />

      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold text-brand">Salonlar</h1>
        <button type="button" onClick={openNew} className="btn-primary btn-sm text-white hover:text-white">
          <IconPlus size={16} /> Yeni Salon
        </button>
      </div>
      <p className="mb-6 text-sm text-brand-muted">
        Bir işletmede birden çok salon tanımlayabilirsiniz. Çakışma kontrolü salon bazında
        yapılır: aynı gün ve seansta farklı salonlara rezervasyon açılabilir, aynı salona açılamaz.
      </p>

      {error && <Alert kind="error" className="mb-4">{error}</Alert>}

      {showForm && (
        <form onSubmit={(e) => { void submit(e); }} noValidate className="card mb-6 p-5">
          <h2 className="mb-4 font-heading text-lg font-bold text-brand">
            {editing ? 'Salonu Düzenle' : 'Yeni Salon'}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="hall-name" className="field-label">Salon Adı</label>
              <input id="hall-name" className="field-input" value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="hall-capacity" className="field-label">Kapasite (kişi)</label>
              <input id="hall-capacity" inputMode="numeric" className="field-input" value={form.capacity}
                onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="hall-note" className="field-label">Açıklama</label>
              <input id="hall-note" className="field-input" value={form.note}
                placeholder="Sahne, balkon, açık alan…"
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
              Aktif (yeni rezervasyonlarda seçilebilir)
            </label>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="submit" className="btn-primary text-white hover:text-white"
              disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
            <button type="button" className="btn-outline" onClick={() => setShowForm(false)}>Vazgeç</button>
          </div>
        </form>
      )}

      {halls.length === 0 ? (
        <div className="card p-10 text-center">
          <IconBuilding size={32} className="mx-auto mb-3 text-brand-muted" />
          <p className="text-brand-muted">Henüz salon tanımlanmamış. Rezervasyon açabilmek için en az bir salon gerekir.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {halls.map((h) => (
            <div key={h.id} className="card p-5">
              <div className="mb-2 flex items-start justify-between gap-2">
                <h2 className="font-heading font-bold text-brand">{h.name}</h2>
                {!h.isActive && (
                  <span className="rounded-full bg-[#f2ece4] px-2 py-0.5 text-xs text-brand-muted">Pasif</span>
                )}
              </div>
              <dl className="mb-4 space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-brand-muted">Kapasite</dt>
                  <dd className="text-brand">{h.capacity > 0 ? `${formatNumber(h.capacity)} kişi` : '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-brand-muted">Rezervasyon</dt>
                  <dd className="text-brand">{formatNumber(usageOf(h.id))}</dd>
                </div>
              </dl>
              {h.note && <p className="mb-4 text-sm text-brand-muted">{h.note}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => openEdit(h)} className="btn-outline btn-sm">
                  <IconEdit size={14} /> Düzenle
                </button>
                <button type="button" onClick={() => setToDelete(h)} className="btn-outline btn-sm"
                  aria-label={`${h.name} salonunu sil`}>
                  <IconTrash size={14} /> Sil
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Salonu sil"
        description={
          toDelete && usageOf(toDelete.id) > 0
            ? `"${toDelete.name}" salonuna bağlı ${usageOf(toDelete.id)} rezervasyon var. Bu salon silinemez; bunun yerine pasife alabilirsiniz.`
            : `"${toDelete?.name}" salonu silinecek. Bu işlem geri alınamaz.`
        }
        confirmLabel="Sil"
        onConfirm={() => { void remove(); }}
        onCancel={() => setToDelete(null)}
      />
    </QueryBoundary>
  );
}
