import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import PublicLayout from './layouts/PublicLayout';
import AppLayout from './layouts/AppLayout';
import RequireAuth from './components/RequireAuth';

import Anket from './pages/Anket';
import KodDogrulama from './pages/KodDogrulama';
import LegalPage from './pages/LegalPage';
import UyeGirisi from './pages/UyeGirisi';
import NotFound from './pages/NotFound';

const Dashboard = lazy(() => import('./pages/app/Dashboard'));
const Takvim = lazy(() => import('./pages/app/Takvim'));
const Rezervasyonlar = lazy(() => import('./pages/app/Rezervasyonlar'));
const RezervasyonForm = lazy(() => import('./pages/app/RezervasyonForm'));
const RezervasyonDetay = lazy(() => import('./pages/app/RezervasyonDetay'));
const Sozlesme = lazy(() => import('./pages/app/Sozlesme'));
const Kasa = lazy(() => import('./pages/app/Kasa'));
const Salonlar = lazy(() => import('./pages/app/Salonlar'));
const Menuler = lazy(() => import('./pages/app/Menuler'));
const Hatirlatmalar = lazy(() => import('./pages/app/Hatirlatmalar'));
const OdemeBildirimleri = lazy(() => import('./pages/app/OdemeBildirimleri'));
const UrunHizmet = lazy(() => import('./pages/app/UrunHizmet'));
const Makbuz = lazy(() => import('./pages/app/Makbuz'));
const Raporlar = lazy(() => import('./pages/app/Raporlar'));
const RenkAyarlari = lazy(() => import('./pages/app/RenkAyarlari'));
const Musteriler = lazy(() => import('./pages/app/Musteriler'));
const Isletmeler = lazy(() => import('./pages/app/Isletmeler'));
const Kullanicilar = lazy(() => import('./pages/app/Kullanicilar'));
const SmsKayitlari = lazy(() => import('./pages/app/SmsKayitlari'));
const MusteriAdaylari = lazy(() => import('./pages/app/MusteriAdaylari'));
const MusteriAdayiDetay = lazy(() => import('./pages/app/MusteriAdayiDetay'));
const MusteriAdayiYeni = lazy(() => import('./pages/app/MusteriAdayiYeni'));
const WhatsappAyarlari = lazy(() => import('./pages/app/WhatsappAyarlari'));
const AdayDurumlari = lazy(() => import('./pages/app/AdayDurumlari'));
const Ayarlar = lazy(() => import('./pages/app/Ayarlar'));
const DenetimKaydi = lazy(() => import('./pages/app/DenetimKaydi'));
const IzinYonetimi = lazy(() => import('./pages/app/IzinYonetimi'));
const SistemDurumu = lazy(() => import('./pages/app/SistemDurumu'));
const Faturalar = lazy(() => import('./pages/app/Faturalar'));
const OzelGunler = lazy(() => import('./pages/app/OzelGunler'));
const FaturaDetay = lazy(() => import('./pages/app/FaturaDetay'));

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
            {/* Sistem bir tanıtım sitesi değil, işletmenin kendi paneli.
                Açılış doğrudan giriş ekranı. */}
            <Route index element={<UyeGirisi />} />
            <Route path="uye-girisi" element={<Navigate to="/" replace />} />

            {/* Müşteriye gönderilen SMS'teki sorgu kodu buraya geliyor. */}
            <Route path="kod-dogrulama" element={<KodDogrulama />} />

            {/*
              Deneyim anketi (madde 31). Bağlantı e-postayla gidiyor ve
              jetonu adres satırında taşıyor; müşterinin sisteme girişi
              yok, bu yüzden yol herkese açık bölümde.
            */}
            <Route path="anket" element={<Anket />} />

            <Route path="gizlilik-politikasi" element={<LegalPage />} />
            <Route path="kvkk-aydinlatma-metni" element={<LegalPage />} />

            <Route path="*" element={<NotFound />} />
          </Route>

          {/* Panel ekranları yalnızca giriş yapan kullanıcılar için yüklenir; ana paket küçük kalır. */}
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
            <Route path="ozel-gunler" element={<OzelGunler />} />
            <Route path="rezervasyonlar" element={<Rezervasyonlar />} />
            <Route path="rezervasyonlar/yeni" element={<RezervasyonForm />} />
            <Route path="rezervasyonlar/:id" element={<RezervasyonDetay />} />
            <Route path="rezervasyonlar/:id/duzenle" element={<RezervasyonForm />} />
            <Route path="rezervasyonlar/:id/sozlesme" element={<Sozlesme />} />
            <Route path="rezervasyonlar/:id/makbuz" element={<Makbuz />} />
            <Route path="kasa" element={<Kasa />} />
            <Route path="faturalar" element={<Faturalar />} />
            <Route path="faturalar/:id" element={<FaturaDetay />} />
            <Route path="raporlar" element={<Raporlar />} />
            <Route path="renk-ayarlari" element={<RenkAyarlari />} />
            <Route path="musteriler" element={<Musteriler />} />
            <Route path="isletmeler" element={<Isletmeler />} />
            <Route path="kullanicilar" element={<Kullanicilar />} />
            <Route path="salonlar" element={<Salonlar />} />
            <Route path="menuler" element={<Menuler />} />
            <Route path="hatirlatmalar" element={<Hatirlatmalar />} />
            <Route path="odeme-bildirimleri" element={<OdemeBildirimleri />} />
            <Route path="urun-hizmet" element={<UrunHizmet />} />
            {/* Eski adres: kayıtlı bağlantılar ve yer imleri kırılmasın. */}
            <Route path="tedarikciler" element={<Navigate to="/panel/urun-hizmet" replace />} />
            <Route path="sms" element={<SmsKayitlari />} />
            <Route path="musteri-adaylari" element={<MusteriAdaylari />} />
            <Route path="musteri-adaylari/yeni" element={<MusteriAdayiYeni />} />
            <Route path="whatsapp-ayarlari" element={<WhatsappAyarlari />} />
            <Route path="musteri-adaylari/durumlar" element={<AdayDurumlari />} />
            <Route path="musteri-adaylari/:id" element={<MusteriAdayiDetay />} />
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
