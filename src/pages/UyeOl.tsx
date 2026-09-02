import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Seo from '../components/Seo';
import Alert from '../components/Alert';
import { CATEGORIES, CITIES, CURRENCIES, DISTRICTS, HEARD_FROM, TRIAL_DAYS } from '../data/constants';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../lib/authHelpers';
import type { Currency } from '../types';

interface FormState {
  companyName: string;
  fullName: string;
  mobile: string;
  capacity: string;
  facebook: string;
  instagram: string;
  referredBy: string;
  email: string;
  password: string;
  passwordRepeat: string;
  currency: Currency;
  category: string;
  city: string;
  district: string;
  heardFrom: string;
  phone: string;
  street: string;
  avenue: string;
  buildingNo: string;
  neighbourhood: string;
  acceptPrivacy: boolean;
  acceptTerms: boolean;
}

const INITIAL: FormState = {
  companyName: '',
  fullName: '',
  mobile: '',
  capacity: '',
  facebook: '',
  instagram: '',
  referredBy: '',
  email: '',
  password: '',
  passwordRepeat: '',
  currency: 'TL',
  category: '',
  city: '',
  district: '',
  heardFrom: '',
  phone: '',
  street: '',
  avenue: '',
  buildingNo: '',
  neighbourhood: '',
  acceptPrivacy: false,
  acceptTerms: false,
};

