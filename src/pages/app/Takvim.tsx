import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Seo from '../../components/Seo';
import { useBusinessData } from '../../hooks/useBusinessData';
import { DAY_NAMES_SHORT, MONTH_NAMES } from '../../data/constants';
import { formatMoney, toIso, todayIso } from '../../lib/format';
import { remainingBalance } from '../../lib/db';
import { IconChevronLeft, IconChevronRight, IconPlus } from '../../components/Icons';
import type { Reservation } from '../../types';

export default function Takvim() {
  const { reservations, colors } = useBusinessData();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selected, setSelected] = useState<string | null>(null);

  const byDate = useMemo(() => {
    const map = new Map<string, Reservation[]>();
    reservations
      .filter((r) => r.status !== 'İptal')
      .forEach((r) => {
        const list = map.get(r.date) ?? [];
        list.push(r);
        map.set(r.date, list);
      });
    return map;
  }, [reservations]);

  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const today = todayIso();

  const monthReservations = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    return reservations
      .filter((r) => r.date.startsWith(prefix) && r.status !== 'İptal')
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [reservations, year, month]);

  function shift(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
    setSelected(null);
  }

  const selectedItems = selected ? byDate.get(selected) ?? [] : [];

  return (
    <>
      <Seo title="Rezervasyon Takvimi - Düğün Takip Panel" noindex />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold text-brand">Rezervasyon Takvimi</h1>
        <Link to="/panel/rezervasyonlar/yeni" className="btn-primary text-white hover:text-white">
          <IconPlus size={18} /> Yeni Rezervasyon
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-4 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <button type="button" onClick={() => shift(-1)} aria-label="Önceki ay" className="rounded border border-line p-2 text-brand hover:border-accent hover:text-accent">
              <IconChevronLeft size={18} />
            </button>
            <div className="text-center">
              <h2 className="font-heading text-lg font-bold text-brand">
                {MONTH_NAMES[month]} {year}
              </h2>
              <button
                type="button"
                className="text-xs text-accent"
                onClick={() => {
                  setYear(now.getFullYear());
                  setMonth(now.getMonth());
                }}
              >
                Bugüne dön
              </button>
            </div>
            <button type="button" onClick={() => shift(1)} aria-label="Sonraki ay" className="rounded border border-line p-2 text-brand hover:border-accent hover:text-accent">
              <IconChevronRight size={18} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-brand-muted">
            {DAY_NAMES_SHORT.map((d) => (
              <span key={d} className="py-1">{d}</span>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((cell, i) => {
              if (!cell) return <span key={`e${i}`} className="min-h-[74px] rounded bg-surface/50" />;
              const items = byDate.get(cell) ?? [];
              const isToday = cell === today;
              const isSelected = cell === selected;
              const day = Number(cell.slice(-2));
              return (
                <button
                  key={cell}
                  type="button"
                  onClick={() => setSelected(isSelected ? null : cell)}
                  aria-pressed={isSelected}
                  aria-label={`${day} ${MONTH_NAMES[month]} ${year}, ${items.length} rezervasyon`}
                  className={`min-h-[74px] rounded border p-1.5 text-left transition ${
                    isSelected ? 'border-accent bg-accent/5' : isToday ? 'border-accent/50 bg-white' : 'border-line bg-white hover:border-accent/50'
                  }`}
                >
                  <span className={`text-xs font-semibold ${isToday ? 'text-accent' : 'text-brand'}`}>{day}</span>
                  <span className="mt-1 block space-y-0.5">
                    {items.slice(0, 2).map((r) => {
                      const color = colors.find((c) => c.key === r.colorKey)?.color ?? '#47b2e4';
                      return (
                        <span
                          key={r.id}
                          className="block truncate rounded px-1 py-0.5 text-[9px] text-white"
                          style={{ background: color }}
                        >
                          {r.slot === 'Gündüz' ? '☀' : '☾'} {r.customerName}
                        </span>
                      );
                    })}
                    {items.length > 2 && (
                      <span className="block text-[9px] text-brand-muted">+{items.length - 2} daha</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-3 border-t border-line pt-4 text-xs">
            {colors.map((c) => (
              <span key={c.key} className="flex items-center gap-1.5 text-brand-muted">
                <span className="h-3 w-3 rounded" style={{ background: c.color }} />
                {c.label}
              </span>
            ))}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 font-heading text-lg font-bold text-brand">
            {selected ? `${Number(selected.slice(-2))} ${MONTH_NAMES[month]} kayıtları` : `${MONTH_NAMES[month]} ayı kayıtları`}
          </h2>
          {(selected ? selectedItems : monthReservations).length === 0 ? (
            <p className="py-6 text-center text-sm text-brand-muted">
              {selected ? 'Bu güne ait rezervasyon bulunmuyor.' : 'Bu ay için rezervasyon bulunmuyor.'}
            </p>
          ) : (
            <ul className="space-y-3">
              {(selected ? selectedItems : monthReservations).map((r) => {
                const color = colors.find((c) => c.key === r.colorKey)?.color ?? '#47b2e4';
                return (
                  <li key={r.id} className="rounded-md border border-line p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link to={`/panel/rezervasyonlar/${r.id}`} className="block truncate font-medium">
                          {r.customerName}
                        </Link>
                        <p className="mt-0.5 text-xs text-brand-muted">
                          {Number(r.date.slice(-2))} {MONTH_NAMES[Number(r.date.slice(5, 7)) - 1]} · {r.slot} · {r.guestCount} kişi
                        </p>
                      </div>
                      <span className="shrink-0 rounded px-2 py-0.5 text-[10px] text-white" style={{ background: color }}>
                        {r.organizationType}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-brand-muted">
                      Kalan: <strong className="text-brand">{formatMoney(remainingBalance(r), r.currency)}</strong>
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

/** Pazartesi başlangıçlı ay ızgarası; boş hücreler null döner */
function buildMonthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Pazartesi = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array.from({ length: offset }, () => null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(toIso(new Date(year, month, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
