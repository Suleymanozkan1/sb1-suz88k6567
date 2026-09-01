import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Seo from '../components/Seo';
import Alert from '../components/Alert';
import NotFound from './NotFound';
import { DIRECTORY, findMemberBySlug } from '../data/directory';
import { useAddMessage } from '../lib/queries';
import { errorMessage } from '../lib/authHelpers';
import { formatPhone } from '../lib/format';
import { IconLocation, IconPhone, IconStar, IconUsers } from '../components/Icons';

const SUBJECTS = [
  'Fiyat Teklifi İste',
  'İletişim',
  'Rezervasyon',
  'Salon Hakkında Yorum',
];

/** /salon/<slug> — işletme detay sayfası ve fiyat teklifi formu */
export default function SalonDetay() {
  const slug = useLocation().pathname.replace(/^\/salon\/?/, '').replace(/\/+$/, '');
  const member = findMemberBySlug(slug);

  const [form, setForm] = useState({
    subject: SUBJECTS[0],
    eventDate: '',
    name: '',
    email: '',
    phone: '',
    message: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState('');
  const addMessage = useAddMessage();

  if (!member) return <NotFound />;

  const nearby = DIRECTORY.filter(
    (m) => m.id !== member.id && m.city === member.city && m.category === member.category,
  ).slice(0, 6);

  function set(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((f) => ({ ...f, [key]: e.target.value }));
      setErrors((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    };
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Adınızı soyadınızı giriniz.';
    if (!form.email.trim()) next.email = 'E-posta adresinizi giriniz.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim()))
      next.email = 'Geçerli bir e-posta adresi giriniz.';
    if (!form.phone.trim()) next.phone = 'Telefon numaranızı giriniz.';
    else if (form.phone.replace(/\D/g, '').length < 10)
      next.phone = 'Telefon numarası en az 10 haneli olmalıdır.';
    if (!form.message.trim()) next.message = 'Mesajınızı yazınız.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSendError('');
    if (!validate()) return;
    try {
      await addMessage.mutateAsync({
        name: form.name,
        email: form.email,
        phone: form.phone,
        message: [
          `İşletme: ${member!.name} (${member!.district} / ${member!.city})`,
          `Konu: ${form.subject}`,
          form.eventDate ? `İstenilen etkinlik tarihi: ${form.eventDate}` : '',
          '',
          form.message,
        ]
          .filter(Boolean)
          .join('\n'),
        kind: 'demo',
      });
      setSent(true);
      setForm({ subject: SUBJECTS[0], eventDate: '', name: '', email: '', phone: '', message: '' });
    } catch (err) {
      setSendError(errorMessage(err));
    }
  }

  return (
    <>
      <Seo
        title={`${member.name} - ${member.district} / ${member.city} - Düğün Takip`}
        description={`${member.name}, ${member.district} / ${member.city}. ${member.about}`}
        path={`/salon/${member.slug}`}
      />
      <PageHeader title={member.name} breadcrumbs={[{ label: member.name }]} />

      <section className="py-12">
        <div className="container-dt grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="card p-6">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-accent/10 px-3 py-1 text-xs text-accent">{member.category}</span>
                <span className="flex gap-0.5 text-accent" aria-label="5 üzerinden 5 puan">
                  {Array.from({ length: 5 }, (_, i) => (
                    <IconStar key={i} size={14} className="fill-current" />
                  ))}
                </span>
              </div>

              <h2 className="mb-4 font-heading text-lg font-bold text-brand">İşletme Bilgileri</h2>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Info label="Adres" icon={<IconLocation size={16} className="text-accent" />}>
                  {member.address ?? '—'}
                </Info>
                <Info label="İl / İlçe" icon={<IconLocation size={16} className="text-accent" />}>
                  {member.district} / {member.city}
                </Info>
                {member.capacity !== undefined && (
                  <Info label="Salon Kapasitesi" icon={<IconUsers size={16} className="text-accent" />}>
                    {member.capacity} kişi
                  </Info>
                )}
                {member.phone && (
                  <Info label="Telefon" icon={<IconPhone size={16} className="text-accent" />}>
                    <a href={`tel:${member.phone}`}>{formatPhone(member.phone)}</a>
                  </Info>
                )}
              </dl>

              <h3 className="mb-2 mt-6 font-heading font-bold text-brand">Hakkında</h3>
              <p className="leading-relaxed">{member.about}</p>
            </div>

            <div className="card mt-6 p-6">
              <h2 className="mb-1 font-heading text-lg font-bold text-brand">
                Fiyat Teklifi İste / İletişim / Rezervasyon / Salon Hakkında Yorum
              </h2>
              <p className="mb-5 text-sm text-brand-muted">
                Formu doldurun, işletme sizinle en kısa sürede iletişime geçsin.
              </p>

              {sendError && <Alert kind="error" className="mb-5">{sendError}</Alert>}
              {sent && (
                <Alert kind="success" className="mb-5">
                  Talebiniz {member.name} işletmesine iletildi. En kısa sürede sizinle iletişime geçilecektir.
                </Alert>
              )}

              <form onSubmit={(e) => { void onSubmit(e); }} noValidate className="grid gap-4 md:grid-cols-2">
                <Field id="sd-subject" label="Mesaj Konusu">
                  <select id="sd-subject" className="field-input" value={form.subject} onChange={set('subject')}>
                    {SUBJECTS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                <Field id="sd-date" label="İstenilen Etkinlik Tarihi">
                  <input id="sd-date" type="date" className="field-input" value={form.eventDate} onChange={set('eventDate')} />
                </Field>
                <Field id="sd-name" label="Adınız Soyadınız" error={errors.name}>
                  <input id="sd-name" className="field-input" value={form.name} onChange={set('name')} autoComplete="name" aria-invalid={Boolean(errors.name)} />
                </Field>
                <Field id="sd-email" label="Email Adresiniz" error={errors.email}>
                  <input id="sd-email" type="email" className="field-input" value={form.email} onChange={set('email')} autoComplete="email" aria-invalid={Boolean(errors.email)} />
                </Field>
                <Field id="sd-phone" label="Telefon" error={errors.phone} className="md:col-span-2">
                  <input id="sd-phone" type="tel" className="field-input" placeholder="532xxxyyzz şeklinde yazınız" value={form.phone} onChange={set('phone')} autoComplete="tel" aria-invalid={Boolean(errors.phone)} />
                </Field>
                <Field id="sd-message" label="Mesajınız" error={errors.message} className="md:col-span-2">
                  <textarea id="sd-message" rows={5} className="field-input" value={form.message} onChange={set('message')} aria-invalid={Boolean(errors.message)} />
                </Field>
                <div className="md:col-span-2">
                  <button type="submit" className="btn-primary text-white hover:text-white" disabled={addMessage.isPending}>
                    {addMessage.isPending ? 'Gönderiliyor' : 'Gönder'}
                  </button>
                </div>
              </form>
            </div>
          </div>

          <aside>
            <div className="card p-6">
              <h2 className="mb-3 font-heading text-base font-bold text-brand">Bu işletme Düğün Takip üyesidir</h2>
              <p className="text-sm leading-relaxed">
                Siz de işletmenizi buraya ekleyip rezervasyon ve ödeme takibinizi tek ekrandan yönetebilirsiniz.
              </p>
              <Link to="/uye-ol" className="btn-primary mt-4 w-full text-white hover:text-white">
                7 gün ücretsiz deneyin
              </Link>
            </div>

            {nearby.length > 0 && (
              <div className="card mt-6 p-6">
                <h2 className="mb-3 font-heading text-base font-bold text-brand">
                  {member.city} ilindeki diğer işletmeler
                </h2>
                <ul className="space-y-2">
                  {nearby.map((m) => (
                    <li key={m.id}>
                      <Link to={`/salon/${m.slug}`} className="block rounded-md border border-line px-3 py-2 text-sm hover:border-accent">
                        <span className="block font-medium text-brand">{m.name}</span>
                        <span className="block text-xs text-brand-muted">{m.district} / {m.city}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link to="/uyeler" className="mt-4 inline-block text-sm">Tüm salonlar →</Link>
              </div>
            )}
          </aside>
        </div>
      </section>
    </>
  );
}

function Info({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-brand-muted">
        {icon} {label}
      </dt>
      <dd className="mt-0.5 text-brand">{children}</dd>
    </div>
  );
}

function Field({
  id, label, error, className = '', children,
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
