import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Seo from '../components/Seo';
import Alert from '../components/Alert';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../lib/authHelpers';
import { DEMO_CREDENTIALS } from '../lib/seed';
import { IconLock, IconShield } from '../components/Icons';
import { issueLoginOtp, verifyLoginOtp, type OtpChallenge } from '../lib/sms';
import { formatPhone } from '../lib/format';

export default function UyeGirisi() {
  const { user, signIn, signOut, requestPasswordReset, isDemoMode, signupEnabled } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // SMS doğrulama adımı: şifre doğrulandıktan sonra devreye girer
  const [challenge, setChallenge] = useState<{ phone: string; otp: OtpChallenge } | null>(null);
  const [smsCode, setSmsCode] = useState('');

  if (user) return <Navigate to="/panel" replace />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setResetSent(false);
    if (!email.trim() || !password) {
      setError('E-posta ve şifrenizi giriniz.');
      return;
    }
    setBusy(true);
    try {
      const account = await signIn(email, password);

      // Şifre doğru: ikinci adım olarak cep telefonuna doğrulama kodu istenir.
      const result = await issueLoginOtp(account.mobile);
      if ('challenge' in result) {
        setChallenge({ phone: account.mobile, otp: result.challenge });
        return;
      }
      if ('error' in result) {
        setError(result.error);
        await signOut();
        return;
      }
      // Sağlayıcı tanımlı değil: doğrulama atlanır, kullanıcı bilgilendirilir.
      navigate('/panel', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!challenge) return;
    setBusy(true);
    try {
      const result = await verifyLoginOtp(challenge.phone, smsCode, challenge.otp);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      navigate('/panel', { replace: true });
    } finally {
      setBusy(false);
    }
  }

  async function onCancelVerification() {
    setChallenge(null);
    setSmsCode('');
    setError('');
    await signOut();
  }

  async function onReset() {
    setError('');
    setResetSent(false);
    if (!email.trim()) {
      setError('Şifre sıfırlama için önce e-posta adresinizi yazınız.');
      return;
    }
    try {
      await requestPasswordReset(email);
      setResetSent(true);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <>
      <Seo title="Üye Girişi - Düğün Takip" description="Düğün Takip üye girişi." path="/uye-girisi" noindex />
      <PageHeader title="Üye Girişi" breadcrumbs={[{ label: 'Üye Girişi' }]} />

      <section className="py-12">
        <div className="container-dt grid max-w-4xl gap-8 md:grid-cols-5">
          <div className="md:col-span-3">
            {error && <Alert kind="error" className="mb-5">{error}</Alert>}
            {resetSent && (
              <Alert kind="success" className="mb-5">
                Şifre sıfırlama bağlantısı e-posta adresinize gönderildi.
              </Alert>
            )}

            {challenge ? (
              <form onSubmit={(e) => { void onVerify(e); }} noValidate className="card p-6">
                <h2 className="mb-2 flex items-center gap-2 font-heading text-xl font-bold text-brand">
                  <IconShield size={20} className="text-accent" /> SMS Doğrulama
                </h2>
                <p className="mb-5 text-sm leading-relaxed">
                  Güvenliğiniz için <strong>{formatPhone(challenge.phone)}</strong> numarasına 6 haneli
                  doğrulama kodu gönderildi. Kod 5 dakika geçerlidir.
                </p>

                <label htmlFor="sms-code" className="field-label">Sms Kodu</label>
                <input
                  id="sms-code"
                  inputMode="numeric"
                  maxLength={6}
                  className="field-input text-center font-mono text-lg tracking-[0.5em]"
                  value={smsCode}
                  onChange={(ev) => setSmsCode(ev.target.value.replace(/\D/g, ''))}
                  autoFocus
                />

                <button type="submit" className="btn-primary mt-5 w-full text-white hover:text-white" disabled={busy}>
                  {busy ? 'Doğrulanıyor...' : 'Doğrula ve Giriş Yap'}
                </button>
                <button type="button" className="btn-outline mt-2 w-full" onClick={() => { void onCancelVerification(); }}>
                  Geri dön
                </button>
              </form>
            ) : (
            <form onSubmit={(e) => { void onSubmit(e); }} noValidate className="card p-6">
              <h2 className="mb-5 flex items-center gap-2 font-heading text-xl font-bold text-brand">
                <IconLock size={20} className="text-accent" /> Giriş yapın
              </h2>

              <div className="space-y-4">
                <div>
                  <label htmlFor="login-email" className="field-label">Email Adresiniz</label>
                  <input id="login-email" type="email" className="field-input" value={email}
                    onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
                </div>
                <div>
                  <label htmlFor="login-password" className="field-label">Şifreniz</label>
                  <input id="login-password" type="password" className="field-input" value={password}
                    onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                </div>
              </div>

              <button type="submit" className="btn-primary mt-6 w-full text-white hover:text-white" disabled={busy}>
                {busy ? 'Lütfen bekleyiniz...' : 'Giriş Yap'}
              </button>

              {!isDemoMode && (
                <button type="button" onClick={() => { void onReset(); }} className="mt-3 w-full text-sm text-accent hover:text-accent-dark">
                  Şifremi unuttum
                </button>
              )}

              {signupEnabled && (
                <p className="mt-4 text-sm">
                  Üye değil misiniz? <Link to="/uye-ol">Hemen üye olun</Link>
                </p>
              )}
            </form>
            )}
          </div>

          <aside className="md:col-span-2">
            {isDemoMode && (
              <div className="card p-6">
                <h2 className="font-heading text-base font-bold text-brand">Demo hesabı</h2>
                <p className="mt-2 text-sm leading-relaxed">
                  Veritabanı bağlı değil. Sistemi örnek verilerle incelemek için demo hesabını kullanabilirsiniz.
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
            )}

            <div className={`card p-6 ${isDemoMode ? 'mt-4' : ''}`}>
              <h2 className="flex items-center gap-2 font-heading text-base font-bold text-brand">
                <IconShield size={18} className="text-accent" /> Güvenlik
              </h2>
              <p className="mt-2 text-sm leading-relaxed">
                {isDemoMode
                  ? 'Demo modunda veriler yalnızca bu tarayıcıda saklanır. Gerçek kullanım için veritabanı bağlantısı gereklidir.'
                  : 'Şifreniz sunucu tarafında şifrelenmiş olarak saklanır ve hiçbir zaman tarayıcınıza gönderilmez. Tüm veri trafiği SSL ile korunur.'}
              </p>
              <p className="mt-2 text-sm leading-relaxed">
                SMS sağlayıcısı tanımlıysa giriş sırasında cep telefonunuza gönderilen 6 haneli kod
                ile ikinci adım doğrulama istenir.
              </p>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
