import { useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import Seo from '../components/Seo';
import { DIRECTORY, TOTAL_MEMBER_COUNT } from '../data/directory';
import { formatNumber, normalizeTr } from '../lib/format';
import { IconLocation, IconSearch, IconUsers } from '../components/Icons';
import type { DirectoryMember } from '../types';

const PAGE_SIZE = 12;

interface Props {
  /** Salon kategorisi sayfalarında listeyi önceden daraltmak için */
  restrictCategories?: string[];
  title?: string;
  intro?: string;
  path?: string;
  breadcrumbLabel?: string;
}

export default function Uyeler({ restrictCategories, title, intro, path, breadcrumbLabel }: Props) {
  const pool = useMemo(
    () => (restrictCategories ? DIRECTORY.filter((m) => restrictCategories.includes(m.category)) : DIRECTORY),
    [restrictCategories],
  );

  const [category, setCategory] = useState('');
  const [city, setCity] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const categories = useMemo(() => [...new Set(pool.map((m) => m.category))].sort((a, b) => a.localeCompare(b, 'tr')), [pool]);
  const cities = useMemo(() => [...new Set(pool.map((m) => m.city))].sort((a, b) => a.localeCompare(b, 'tr')), [pool]);

  const filtered = useMemo(() => {
    const q = normalizeTr(query);
    return pool.filter((m) => {
      if (category && m.category !== category) return false;
      if (city && m.city !== city) return false;
      if (q && !normalizeTr(`${m.name} ${m.district} ${m.city}`).includes(q)) return false;
      return true;
    });
  }, [pool, category, city, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const heading = title ?? 'Referanslarımız / Üyeler / İşletmeler';

  const resetPage = <T,>(setter: (v: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  return (
    <>
      <Seo
        title={`${heading} - Düğün Takip`}
        description={intro ?? 'Düğün Takip sistemini kullanan düğün salonları, organizasyon firmaları, oteller ve daha fazlası.'}
        path={path ?? '/uyeler'}
      />
      <PageHeader
        title={heading}
        breadcrumbs={[{ label: breadcrumbLabel ?? 'Referanslarımız' }]}
        description={intro}
      />

      <section className="py-10">
        <div className="container-dt">
          <p className="mb-6 text-sm text-brand-muted">
            İşletme sayı : <strong className="text-brand">{formatNumber(TOTAL_MEMBER_COUNT)}</strong>
            {' · '}Listelenen: <strong className="text-brand">{formatNumber(filtered.length)}</strong>
          </p>

          <form className="mb-8 grid gap-3 md:grid-cols-3" onSubmit={(e) => e.preventDefault()} role="search">
            <div>
              <label htmlFor="dir-category" className="field-label">Kategori</label>
              <select
                id="dir-category"
                className="field-input"
                value={category}
                onChange={(e) => resetPage(setCategory)(e.target.value)}
              >
                <option value="">---Tüm Kategoriler---</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="dir-city" className="field-label">İl</label>
              <select id="dir-city" className="field-input" value={city} onChange={(e) => resetPage(setCity)(e.target.value)}>
                <option value="">---Tüm İller---</option>
                {cities.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="dir-query" className="field-label">Arama</label>
              <div className="relative">
                <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
                <input
                  id="dir-query"
                  type="search"
                  className="field-input pl-9"
                  placeholder="İşletme adı veya ilçe"
                  value={query}
                  onChange={(e) => resetPage(setQuery)(e.target.value)}
                />
              </div>
            </div>
          </form>

          {visible.length === 0 ? (
            <p className="card p-8 text-center">Aradığınız kriterlere uygun işletme bulunamadı.</p>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {visible.map((m) => (
                <li key={m.id}>
                  <MemberCard member={m} />
                </li>
              ))}
            </ul>
          )}

          {pageCount > 1 && (
            <nav aria-label="Sayfalama" className="mt-10 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                className="btn-sm rounded border border-line px-3 py-1.5 text-brand disabled:opacity-40"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Önceki
              </button>
              {buildPageList(currentPage, pageCount).map((p, i) =>
                p === '…' ? (
                  <span key={`gap-${i}`} className="px-2 text-brand-muted">…</span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p as number)}
                    aria-current={p === currentPage ? 'page' : undefined}
                    className={`btn-sm rounded border px-3 py-1.5 ${
                      p === currentPage ? 'border-accent bg-accent text-white' : 'border-line text-brand'
                    }`}
                  >
                    {p}
                  </button>
                ),
              )}
              <button
                type="button"
                className="btn-sm rounded border border-line px-3 py-1.5 text-brand disabled:opacity-40"
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={currentPage === pageCount}
              >
                Sonraki
              </button>
            </nav>
          )}
        </div>
      </section>
    </>
  );
}

function MemberCard({ member }: { member: DirectoryMember }) {
  return (
    <article className="card flex h-full flex-col p-5">
      <h2 className="font-heading text-base font-bold text-brand">{member.name}</h2>
      <p className="mt-1 flex items-center gap-1.5 text-sm text-brand-muted">
        <IconLocation size={15} className="text-accent" />
        {member.district} / {member.city}
      </p>
      {member.capacity !== undefined && (
        <p className="mt-1 flex items-center gap-1.5 text-sm text-brand-muted">
          <IconUsers size={15} className="text-accent" />
          Salon kapasitesi : {member.capacity}
        </p>
      )}
      <p className="mt-3 flex-1 text-sm leading-relaxed">{member.about}</p>
      <span className="mt-4 inline-block self-start rounded-full bg-surface px-3 py-1 text-xs text-brand-muted">
        {member.category}
      </span>
    </article>
  );
}

function buildPageList(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '…')[] = [1];
  if (current > 3) pages.push('…');
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p += 1) pages.push(p);
  if (current < total - 2) pages.push('…');
  pages.push(total);
  return pages;
}
