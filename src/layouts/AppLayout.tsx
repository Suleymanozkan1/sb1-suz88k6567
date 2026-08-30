import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getBusinesses } from '../lib/db';
import { formatDate } from '../lib/format';
import {
  IconBuilding, IconCalendar, IconClose, IconGift, IconGrid, IconList, IconLogout, IconMenu,
  IconMessage, IconPalette, IconReport, IconSettings, IconUser, IconUsers, IconWallet,
} from '../components/Icons';
import Alert from '../components/Alert';

const NAV = [
  { to: '/panel', label: 'Özet', icon: IconGrid, end: true },
  { to: '/panel/takvim', label: 'Rezervasyon Takvimi', icon: IconCalendar },
  { to: '/panel/rezervasyonlar', label: 'Rezervasyonlar', icon: IconList },
  { to: '/panel/musteriler', label: 'Müşteriler', icon: IconUsers },
  { to: '/panel/kasa', label: 'Gelir / Gider', icon: IconWallet },
  { to: '/panel/raporlar', label: 'Raporlar', icon: IconReport },
  { to: '/panel/renk-ayarlari', label: 'Renk Ayarları', icon: IconPalette },
  { to: '/panel/isletmeler', label: 'Firmalarım', icon: IconBuilding },
  { to: '/panel/kullanicilar', label: 'Kullanıcılar', icon: IconUser },
  { to: '/panel/sms', label: 'SMS Kayıtları', icon: IconMessage },
  { to: '/panel/tavsiye-et', label: 'Tavsiye Et Kazan', icon: IconGift },
  { to: '/panel/abonelik', label: 'Aboneliğim', icon: IconWallet },
  { to: '/panel/ayarlar', label: 'Ayarlar', icon: IconSettings },
];

export default function AppLayout() {
  const { user, logout, daysRemaining, setActiveBusiness } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  if (!user) return null;

  const businesses = getBusinesses(user.role === 'staff' ? user.ownerId : user.id);
  const active = businesses.find((b) => b.id === user.activeBusinessId) ?? businesses[0];

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition ${
      isActive ? 'bg-accent text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'
    }`;

  return (
    <div className="flex min-h-screen bg-surface">
      {/* Kenar çubuğu */}
      <aside
        className={`no-print fixed inset-y-0 left-0 z-50 w-64 shrink-0 overflow-y-auto bg-brand p-4 transition-transform lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Panel menüsü"
      >
        <div className="mb-6 flex items-center justify-between">
          <Link to="/" className="font-display text-xl font-bold text-white hover:text-white">
            Düğün<span className="text-accent">Takip</span>
          </Link>
          <button type="button" className="text-white lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Menüyü kapat">
            <IconClose size={22} />
          </button>
        </div>

        {businesses.length > 1 && (
          <div className="mb-4">
            <label htmlFor="active-business" className="mb-1 block text-xs text-white/60">
              Aktif işletme
            </label>
            <select
              id="active-business"
              className="w-full rounded-md border border-white/20 bg-brand-dark px-2 py-2 text-sm text-white"
              value={active?.id ?? ''}
              onChange={(e) => setActiveBusiness(e.target.value)}
            >
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        )}

        <nav>
          <ul className="space-y-1">
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} end={item.end} className={linkClass}>
                  <item.icon size={18} />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <button
          type="button"
          onClick={logout}
          className="mt-6 flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm text-white/80 transition hover:bg-white/10 hover:text-white"
        >
          <IconLogout size={18} />
          Çıkış Yap
        </button>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-white px-4 py-3">
          <button type="button" className="text-brand lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Menüyü aç">
            <IconMenu size={24} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-heading text-sm font-bold text-brand">{active?.name ?? user.companyName}</p>
            <p className="truncate text-xs text-brand-muted">
              {user.fullName} · {user.role === 'owner' ? 'Yönetici' : 'Personel'}
            </p>
          </div>
          <Link to="/panel/abonelik" className="hidden text-xs text-brand-muted hover:text-accent sm:block">
            Bitiş: {formatDate(user.subscriptionEndsAt)}
          </Link>
        </header>

        <main className="min-w-0 flex-1 p-4 md:p-6">
          {daysRemaining <= 7 && (
            <Alert kind={daysRemaining < 0 ? 'error' : 'warning'} className="mb-5">
              {daysRemaining < 0 ? (
                <>
                  Kullanım süreniz doldu. Kayıtlarınız saklanmaktadır.{' '}
                  <Link to="/panel/abonelik">Aboneliğinizi yenileyin</Link>.
                </>
              ) : (
                <>
                  Kullanım sürenizin bitmesine <strong>{daysRemaining} gün</strong> kaldı.{' '}
                  <Link to="/panel/abonelik">Aboneliğinizi uzatın</Link>.
                </>
              )}
            </Alert>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
