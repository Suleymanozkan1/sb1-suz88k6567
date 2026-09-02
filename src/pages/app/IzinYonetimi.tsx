import { useMemo, useState } from 'react';
import Seo from '../../components/Seo';
import Alert from '../../components/Alert';
import ConfirmDialog from '../../components/ConfirmDialog';
import { QueryBoundary } from '../../components/QueryState';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../lib/authHelpers';
import { useConsents, useDeleteConsent, useSaveConsent } from '../../lib/queries';
import { CONSENT_SOURCES } from '../../data/constants';
import { formatDate, formatPhone, normalizeTr } from '../../lib/format';
import { IconPlus, IconSearch, IconShield, IconTrash } from '../../components/Icons';
import type { SmsConsent } from '../../types';

const STATUS_STYLES = {
  ONAY: 'bg-[#e8f8ef] text-[#15803d]',
  RET: 'bg-[#fdecea] text-[#b91c1c]',
} as const;

export default function IzinYonetimi() {
  const { can, isDemoMode } = useAuth();
  const { data, isLoading, error } = useConsents();
  const saveMutation = useSaveConsent();
  const deleteMutation = useDeleteConsent();

  const [form, setForm] = useState({
    phone: '', status: 'ONAY' as SmsConsent['status'],
    source: CONSENT_SOURCES[0].value, note: '',
  });
  const [formError, setFormError] = useState('');
  const [saved, setSaved] = useState(false);
  const [query, setQuery] = useState('');
  const [toDelete, setToDelete] = useState<SmsConsent | null>(null);

  const consents = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const q = normalizeTr(query);
    if (!q) return consents;
    return consents.filter((c) => normalizeTr(`${c.phone} ${c.note ?? ''}`).includes(q));
  }, [consents, query]);

  const pendingSync = useMemo(
    () => consents.filter((c) => !c.iysSyncedAt).length,
    [consents],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setSaved(false);

    const digits = form.phone.replace(/\D/g, '').replace(/^90/, '').replace(/^0/, '');
    if (!/^5\d{9}$/.test(digits)) {
      setFormError('Cep telefonunu 532xxxyyzz şeklinde, 10 haneli giriniz.');
      return;
    }

    try {
      await saveMutation.mutateAsync({
        phone: digits, status: form.status, source: form.source,
        note: form.note.trim() || undefined,
      });
      setForm({ phone: '', status: 'ONAY', source: CONSENT_SOURCES[0].value, note: '' });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setFormError(errorMessage(err));
    }
  }

  async function remove() {
    if (!toDelete) return;
    const target = toDelete;
    setToDelete(null);
    try {
      await deleteMutation.mutateAsync(target.id);
    } catch (err) {
      setFormError(errorMessage(err));
    }
  }

  if (!can('ayarlar.duzenle')) {
    return <Alert kind="error">İzin yönetimi için yetkiniz bulunmuyor.</Alert>;
  }

  return (
    <QueryBoundary isLoading={isLoading} error={error}>
      <Seo title="İYS İzin Yönetimi - Düğün Takip Panel" noindex />

      <h1 className="mb-2 flex items-center gap-2 font-heading text-2xl font-bold text-brand">
        <IconShield size={24} className="text-accent" /> İYS İzin Yönetimi
      </h1>
      <p className="mb-6 max-w-3xl text-sm leading-relaxed text-brand-muted">
        Kampanya, indirim ve tanıtım gibi <strong>ticari iletiler</strong> için alıcıdan İYS onayı
        alınması zorunludur. Rezervasyon onayı, hatırlatma ve doğrulama kodu gibi{' '}
        <strong>işlem bildirimleri</strong> bu kapsamda değildir ve onay gerektirmez.
      </p>

      <Alert kind="info" className="mb-5">
        Aldığınız yeni onaylar <strong>3 iş günü içinde</strong> İYS'ye aktarılmalıdır. Alıcı ret
        talebinde bulunduğunda gönderim en geç <strong>3 iş günü içinde</strong> durdurulmalıdır.
        Sistem, ret kaydı bulunan numaralara ticari ileti göndermeyi anında engeller.
      </Alert>

      {isDemoMode ? (
        <Alert kind="warning" className="mb-5">
          Demo modunda İYS senkronizasyonu yapılmaz; kayıtlar yalnızca bu tarayıcıda tutulur.
        </Alert>
      ) : pendingSync > 0 && (
        <Alert kind="warning" className="mb-5">
          <strong>{pendingSync}</strong> kayıt henüz İYS'ye aktarılmadı. Aktarım her gece otomatik
          yapılır; İYS bilgileri tanımlı değilse aktarım gerçekleşmez.
        </Alert>
      )}

      <form onSubmit={(e) => { void submit(e); }} noValidate className="card mb-6 p-5">
        <h2 className="mb-4 font-heading text-lg font-bold text-brand">İzin Kaydı Ekle / Güncelle</h2>
        {formError && <Alert kind="error" className="mb-4">{formError}</Alert>}
        {saved && <Alert kind="success" className="mb-4">İzin kaydı kaydedildi.</Alert>}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="cs-phone" className="field-label">Cep Telefonu</label>
            <input id="cs-phone" type="tel" className="field-input" placeholder="532xxxyyzz"
              value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div>
            <label htmlFor="cs-status" className="field-label">Durum</label>
            <select id="cs-status" className="field-input" value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as SmsConsent['status'] }))}>
              <option value="ONAY">ONAY — ticari ileti gönderilebilir</option>
              <option value="RET">RET — ticari ileti gönderilemez</option>
            </select>
          </div>
          <div>
            <label htmlFor="cs-source" className="field-label">Onay Kaynağı</label>
            <select id="cs-source" className="field-input" value={form.source}
              onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}>
              {CONSENT_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="cs-note" className="field-label">Not</label>
            <input id="cs-note" className="field-input" value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
          </div>
        </div>

        <button type="submit" className="btn-primary mt-5 text-white hover:text-white" disabled={saveMutation.isPending}>
          <IconPlus size={16} /> {saveMutation.isPending ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </form>

      <div className="card mb-5 p-4">
        <label htmlFor="cs-q" className="field-label">Numara veya not ile ara</label>
        <div className="relative max-w-md">
          <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
          <input id="cs-q" type="search" className="field-input pl-9" value={query}
            onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <div className="card overflow-x-auto">
        {filtered.length === 0 ? (
          <p className="p-10 text-center text-sm text-brand-muted">İzin kaydı bulunamadı.</p>
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line bg-surface text-left text-xs uppercase text-brand-muted">
                <th className="px-4 py-3 font-medium">Numara</th>
                <th className="px-4 py-3 font-medium">Durum</th>
                <th className="px-4 py-3 font-medium">Kaynak</th>
                <th className="px-4 py-3 font-medium">Tarih</th>
                <th className="px-4 py-3 font-medium">İYS</th>
                <th className="px-4 py-3 font-medium">Not</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-line/60 last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-brand">{formatPhone(c.phone)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs ${STATUS_STYLES[c.status]}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-brand-muted">
                    {CONSENT_SOURCES.find((s) => s.value === c.source)?.label ?? c.source}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-brand-muted">
                    {formatDate(c.consentDate.slice(0, 10))}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {c.iysSyncedAt ? (
                      <span className="text-[#15803d]">Aktarıldı</span>
                    ) : c.iysError ? (
                      <span className="text-[#b91c1c]" title={c.iysError}>Hata</span>
                    ) : (
                      <span className="text-[#92600e]">Bekliyor</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-brand-muted">{c.note || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => setToDelete(c)}
                      aria-label={`${formatPhone(c.phone)} iznini sil`}
                      className="rounded p-1 text-brand-muted hover:text-[#e74c3c]">
                      <IconTrash size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="İzin kaydını silmek istiyor musunuz?"
        description={
          toDelete
            ? `${formatPhone(toDelete.phone)} numarasının izin kaydı silinecek. Kayıt silinse de izin geçmişi ispat amacıyla saklanır.`
            : ''
        }
        confirmLabel="Evet, sil"
        onConfirm={() => { void remove(); }}
        onCancel={() => setToDelete(null)}
      />
    </QueryBoundary>
  );
}
