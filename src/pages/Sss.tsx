import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Seo from '../components/Seo';
import Accordion from '../components/Accordion';
import { FAQ } from '../data/content';

export default function Sss() {
  return (
    <>
      <Seo
        title="Sık Sorulan Sorular - Düğün Takip"
        description="Düğün Takip salon takip programı hakkında sık sorulan sorular ve cevapları."
        path="/sss"
      />
      <PageHeader title="Sık Sorulan Sorular" breadcrumbs={[{ label: 'Sık Sorulan Sorular' }]} />

      <section className="py-12">
        <div className="container-dt max-w-4xl">
          <Accordion items={FAQ} defaultOpen={0} />
          <div className="mt-10 rounded-lg bg-surface p-6 text-center">
            <h2 className="font-heading text-lg font-bold text-brand">Sorunuzun cevabını bulamadınız mı?</h2>
            <p className="mt-2 text-sm">Bize yazın, en kısa sürede dönüş yapalım.</p>
            <Link to="/iletisim" className="btn-primary mt-4 text-white hover:text-white">
              İletişime geçin
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