export default function UyeOl() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { signUp, user, signupEnabled } = useAuth();

  const [form, setForm] = useState<FormState>({ ...INITIAL, referredBy: params.get('ref') ?? '' });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  const districts = useMemo(() => DISTRICTS[form.city] ?? [], [form.city]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value, ...(key === 'city' ? { district: '' } : {}) }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function validate(): boolean {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!form.companyName.trim()) e.companyName = 'Üye firma adını giriniz.';
    if (!form.fullName.trim()) e.fullName = 'Yetkili ad soyad giriniz.';

    const mobileDigits = form.mobile.replace(/\D/g, '');
    if (!mobileDigits) e.mobile = 'Cep telefonu giriniz.';
    else if (mobileDigits.length !== 10 || !mobileDigits.startsWith('5'))
      e.mobile = '532xxxyyzz şeklinde, 10 haneli olarak yazınız.';

    if (!form.email.trim()) e.email = 'Email adresinizi giriniz.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) e.email = 'Geçerli bir email adresi giriniz.';

    if (!form.password) e.password = 'Şifrenizi giriniz.';
    else if (form.password.length < 6) e.password = 'Şifreniz en az 6 karakter olmalıdır.';
    if (form.password !== form.passwordRepeat) e.passwordRepeat = 'Şifreler birbiriyle uyuşmuyor.';

    if (!form.category) e.category = 'Kategori seçiniz.';
    if (!form.city) e.city = 'Şehir seçiniz.';
    if (districts.length > 0 && !form.district) e.district = 'İlçe seçiniz.';

    if (form.capacity && (!/^\d+$/.test(form.capacity) || Number(form.capacity) <= 0))
      e.capacity = 'Kapasiteyi rakam olarak giriniz.';

    if (!form.acceptPrivacy) e.acceptPrivacy = 'Gizlilik politikasını onaylamanız gerekmektedir.';
    if (!form.acceptTerms) e.acceptTerms = 'Üyelik sözleşmesini onaylamanız gerekmektedir.';

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setServerError('');
    if (!validate()) {
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    setSubmitting(true);
    try {
      await signUp({
        companyName: form.companyName.trim(),
        fullName: form.fullName.trim(),
        mobile: form.mobile.replace(/\D/g, ''),
        capacity: Number(form.capacity) || 0,
        facebook: form.facebook.trim() || undefined,
        instagram: form.instagram.trim() || undefined,
        email: form.email.trim(),
        password: form.password,
        currency: form.currency,
        category: form.category,
        city: form.city,
        district: form.district || form.city,
        phone: form.phone.replace(/\D/g, '') || undefined,
        address: [form.neighbourhood, form.street, form.avenue, form.buildingNo ? `No:${form.buildingNo}` : '']
          .filter(Boolean)
          .join(' ')
          .trim(),
      });
      navigate('/panel', { replace: true });
    } catch (err) {
      setServerError(errorMessage(err));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  }

  if (!signupEnabled) {
    return (
      <>
        <Seo title="Üye Ol - Düğün Takip" path="/uye-ol" noindex />
        <PageHeader title="Üye Ol" breadcrumbs={[{ label: 'Üye Ol' }]} />
        <section className="py-14">
          <div className="container-dt max-w-2xl">
            <Alert kind="info">
              Yeni üyelik kaydı şu anda kapalıdır. Hesabınız varsa{' '}
              <Link to="/uye-girisi">üye girişi yapabilirsiniz</Link>. Hesap açtırmak için{' '}
              <Link to="/iletisim">bizimle iletişime geçin</Link>.
            </Alert>
          </div>
        </section>
      </>
    );
  }

  if (user) {
    return (
      <>
        <PageHeader title="Üye Ol" breadcrumbs={[{ label: 'Üye Ol' }]} />
        <section className="py-14">
          <div className="container-dt max-w-2xl">
            <Alert kind="info">
              Zaten giriş yapmış durumdasınız. <Link to="/panel">Panelinize gidin</Link>.
            </Alert>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <Seo
        title="Üye Ol - Düğün Takip Salon Takip Programı"
        description={`Düğün Takip sistemine üye olun, ${TRIAL_DAYS} gün boyunca ücretsiz tam sürüm kullanın.`}
        path="/uye-ol"
      />
      <PageHeader
        title="Üye Ol"
        breadcrumbs={[{ label: 'Üye Ol' }]}
        description={`Üye olarak ${TRIAL_DAYS} gün boyunca ücretsiz tam sürüm kullanabilirsiniz. Kredi kartı bilgisi istenmez.`}
      />

      <section className="py-12">
        <div className="container-dt max-w-4xl">
          {serverError && <Alert kind="error" className="mb-6">{serverError}</Alert>}

          <form onSubmit={(e) => { void onSubmit(e); }} noValidate className="card p-6 md:p-8">
            <fieldset className="mb-8">
              <legend className="mb-4 font-heading text-lg font-bold text-brand">İşletme Bilgileri</legend>
              <div className="grid gap-4 md:grid-cols-2">
                <Field id="companyName" label="Üye Firma Adı" required error={errors.companyName}>
                  <input id="companyName" className="field-input" value={form.companyName} onChange={(e) => update('companyName', e.target.value)} aria-invalid={Boolean(errors.companyName)} autoComplete="organization" />
                </Field>
                <Field id="fullName" label="Yetkili Ad Soyad" required error={errors.fullName}>
                  <input id="fullName" className="field-input" value={form.fullName} onChange={(e) => update('fullName', e.target.value)} aria-invalid={Boolean(errors.fullName)} autoComplete="name" />
                </Field>
                <Field id="mobile" label="Cep Telefonu" required error={errors.mobile}>
                  <input id="mobile" type="tel" className="field-input" placeholder="532xxxyyzz şeklinde yazınız" value={form.mobile} onChange={(e) => update('mobile', e.target.value)} aria-invalid={Boolean(errors.mobile)} autoComplete="tel" />
                </Field>
                <Field id="phone" label="Telefon" error={errors.phone}>
                  <input id="phone" type="tel" className="field-input" value={form.phone} onChange={(e) => update('phone', e.target.value)} />
                </Field>
                <Field id="category" label="Kategori" required error={errors.category}>
                  <select id="category" className="field-input" value={form.category} onChange={(e) => update('category', e.target.value)} aria-invalid={Boolean(errors.category)}>
                    <option value="">---Seçiniz---</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field id="capacity" label="Salon Kapasitesi (kişi)" error={errors.capacity}>
                  <input id="capacity" inputMode="numeric" className="field-input" value={form.capacity} onChange={(e) => update('capacity', e.target.value)} aria-invalid={Boolean(errors.capacity)} />
                </Field>
                <Field id="currency" label="Para Birimi">
                  <select id="currency" className="field-input" value={form.currency} onChange={(e) => update('currency', e.target.value as Currency)}>
                    {CURRENCIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </Field>
                <Field id="heardFrom" label="Bize Nereden Ulaştınız?">
                  <select id="heardFrom" className="field-input" value={form.heardFrom} onChange={(e) => update('heardFrom', e.target.value)}>
                    <option value="">---Seçiniz---</option>
                    {HEARD_FROM.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </Field>
              </div>
            </fieldset>

            <fieldset className="mb-8">
              <legend className="mb-4 font-heading text-lg font-bold text-brand">Adres Bilgileri</legend>
              <div className="grid gap-4 md:grid-cols-2">
                <Field id="city" label="Şehir" required error={errors.city}>
                  <select id="city" className="field-input" value={form.city} onChange={(e) => update('city', e.target.value)} aria-invalid={Boolean(errors.city)}>
                    <option value="">---Seçiniz---</option>
                    {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field id="district" label="İlçe" required={districts.length > 0} error={errors.district}>
                  {districts.length > 0 ? (
                    <select id="district" className="field-input" value={form.district} onChange={(e) => update('district', e.target.value)} aria-invalid={Boolean(errors.district)}>
                      <option value="">---Seçiniz---</option>
                      {districts.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  ) : (
                    <input id="district" className="field-input" value={form.district} onChange={(e) => update('district', e.target.value)} />
                  )}
                </Field>
                <Field id="neighbourhood" label="Mahalle">
                  <input id="neighbourhood" className="field-input" value={form.neighbourhood} onChange={(e) => update('neighbourhood', e.target.value)} />
                </Field>
                <Field id="street" label="Cadde">
                  <input id="street" className="field-input" value={form.street} onChange={(e) => update('street', e.target.value)} />
                </Field>
                <Field id="avenue" label="Sokak">
                  <input id="avenue" className="field-input" value={form.avenue} onChange={(e) => update('avenue', e.target.value)} />
                </Field>
                <Field id="buildingNo" label="No">
                  <input id="buildingNo" className="field-input" value={form.buildingNo} onChange={(e) => update('buildingNo', e.target.value)} />
                </Field>
              </div>
            </fieldset>

            <fieldset className="mb-8">
              <legend className="mb-4 font-heading text-lg font-bold text-brand">Hesap Bilgileri</legend>
              <div className="grid gap-4 md:grid-cols-2">
                <Field id="email" label="Email Adresiniz" required error={errors.email}>
                  <input id="email" type="email" className="field-input" value={form.email} onChange={(e) => update('email', e.target.value)} aria-invalid={Boolean(errors.email)} autoComplete="email" />
                </Field>
                <Field id="referredBy" label="Tavsiye Eden">
                  <input id="referredBy" className="field-input" placeholder="Tavsiye kodu veya e-posta" value={form.referredBy} onChange={(e) => update('referredBy', e.target.value)} />
                </Field>
                <Field id="password" label="Şifreniz" required error={errors.password}>
                  <input id="password" type="password" className="field-input" value={form.password} onChange={(e) => update('password', e.target.value)} aria-invalid={Boolean(errors.password)} autoComplete="new-password" />
                </Field>
                <Field id="passwordRepeat" label="Şifreniz (Tekrar)" required error={errors.passwordRepeat}>
                  <input id="passwordRepeat" type="password" className="field-input" value={form.passwordRepeat} onChange={(e) => update('passwordRepeat', e.target.value)} aria-invalid={Boolean(errors.passwordRepeat)} autoComplete="new-password" />
                </Field>
                <Field id="facebook" label="Facebook (varsa)">
                  <input id="facebook" className="field-input" value={form.facebook} onChange={(e) => update('facebook', e.target.value)} />
                </Field>
                <Field id="instagram" label="Instagram (varsa)">
                  <input id="instagram" className="field-input" value={form.instagram} onChange={(e) => update('instagram', e.target.value)} />
                </Field>
              </div>
            </fieldset>

            <div className="space-y-3">
              <Checkbox
                id="acceptPrivacy"
                checked={form.acceptPrivacy}
                onChange={(v) => update('acceptPrivacy', v)}
                error={errors.acceptPrivacy}
              >
                <Link to="/gizlilik-politikasi" target="_blank">Gizlilik Politikası</Link>’nı okudum, kabul ediyorum.
              </Checkbox>
              <Checkbox
                id="acceptTerms"
                checked={form.acceptTerms}
                onChange={(v) => update('acceptTerms', v)}
                error={errors.acceptTerms}
              >
                <Link to="/uyelik-sozlesmesi" target="_blank">Üyelik Sözleşmesi</Link>’ni okudum, kabul ediyorum.
              </Checkbox>
            </div>

            <button type="submit" className="btn-primary mt-6 !px-8 !py-3 text-white hover:text-white" disabled={submitting}>
              {submitting ? 'Lütfen bekleyiniz...' : 'Üye Ol'}
            </button>

            <p className="mt-4 text-sm">
              Zaten üye misiniz? <Link to="/uye-girisi">Üye girişi yapın</Link>
            </p>
          </form>
        </div>
      </section>
    </>
  );
}

function Field({
  id,
  label,
  required,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
        {required && <span className="ml-0.5 text-[#e74c3c]" aria-hidden="true">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-[#e74c3c]" role="alert">{error}</p>}
    </div>
  );
}

function Checkbox({
  id,
  checked,
  onChange,
  error,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="flex items-start gap-2.5 text-sm">
        <input
          id={id}
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-line text-accent focus:ring-accent"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={Boolean(error)}
        />
        <span>{children}</span>
      </label>
      {error && <p className="ml-6 mt-1 text-xs text-[#e74c3c]" role="alert">{error}</p>}
    </div>
  );
}
