import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { IconChevronDown, IconClose, IconMenu } from './Icons';
import { useAuth } from '../context/AuthContext';

interface NavItem {
  label: string;
  to?: string;
  children?: { label: string; to: string }[];
}

const NAV: NavItem[] = [
  { label: 'Anasayfa', to: '/' },
  { label: 'Nedir', to: '/nedir' },
  { label: 'Haberler', to: '/haberler' },
  { label: 'Ekranlar', to: '/ekranlar' },
  { label: 'Referanslarımız', to: '/uyeler' },
  { label: 'İletişim', to: '/iletisim' },
  {
    label: 'İçerik',
    children: [
      { label: 'Yorumlar', to: '/dusunceler' },
      { label: 'Sık Sorulan Sorular', to: '/sss' },
      { label: 'Üyelerimizin Düşünceleri', to: '/dusunceler' },
      { label: 'Düğün Salonları', to: '/dugun-salonlari' },
      { label: 'Salon Yönetim Sistemi', to: '/' },
      { label: 'Takvim Programı', to: '/' },
      { label: 'Kod Doğrulama', to: '/kod-dogrulama' },
    ],
  },
];

export default function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const { user } = useAuth();
  const location = useLocation();
  const dropdownRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setOpenDropdown(null);
  }, [location.pathname]);

  useEffect(() => {
    if (!openDropdown) return undefined;
    const onClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpenDropdown(null);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [openDropdown]);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `block whitespace-nowrap px-3 py-2 text-[15px] font-medium transition-colors ${
      isActive ? 'text-accent' : 'text-white hover:text-accent'
    }`;

  return (
    <header
      id="header"
      className={`fixed inset-x-0 top-0 z-50 transition-all ${
        scrolled ? 'bg-brand/95 py-2 shadow-lg backdrop-blur' : 'bg-brand py-4'
      }`}
    >
      <div className="container-dt flex items-center justify-between gap-4">
        <Link to="/" className="font-display text-2xl font-bold text-white hover:text-white">
          Düğün<span className="text-accent">Takip</span>
        </Link>

        <nav aria-label="Ana menü" className="hidden lg:block">
          <ul className="flex items-center">
            {NAV.map((item) =>
              item.children ? (
                <li key={item.label} className="relative" ref={dropdownRef}>
                  <button
                    type="button"
                    className="flex items-center gap-1 px-3 py-2 text-[15px] font-medium text-white transition-colors hover:text-accent"
                    aria-expanded={openDropdown === item.label}
                    aria-haspopup="true"
                    onClick={() => setOpenDropdown((v) => (v === item.label ? null : item.label))}
                  >
                    {item.label}
                    <IconChevronDown size={16} />
                  </button>
                  {openDropdown === item.label && (
                    <ul className="absolute left-0 top-full z-50 mt-2 min-w-[240px] rounded-md bg-white py-2 shadow-xl">
                      {item.children.map((child, i) => (
                        <li key={`${child.to}-${i}`}>
                          <Link
                            to={child.to}
                            className="block px-4 py-2 text-sm text-brand hover:bg-surface hover:text-accent"
                          >
                            {child.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ) : (
                <li key={item.to}>
                  <NavLink to={item.to!} className={linkClass} end={item.to === '/'}>
                    {item.label}
                  </NavLink>
                </li>
              ),
            )}
          </ul>
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          {user ? (
            <Link to="/panel" className="btn-primary btn-sm !px-5 !py-2 text-white hover:text-white">
              Panelim
            </Link>
          ) : (
            <>
              <Link to="/uye-ol" className="btn-primary btn-sm !px-5 !py-2 text-white hover:text-white">
                Üye Ol
              </Link>
              <Link
                to="/uye-girisi"
                className="btn-sm rounded-full border border-white/40 px-5 py-2 text-sm font-medium text-white transition hover:border-accent hover:text-accent"
              >
                Üye Girişi
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          className="text-white lg:hidden"
          aria-label={mobileOpen ? 'Menüyü kapat' : 'Menüyü aç'}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? <IconClose size={28} /> : <IconMenu size={28} />}
        </button>
      </div>

      {mobileOpen && (
        <nav aria-label="Mobil menü" className="lg:hidden">
          <ul className="container-dt mt-3 max-h-[75vh] space-y-1 overflow-y-auto rounded-md bg-white py-3">
            {NAV.map((item) =>
              item.children ? (
                <li key={item.label}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-4 py-2 text-left text-brand"
                    aria-expanded={openDropdown === item.label}
                    onClick={() => setOpenDropdown((v) => (v === item.label ? null : item.label))}
                  >
                    {item.label}
                    <IconChevronDown size={16} />
                  </button>
                  {openDropdown === item.label && (
                    <ul className="bg-surface py-1">
                      {item.children.map((child, i) => (
                        <li key={`${child.to}-m${i}`}>
                          <Link to={child.to} className="block px-8 py-2 text-sm text-brand">
                            {child.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ) : (
                <li key={item.to}>
                  <Link to={item.to!} className="block px-4 py-2 text-brand">
                    {item.label}
                  </Link>
                </li>
              ),
            )}
            <li className="flex gap-2 px-4 pt-2">
              {user ? (
                <Link to="/panel" className="btn-primary btn-sm flex-1 text-white hover:text-white">
                  Panelim
                </Link>
              ) : (
                <>
                  <Link to="/uye-ol" className="btn-primary btn-sm flex-1 text-white hover:text-white">
                    Üye Ol
                  </Link>
                  <Link to="/uye-girisi" className="btn-outline btn-sm flex-1">
                    Üye Girişi
                  </Link>
                </>
              )}
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
