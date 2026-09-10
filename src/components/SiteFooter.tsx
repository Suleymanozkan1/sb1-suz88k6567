import { Link } from 'react-router-dom';
import { COPYRIGHT } from '../data/content';

/**
 * Herkese açık alt bilgi.
 *
 * Yalnızca yasal metinler ve müşterinin rezervasyon sorgusu. Tanıtım
 * bağlantıları, mekan dizini ve sosyal medya kaldırıldı; bunlar sistemin
 * kullanıcısına hitap etmiyordu.
 */
const BAGLANTILAR = [
  { label: 'Rezervasyon Sorgulama', to: '/kod-dogrulama' },
  { label: 'KVKK Aydınlatma Metni', to: '/kvkk-aydinlatma-metni' },
  { label: 'Gizlilik Politikası', to: '/gizlilik-politikasi' },
  { label: 'Üyelik Sözleşmesi', to: '/uyelik-sozlesmesi' },
];

export default function SiteFooter() {
  return (
    <footer id="footer" className="border-t border-line bg-surface py-8 text-sm text-ink">
      <div className="container-dt flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
        <p className="text-brand-muted">{COPYRIGHT}</p>
        <nav aria-label="Alt bilgi bağlantıları">
          <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            {BAGLANTILAR.map((b) => (
              <li key={b.to}>
                <Link to={b.to} className="text-brand-muted hover:text-accent-ink">{b.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
