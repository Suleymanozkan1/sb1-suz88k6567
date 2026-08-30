import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import Seo from '../components/Seo';
import { CONTACT, SOCIAL } from '../data/content';
import { addMessage } from '../lib/db';
import { IconFacebook, IconInstagram, IconMail, IconMessage } from '../components/Icons';
import Alert from '../components/Alert';

interface Props {
  variant?: 'iletisim' | 'demo';
}

export default function Iletisim({ variant = 'iletisim' }: Props) {
  const isDemo = variant === 'demo';
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Adınızı soyadınızı giriniz.';
    if (!form.email.trim()) next.email = 'E-posta adresinizi giriniz.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) next.email = 'Geçerli bir e-posta adresi giriniz.';
    if (!form.phone.trim()) next.phone = 'Telefon numaranızı giriniz.';
    else if (form.phone.replace(/\D/g, '').length < 10) next.phone = 'Telefon numarası en az 10 haneli olmalıdır.';
    if (!form.message.trim()) next.message = 'Mesajınızı yazınız.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSending(true);
    window.setTimeout(() => {
      addMessage({ ...form, kind: isDemo ? 'demo' : 'iletisim' });
      setSending(false);
      setSent(true);
      setForm({ name: '', email: '', phone: '', message: '' });
    }, 600);
  }

  const title = isDemo ? 'Demo Talebi' : CONTACT.title;

  return (
    <>
      <Seo
        title={`${isDemo ? 'Demo Talebi' : 'İletişim'} - Düğün Takip Salon Takip Programı`}
        description={
          isDemo
            ? 'Ücretsiz demo ve eğitim talebinde bulunun, sizi arayalım.'
            : 'Düğün Takip salon takip programı iletişim bilgileri ve iletişim formu.'
        }
        path={isDemo ? '/demo-talebi' : '/iletisim'}
      />
      <PageHeader
        title={title}
        breadcrumbs={[{ label: isDemo ? 'Demo Talebi' : 'İletişim' }]}
        description={isDemo ? 'Ücretsiz demo ve eğitim talebinde bulunmak yada sizi aramamızı istermisiniz?' : undefined}
      />

      <section className="py-14">
        <div className="container-dt grid gap-10 lg:grid-cols-3">
          <div className="space-y-4">
            <div className="card flex items-start gap-4 p-5">
              <span className="rounded-full bg-accent/10 p-3 text-accent"><IconMail size={22} /></span>
              <div>
                <h2 className="font-heading font-bold text-brand">E-Posta</h2>
                <p className="mt-1 text-sm">
                  <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
                </p>
              </div>
            </div>
            <div className="card flex items-start gap-4 p-5">
              <span className="rounded-full bg-accent/10 p-3 text-accent"><IconMessage size={22} /></span>
              <div>
                <h2 className="font-heading font-bold text-brand">Destek</h2>
                <p className="mt-1 text-sm leading-relaxed">
                  Ücretsiz eğitim ve ücretsiz telefon desteği tüm üyelerimize sunulmaktadır.
                </p>
              </div>
            </div>
            <div className="card p-5">
              <h2 className="font-heading font-bold text-brand">Sosyal Medya</h2>
              <div className="mt-3 flex gap-2">
                <a href={SOCIAL.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="rounded-full bg-brand p-2.5 text-white hover:bg-accent">
                  <IconFacebook size={18} />
                </a>
                <a href={SOCIAL.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="rounded-full bg-brand p-2.5 text-white hover:bg-accent">
                  <IconInstagram size={18} />
                </a>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <form onSubmit={onSubmit} noValidate className="card p-6">
              <h2 className="mb-5 font-heading text-xl font-bold text-brand">
                {isDemo ? 'Demo ve eğitim talebi formu' : 'Bize mesaj gönderin'}
              </h2>

              {sent && (
                <Alert kind="success" className="mb-5">
                  Mesajınız tarafımıza ulaştı. En kısa sürede sizinle iletişime geçeceğiz.
                </Alert>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <Field id="ct-name" label={CONTACT.formFields.name} error={errors.name}>
                  <input id="ct-name" className="field-input" value={form.name} onChange={set('name')} autoComplete="name" aria-invalid={Boolean(errors.name)} />
                </Field>
                <Field id="ct-email" label={CONTACT.formFields.email} error={errors.email}>
                  <input id="ct-email" type="email" className="field-input" value={form.email} onChange={set('email')} autoComplete="email" aria-invalid={Boolean(errors.email)} />
                </Field>
              </div>

              <Field id="ct-phone" label={CONTACT.formFields.phone} error={errors.phone} className="mt-4">
                <input id="ct-phone" type="tel" className="field-input" value={form.phone} onChange={set('phone')} autoComplete="tel" placeholder="532xxxyyzz şeklinde yazınız" aria-invalid={Boolean(errors.phone)} />
              </Field>

              <Field id="ct-message" label={CONTACT.formFields.message} error={errors.message} className="mt-4">
                <textarea id="ct-message" rows={6} className="field-input" value={form.message} onChange={set('message')} aria-invalid={Boolean(errors.message)} />
              </Field>

              <button type="submit" className="btn-primary mt-6 text-white hover:text-white" disabled={sending}>
                {sending ? CONTACT.submitting : isDemo ? 'Talepte bulun' : CONTACT.submit}
              </button>
            </form>
          </div>
        </div>
      </section>
    </>
  );
}

function Field({
  id,
  label,
  error,
  className = '',
  children,
}: {
  id: string;
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="field-label">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-[#e74c3c]" role="alert">{error}</p>}
    </div>
  );
}
