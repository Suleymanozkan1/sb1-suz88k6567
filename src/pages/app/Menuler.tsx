import { useState } from 'react';
import Seo from '../../components/Seo';
import Alert from '../../components/Alert';
import ConfirmDialog from '../../components/ConfirmDialog';
import { QueryBoundary } from '../../components/QueryState';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../lib/authHelpers';
import { useDeleteMenu, useMenus, useSaveMenu } from '../../lib/queries';
import { kurusToLira, liraToKurus, menuTotalKurus } from '../../lib/seating';
import { uid } from '../../lib/ids';
import { formatMoney } from '../../lib/format';
import { IconEdit, IconPlus, IconReport, IconTrash } from '../../components/Icons';
import { MENU_PRICING_LABELS, type Menu, type MenuPricing } from '../../types';

const EMPTY = { name: '', pricing: 'kisi_basi' as MenuPricing, price: '', description: '', isActive: true };

/** Örnek davetli sayıları: kişi başı menünün ne tuttuğunu göstermek için. */
const ORNEK_KISI = [150, 300, 500];

export default function Menuler() {
  const { user, can } = useAuth();
  const businessId = user?.activeBusinessId ?? '';
  const { data: menus = [], isLoading, error: loadError } = useMenus();
  const saveMutation = useSaveMenu();
  const deleteMutation = useDeleteMenu();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Menu | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [toDelete, setToDelete] = useState<Menu | null>(null);

  function openNew() {
    setEditing(null); setForm(EMPTY); setError(''); setShowForm(true);
  }

  function openEdit(menu: Menu) {
    setEditing(menu);
    setForm({
      name: menu.name, pricing: menu.pricing,
      price: String(kurusToLira(menu.priceKurus)),
      description: menu.description, isActive: menu.isActive,
    });
    setError(''); setShowForm(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('Menü adı giriniz.'); return; }
    const price = Number(form.price);
    if (!Number.isFinite(price) || price < 0) { setError('Geçerli bir fiyat giriniz.'); return; }

    try {
      await saveMutation.mutateAsync({
        id: editing?.id ?? uid('menu'),
        businessId,
        name: form.name.trim(),
        pricing: form.pricing,
        priceKurus: liraToKurus(price),
        description: form.description.trim(),
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
    return <Alert kind="error">Menü tanımlarını yalnızca yetkili kullanıcı düzenleyebilir.</Alert>;
  }

  return (
    <QueryBoundary isLoading={isLoading} error={loadError}>
      <Seo title="Menüler - Düğün Takip Panel" noindex />

      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold text-brand">Menüler ve Paketler</h1>
        <button type="button" onClick={openNew} className="btn-primary btn-sm text-white hover:text-white">
          <IconPlus size={16} /> Yeni Menü
        </button>
      </div>
      <p className="mb-6 text-sm text-brand-muted">
        Menüyü kişi başı ya da sabit tutarlı tanımlarsınız. Rezervasyona menü seçtiğinizde
        toplam tutar davetli sayısına göre hesaplanır; isterseniz elle değiştirebilirsiniz.
      </p>

      {error && <Alert kind="error" className="mb-4">{error}</Alert>}

      {showForm && (
        <form onSubmit={(e) => { void submit(e); }} noValidate className="card mb-6 p-5">
          <h2 className="mb-4 font-heading text-lg font-bold text-brand">
            {editing ? 'Menüyü Düzenle' : 'Yeni Menü'}
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <label htmlFor="menu-name" className="field-label">Menü Adı</label>
              <input id="menu-name" className="field-input" value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="menu-pricing" className="field-label">Fiyatlandırma</label>
              <select id="menu-pricing" className="field-input" value={form.pricing}
                onChange={(e) => setForm((f) => ({ ...f, pricing: e.target.value as MenuPricing }))}>
                {(Object.keys(MENU_PRICING_LABELS) as MenuPricing[]).map((p) => (
                  <option key={p} value={p}>{MENU_PRICING_LABELS[p]}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="menu-price" className="field-label">
                {form.pricing === 'kisi_basi' ? 'Kişi Başı Fiyat (₺)' : 'Sabit Fiyat (₺)'}
              </label>
              <input id="menu-price" inputMode="decimal" className="field-input" value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="menu-desc" className="field-label">Açıklama</label>
              <input id="menu-desc" className="field-input" value={form.description}
                placeholder="Çorba, ara sıcak, ana yemek, tatlı…"
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-sm md:col-span-3">
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

      {menus.length === 0 ? (
        <div className="card p-10 text-center">
          <IconReport size={32} className="mx-auto mb-3 text-brand-muted" />
          <p className="text-brand-muted">Henüz menü tanımlanmamış. Menü tanımlarsanız rezervasyon tutarı kendiliğinden hesaplanır.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {menus.map((m) => (
            <div key={m.id} className="card p-5">
              <div className="mb-2 flex items-start justify-between gap-2">
                <h2 className="font-heading font-bold text-brand">{m.name}</h2>
                {!m.isActive && (
                  <span className="rounded-full bg-[#f2ece4] px-2 py-0.5 text-xs text-brand-muted">Pasif</span>
                )}
              </div>
              <p className="mb-3 font-heading text-xl font-bold text-brand">
                {formatMoney(kurusToLira(m.priceKurus), 'TL')}
                <span className="ml-1 text-sm font-normal text-brand-muted">
                  {m.pricing === 'kisi_basi' ? '/ kişi' : 'sabit'}
                </span>
              </p>
              {m.description && <p className="mb-3 text-sm text-brand-muted">{m.description}</p>}

              {m.pricing === 'kisi_basi' && (
                <dl className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-xs">
                  {ORNEK_KISI.map((kisi) => (
                    <div key={kisi}>
                      <dt className="inline text-brand-muted">{kisi} kişi: </dt>
                      <dd className="inline font-semibold text-brand">
                        {formatMoney(kurusToLira(menuTotalKurus(m, kisi)), 'TL')}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              <div className="flex gap-2">
                <button type="button" onClick={() => openEdit(m)} className="btn-outline btn-sm">
                  <IconEdit size={14} /> Düzenle
                </button>
                <button type="button" onClick={() => setToDelete(m)} className="btn-outline btn-sm"
                  aria-label={`${m.name} menüsünü sil`}>
                  <IconTrash size={14} /> Sil
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Menüyü sil"
        description={`"${toDelete?.name}" menüsü silinecek. Bu menüyü kullanan rezervasyonların tutarı değişmez, yalnızca menü bağlantısı kalkar.`}
        confirmLabel="Sil"
        onConfirm={() => { void remove(); }}
        onCancel={() => setToDelete(null)}
      />
    </QueryBoundary>
  );
}
