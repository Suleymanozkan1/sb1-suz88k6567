import { useState } from 'react';
import Seo from '../../components/Seo';
import Alert from '../../components/Alert';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../lib/authHelpers';
import { useDeleteStaff, useSaveStaff, useStaff } from '../../lib/queries';
import { QueryBoundary } from '../../components/QueryState';
import { ALL_PERMISSIONS } from '../../types';
import { OWNER_PERMISSIONS } from '../../data/constants';
import { formatPhone } from '../../lib/format';
import { IconEdit, IconPlus, IconReport, IconTrash, IconUser } from '../../components/Icons';
import type { Permission, User } from '../../types';

const EMPTY = {
  fullName: '', email: '', mobile: '', password: '',
  permissions: ['rezervasyon.goruntule'] as Permission[],
  monthlyReport: false,
};

export default function Kullanicilar() {
  const { user, can, isDemoMode } = useAuth();
  const { data: staff = [], isLoading, error: loadError } = useStaff();
  const saveMutation = useSaveStaff();
  const deleteMutation = useDeleteStaff();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [toDelete, setToDelete] = useState<User | null>(null);


  function openNew() {
    setEditing(null);
    setForm(EMPTY);
    setError('');
    setShowForm(true);
  }

  function openEdit(u: User) {
    setEditing(u);
    setForm({
      fullName: u.fullName, email: u.email, mobile: u.mobile, password: '',
      permissions: u.permissions, monthlyReport: Boolean(u.monthlyReport),
    });
    setError('');
    setShowForm(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.fullName.trim()) { setError('Ad soyad giriniz.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) { setError('Geçerli bir e-posta adresi giriniz.'); return; }
    if (!editing && form.password.length < 6) { setError('Şifre en az 6 karakter olmalıdır.'); return; }
    if (!user) return;

    try {
      await saveMutation.mutateAsync({
        id: editing?.id,
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password || undefined,
        mobile: form.mobile.replace(/\D/g, ''),
        monthlyReport: form.monthlyReport,
        permissions: form.permissions,
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

  function togglePermission(p: Permission, checked: boolean) {
    setForm((f) => ({
      ...f,
      permissions: checked ? [...f.permissions, p] : f.permissions.filter((x) => x !== p),
    }));
  }

  /*
    Yirmi beş kutuyu tek tek işaretlemek, yardımcısına her şeyi açmak
    isteyen salon sahibi için gereksiz bir iş. "Tümünü ver" listeyi
    OWNER_PERMISSIONS'tan kuruyor: yeni bir yetki eklendiğinde buraya
    da yazmak gerekmiyor.
  */
  const tumYetkilerVar = OWNER_PERMISSIONS.every((k) => form.permissions.includes(k));

  function tumunuDegistir(checked: boolean) {
    setForm((f) => ({ ...f, permissions: checked ? [...OWNER_PERMISSIONS] : [] }));
  }

  /** Bir başlıktaki yetkilerin tamamını birlikte aç/kapat. */
  function grubuDegistir(grup: string, checked: boolean) {
    const anahtarlar = ALL_PERMISSIONS.filter((p) => p.group === grup).map((p) => p.key);
    setForm((f) => ({
      ...f,
      permissions: checked
        ? [...new Set([...f.permissions, ...anahtarlar])]
        : f.permissions.filter((x) => !anahtarlar.includes(x)),
    }));
  }

  const gruplar = [...new Set(ALL_PERMISSIONS.map((p) => p.group))];

  if (!can('kullanici.duzenle') || user?.role !== 'owner') {
    return <Alert kind="error">Kullanıcı yönetimi yalnızca yönetici hesabı ile yapılabilir.</Alert>;
  }

  return (
    <QueryBoundary isLoading={isLoading} error={loadError}>
      <Seo title="Kullanıcılar - Sahra Takip Panel" noindex />

      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold text-brand">Kullanıcılar</h1>
        <button type="button" onClick={openNew} className="btn-primary btn-sm text-white hover:text-white">
          <IconPlus size={16} /> Yeni Kullanıcı
        </button>
      </div>
      <p className="mb-6 text-sm text-brand-muted">
        Alt kullanıcılar için kişiye özel giriş yöntemi oluşturabilir, hangi ekranlara erişebileceklerini
        belirleyebilirsiniz.
      </p>

      {!isDemoMode && (
        <Alert kind="info" className="mb-5">
          Yeni personel hesabını şu an sunucu yöneticisi açıyor (veritabanındaki
          <code> kullanici_ac</code> fonksiyonu). Hesap açıldıktan sonra adını,
          telefonunu ve yetkilerini buradan düzenleyebilirsiniz.
        </Alert>
      )}

      {showForm && (
        <form onSubmit={(e) => { void submit(e); }} noValidate className="card mb-6 p-5">
          <h2 className="mb-4 font-heading text-lg font-bold text-brand">
            {editing ? 'Kullanıcıyı Düzenle' : 'Yeni Kullanıcı'}
          </h2>
          {error && <Alert kind="error" className="mb-4">{error}</Alert>}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="us-name" className="field-label">Ad Soyad</label>
              <input id="us-name" className="field-input" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="us-email" className="field-label">E-Posta</label>
              <input id="us-email" type="email" className="field-input" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="us-mobile" className="field-label">Cep Telefonu</label>
              <input id="us-mobile" type="tel" className="field-input" value={form.mobile} onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="us-password" className="field-label">
                Şifre {editing && <span className="text-xs font-normal text-brand-muted">(boş bırakılırsa değişmez)</span>}
              </label>
              <input id="us-password" type="password" className="field-input" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} autoComplete="new-password" />
            </div>
          </div>

          {/*
            Aylık rapor (madde 24). Raporun GİDECEĞİ adres burada değil,
            Ayarlar'da: iki ayar ayrı durmasaydı raporu kapatmak adresi de
            silmek olurdu.
          */}
          <label className="mt-4 flex items-center gap-2 text-sm text-brand">
            <input
              type="checkbox"
              checked={form.monthlyReport}
              onChange={(e) => setForm((f) => ({ ...f, monthlyReport: e.target.checked }))}
            />
            Aylık rapor gönderilsin (ayın ilk günü, biten ayın özeti)
          </label>

          <fieldset className="mt-5">
            <legend className="field-label">Yetkiler</legend>

            <label className="mb-3 flex items-center gap-2 rounded-md border border-accent-ink/40 bg-accent-ink/5 px-3 py-2.5 text-sm font-semibold text-brand">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-line text-accent-ink focus:ring-accent"
                checked={tumYetkilerVar}
                onChange={(e) => tumunuDegistir(e.target.checked)}
              />
              Tüm yetkileri ver ({OWNER_PERMISSIONS.length} yetki)
            </label>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {gruplar.map((grup) => {
                const satirlar = ALL_PERMISSIONS.filter((p) => p.group === grup);
                const hepsi = satirlar.every((p) => form.permissions.includes(p.key));
                return (
                  <div key={grup} className="rounded-md border border-line p-3">
                    {/*
                      Başlık da bir kutu: "finansın tamamını kapat" tek
                      hareket olsun, dört satırı tek tek aramaya gerek
                      kalmasın.
                    */}
                    <label className="mb-2 flex items-center gap-2 border-b border-line pb-2 text-sm font-semibold text-brand">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-line text-accent-ink focus:ring-accent"
                        checked={hepsi}
                        onChange={(e) => grubuDegistir(grup, e.target.checked)}
                      />
                      {grup}
                    </label>
                    <div className="space-y-2">
                      {satirlar.map((p) => (
                        <label key={p.key} className="flex items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 shrink-0 rounded border-line text-accent-ink focus:ring-accent"
                            checked={form.permissions.includes(p.key)}
                            onChange={(e) => togglePermission(p.key, e.target.checked)}
                          />
                          <span>
                            {p.label}
                            {p.hint && (
                              <span className="block text-xs text-brand-muted">{p.hint}</span>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-5 flex gap-2">
            <button type="submit" className="btn-primary text-white hover:text-white">Kaydet</button>
            <button type="button" className="btn-outline" onClick={() => setShowForm(false)}>Vazgeç</button>
          </div>
        </form>
      )}

      <div className="card overflow-x-auto">
        {staff.length === 0 ? (
          <p className="p-10 text-center text-sm text-brand-muted">Henüz alt kullanıcı eklenmemiş.</p>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line bg-surface text-left text-xs uppercase text-brand-muted">
                <th className="px-4 py-3 font-medium">Kullanıcı</th>
                <th className="px-4 py-3 font-medium">E-Posta</th>
                <th className="px-4 py-3 font-medium">Telefon</th>
                <th className="px-4 py-3 font-medium">Yetkiler</th>
                <th className="px-4 py-3 font-medium">Aylık Rapor</th>
                <th className="px-4 py-3 text-right font-medium">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((u) => (
                <tr key={u.id} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2 font-medium text-brand">
                      <IconUser size={16} className="text-brand-muted" /> {u.fullName}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-brand-muted">{u.email}</td>
                  <td className="px-4 py-3 text-brand-muted">{u.mobile ? formatPhone(u.mobile) : '-'}</td>
                  <td className="px-4 py-3 text-xs text-brand-muted">
                    {OWNER_PERMISSIONS.every((k) => u.permissions.includes(k))
                      ? 'Tam yetki'
                      : `${u.permissions.length} yetki`}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {u.monthlyReport
                      ? <span className="flex items-center gap-1 text-[#15803d]"><IconReport size={14} /> Açık</span>
                      : <span className="text-brand-muted">Kapalı</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button type="button" onClick={() => openEdit(u)} aria-label={`${u.fullName} düzenle`} className="rounded p-1.5 text-brand-muted hover:text-accent-ink">
                        <IconEdit size={16} />
                      </button>
                      <button type="button" onClick={() => setToDelete(u)} aria-label={`${u.fullName} sil`} className="rounded p-1.5 text-brand-muted hover:text-danger">
                        <IconTrash size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Kullanıcıyı silmek istiyor musunuz?"
        description={toDelete ? `${toDelete.fullName} artık sisteme giriş yapamayacaktır.` : ''}
        confirmLabel="Evet, sil"
        onConfirm={() => { void remove(); }}
        onCancel={() => setToDelete(null)}
      />
    </QueryBoundary>
  );
}
