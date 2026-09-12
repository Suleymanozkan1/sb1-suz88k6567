import { useMemo, useState } from 'react';
import Seo from '../../components/Seo';
import Alert from '../../components/Alert';
import ConfirmDialog from '../../components/ConfirmDialog';
import { QueryBoundary } from '../../components/QueryState';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../lib/authHelpers';
import { useDeleteVendor, useSaveVendor, useVendors } from '../../lib/queries';
import { uid } from '../../lib/ids';
import { formatMoney, formatNumber, formatPhone } from '../../lib/format';
import { stokToplami } from '../../lib/stok';
import { IconEdit, IconPlus, IconTrash, IconUsers } from '../../components/Icons';
import {
  HIZMET_KATEGORILERI, URUN_KATEGORILERI, type Vendor, type VendorKind,
} from '../../types';

const BOS = {
  name: '', kind: 'hizmet' as VendorKind, category: HIZMET_KATEGORILERI[0] as string,
  phone: '', note: '', unitPrice: '',
  boxCount: '', unitsPerBox: '', looseCount: '', minCount: '',
  isActive: true,
};

/**
 * Ürün ve Hizmet (eski adıyla Tedarikçiler).
 *
 * İki tür kalem aynı ekranda tanımlanıyor:
 *   hizmet : garson, DJ, vale, fotoğrafçı -- düğün içi gidere girer
 *   ürün   : su, kola, tuvalet kâğıdı -- stoğu takip edilir
 *
 * Ayrı ekranlar yapılsaydı aynı kalem iki yerden girilebilir, hangisinin
 * doğru olduğu belirsiz kalırdı. Stok alanları yalnızca üründe açılıyor:
 * DJ'in kolisi olmaz.
 */
