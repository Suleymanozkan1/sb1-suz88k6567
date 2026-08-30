import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Seo from '../components/Seo';
import Alert from '../components/Alert';
import { useAuth, DEMO_CREDENTIALS } from '../context/AuthContext';
import { IconLock, IconShield } from '../components/Icons';
import { formatPhone } from '../lib/format';
import { findUserByEmail } from '../lib/db';

export default function UyeGirisi() {
  const { user, login, verifySms, pendingLogin, cancelPendingLogin } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/panel" replace />;

  function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('E-posta ve şifrenizi giriniz.');
      return;
    }
    setBusy(true);
    window.setTimeout(() => {
      const result = login(email, password);
      setBusy(false);
      if (!result.ok) setError(result.error ?? 'Giriş yapılamadı.');
    }, 400);
  }

  function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    window.setTimeout(() => {
      const result = verifySms(smsCode);
      setBusy(false);
      if (!result.ok) {
        setError(result.error ?? 'Doğrulama başarısız.');
        return;
      }
      navigate('/panel', { replace: true });
    }, 300);
  }

  const pendingUser = pendingLogin ? findUserByEmail(email) : undefined;

  return (
    <>
      <Seo title="Üye Girişi - Düğün Takip" description="Düğün Takip üye girişi." path="/uye-girisi" noindex />
      <PageHeader title="Üye Girişi" breadcrumbs={[{ label: 'Üye Girişi' }]} />

      <section className="py-12">
        <div className="container-dt grid max-w-4xl gap-8 md:grid-cols-5">
          <div className="md:col-span-3">
            {error && <Alert kind="error" className="mb-5">{error}</Alert>}

            {!pendingLogin ? (
              <form onSubmit={onLogin} noValidate className="card p-6">
                <h2 className="mb-5 flex items-center gap-2 font-heading text-xl font-bold text-brand">
                  <IconLock size={20} className="text-accent" /> Giriş yapın
                </h2>

                <div className="space-y-4">
                  <div>
                    <label htmlFor="login-email" className="field-label">Email Adresiniz</label>
                    <input id="login-email" type="email" className="field-input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
                  </div>
                  <div>
                    <label htmlFor="login-password" className="field-label">Şifreniz</label>
                    <input id="login-password" type="password" className="field-input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                  </div>
                </div>

                <button type="submit" className="btn-primary mt-6 w-full text-white hover:text-white" disabled={busy}>
                  {busy ? 'Lütfen bekleyiniz...' : 'Giriş Yap'}
                </button>

                <p className="mt-4 text-sm">
                  Üye değil misiniz? <Link to="/uye-ol">7 gün ücretsiz deneyin</Link>
                </p>
              </form>
            ) : (
              <form onSubmit={onVerify} noValidate className="card p-6">
                <h2 className="mb-2 flex items-center gap-2 font-heading text-xl font-bold text-brand">
                  <IconShield size={20} className="text-accent" /> SMS Doğrulama
                </h2>
                <p className="mb-5 text-sm leading-relaxed">
                  Güvenliğiniz için <strong>{pendingUser ? formatPhone(pendingUser.mobile) : 'kayıtlı cep telefonunuza'}</strong>{' '}
                  numarasına 6 haneli doğrulama kodu gönderildi.
                </p>

                <Alert kind="info" className="mb-5">
                  Demo ortamında SMS gönderimi yapılamadığı için kodunuz:{' '}
                  <strong className="font-mono tracking-widest">{pendingLogin.code}</strong>
                </Alert>

                <label htmlFor="sms-code" className="field-label">Sms Kodu</label>
                <input
                  id="sms-code"
                  inputMode="numeric"
                  maxLength={6}
                  className="field-input text-center font-mono text-lg tracking-[0.5em]"
                  value={smsCode}
                  onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                />

                <button type="submit" className="btn-primary mt-5 w-full text-white hover:text-white" disabled={busy}>
                  {busy ? 'Doğrulanıyor...' : 'Doğrula ve Giriş Yap'}
                </button>
                <button
                  type="button"
                  className="btn-outline mt-2 w-full"
                  onClick={() => {
                    cancelPendingLogin();
                    setSmsCode('');
                    setError('');
                  }}
                >
                  Geri dön
                </button>
              </form>
            )}
          </div>

          <aside className="md:col-span-2">
            <div className="card p-6">
              <h2 className="font-heading text-base font-bold text-brand">Demo hesabı</h2>
              <p className="mt-2 text-sm leading-relaxed">
                Sistemi örnek verilerle incelemek için demo hesabını kullanabilirsiniz.
              </p>
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-brand-muted">E-posta</dt>
                  <dd className="font-mono text-brand">{DEMO_CREDENTIALS.email}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-brand-muted">Şifre</dt>
                  <dd className="font-mono text-brand">{DEMO_CREDENTIALS.password}</dd>
                </div>
              </dl>
              <button
                type="button"
                className="btn-outline btn-sm mt-4 w-full"
                onClick={() => {
                  setEmail(DEMO_CREDENTIALS.email);
                  setPassword(DEMO_CREDENTIALS.password);
                }}
              >
                Demo bilgilerini doldur
              </button>
            </div>

            <div className="card mt-4 p-6">
              <h2 className="font-heading text-base font-bold text-brand">Güvenlik</h2>
              <p className="mt-2 text-sm leading-relaxed">
                Platforma giriş işlemlerinde tüm kullanıcılar için SMS doğrulama zorunludur. Bu sayede e-posta
                adresi ve şifrenizi bilen üçüncü şahıslar sisteminize giriş yapamaz.
              </p>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
