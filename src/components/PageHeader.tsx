import { Link } from 'react-router-dom';
import { IconChevronRight } from './Icons';

interface Props {
  title: string;
  breadcrumbs?: { label: string; to?: string }[];
  description?: string;
}

/** İç sayfalarda kullanılan başlık bandı (orijinal sitedeki breadcrumbs bölümü) */
export default function PageHeader({ title, breadcrumbs = [], description }: Props) {
  return (
    <section className="bg-surface pb-8 pt-28 md:pt-32">
      <div className="container-dt">
        <nav aria-label="Sayfa yolu" className="mb-2">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-brand-muted">
            <li>
              <Link to="/" className="text-brand-muted hover:text-accent">
                Anasayfa
              </Link>
            </li>
            {breadcrumbs.map((b) => (
              <li key={b.label} className="flex items-center gap-1">
                <IconChevronRight size={14} />
                {b.to ? (
                  <Link to={b.to} className="text-brand-muted hover:text-accent">
                    {b.label}
                  </Link>
                ) : (
                  <span>{b.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <h1 className="font-heading text-2xl font-bold text-brand md:text-3xl">{title}</h1>
        {description && <p className="mt-2 max-w-3xl leading-relaxed">{description}</p>}
      </div>
    </section>
  );
}
