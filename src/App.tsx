import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import PublicLayout from './layouts/PublicLayout';
import AppLayout from './layouts/AppLayout';
import RequireAuth from './components/RequireAuth';

import Home from './pages/Home';
import Nedir from './pages/Nedir';
import Haberler, { HaberDetay } from './pages/Haberler';
import Ekranlar from './pages/Ekranlar';
import Uyeler from './pages/Uyeler';
import VenueCategory from './pages/VenueCategory';
import SalonDetay from './pages/SalonDetay';
import Iletisim from './pages/Iletisim';
import Dusunceler from './pages/Dusunceler';
import Sss from './pages/Sss';
import KodDogrulama from './pages/KodDogrulama';
import LegalPage from './pages/LegalPage';
import UyeOl from './pages/UyeOl';
import UyeGirisi from './pages/UyeGirisi';
import NotFound from './pages/NotFound';

const Dashboard = lazy(() => import('./pages/app/Dashboard'));
const Takvim = lazy(() => import('./pages/app/Takvim'));
const Rezervasyonlar = lazy(() => import('./pages/app/Rezervasyonlar'));
const RezervasyonForm = lazy(() => import('./pages/app/RezervasyonForm'));
const RezervasyonDetay = lazy(() => import('./pages/app/RezervasyonDetay'));
const Sozlesme = lazy(() => import('./pages/app/Sozlesme'));
const Kasa = lazy(() => import('./pages/app/Kasa'));
const Talepler = lazy(() => import('./pages/app/Talepler'));
const Salonlar = lazy(() => import('./pages/app/Salonlar'));
const Menuler = lazy(() => import('./pages/app/Menuler'));
const Makbuz = lazy(() => import('./pages/app/Makbuz'));
const Raporlar = lazy(() => import('./pages/app/Raporlar'));
const RenkAyarlari = lazy(() => import('./pages/app/RenkAyarlari'));
const Musteriler = lazy(() => import('./pages/app/Musteriler'));
const Isletmeler = lazy(() => import('./pages/app/Isletmeler'));
const Kullanicilar = lazy(() => import('./pages/app/Kullanicilar'));
const SmsKayitlari = lazy(() => import('./pages/app/SmsKayitlari'));
const Ayarlar = lazy(() => import('./pages/app/Ayarlar'));
const DenetimKaydi = lazy(() => import('./pages/app/DenetimKaydi'));
const IzinYonetimi = lazy(() => import('./pages/app/IzinYonetimi'));
const SistemDurumu = lazy(() => import('./pages/app/SistemDurumu'));
const Faturalar = lazy(() => import('./pages/app/Faturalar'));

function PanelLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface" role="status" aria-live="polite">
      <span className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-accent" />
      <span className="sr-only">Yükleniyor</span>
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<Home />} />
            <Route path="nedir" element={<Nedir />} />
            <Route path="haberler" element={<Haberler />} />
            <Route path="haberler/:slug" element={<HaberDetay />} />
            <Route path="ekranlar" element={<Ekranlar />} />
            <Route path="uyeler" element={<Uyeler />} />
            <Route path="dusunceler" element={<Dusunceler />} />
            <Route path="sss" element={<Sss />} />
            <Route path="iletisim" element={<Iletisim />} />
            <Route path="demo-talebi" element={<Iletisim variant="demo" />} />
            <Route path="kod-dogrulama" element={<KodDogrulama />} />
            <Route path="uye-ol" element={<UyeOl />} />
            <Route path="uye-girisi" element={<UyeGirisi />} />

            <Route path="dugun-salonlari" element={<VenueCategory />} />
            <Route path="kina-salonlari" element={<VenueCategory />} />
            <Route path="dugun-otelleri" element={<VenueCategory />} />
            <Route path="kir-dugunu-mekanlari" element={<VenueCategory />} />
            <Route path="salon/:slug" element={<SalonDetay />} />

            <Route path="gizlilik-politikasi" element={<LegalPage />} />
            <Route path="iade-proseduru" element={<LegalPage />} />
            <Route path="mesafeli-hizmet-sozlesmesi" element={<LegalPage />} />
            <Route path="uyelik-sozlesmesi" element={<LegalPage />} />

            <Route path="*" element={<NotFound />} />
          </Route>

          {/* Panel ekranları yalnızca giriş yapan üyeler için yüklenir; ana paket küçük kalır. */}
          <Route
            path="panel"
            element={
              <RequireAuth>
                <Suspense fallback={<PanelLoading />}>
                  <AppLayout />
                </Suspense>
              </RequireAuth>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="takvim" element={<Takvim />} />
            <Route path="rezervasyonlar" element={<Rezervasyonlar />} />
            <Route path="rezervasyonlar/yeni" element={<RezervasyonForm />} />
            <Route path="rezervasyonlar/:id" element={<RezervasyonDetay />} />
            <Route path="rezervasyonlar/:id/duzenle" element={<RezervasyonForm />} />
            <Route path="rezervasyonlar/:id/sozlesme" element={<Sozlesme />} />
            <Route path="rezervasyonlar/:id/makbuz" element={<Makbuz />} />
            <Route path="kasa" element={<Kasa />} />
            <Route path="faturalar" element={<Faturalar />} />
            <Route path="raporlar" element={<Raporlar />} />
            <Route path="renk-ayarlari" element={<RenkAyarlari />} />
            <Route path="musteriler" element={<Musteriler />} />
            <Route path="isletmeler" element={<Isletmeler />} />
            <Route path="kullanicilar" element={<Kullanicilar />} />
            <Route path="talepler" element={<Talepler />} />
            <Route path="salonlar" element={<Salonlar />} />
            <Route path="menuler" element={<Menuler />} />
            <Route path="sms" element={<SmsKayitlari />} />
            <Route path="izinler" element={<IzinYonetimi />} />
            <Route path="denetim" element={<DenetimKaydi />} />
            <Route path="sistem" element={<SistemDurumu />} />
            <Route path="ayarlar" element={<Ayarlar />} />
            <Route path="*" element={<Navigate to="/panel" replace />} />
          </Route>
        </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
