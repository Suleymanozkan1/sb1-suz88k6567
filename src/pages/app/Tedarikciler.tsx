import { useState } from 'react';
import Seo from '../../components/Seo';
import Alert from '../../components/Alert';
import ConfirmDialog from '../../components/ConfirmDialog';
import { QueryBoundary } from '../../components/QueryState';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../lib/authHelpers';
import { useDeleteVendor, useSaveVendor, useVendors } from '../../lib/queries';
import { uid } from '../../lib/ids';
import { formatPhone } from '../../lib/format';
import { IconEdit, IconPlus, IconTrash, IconUsers } from '../../components/Icons';
import { VENDOR_CATEGORIES, type Vendor } from '../../types';

const EMPTY = { name: '', category: VENDOR_CATEGORIES[0] as string, phone: '', note: '', isActive: true };

export default function Tedarikciler() {
  const { user, can } = useAuth();
  const businessId = user?.activeBusinessId ?? '';
  const { data: vendors = [], isLoading, error: loadError } = useVendors();
  const saveMutation = useSaveVendor();
  const deleteMutation = useDeleteVendor();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [toDelete, setToDelete] = useState<Vendor | null>(null);

  function openNew() { setEditing(null); setForm(EMPTY); setError(''); setShowForm(true); }

  function openEdit(v: Vendor) {
    setEditing(v);
    setForm({ name: v.name, category: v.category, phone: v.phone, note: v.note, isActive: v.isActive });
    setError(''); setShowForm(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('Tedarikçi adı giriniz.'); return; }
    try {
      await saveMutation.mutateAsync({
        id: editing?.id ?? uid('vendor'),
        businessId,
        name: form.name.trim(),
        category: form.category,
        phone: form.phone.replace(/\D/g, ''),
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
    return <Alert kind="error">Tedarikçi tanımlarını yalnızca yetkili kullanıcı düzenleyebilir.</Alert>;
  }

  return (
    <QueryBoundary isLoading={isLoading} error={loadError}>
      <Seo title="Tedarikçiler - Sahra Takip Panel" noindex />

      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold text-brand">Tedarikçiler</h1>
        <button type="button" onClick={openNew} className="btn-primary btn-sm text-white hover:text-white">
          <IconPlus size={16} /> Yeni Tedarikçi
        </button>
      </div>
      <p className="mb-6 text-sm text-brand-muted">
        Orkestra, fotoğrafçı, çiçekçi gibi dışarıdan çalıştığınız firmalar burada tutulur.
        Her organizasyona tedarikçi atayıp geliş saatini ve ücretini kaydedebilirsiniz.
      </p>

      {error && <Alert kind="error" className="mb-4">{error}</Alert>}

      {showForm && (
        <form onSubmit={(e) => { void submit(e); }} noValidate className="card mb-6 p-5">
          <h2 className="mb-4 font-heading text-lg font-bold text-brand">
            {editing ? 'Tedarikçiyi Düzenle' : 'Yeni Tedarikçi'}
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label htmlFor="vendor-name" className="field-label">Firma / Kişi Adı</label>
              <input id="vendor-name" className="field-input" value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="vendor-category" className="field-label">Kategori</label>
              <select id="vendor-category" className="field-input" value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                {VENDOR_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="vendor-phone" className="field-label">Telefon</label>
              <input id="vendor-phone" type="tel" className="field-input" placeholder="532xxxyyzz"
                value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="md:col-span-3">
              <label htmlFor="vendor-note" className="field-label">Not</label>
              <input id="vendor-note" className="field-input" value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-sm md:col-span-3">
              <input type="checkbox" checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
              Aktif (organizasyonlara atanabilir)
            </label>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="submit" className="btn-primary text-white hover:text-white" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
            <button type="button" className="btn-outline" onClick={() => setShowForm(false)}>Vazgeç</button>
          </div>
        </form>
      )}

      {vendors.length === 0 ? (
        <div className="card p-10 text-center">
          <IconUsers size={32} className="mx-auto mb-3 text-brand-muted" />
          <p className="text-brand-muted">Henüz tedarikçi tanımlanmamış.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {vendors.map((v) => (
            <div key={v.id} className="card p-5">
              <div className="mb-1 flex items-start justify-between gap-2">
                <h2 className="font-heading font-bold text-brand">{v.name}</h2>
                {!v.isActive && (
                  <span className="rounded-full bg-[#f2ece4] px-2 py-0.5 text-xs text-brand-muted">Pasif</span>
                )}
              </div>
              <p className="mb-3 text-sm text-brand-muted">{v.category}</p>
              {v.phone && (
                <p className="mb-1 text-sm">
                  <a className="text-brand underline" href={`tel:${v.phone}`}>{formatPhone(v.phone)}</a>
                </p>
              )}
              {v.note && <p className="mb-3 text-sm text-brand-muted">{v.note}</p>}
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => openEdit(v)} className="btn-outline btn-sm">
                  <IconEdit size={14} /> Düzenle
                </button>
                <button type="button" onClick={() => setToDelete(v)} className="btn-outline btn-sm"
                  aria-label={`${v.name} tedarikçisini sil`}>
                  <IconTrash size={14} /> Sil
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Tedarikçiyi sil"
        description={`"${toDelete?.name}" silinecek. Organizasyonlara atanmışsa silinemez; bunun yerine pasife alabilirsiniz.`}
        confirmLabel="Sil"
        onConfirm={() => { void remove(); }}
        onCancel={() => setToDelete(null)}
      />
    </QueryBoundary>
  );
}
