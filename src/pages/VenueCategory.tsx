import { useLocation } from 'react-router-dom';
import { VENUE_PAGES } from '../data/directory';
import Uyeler from './Uyeler';
import NotFound from './NotFound';

/** /dugun-salonlari, /kina-salonlari, /dugun-otelleri, /kir-dugunu-mekanlari */
export default function VenueCategory() {
  // Rotalar sabit yollarla tanımlı; slug bilgisi adresin kendisinden okunur.
  const slug = useLocation().pathname.replace(/^\/+|\/+$/g, '');
  const page = VENUE_PAGES.find((p) => p.slug === slug);
  if (!page) return <NotFound />;

  return (
    <Uyeler
      key={page.slug}
      restrictCategories={page.categories}
      title={page.heading}
      intro={page.intro}
      path={`/${page.slug}`}
      breadcrumbLabel={page.title}
    />
  );
}
