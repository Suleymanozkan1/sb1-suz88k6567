import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Seo from '../components/Seo';
import ScreenMockup from '../components/ScreenMockup';
import { SCREENS } from '../data/content';

export default function Ekranlar() {
  return (
    <>
      <Seo
        title="Ekranlar - Düğün Takip Salon Takip Programı"
        description="Düğün Takip programının rezervasyon takvimi, raporlar, renk ayarları ve gelir gider ekranları."
        path="/ekranlar"
      />
      <PageHeader
        title="Ekranlar"
        breadcrumbs={[{ label: 'Ekranlar' }]}
        description="Düğün Takip programının başlıca ekranları. Tüm ekranlara 7 gün ücretsiz deneme ile hemen erişebilirsiniz."
      />

      <section className="py-14">
        <div className="container-dt grid gap-8 md:grid-cols-2">
          {SCREENS.map((s) => (
            <figure key={s.title}>
              <ScreenMockup kind={s.kind} />
              <figcaption className="mt-3">
                <h2 className="font-heading text-lg font-bold text-brand">{s.title}</h2>
                <p className="mt-1 text-sm leading-relaxed">{s.description}</p>
              </figcaption>
            </figure>
          ))}
        </div>
        <div className="container-dt mt-12 text-center">
          <Link to="/uye-ol" className="btn-primary !px-8 !py-3 text-white hover:text-white">
            7 gün ücretsiz deneyin
          </Link>
        </div>
      </section>
    </>
  );
}
