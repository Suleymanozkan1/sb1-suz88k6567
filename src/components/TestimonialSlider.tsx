import { useCallback, useEffect, useState } from 'react';
import type { Testimonial } from '../types';
import { IconChevronLeft, IconChevronRight } from './Icons';
import { initials } from '../lib/format';

/** Üye düşünceleri karuseli (orijinaldeki owl.carousel karşılığı) */
export default function TestimonialSlider({ items }: { items: Testimonial[] }) {
  const [index, setIndex] = useState(0);
  const [perView, setPerView] = useState(3);

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      setPerView(w < 640 ? 1 : w < 1024 ? 2 : 3);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const pages = Math.max(1, Math.ceil(items.length / perView));

  useEffect(() => {
    setIndex((i) => Math.min(i, pages - 1));
  }, [pages]);

  const next = useCallback(() => setIndex((i) => (i + 1) % pages), [pages]);
  const prev = useCallback(() => setIndex((i) => (i - 1 + pages) % pages), [pages]);

  useEffect(() => {
    const timer = window.setInterval(next, 7000);
    return () => window.clearInterval(timer);
  }, [next]);

  const visible = items.slice(index * perView, index * perView + perView);

  return (
    <div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((t) => (
          <figure key={`${t.business}-${t.author}`} className="card flex h-full flex-col p-6">
            <span className="mb-3 font-serif text-5xl leading-none text-accent/30" aria-hidden="true">
              &ldquo;
            </span>
            <blockquote className="flex-1 text-sm leading-relaxed text-ink">{t.text}</blockquote>
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
        ))}
      </div>

      {pages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-4">
          <button type="button" onClick={prev} aria-label="Önceki yorumlar" className="rounded-full border border-line p-2 text-brand hover:border-accent hover:text-accent">
            <IconChevronLeft size={18} />
          </button>
          <div className="flex gap-2">
            {Array.from({ length: pages }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`${i + 1}. sayfa`}
                aria-current={i === index}
                className={`h-2.5 rounded-full transition-all ${i === index ? 'w-6 bg-accent' : 'w-2.5 bg-line'}`}
              />
            ))}
          </div>
          <button type="button" onClick={next} aria-label="Sonraki yorumlar" className="rounded-full border border-line p-2 text-brand hover:border-accent hover:text-accent">
            <IconChevronRight size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
