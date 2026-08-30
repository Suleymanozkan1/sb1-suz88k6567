import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Seo from '../components/Seo';
import Accordion from '../components/Accordion';
import { HOME_ACCORDION, WHY_US } from '../data/content';
import { SCREENS } from '../data/content';
import { IconCheck } from '../components/Icons';

const CAPABILITIES = [
  'Gündüz ve gece olmak üzere bütün yıl boyunca rezervasyon takibi',
  'Detaylı rezervasyon kaydı',
  'Salon kiralama sözleşmesi oluşturma',
  'Kaparo ve kalan alacak kaydı',
  'Düğün, Sünnet, Nişan, Kına, Konferans, Kokteyl vs. organizasyonları ayrı ayrı kaydetme',
  'İstenilen tarih aralığında rezervasyon ve alacak bakiyesi raporu alma',
  'İsim ve telefon no bazında detaylı kayıt arama',
];

export default function Nedir() {
  return (
    <>
      <Seo
        title="Düğün Takip Salon Takip Programı Nedir? - Düğün Takip"
        description="Düğün Takip Programı Düğün Salonları için özel olarak geliştirilmiş Rezervasyon ve Ödeme Takip sistemidir."
        path="/nedir"
      />
      <PageHeader title="Düğün Takip Salon Takip Programı Nedir?" breadcrumbs={[{ label: 'Nedir' }]} />

      <section className="py-14">
        <div className="container-dt grid gap-10 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <p className="text-lg leading-relaxed">
              Düğün Takip Programı Düğün Salonları için özel olarak geliştirilmiş{' '}
              <strong className="text-brand">Rezervasyon ve Ödeme Takip</strong> sistemidir.
            </p>
            <p className="mt-4 leading-relaxed">{WHY_US.description}</p>

            <h2 className="mt-10 font-heading text-xl font-bold text-brand">Neler yapabilirsiniz?</h2>
            <ul className="mt-4 space-y-3">
              {CAPABILITIES.map((c) => (
                <li key={c} className="flex items-start gap-3">
                  <IconCheck size={20} className="mt-0.5 shrink-0 text-accent" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>

            <h2 className="mt-10 font-heading text-xl font-bold text-brand">Program ekranları</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {SCREENS.slice(0, 6).map((s) => (
                <article key={s.title} className="card p-5">
                  <h3 className="font-heading font-semibold text-brand">{s.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed">{s.description}</p>
                </article>
              ))}
            </div>
            <p className="mt-4">
              <Link to="/ekranlar">Tüm ekran görüntülerini inceleyin →</Link>
            </p>

            <h2 className="mt-10 font-heading text-xl font-bold text-brand">Sık sorulan sorular</h2>
            <div className="mt-4">
              <Accordion items={HOME_ACCORDION} defaultOpen={null} />
            </div>
            <p className="mt-4">
              <Link to="/sss">Tüm sık sorulan sorular →</Link>
            </p>
          </div>

          <aside className="lg:col-span-1">
            <div className="sticky top-28 rounded-lg bg-brand p-6 text-white">
              <h2 className="font-heading text-xl font-bold text-white">Avantajlarımız</h2>
              <ul className="mt-4 space-y-3">
                {WHY_US.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-3">
                    <IconCheck size={18} className="mt-0.5 shrink-0 text-accent" />
                    <span className="text-sm">{b}</span>
                  </li>
                ))}
              </ul>
              <Link to="/uye-ol" className="btn-primary mt-6 w-full text-white hover:text-white">
                7 gün ücretsiz deneyin
              </Link>
              <Link to="/demo-talebi" className="btn mt-2 w-full border-2 border-white text-white hover:border-accent hover:bg-accent hover:text-white">
                Demo talebinde bulun
              </Link>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
