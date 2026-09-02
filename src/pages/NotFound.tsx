import { Link } from 'react-router-dom';
import Seo from '../components/Seo';

export default function NotFound() {
  return (
    <>
      <Seo title="Sayfa bulunamadı - Düğün Takip" noindex />
      <section className="flex min-h-[70vh] items-center py-24">
        <div className="container-dt text-center">
          <p className="font-display text-7xl font-bold text-accent">404</p>
          <h1 className="mt-4 font-heading text-2xl font-bold text-brand">Aradığınız sayfa bulunamadı</h1>
          <p className="mt-2">Adresi kontrol edip tekrar deneyebilir ya da anasayfaya dönebilirsiniz.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/" className="btn-primary text-white hover:text-white">Anasayfa</Link>
            <Link to="/iletisim" className="btn-outline">İletişim</Link>
          </div>
        </div>
      </section>
    </>
  );
}
