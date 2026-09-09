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

      {/* Dokunma hedefleri 24 piksele çıkınca on sayfa noktası 375 piksellik
          ekrana sığmadı ve okları dışarı itti; bu yüzden satır sarabiliyor. */}
      {pages > 1 && (
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 px-4">
          <button type="button" onClick={prev} aria-label="Önceki yorumlar" className="rounded-full border border-line p-2 text-brand hover:border-accent-ink hover:text-accent-ink">
            <IconChevronLeft size={18} />
          </button>
          <div className="flex max-w-full flex-wrap justify-center gap-1">
            {Array.from({ length: pages }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`${i + 1}. sayfa`}
                aria-current={i === index}
                // Görünen nokta küçük kalır ama dokunma hedefi 24×24 CSS
                // pikseldir; WCAG 2.2'nin 2.5.8 ölçütü bunu istiyor.
                className="flex h-6 min-w-[24px] items-center justify-center"
              >
                <span
                  aria-hidden="true"
                  className={`block h-2.5 rounded-full transition-all ${
                    i === index ? 'w-6 bg-accent-ink' : 'w-2.5 bg-brand-muted'
                  }`}
                />
              </button>
            ))}
          </div>
          <button type="button" onClick={next} aria-label="Sonraki yorumlar" className="rounded-full border border-line p-2 text-brand hover:border-accent-ink hover:text-accent-ink">
            <IconChevronRight size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
