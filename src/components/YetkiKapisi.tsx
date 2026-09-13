import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { yolunYetkisi } from '../lib/yetkiAlanlari';
import { ALL_PERMISSIONS } from '../types';

/**
 * Yetkisi olmayan ekranı kapatır.
 *
 * Ekranların kendi içindeki `can(...)` kontrolleri kaldırılmadı; bu kapı
 * onların ÜSTÜNE geliyor. Tek tek ekranlara güvenmek, yeni eklenen bir
 * ekranda kontrolü yazmayı unutmak demekti: burada yol tablosuna
 * yazılmayan ekran zaten menüde de çıkmıyor.
 */
export default function YetkiKapisi({ children }: { children: React.ReactNode }) {
  const { can } = useAuth();
  const { pathname } = useLocation();
  const gereken = yolunYetkisi(pathname);

  if (gereken && !can(gereken)) {
    const ad = ALL_PERMISSIONS.find((p) => p.key === gereken)?.label ?? gereken;
    return (
      <section className="card p-6">
        <h1 className="font-heading text-xl font-bold text-brand">Bu ekran size kapalı</h1>
        <p className="mt-2 text-sm text-brand-muted">
          Bu ekranı açmak için <strong className="text-brand">{ad.toLocaleLowerCase('tr')}</strong> yetkisi
          gerekiyor. Yetkiyi işletme sahibi Kullanıcılar ekranından verebilir.
        </p>
      </section>
    );
  }

  return <>{children}</>;
}
