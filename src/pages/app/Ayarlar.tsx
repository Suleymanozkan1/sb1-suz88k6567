import { useState } from 'react';
import Seo from '../../components/Seo';
import Alert from '../../components/Alert';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useAuth } from '../../context/AuthContext';
import { CATEGORIES, CITIES, CURRENCIES, DISTRICTS } from '../../data/constants';
import { clearAll } from '../../lib/storage';
import { formatDateLong } from '../../lib/format';
import type { Currency } from '../../types';

export default function Ayarlar() {
  const { user, updateUser, logout } = useAuth();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSaved, setPwSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const [profile, setProfile] = useState({
    companyName: user?.companyName ?? '',
    fullName: user?.fullName ?? '',
    mobile: user?.mobile ?? '',
    city: user?.city ?? '',
    district: user?.district ?? '',
    category: user?.category ?? '',
    capacity: String(user?.capacity ?? ''),
    currency: (user?.currency ?? 'TL') as Currency,
    facebook: user?.facebook ?? '',
    instagram: user?.instagram ?? '',
  });

  const [pw, setPw] = useState({ current: '', next: '', repeat: '' });

  if (!user) return null;

  const districts = DISTRICTS[profile.city] ?? [];

  function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaved(false);
    if (!profile.companyName.trim()) { setError('Firma adını giriniz.'); return; }
    if (!profile.fullName.trim()) { setError('Yetkili ad soyad giriniz.'); return; }
    const digits = profile.mobile.replace(/\D/g, '');
    if (digits.length !== 10 || !digits.startsWith('5')) { setError('Cep telefonunu 532xxxyyzz şeklinde giriniz.'); return; }
    if (profile.capacity && (!/^\d+$/.test(profile.capacity) || Number(profile.capacity) <= 0)) {
      setError('Kapasiteyi rakam olarak giriniz.');
      return;
    }

    updateUser({
      companyName: profile.companyName.trim(),
      fullName: profile.fullName.trim(),
      mobile: digits,
      city: profile.city,
      district: profile.district,
      category: profile.category,
      capacity: Number(profile.capacity) || 0,
      currency: profile.currency,
      facebook: profile.facebook.trim() || undefined,
      instagram: profile.instagram.trim() || undefined,
    });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 3000);
  }

  function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError('');
    setPwSaved(false);
    if (pw.current !== user!.password) { setPwError('Mevcut şifreniz hatalı.'); return; }
    if (pw.next.length < 6) { setPwError('Yeni şifre en az 6 karakter olmalıdır.'); return; }
    if (pw.next !== pw.repeat) { setPwError('Yeni şifreler birbiriyle uyuşmuyor.'); return; }

    updateUser({ password: pw.next });
    setPw({ current: '', next: '', repeat: '' });
    setPwSaved(true);
    window.setTimeout(() => setPwSaved(false), 3000);
  }

  function resetData() {
    clearAll();
    logout();
    window.location.href = '/';
  }

  return (
    <>
      <Seo title="Ayarlar - Düğün Takip Panel" noindex />

      <h1 className="mb-6 font-heading text-2xl font-bold text-brand">Ayarlar</h1>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-6 lg:col-span-2">
          <h2 className="mb-4 font-heading text-lg font-bold text-brand">Üyelik Bilgileri</h2>
          {saved && <Alert kind="success" className="mb-4">Bilgileriniz kaydedildi.</Alert>}
          {error && <Alert kind="error" className="mb-4">{error}</Alert>}

          <form onSubmit={saveProfile} noValidate className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="st-company" className="field-label">Üye Firma Adı</label>
              <input id="st-company" className="field-input" value={profile.companyName} onChange={(e) => setProfile((p) => ({ ...p, companyName: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="st-name" className="field-label">Yetkili Ad Soyad</label>
              <input id="st-name" className="field-input" value={profile.fullName} onChange={(e) => setProfile((p) => ({ ...p, fullName: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="st-mobile" className="field-label">Cep Telefonu</label>
              <input id="st-mobile" type="tel" className="field-input" value={profile.mobile} onChange={(e) => setProfile((p) => ({ ...p, mobile: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="st-email" className="field-label">Email Adresiniz</label>
              <input id="st-email" className="field-input bg-surface" value={user.email} readOnly tabIndex={-1} />
            </div>
            <div>
              <label htmlFor="st-category" className="field-label">Kategori</label>
              <select id="st-category" className="field-input" value={profile.category} onChange={(e) => setProfile((p) => ({ ...p, category: e.target.value }))}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="st-capacity" className="field-label">Salon Kapasitesi (kişi)</label>
              <input id="st-capacity" inputMode="numeric" className="field-input" value={profile.capacity} onChange={(e) => setProfile((p) => ({ ...p, capacity: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="st-city" className="field-label">Şehir</label>
              <select id="st-city" className="field-input" value={profile.city} onChange={(e) => setProfile((p) => ({ ...p, city: e.target.value, district: '' }))}>
                <option value="">---Seçiniz---</option>
                {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="st-district" className="field-label">İlçe</label>
              {districts.length > 0 ? (
                <select id="st-district" className="field-input" value={profile.district} onChange={(e) => setProfile((p) => ({ ...p, district: e.target.value }))}>
                  <option value="">---Seçiniz---</option>
                  {districts.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              ) : (
                <input id="st-district" className="field-input" value={profile.district} onChange={(e) => setProfile((p) => ({ ...p, district: e.target.value }))} />
              )}
            </div>
            <div>
              <label htmlFor="st-currency" className="field-label">Para Birimi</label>
              <select id="st-currency" className="field-input" value={profile.currency} onChange={(e) => setProfile((p) => ({ ...p, currency: e.target.value as Currency }))}>
                {CURRENCIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="st-facebook" className="field-label">Facebook</label>
              <input id="st-facebook" className="field-input" value={profile.facebook} onChange={(e) => setProfile((p) => ({ ...p, facebook: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="st-instagram" className="field-label">Instagram</label>
              <input id="st-instagram" className="field-input" value={profile.instagram} onChange={(e) => setProfile((p) => ({ ...p, instagram: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <button type="submit" className="btn-primary text-white hover:text-white">Kaydet</button>
            </div>
          </form>
        </section>

        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="mb-4 font-heading text-lg font-bold text-brand">Şifre Değiştir</h2>
            {pwSaved && <Alert kind="success" className="mb-4">Şifreniz güncellendi.</Alert>}
            {pwError && <Alert kind="error" className="mb-4">{pwError}</Alert>}

            <form onSubmit={changePassword} noValidate className="space-y-3">
              <div>
                <label htmlFor="pw-current" className="field-label">Mevcut Şifreniz</label>
                <input id="pw-current" type="password" className="field-input" value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} autoComplete="current-password" />
              </div>
              <div>
                <label htmlFor="pw-next" className="field-label">Yeni Şifreniz</label>
                <input id="pw-next" type="password" className="field-input" value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} autoComplete="new-password" />
              </div>
              <div>
                <label htmlFor="pw-repeat" className="field-label">Yeni Şifreniz (Tekrar)</label>
                <input id="pw-repeat" type="password" className="field-input" value={pw.repeat} onChange={(e) => setPw((p) => ({ ...p, repeat: e.target.value }))} autoComplete="new-password" />
              </div>
              <button type="submit" className="btn-primary w-full text-white hover:text-white">Şifreyi Güncelle</button>
            </form>
          </section>

          <section className="card p-6">
            <h2 className="mb-2 font-heading text-lg font-bold text-brand">Üyelik Durumu</h2>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-brand-muted">Üyelik başlangıcı</dt>
                <dd className="text-brand">{formatDateLong(user.createdAt.slice(0, 10))}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-brand-muted">Bitiş tarihi</dt>
                <dd className="text-brand">{formatDateLong(user.subscriptionEndsAt)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-brand-muted">Tavsiye kodunuz</dt>
                <dd className="font-mono text-brand">{user.referralCode}</dd>
              </div>
            </dl>
          </section>

          <section className="card border-[#f5c6c2] p-6">
            <h2 className="mb-2 font-heading text-lg font-bold text-[#b91c1c]">Demo verilerini sıfırla</h2>
            <p className="mb-4 text-sm leading-relaxed text-brand-muted">
              Bu tarayıcıda saklanan tüm örnek kayıtları siler ve sistemi ilk kurulum hâline döndürür.
            </p>
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="btn btn-sm w-full border-2 border-[#e74c3c] text-[#e74c3c] hover:bg-[#e74c3c] hover:text-white"
            >
              Verileri sıfırla
            </button>
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Tüm veriler silinsin mi?"
        description="Bu tarayıcıda saklanan üyelikler, rezervasyonlar ve kasa kayıtları kalıcı olarak silinecek, oturumunuz kapatılacaktır."
        confirmLabel="Evet, sıfırla"
        onConfirm={resetData}
        onCancel={() => setConfirmReset(false)}
      />
    </>
  );
}
