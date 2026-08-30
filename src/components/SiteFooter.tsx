import { Link } from 'react-router-dom';
import { COPYRIGHT, CONTACT, SOCIAL } from '../data/content';
import { IconFacebook, IconInstagram, IconMail, IconTwitter, IconYoutube } from './Icons';

const CONTENT_LINKS = [
  { label: 'Düğün Takip', to: '/nedir' },
  { label: 'Gizlilik Politikası', to: '/gizlilik-politikasi' },
  { label: 'İade/İptal Prosedürü', to: '/iade-proseduru' },
  { label: 'Mesafeli Hizmet Sözleşmesi', to: '/mesafeli-hizmet-sozlesmesi' },
  { label: 'Salon Yönetim Sistemi', to: '/' },
  { label: 'Takvim Programı', to: '/' },
  { label: 'Kod Doğrulama', to: '/kod-dogrulama' },
  { label: 'İletişim', to: '/iletisim' },
];

const VENUE_LINKS = [
  { label: 'Düğün Salonları', to: '/dugun-salonlari' },
  { label: 'Kına Salonları', to: '/kina-salonlari' },
  { label: 'Düğün Otelleri', to: '/dugun-otelleri' },
  { label: 'Kır Düğünü Mekanları', to: '/kir-dugunu-mekanlari' },
  { label: 'Tüm Salonlar', to: '/uyeler' },
];

export default function SiteFooter() {
  return (
    <footer id="footer" className="bg-surface pt-16 text-sm text-ink">
      <div className="container-dt grid gap-10 pb-12 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <h3 className="mb-3 font-display text-2xl font-bold text-brand">
            Düğün<span className="text-accent">Takip</span>
          </h3>
          <p className="leading-relaxed">
            Türkiye’nin ilk online düğün takip sistemi. Düğün salonları için özel olarak geliştirilmiş
            rezervasyon ve ödeme takip sistemi.
          </p>
          <p className="mt-4 flex items-center gap-2">
            <IconMail size={18} className="text-accent" />
            <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
          </p>
        </div>

        <nav aria-labelledby="footer-icerikler">
          <h4 id="footer-icerikler" className="mb-4 text-base font-bold text-brand">
            İçerikler
          </h4>
          <ul className="space-y-2">
            {CONTENT_LINKS.map((l, i) => (
              <li key={`${l.to}-${i}`}>
                <Link to={l.to} className="text-ink hover:text-accent">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-labelledby="footer-salonlar">
          <h4 id="footer-salonlar" className="mb-4 text-base font-bold text-brand">
            Salonlar
          </h4>
          <ul className="space-y-2">
            {VENUE_LINKS.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="text-ink hover:text-accent">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h4 className="mb-4 text-base font-bold text-brand">Sosyal Medya</h4>
          <p className="mb-4">Bizi aşağıdaki sosyal medya hesaplarımızdan takip edebilirsiniz</p>
          <div className="flex gap-2">
            <a href={SOCIAL.twitter} aria-label="Twitter" className="rounded-full bg-brand p-2.5 text-white hover:bg-accent" target="_blank" rel="noopener noreferrer">
              <IconTwitter size={18} />
            </a>
            <a href={SOCIAL.facebook} aria-label="Facebook" className="rounded-full bg-brand p-2.5 text-white hover:bg-accent" target="_blank" rel="noopener noreferrer">
              <IconFacebook size={18} />
            </a>
            <a href={SOCIAL.instagram} aria-label="Instagram" className="rounded-full bg-brand p-2.5 text-white hover:bg-accent" target="_blank" rel="noopener noreferrer">
              <IconInstagram size={18} />
            </a>
            <a href={SOCIAL.youtube} aria-label="YouTube" className="rounded-full bg-brand p-2.5 text-white hover:bg-accent" target="_blank" rel="noopener noreferrer">
              <IconYoutube size={18} />
            </a>
          </div>

          <div className="mt-6 flex flex-col gap-2">
            <StoreBadge store="google" />
            <StoreBadge store="apple" />
          </div>
        </div>
      </div>

      <div className="border-t border-line py-5 text-center">
        <div className="container-dt">{COPYRIGHT}</div>
      </div>
    </footer>
  );
}

function StoreBadge({ store }: { store: 'google' | 'apple' }) {
  const isGoogle = store === 'google';
  return (
    <a
      href={isGoogle ? 'https://play.google.com/store/search?q=d%C3%BC%C4%9F%C3%BCn%20takip' : 'https://apps.apple.com/tr/search?term=d%C3%BC%C4%9F%C3%BCn%20takip'}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex w-40 items-center gap-3 rounded-md bg-brand px-3 py-2 text-white hover:bg-brand-dark hover:text-white"
    >
      {isGoogle ? (
        <svg width="20" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M3.6 1.8a1.5 1.5 0 00-.6 1.2v18a1.5 1.5 0 00.6 1.2l10-10.2-10-10.2zM16.9 9.1L5.6 2.7l8.9 9.1 2.4-2.7zM19.9 11c.7.4 1.1.9 1.1 1.6s-.4 1.2-1.1 1.6l-2.3 1.3-2.6-2.9 2.6-2.9 2.3 1.3zM5.6 21.3l11.3-6.4-2.4-2.7-8.9 9.1z" />
        </svg>
      ) : (
        <svg width="20" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M16.4 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9s-1.8-.9-3-.9c-1.5 0-2.9.9-3.7 2.3-1.6 2.7-.4 6.8 1.1 9 .8 1.1 1.7 2.3 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7 2-1.1 2.8-2.2c.9-1.2 1.2-2.4 1.3-2.5-.1 0-2.5-1-2.5-3.6zM14.2 5.5c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.8 1.4-.6.7-1.2 1.8-1 2.9 1 .1 2.1-.5 2.8-1.3z" />
        </svg>
      )}
      <span className="text-left leading-tight">
        <span className="block text-[9px] uppercase opacity-80">{isGoogle ? 'Google Play' : 'App Store'}</span>
        <span className="block text-xs font-semibold">İndir</span>
      </span>
    </a>
  );
}
