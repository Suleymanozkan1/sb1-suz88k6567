import { useState } from 'react';
import Seo from '../../components/Seo';
import Alert from '../../components/Alert';
import { useAuth } from '../../context/AuthContext';
import { getUsers } from '../../lib/db';
import { REFERRAL_BONUS_DAYS } from '../../data/constants';
import { IconCopy, IconFacebook, IconGift, IconInstagram, IconMessage } from '../../components/Icons';

export default function TavsiyeEt() {
  const { user } = useAuth();
  const [copied, setCopied] = useState('');

  if (!user) return null;

  const link = `${window.location.origin}/uye-ol?ref=${user.referralCode}`;
  const invited = getUsers().filter((u) => u.referredBy === user.referralCode || u.referredBy === user.email);
  const message = `Duguntakip.com salon takip programini deneyin! Uye olmak icin: ${link}`;

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(''), 2500);
    } catch {
      setCopied('error');
    }
  }

  return (
    <>
      <Seo title="Tavsiye Et Kazan - Düğün Takip Panel" noindex />

      <h1 className="mb-2 font-heading text-2xl font-bold text-brand">Tavsiye Et Kazan</h1>
      <p className="mb-6 max-w-3xl text-sm leading-relaxed text-brand-muted">
        Kodu kopyalayın ya da uygulamadan paylaşın (WhatsApp, Instagram, SMS). Arkadaşınız bu linkten üye olup yıllık
        abonelik ücretini yatırdığında, üyeliğinize otomatik olarak <strong className="text-brand">+1 AY</strong> eklenir.
        Üye sınırı yoktur; ne kadar ücretli üyelik, o kadar ek süre.
      </p>

      {copied === 'error' && <Alert kind="error" className="mb-5">Panoya kopyalanamadı, metni elle seçebilirsiniz.</Alert>}
      {copied && copied !== 'error' && <Alert kind="success" className="mb-5">Panoya kopyalandı.</Alert>}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-6 lg:col-span-2">
          <div className="mb-5 flex items-center gap-3">
            <span className="rounded-lg bg-accent/10 p-3 text-accent"><IconGift size={24} /></span>
            <div>
              <h2 className="font-heading text-lg font-bold text-brand">Tavsiye kodunuz</h2>
              <p className="text-xs text-brand-muted">Her ücretli üye için +{REFERRAL_BONUS_DAYS} gün</p>
            </div>
          </div>

          <label htmlFor="ref-code" className="field-label">Kodunuz</label>
          <div className="flex gap-2">
            <input id="ref-code" readOnly value={user.referralCode} className="field-input font-mono text-lg tracking-widest" />
            <button type="button" onClick={() => copy(user.referralCode, 'code')} className="btn-outline shrink-0">
              <IconCopy size={16} /> Kopyala
            </button>
          </div>

          <label htmlFor="ref-link" className="field-label mt-4">Davet linkiniz</label>
          <div className="flex gap-2">
            <input id="ref-link" readOnly value={link} className="field-input text-sm" />
            <button type="button" onClick={() => copy(link, 'link')} className="btn-outline shrink-0">
              <IconCopy size={16} /> Kopyala
            </button>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-outline btn-sm"
            >
              <IconMessage size={16} /> WhatsApp ile paylaş
            </a>
            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-outline btn-sm"
            >
              <IconFacebook size={16} /> Facebook
            </a>
            <a href="https://www.instagram.com/" target="_blank" rel="noopener noreferrer" className="btn-outline btn-sm">
              <IconInstagram size={16} /> Instagram
            </a>
            <a href={`sms:?body=${encodeURIComponent(message)}`} className="btn-outline btn-sm">
              <IconMessage size={16} /> SMS
            </a>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="mb-4 font-heading text-lg font-bold text-brand">Davet ettikleriniz</h2>
          <p className="mb-4 text-3xl font-bold text-accent">{invited.length}</p>
          {invited.length === 0 ? (
            <p className="text-sm text-brand-muted">Henüz davetinizle üye olan bulunmuyor.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {invited.map((u) => (
                <li key={u.id} className="rounded-md border border-line px-3 py-2">
                  <span className="block font-medium text-brand">{u.companyName}</span>
                  <span className="block text-xs text-brand-muted">{u.city} · {u.category}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card mt-6 p-6">
        <h2 className="mb-3 font-heading text-lg font-bold text-brand">Nasıl çalışır?</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>Tavsiye kodunuzu veya davet linkinizi kopyalayın.</li>
          <li>Fotoğrafçılara, organizasyonculara, gelinlikçilere, düğün salonlarına ve araç kiralama firmalarına gönderin.</li>
          <li>Arkadaşınız bu linkten üye olsun.</li>
          <li>Yıllık abonelik ücretini yatırdığında üyeliğinize otomatik +1 ay eklenir.</li>
        </ol>
      </section>
    </>
  );
}
