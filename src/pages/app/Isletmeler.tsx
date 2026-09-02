import { useState } from 'react';
import Seo from '../../components/Seo';
import Alert from '../../components/Alert';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../lib/authHelpers';
import { useBusinesses, useDeleteBusiness, useSaveBusiness } from '../../lib/queries';
import { QueryBoundary } from '../../components/QueryState';
import { CATEGORIES, CITIES, CURRENCIES, DISTRICTS } from '../../data/constants';
import { formatPhone } from '../../lib/format';
import { IconBuilding, IconEdit, IconPlus, IconTrash } from '../../components/Icons';
import type { Business, Currency } from '../../types';

const EMPTY = {
  name: '', category: CATEGORIES[0], city: '', district: '', phone: '',
  capacity: '', currency: 'TL' as Currency, address: '', about: '',
};

export default function Isletmeler() {
  const { user, can, setActiveBusiness, ownerId } = useAuth();
  const { data: businesses = [], isLoading, error: loadError } = useBusinesses();
  const saveMutation = useSaveBusiness();
  const deleteMutation = useDeleteBusiness();
  const [editing, setEditing] = useState<Business | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [toDelete, setToDelete] = useState<Business | null>(null);

  const districts = DISTRICTS[form.city] ?? [];

  function openNew() {
    setEditing(null);
    setForm(EMPTY);
    setError('');
    setShowForm(true);
  }

  function openEdit(b: Business) {
    setEditing(b);
    setForm({
      name: b.name, category: b.category, city: b.city, district: b.district, phone: b.phone,
      capacity: String(b.capacity), currency: b.currency, address: b.address ?? '', about: b.about ?? '',
    });
    setError('');
    setShowForm(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('İşletme adını giriniz.'); return; }
    if (!form.city) { setError('Şehir seçiniz.'); return; }
    if (form.capacity && (!/^\d+$/.test(form.capacity) || Number(form.capacity) <= 0)) {
      setError('Kapasiteyi rakam olarak giriniz.');
      return;
    }

    try {
      await saveMutation.mutateAsync({
      id: editing?.id ?? crypto.randomUUID(),
      ownerId,
      name: form.name.trim(),
      category: form.category,
      city: form.city,
      district: form.district || form.city,
      phone: form.phone.replace(/\D/g, ''),
      capacity: Number(form.capacity) || 0,
      currency: form.currency,
      address: form.address.trim() || undefined,
      about: form.about.trim() || undefined,
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
      if (user?.activeBusinessId === target.id) {
        const rest = businesses.filter((b) => b.id !== target.id);
        if (rest[0]) await setActiveBusiness(rest[0].id);
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (!can('ayarlar.duzenle')) {
    return <Alert kind="error">İşletme yönetimi için yetkiniz bulunmuyor.</Alert>;
  }

  return (
    <QueryBoundary isLoading={isLoading} error={loadError}>
      <Seo title="Firmalarım - Düğün Takip Panel" noindex />

      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold text-brand">Firmalarım / Adminler</h1>
        <button type="button" onClick={openNew} className="btn-primary btn-sm text-white hover:text-white">
          <IconPlus size={16} /> Yeni İşletme Ekle
        </button>
      </div>
      <p className="mb-6 text-sm text-brand-muted">
        Birden fazla düğün salonu sahibiyseniz her salonunuz için ayrı işletme ekleyebilir, panelin üst kısmından
        işletmeler arasında geçiş yapabilirsiniz.
      </p>

      {showForm && (
        <form onSubmit={(e) => { void submit(e); }} noValidate className="card mb-6 p-5">
          <h2 className="mb-4 font-heading text-lg font-bold text-brand">
            {editing ? 'İşletmeyi Düzenle' : 'Yeni İşletme'}
          </h2>
          {error && <Alert kind="error" className="mb-4">{error}</Alert>}

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="bz-name" className="field-label">İşletme Adı</label>
              <input id="bz-name" className="field-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="bz-category" className="field-label">Kategori</label>
              <select id="bz-category" className="field-input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="bz-phone" className="field-label">Telefon</label>
              <input id="bz-phone" type="tel" className="field-input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="bz-city" className="field-label">Şehir</label>
              <select id="bz-city" className="field-input" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value, district: '' }))}>
                <option value="">---Seçiniz---</option>
                {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="bz-district" className="field-label">İlçe</label>
              {districts.length > 0 ? (
                <select id="bz-district" className="field-input" value={form.district} onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))}>
                  <option value="">---Seçiniz---</option>
                  {districts.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              ) : (
                <input id="bz-district" className="field-input" value={form.district} onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))} />
              )}
            </div>
            <div>
              <label htmlFor="bz-capacity" className="field-label">Salon Kapasitesi (kişi)</label>
              <input id="bz-capacity" inputMode="numeric" className="field-input" value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="bz-currency" className="field-label">Para Birimi</label>
              <select id="bz-currency" className="field-input" value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value as Currency }))}>
                {CURRENCIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label htmlFor="bz-address" className="field-label">Adres</label>
              <input id="bz-address" className="field-input" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <label htmlFor="bz-about" className="field-label">Açıklama</label>
              <textarea id="bz-about" rows={3} className="field-input" value={form.about} onChange={(e) => setForm((f) => ({ ...f, about: e.target.value }))} />
            </div>
          </div>

          <div className="mt-5 flex gap-2">
            <button type="submit" className="btn-primary text-white hover:text-white">Kaydet</button>
            <button type="button" className="btn-outline" onClick={() => setShowForm(false)}>Vazgeç</button>
          </div>
        </form>
      )}

      <ul className="grid gap-4 md:grid-cols-2">
        {businesses.map((b) => {
          const isActive = b.id === user?.activeBusinessId;
          return (
            <li key={b.id} className={`card p-5 ${isActive ? 'ring-2 ring-accent' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="rounded-lg bg-accent/10 p-3 text-accent"><IconBuilding size={22} /></span>
                  <div>
                    <h2 className="font-heading font-bold text-brand">{b.name}</h2>
                    <p className="text-xs text-brand-muted">{b.district} / {b.city} · {b.category}</p>
                    <p className="mt-1 text-xs text-brand-muted">
                      {b.capacity > 0 && `${b.capacity} kişi · `}{b.phone ? formatPhone(b.phone) : '—'}
                    </p>
                  </div>
                </div>
                {isActive && <span className="rounded-full bg-accent px-2.5 py-1 text-[10px] text-white">Aktif</span>}
              </div>


              <div className="mt-4 flex flex-wrap gap-2">
                {!isActive && (
                  <button type="button" className="btn-outline btn-sm" onClick={() => { void setActiveBusiness(b.id); }}>
                    Aktif yap
                  </button>
                )}
                <button type="button" className="btn-outline btn-sm" onClick={() => openEdit(b)}>
                  <IconEdit size={14} /> Düzenle
                </button>
                {businesses.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-sm border-2 border-[#e74c3c] text-[#e74c3c] hover:bg-[#e74c3c] hover:text-white"
                    onClick={() => setToDelete(b)}
                  >
                    <IconTrash size={14} /> Sil
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="İşletmeyi silmek istiyor musunuz?"
        description={toDelete ? `${toDelete.name} işletmesi ve bu işletmeye ait tüm rezervasyon / kasa kayıtları silinecektir.` : ''}
        confirmLabel="Evet, sil"
        onConfirm={() => { void remove(); }}
        onCancel={() => setToDelete(null)}
      />
    </QueryBoundary>
  );
}
