import { useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import Seo from '../components/Seo';
import { TESTIMONIALS } from '../data/content';
import { initials, normalizeTr } from '../lib/format';
import { IconSearch, IconStar } from '../components/Icons';

export default function Dusunceler() {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = normalizeTr(query);
    if (!q) return TESTIMONIALS;
    return TESTIMONIALS.filter((t) => normalizeTr(`${t.author} ${t.business} ${t.text}`).includes(q));
  }, [query]);

  return (
    <>
      <Seo
        title="Üyelerimizin Düşünceleri - Düğün Takip"
        description="Düğüntakip sistemini kullanan üyelerimizin düşünceleri ve yorumları."
        path="/dusunceler"
      />
      <PageHeader
        title="Üyelerimizin Düşünceleri"
        breadcrumbs={[{ label: 'Üyelerimizin Düşünceleri' }]}
        description="Düğüntakip sistemini kullanan üyelerimizin düşünceleri..."
      />

      <section className="py-12">
        <div className="container-dt">
          <div className="mb-8 max-w-md">
            <label htmlFor="tst-search" className="field-label">Yorumlarda ara</label>
            <div className="relative">
              <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
              <input
                id="tst-search"
                type="search"
                className="field-input pl-9"
                placeholder="İşletme veya kişi adı"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="card p-8 text-center">Aramanıza uygun yorum bulunamadı.</p>
          ) : (
            <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((t) => (
                <li key={`${t.business}-${t.author}`}>
                  <figure className="card flex h-full flex-col p-6">
                    <div className="mb-3 flex gap-0.5 text-accent" aria-label="5 üzerinden 5 puan">
                      {Array.from({ length: 5 }, (_, i) => (
                        <IconStar key={i} size={16} className="fill-current" />
                      ))}
                    </div>
                    <blockquote className="flex-1 text-sm leading-relaxed">{t.text}</blockquote>
                    <figcaption className="mt-5 flex items-center gap-3 border-t border-line pt-4">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand font-heading text-sm font-bold text-white">
                        {initials(t.author)}
                      </span>
                      <span>
                        <span className="block font-heading font-semibold text-brand">{t.author}</span>
                        <span className="block text-xs text-brand-muted">{t.business}</span>
                      </span>
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
