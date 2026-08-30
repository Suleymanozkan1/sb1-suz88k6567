import { useState } from 'react';
import Seo from '../../components/Seo';
import Alert from '../../components/Alert';
import { useAuth } from '../../context/AuthContext';
import { addDays, formatDateLong } from '../../lib/format';
import { IconCheck, IconShield } from '../../components/Icons';

const PLANS = [
  { id: 'aylik', name: 'Aylık', months: 1, price: 750, badge: '' },
  { id: 'alti-aylik', name: '6 Aylık', months: 6, price: 3900, badge: '%13 indirim' },
  { id: 'yillik', name: 'Yıllık', months: 12, price: 6900, badge: 'En avantajlı' },
];

const FEATURES = [
  'Sınırsız rezervasyon kaydı',
  'Gündüz / gece seans takibi',
  'Kaparo ve kalan alacak takibi',
  'Salon kiralama sözleşmesi',
  'Program ve ay bazlı raporlar',
  'Gelir gider kayıtları',
  'Otomatik rezervasyon SMS’i',
  'Sınırsız alt kullanıcı',
  'Ücretsiz eğitim ve telefon desteği',
];

export default function Abonelik() {
  const { user, updateUser, daysRemaining } = useAuth();
  const [selected, setSelected] = useState('yillik');
  const [done, setDone] = useState(false);
  const [processing, setProcessing] = useState(false);

  if (!user) return null;

  const plan = PLANS.find((p) => p.id === selected) ?? PLANS[2];

  function pay() {
    setProcessing(true);
    window.setTimeout(() => {
      const base = daysRemaining > 0 ? user!.subscriptionEndsAt : new Date().toISOString().slice(0, 10);
      updateUser({ subscriptionEndsAt: addDays(base, plan.months * 30) });
      setProcessing(false);
      setDone(true);
    }, 800);
  }

  return (
    <>
      <Seo title="Aboneliğim - Düğün Takip Panel" noindex />

      <h1 className="mb-6 font-heading text-2xl font-bold text-brand">Aboneliğim</h1>

      {done && (
        <Alert kind="success" className="mb-6">
          Ödemeniz alındı. Yeni bitiş tarihiniz: <strong>{formatDateLong(user.subscriptionEndsAt)}</strong>
        </Alert>
      )}

      <div className="card mb-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-brand-muted">Mevcut üyelik durumu</p>
            <p className="mt-1 font-heading text-xl font-bold text-brand">
              {daysRemaining < 0 ? 'Süresi doldu' : `${daysRemaining} gün kaldı`}
            </p>
            <p className="mt-0.5 text-sm text-brand-muted">
              Bitiş tarihi: {formatDateLong(user.subscriptionEndsAt)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-brand-muted">Firma</p>
            <p className="mt-1 font-heading font-bold text-brand">{user.companyName}</p>
          </div>
        </div>
      </div>

      <h2 className="mb-4 font-heading text-lg font-bold text-brand">Abonelik paketleri</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((p) => {
          const isSelected = p.id === selected;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelected(p.id)}
              aria-pressed={isSelected}
              className={`card p-6 text-left transition ${isSelected ? 'ring-2 ring-accent' : 'hover:shadow-md'}`}
            >
              {p.badge && (
                <span className="mb-2 inline-block rounded-full bg-accent/10 px-3 py-1 text-[10px] font-medium text-accent">
                  {p.badge}
                </span>
              )}
              <h3 className="font-heading text-lg font-bold text-brand">{p.name}</h3>
              <p className="mt-2 font-display text-3xl font-bold text-brand">
                {p.price.toLocaleString('tr-TR')} <span className="text-base font-normal">₺</span>
              </p>
              <p className="mt-1 text-xs text-brand-muted">
                {p.months} ay · aylık {Math.round(p.price / p.months).toLocaleString('tr-TR')} ₺
              </p>
            </button>
          );
        })}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="card p-6 lg:col-span-2">
          <h2 className="mb-4 font-heading text-lg font-bold text-brand">Tüm paketlere dahil</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <IconCheck size={18} className="mt-0.5 shrink-0 text-accent" />
                {f}
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-6">
          <h2 className="mb-3 font-heading text-lg font-bold text-brand">Ödeme</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-brand-muted">Paket</dt>
              <dd className="font-medium text-brand">{plan.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-brand-muted">Tutar</dt>
              <dd className="font-medium text-brand">{plan.price.toLocaleString('tr-TR')} ₺</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-2">
              <dt className="text-brand-muted">Yeni bitiş tarihi</dt>
              <dd className="font-medium text-brand">
                {formatDateLong(addDays(daysRemaining > 0 ? user.subscriptionEndsAt : new Date().toISOString().slice(0, 10), plan.months * 30))}
              </dd>
            </div>
          </dl>

          <button type="button" onClick={pay} className="btn-primary mt-5 w-full text-white hover:text-white" disabled={processing}>
            {processing ? 'İşleniyor...' : 'Ödemeyi tamamla'}
          </button>

          <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-brand-muted">
            <IconShield size={16} className="mt-0.5 shrink-0 text-accent" />
            Kredi kartı bilgileriniz 128 bit SSL güvenlik katmanı üzerinden sadece bankanıza ödeme bilgisi için
            gönderilir, sistemimizde saklanmaz.
          </p>
        </section>
      </div>
    </>
  );
}