export default function UrunHizmet() {
  const { user, can } = useAuth();
  const businessId = user?.activeBusinessId ?? '';
  const currency = user?.currency ?? 'TL';
  const { data: kayitlar = [], isLoading, error: loadError } = useVendors();
  const saveMutation = useSaveVendor();
  const deleteMutation = useDeleteVendor();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [form, setForm] = useState(BOS);
  const [error, setError] = useState('');
  const [toDelete, setToDelete] = useState<Vendor | null>(null);
  const [sekme, setSekme] = useState<VendorKind>('hizmet');

  const gorunen = useMemo(
    () => kayitlar.filter((v) => v.kind === sekme),
    [kayitlar, sekme],
  );

  const kategoriler = form.kind === 'urun' ? URUN_KATEGORILERI : HIZMET_KATEGORILERI;

  function openNew() {
    setEditing(null);
    setForm({
      ...BOS,
      kind: sekme,
      category: (sekme === 'urun' ? URUN_KATEGORILERI[0] : HIZMET_KATEGORILERI[0]) as string,
    });
    setError(''); setShowForm(true);
  }

  function openEdit(v: Vendor) {
    setEditing(v);
    setForm({
      name: v.name, kind: v.kind, category: v.category, phone: v.phone, note: v.note,
      unitPrice: v.unitPrice ? String(v.unitPrice) : '',
      boxCount: v.boxCount ? String(v.boxCount) : '',
      unitsPerBox: v.unitsPerBox ? String(v.unitsPerBox) : '',
      looseCount: v.looseCount ? String(v.looseCount) : '',
      minCount: v.minCount ? String(v.minCount) : '',
      isActive: v.isActive,
    });
    setError(''); setShowForm(true);
  }

  /** Boş bırakılan sayı alanı sıfır demektir; "0" yazdırmak gereksiz. */
  const sayi = (metin: string) => {
    const d = Number(metin);
    return Number.isFinite(d) && d > 0 ? d : 0;
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('Ad giriniz.'); return; }

    const fiyat = Number(form.unitPrice || '0');
    if (!Number.isFinite(fiyat) || fiyat < 0) { setError('Geçerli bir birim fiyat giriniz.'); return; }

    const urun = form.kind === 'urun';
    try {
      await saveMutation.mutateAsync({
        id: editing?.id ?? uid('vendor'),
        businessId,
        name: form.name.trim(),
        kind: form.kind,
        category: form.category,
        phone: form.phone.replace(/\D/g, ''),
        note: form.note.trim(),
        unitPrice: fiyat,
        // Hizmette stok alanları sıfırlanıyor; veritabanı kısıtı da bunu
        // zorluyor, "3 koli DJ" gibi bir satır hiç oluşmasın.
        boxCount: urun ? sayi(form.boxCount) : 0,
        unitsPerBox: urun ? sayi(form.unitsPerBox) : 0,
        looseCount: urun ? sayi(form.looseCount) : 0,
        minCount: urun ? sayi(form.minCount) : 0,
        isActive: form.isActive,
        createdAt: editing?.createdAt ?? '',
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
    return <Alert kind="error">Ürün ve hizmet tanımlarını yalnızca yetkili kullanıcı düzenleyebilir.</Alert>;
  }

  return (
    <QueryBoundary isLoading={isLoading} error={loadError}>
      <Seo title="Ürün ve Hizmet - Sahra Takip Panel" noindex />

      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold text-brand">Ürün ve Hizmet</h1>
        <button type="button" onClick={openNew} className="btn-primary btn-sm text-white hover:text-white">
          <IconPlus size={16} /> {sekme === 'urun' ? 'Yeni Ürün' : 'Yeni Hizmet'}
        </button>
      </div>
      <p className="mb-5 max-w-3xl text-sm text-brand-muted">
        Garson, DJ, vale, fotoğraf gibi hizmetler ve su, kola, tuvalet kâğıdı gibi ürünler
        burada tanımlanır. Hizmetler organizasyonlara atanır ve düğün içi gidere girer;
        ürünlerin stoğu takip edilir.
      </p>

      <div className="mb-5 flex gap-2" role="tablist" aria-label="Kalem türü">
        {(['hizmet', 'urun'] as VendorKind[]).map((t) => (
          <button
            key={t} type="button" role="tab" aria-selected={sekme === t}
            onClick={() => setSekme(t)}
            className={`rounded-full px-4 py-2 text-sm transition ${
              sekme === t ? 'bg-brand text-white' : 'bg-white text-brand hover:bg-surface'
            }`}
          >
            {t === 'hizmet' ? 'Hizmetler' : 'Ürünler ve Stok'}
          </button>
        ))}
      </div>

      {error && <Alert kind="error" className="mb-4">{error}</Alert>}

      {showForm && (
        <form onSubmit={(e) => { void submit(e); }} noValidate className="card mb-6 p-5">
          <h2 className="mb-4 font-heading text-lg font-bold text-brand">
            {editing ? 'Kaydı Düzenle' : (form.kind === 'urun' ? 'Yeni Ürün' : 'Yeni Hizmet')}
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label htmlFor="vendor-kind" className="field-label">Tür</label>
              <select id="vendor-kind" className="field-input" value={form.kind}
                onChange={(e) => {
                  const kind = e.target.value as VendorKind;
                  setForm((f) => ({
                    ...f, kind,
                    category: (kind === 'urun' ? URUN_KATEGORILERI[0] : HIZMET_KATEGORILERI[0]) as string,
                  }));
                }}>
                <option value="hizmet">Hizmet</option>
                <option value="urun">Ürün</option>
              </select>
            </div>
            <div>
              <label htmlFor="vendor-name" className="field-label">
                {form.kind === 'urun' ? 'Ürün Adı' : 'Firma / Kişi Adı'}
              </label>
              <input id="vendor-name" className="field-input" value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="vendor-category" className="field-label">Kategori</label>
              <select id="vendor-category" className="field-input" value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                {kategoriler.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="vendor-price" className="field-label">Birim Fiyat</label>
              <input id="vendor-price" inputMode="decimal" className="field-input"
                value={form.unitPrice}
                onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))} />
            </div>
            {form.kind === 'hizmet' && (
              <div>
                <label htmlFor="vendor-phone" className="field-label">Telefon</label>
                <input id="vendor-phone" type="tel" className="field-input" placeholder="532xxxyyzz"
                  value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
            )}

            {/*
              Stok alanları yalnızca üründe. Hizmete koli sorulsaydı
              kullanıcı boş geçtiği alanı her seferinde atlamak zorunda
              kalırdı.
            */}
            {form.kind === 'urun' && (
              <>
                <div>
                  <label htmlFor="vendor-box" className="field-label">Koli</label>
                  <input id="vendor-box" inputMode="decimal" className="field-input"
                    value={form.boxCount}
                    onChange={(e) => setForm((f) => ({ ...f, boxCount: e.target.value }))} />
                </div>
                <div>
                  <label htmlFor="vendor-per" className="field-label">Koli İçi Adet</label>
                  <input id="vendor-per" inputMode="numeric" className="field-input"
                    value={form.unitsPerBox}
                    onChange={(e) => setForm((f) => ({ ...f, unitsPerBox: e.target.value }))} />
                </div>
                <div>
                  <label htmlFor="vendor-loose" className="field-label">Tek Adet (bozulmuş)</label>
                  <input id="vendor-loose" inputMode="decimal" className="field-input"
                    value={form.looseCount}
                    onChange={(e) => setForm((f) => ({ ...f, looseCount: e.target.value }))} />
                </div>
                <div>
                  <label htmlFor="vendor-min" className="field-label">Kritik Seviye</label>
                  <input id="vendor-min" inputMode="decimal" className="field-input"
                    value={form.minCount}
                    onChange={(e) => setForm((f) => ({ ...f, minCount: e.target.value }))} />
                </div>
                <div className="flex items-end">
                  <p className="text-sm text-brand-muted">
                    Toplam:{' '}
                    <strong className="text-brand">
                      {formatNumber(sayi(form.boxCount) * sayi(form.unitsPerBox) + sayi(form.looseCount))} adet
                    </strong>
                  </p>
                </div>
              </>
            )}

            <div className="md:col-span-3">
              <label htmlFor="vendor-note" className="field-label">Not</label>
              <input id="vendor-note" className="field-input" value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-sm md:col-span-3">
              <input type="checkbox" checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
              Aktif (organizasyonlara atanabilir, stok listesinde görünür)
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

      {gorunen.length === 0 ? (
        <div className="card p-10 text-center">
          <IconUsers size={32} className="mx-auto mb-3 text-brand-muted" />
          <p className="text-brand-muted">
            {sekme === 'urun' ? 'Henüz ürün tanımlanmamış.' : 'Henüz hizmet tanımlanmamış.'}
          </p>
        </div>
      ) : sekme === 'urun' ? (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">Ürün stokları</caption>
            <thead>
              <tr className="border-b border-line bg-surface text-left text-xs uppercase text-brand-muted">
                <th className="px-4 py-2.5 font-medium">Ürün</th>
                <th className="px-4 py-2.5 font-medium">Kategori</th>
                <th className="px-4 py-2.5 text-right font-medium">Koli</th>
                <th className="px-4 py-2.5 text-right font-medium">Koli İçi</th>
                <th className="px-4 py-2.5 text-right font-medium">Tek Adet</th>
                <th className="px-4 py-2.5 text-right font-medium">Toplam Adet</th>
                <th className="px-4 py-2.5 text-right font-medium">Birim Fiyat</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {gorunen.map((v) => {
                const toplam = stokToplami(v);
                const kritik = v.minCount > 0 && toplam <= v.minCount;
                return (
                  <tr key={v.id} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-2.5 text-brand">
                      {v.name}
                      {!v.isActive && (
                        <span className="ml-2 rounded-full bg-[#f2ece4] px-2 py-0.5 text-xs text-brand-muted">
                          Pasif
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-brand-muted">{v.category}</td>
                    <td className="px-4 py-2.5 text-right text-brand">{formatNumber(v.boxCount)}</td>
                    <td className="px-4 py-2.5 text-right text-brand">{formatNumber(v.unitsPerBox)}</td>
                    <td className="px-4 py-2.5 text-right text-brand">{formatNumber(v.looseCount)}</td>
                    <td className={`px-4 py-2.5 text-right font-medium ${kritik ? 'text-danger' : 'text-brand'}`}>
                      {formatNumber(toplam)}
                      {kritik && <span className="ml-1 text-xs">kritik</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-brand">
                      {v.unitPrice > 0 ? formatMoney(v.unitPrice, currency) : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button type="button" onClick={() => openEdit(v)}
                        aria-label={`${v.name} ürününü düzenle`}
                        className="rounded p-1 text-brand-muted hover:text-brand">
                        <IconEdit size={15} />
                      </button>
                      <button type="button" onClick={() => setToDelete(v)}
                        aria-label={`${v.name} ürününü sil`}
                        className="rounded p-1 text-brand-muted hover:text-danger">
                        <IconTrash size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {gorunen.map((v) => (
            <div key={v.id} className="card p-5">
              <div className="mb-1 flex items-start justify-between gap-2">
                <h2 className="font-heading font-bold text-brand">{v.name}</h2>
                {!v.isActive && (
                  <span className="rounded-full bg-[#f2ece4] px-2 py-0.5 text-xs text-brand-muted">Pasif</span>
                )}
              </div>
              <p className="mb-2 text-sm text-brand-muted">{v.category}</p>
              {v.unitPrice > 0 && (
                <p className="mb-1 text-sm text-brand">
                  Birim fiyat: <strong>{formatMoney(v.unitPrice, currency)}</strong>
                </p>
              )}
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
                  aria-label={`${v.name} kaydını sil`}>
                  <IconTrash size={14} /> Sil
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Kaydı sil"
        description={`"${toDelete?.name}" silinecek. Organizasyonlara atanmışsa silinemez; bunun yerine pasife alabilirsiniz.`}
        confirmLabel="Sil"
        onConfirm={() => { void remove(); }}
        onCancel={() => setToDelete(null)}
      />
    </QueryBoundary>
  );
}
