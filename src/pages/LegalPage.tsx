import { useLocation } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Seo from '../components/Seo';
import { LEGAL_DOCS } from '../data/legal';
import NotFound from './NotFound';

export default function LegalPage() {
  // Rotalar sabit yollarla tanımlı; slug bilgisi adresin kendisinden okunur.
  const slug = useLocation().pathname.replace(/^\/+|\/+$/g, '');
  const doc = LEGAL_DOCS.find((d) => d.slug === slug);
  if (!doc) return <NotFound />;

  return (
    <>
      <Seo
        title={`${doc.title} - Düğün Takip`}
        description={`Düğün Takip ${doc.title.toLocaleLowerCase('tr-TR')} metni.`}
        path={`/${doc.slug}`}
      />
      <PageHeader title={doc.title} breadcrumbs={[{ label: doc.title }]} />
      <article className="py-12">
        <div className="container-dt max-w-3xl">
          {doc.sections.map((section, i) => (
            <section key={i} className="mb-8">
              {section.heading && (
                <h2 className="mb-3 font-heading text-lg font-bold text-brand">{section.heading}</h2>
              )}
              {section.paragraphs.map((paragraph, j) => (
                <p key={j} className="mb-3 leading-relaxed">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>
      </article>
    </>
  );
}
