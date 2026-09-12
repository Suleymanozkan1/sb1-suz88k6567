import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBusinesses } from '../lib/queries';
import DemoNotice from '../components/DemoNotice';
import HataBildir from '../components/HataBildir';
import EkranKilidi from '../components/EkranKilidi';
import {
  IconAlert, IconBell, IconBuilding, IconCalendar, IconChart, IconCheck, IconClose, IconGrid, IconList, IconLogout, IconMenu, IconMessage, IconPalette, IconPlus, IconReport, IconSettings, IconShield, IconUser, IconUsers, IconWallet,
} from '../components/Icons';

const NAV = [
  { to: '/panel', label: 'Özet', icon: IconGrid, end: true },
  { to: '/panel/takvim', label: 'Rezervasyon Takvimi', icon: IconCalendar },
  { to: '/panel/rezervasyonlar', label: 'Rezervasyonlar', icon: IconList },
  { to: '/panel/musteriler', label: 'Müşteriler', icon: IconUsers },
  { to: '/panel/kasa', label: 'Gelir / Gider', icon: IconWallet },
  { to: '/panel/faturalar', label: 'Faturalar', icon: IconReport },
  { to: '/panel/raporlar', label: 'Raporlar', icon: IconChart },
  { to: '/panel/salonlar', label: 'Salonlar', icon: IconBuilding },
  { to: '/panel/menuler', label: 'Menüler', icon: IconList },
  { to: '/panel/urun-hizmet', label: 'Ürün ve Hizmet', icon: IconUsers },
  { to: '/panel/renk-ayarlari', label: 'Renk Ayarları', icon: IconPalette },
  { to: '/panel/isletmeler', label: 'Firmalarım', icon: IconBuilding },
  { to: '/panel/kullanicilar', label: 'Kullanıcılar', icon: IconUser, ownerOnly: true },
  { to: '/panel/hatirlatmalar', label: 'Hatırlatmalar', icon: IconBell },
  { to: '/panel/odeme-bildirimleri', label: 'Ödeme Bildirimleri', icon: IconBell },
  { to: '/panel/musteri-adaylari', label: 'Müşteri Adayları', icon: IconMessage },
  { to: '/panel/sms', label: 'SMS Kayıtları', icon: IconMessage },
  { to: '/panel/izinler', label: 'İYS İzinleri', icon: IconCheck },
  { to: '/panel/denetim', label: 'Denetim Kaydı', icon: IconShield },
  { to: '/panel/sistem', label: 'Sistem Durumu', icon: IconAlert },
  { to: '/panel/ayarlar', label: 'Ayarlar', icon: IconSettings },
];

export default function AppLayout() {
  const { user, signOut, setActiveBusiness, can } = useAuth();
  const { data: businesses = [] } = useBusinesses();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  if (!user) return null;

  const active = businesses.find((b) => b.id === user.activeBusinessId) ?? businesses[0];
  // Yalnızca yöneticiye açık ekranlar personelde bağlantı olarak gösterilmez.
  const visibleNav = NAV.filter((item) => !item.ownerOnly || user.role === 'owner');

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition ${
      isActive ? 'bg-accent-ink text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'
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
            Sahra<span className="text-accent-light">Takip</span>
          </Link>
          <button type="button" className="text-white lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Menüyü kapat">
            <IconClose size={22} />
          </button>
        </div>

        {/*
          Aktif işletme bölümü tek işletmede de görünür. Önceden yalnızca
          birden çok işletmesi olana açılıyordu; yeni işletmeyi buradan
          eklemek isteyen kullanıcı hiçbir giriş noktası bulamıyordu.
        */}
        {active && (
          <div className="mb-4">
            <label htmlFor="active-business" className="mb-1 block text-xs text-white/75">
              Aktif işletme
            </label>
            {businesses.length > 1 ? (
              <select
                id="active-business"
                className="w-full rounded-md border border-white/20 bg-brand-dark px-2 py-2 text-sm text-white"
                value={active.id}
                onChange={(e) => { void setActiveBusiness(e.target.value); }}
              >
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            ) : (
              <p
                id="active-business"
                className="rounded-md border border-white/20 bg-brand-dark px-2 py-2 text-sm text-white"
              >
                {active.name}
              </p>
            )}
            {can('ayarlar.duzenle') && (
              <Link
                to="/panel/isletmeler?yeni=1"
                className="mt-1.5 inline-flex items-center gap-1 text-xs text-white/75 hover:text-white"
              >
                <IconPlus size={14} /> Yeni işletme ekle
              </Link>
            )}
          </div>
        )}

        <nav>
          <ul className="space-y-1">
            {visibleNav.map((item) => (
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
          onClick={() => { void signOut(); }}
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
        </header>

        <main className="min-w-0 flex-1 p-4 md:p-6">
          <DemoNotice className="mb-5" />
          <Outlet />
        </main>

        {/*
          Hata bildirimi ve ekran kilidi panelin tamamında: tek bir ekrana
          konsaydı hatanın çıktığı sayfadan çıkmak gerekirdi.
        */}
        <HataBildir />
        <EkranKilidi />
      </div>
    </div>
  );
}
