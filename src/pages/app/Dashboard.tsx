import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import Seo from '../../components/Seo';
import StatCard from '../../components/StatCard';
import { useAuth } from '../../context/AuthContext';
import { useCashFlow, useReservationsWithBalances } from '../../lib/queries';
import { QueryBoundary } from '../../components/QueryState';
import { formatDate, formatMoney, formatNumber, todayIso } from '../../lib/format';
import { lastMonthsReport, programReport, summarize } from '../../lib/reports';
import { IconCalendar, IconPlus, IconUsers, IconWallet } from '../../components/Icons';
import { MONTH_NAMES } from '../../data/constants';

export default function Dashboard() {
  const { user } = useAuth();
  const { reservations, colors, balance, isLoading, error } = useReservationsWithBalances();
  const cashQuery = useCashFlow();
  const today = todayIso();
  const currency = user?.currency ?? 'TL';

  const active = useMemo(() => reservations.filter((r) => r.status !== 'İptal'), [reservations]);
  const upcoming = useMemo(
    () => active.filter((r) => r.date >= today).sort((a, b) => a.date.localeCompare(b.date)),
    [active, today],
  );

  const thisMonthPrefix = today.slice(0, 7);
  const thisMonth = useMemo(() => active.filter((r) => r.date.startsWith(thisMonthPrefix)), [active, thisMonthPrefix]);

  const totals = useMemo(() => summarize(active, balance), [active, balance]);
  const monthTotals = useMemo(() => summarize(thisMonth, balance), [thisMonth, balance]);

  const cash = useMemo(() => cashQuery.data ?? [], [cashQuery.data]);
  const cashBalance = useMemo(
    () => cash.reduce((sum, c) => sum + (c.kind === 'Gelir' ? c.amount : -c.amount), 0),
    [cash],
  );

  const byProgram = useMemo(() => programReport(active, balance).slice(0, 5), [active, balance]);
  // Bugünden geriye 6 takvim ayı; kaydı olmayan aylar 0 olarak gösterilir.
  const byMonth = useMemo(() => lastMonthsReport(active, 6, today, balance), [active, today, balance]);
  const maxMonth = Math.max(1, ...byMonth.map((m) => m.count));

  return (
    <QueryBoundary isLoading={isLoading} error={error}>
      <Seo title="Özet - Düğün Takip Panel" noindex />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-brand">Hoş geldiniz, {user?.fullName}</h1>
          <p className="text-sm text-brand-muted">
            {MONTH_NAMES[new Date().getMonth()]} {new Date().getFullYear()} özeti
          </p>
        </div>
        <Link to="/panel/rezervasyonlar/yeni" className="btn-primary text-white hover:text-white">
          <IconPlus size={18} /> Yeni Rezervasyon
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Bu ay rezervasyon" value={formatNumber(monthTotals.count)} hint={`Toplam ${formatNumber(totals.count)} kayıt`} icon={IconCalendar} tone="accent" />
        <StatCard label="Bu ay ciro" value={formatMoney(monthTotals.total, currency)} hint={`Tahsil edilen ${formatMoney(monthTotals.collected, currency)}`} icon={IconWallet} tone="brand" />
        <StatCard label="Kalan alacak" value={formatMoney(totals.remaining, currency)} hint="Tüm açık kayıtlar" icon={IconWallet} tone="danger" />
        <StatCard label="Kasa bakiyesi" value={formatMoney(cashBalance, currency)} hint="Gelir - Gider" icon={IconUsers} tone={cashBalance >= 0 ? 'success' : 'danger'} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2" aria-labelledby="upcoming-title">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="upcoming-title" className="font-heading text-lg font-bold text-brand">Yaklaşan organizasyonlar</h2>
            <Link to="/panel/rezervasyonlar" className="text-sm">Tümü →</Link>
          </div>

          {upcoming.length === 0 ? (
            <p className="py-8 text-center text-sm text-brand-muted">
              Yaklaşan rezervasyon kaydı bulunmuyor.{' '}
              <Link to="/panel/rezervasyonlar/yeni">Yeni rezervasyon ekleyin</Link>.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase text-brand-muted">
                    <th className="pb-2 font-medium">Tarih</th>
                    <th className="pb-2 font-medium">Müşteri</th>
                    <th className="pb-2 font-medium">Organizasyon</th>
                    <th className="pb-2 text-right font-medium">Kalan</th>
                  </tr>
                </thead>
                <tbody>
                  {upcoming.slice(0, 8).map((r) => {
                    const color = colors.find((c) => c.key === r.colorKey)?.color ?? '#47b2e4';
                    return (
                      <tr key={r.id} className="border-b border-line/60 last:border-0">
                        <td className="py-2.5 whitespace-nowrap text-brand">
                          {formatDate(r.date)}
                          <span className="ml-1 text-xs text-brand-muted">{r.slot}</span>
                        </td>
                        <td className="py-2.5">
                          <Link to={`/panel/rezervasyonlar/${r.id}`}>{r.customerName}</Link>
                        </td>
                        <td className="py-2.5">
                          <span className="inline-flex items-center gap-1.5 text-brand">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                            {r.organizationType}
                          </span>
                        </td>
                        <td className="py-2.5 text-right font-medium text-brand">
                          {formatMoney(balance.remaining(r), r.currency)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card p-5" aria-labelledby="program-title">
          <h2 id="program-title" className="mb-4 font-heading text-lg font-bold text-brand">Program dağılımı</h2>
          {byProgram.length === 0 ? (
            <p className="py-6 text-center text-sm text-brand-muted">Kayıt bulunmuyor.</p>
          ) : (
            <ul className="space-y-3">
              {byProgram.map((p) => {
                const max = Math.max(...byProgram.map((x) => x.count));
                const color = colors.find((c) => c.label === p.organizationType)?.color ?? '#47b2e4';
                return (
                  <li key={p.organizationType}>
                    <div className="mb-1 flex justify-between text-xs text-brand">
                      <span>{p.organizationType}</span>
                      <span>{p.count} kayıt</span>
                    </div>
                    <div className="h-2 rounded bg-surface">
                      <div className="h-full rounded" style={{ width: `${(p.count / max) * 100}%`, background: color }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="card mt-6 p-5" aria-labelledby="month-title">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="month-title" className="font-heading text-lg font-bold text-brand">Son 6 ay</h2>
          <Link to="/panel/raporlar" className="text-sm">Detaylı rapor →</Link>
        </div>
        {byMonth.length === 0 ? (
          <p className="py-6 text-center text-sm text-brand-muted">Kayıt bulunmuyor.</p>
        ) : (
          <div className="flex h-48 items-end gap-3">
            {byMonth.map((m) => (
              <div key={m.label} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-xs font-medium text-brand">{m.count}</span>
                <div
                  className="w-full rounded-t bg-accent transition-all"
                  style={{ height: `${Math.max(4, (m.count / maxMonth) * 130)}px` }}
                  title={`${m.label}: ${m.count} rezervasyon`}
                />
                <span className="text-center text-[10px] leading-tight text-brand-muted">{m.label}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card mt-6 p-5">
        <h2 className="mb-3 font-heading text-lg font-bold text-brand">Tahsilat özeti</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Summary label="Toplam sözleşme tutarı" value={formatMoney(totals.total, currency)} />
          <Summary label="Tahsil edilen" value={formatMoney(totals.collected, currency)} />
          <Summary label="Kalan alacak" value={formatMoney(totals.remaining, currency)} />
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-surface">
          <div
            className="h-full bg-[#18d26e]"
            style={{ width: `${totals.total > 0 ? (totals.collected / totals.total) * 100 : 0}%` }}
            role="progressbar"
            aria-valuenow={totals.total > 0 ? Math.round((totals.collected / totals.total) * 100) : 0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Tahsilat oranı"
          />
        </div>
      </section>
    </QueryBoundary>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface p-4">
      <p className="text-xs text-brand-muted">{label}</p>
      <p className="mt-1 font-heading text-lg font-bold text-brand">{value}</p>
    </div>
  );
}
