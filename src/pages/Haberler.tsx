import { Link, useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Seo from '../components/Seo';
import { NEWS } from '../data/content';
import { formatDateLong } from '../lib/format';
import NotFound from './NotFound';

export function HaberDetay() {
  const { slug } = useParams();
  const item = NEWS.find((n) => n.slug === slug);
  if (!item) return <NotFound />;

  return (
    <>
      <Seo title={`${item.title} - Düğün Takip`} description={item.excerpt} path={`/haberler/${item.slug}`} />
      <PageHeader
        title={item.title}
        breadcrumbs={[{ label: 'Haberler', to: '/haberler' }, { label: item.title }]}
      />
      <article className="py-14">
        <div className="container-dt max-w-3xl">
          <p className="text-sm text-brand-muted">{formatDateLong(item.date)}</p>
          {item.body.map((p, i) => (
            <p key={i} className="mt-4 leading-relaxed">
              {p}
            </p>
          ))}
          <p className="mt-8">
            <Link to="/haberler">← Tüm haberler</Link>
          </p>
        </div>
      </article>
    </>
  );
}

export default function Haberler() {
  return (
    <>
      <Seo
        title="Düğün Takip - Düğün Salonu Takip Programı - Haberler"
        description="Düğün Takip sisteminden haberler, yenilikler ve duyurular."
        path="/haberler"
      />
      <PageHeader title="Haberler" breadcrumbs={[{ label: 'Haberler' }]} />
      <section className="py-14">
        <div className="container-dt grid gap-6 md:grid-cols-2">
          {NEWS.map((n) => (
            <article key={n.slug} className="card flex flex-col p-6">
              <p className="text-xs uppercase tracking-wide text-accent">{formatDateLong(n.date)}</p>
              <h2 className="mt-2 font-heading text-xl font-bold text-brand">
                <Link to={`/haberler/${n.slug}`} className="text-brand hover:text-accent">
                  {n.title}
                </Link>
              </h2>
              <p className="mt-3 flex-1 leading-relaxed">{n.excerpt}</p>
              <Link to={`/haberler/${n.slug}`} className="mt-4 self-start text-sm font-medium">
                Devamını oku →
              </Link>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
