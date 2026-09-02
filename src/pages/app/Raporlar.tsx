import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Seo from '../../components/Seo';
import Alert from '../../components/Alert';
import { useAuth } from '../../context/AuthContext';
import { useReservationsWithBalances } from '../../lib/queries';
import { QueryBoundary } from '../../components/QueryState';
import { balanceReport, downloadCsv, monthReport, programReport, slotReport, summarize, toCsv, withinRange } from '../../lib/reports';
import { formatDate, formatMoney, formatNumber, formatPhone } from '../../lib/format';
import { IconDownload, IconPrint } from '../../components/Icons';

type Tab = 'program' | 'ay' | 'bakiye' | 'seans';

const TABS: { key: Tab; label: string }[] = [
  { key: 'program', label: 'Program bazlı rapor' },
  { key: 'ay', label: 'Ay bazlı rapor' },
  { key: 'bakiye', label: 'Alacak bakiyesi' },
  { key: 'seans', label: 'Gündüz / Gece' },
];

export default function Raporlar() {
  const { user, can } = useAuth();
  const { reservations, colors, balance, isLoading, error } = useReservationsWithBalances();
  const [tab, setTab] = useState<Tab>('program');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const currency = user?.currency ?? 'TL';

  const scoped = useMemo(
    () => reservations.filter((r) => r.status !== 'İptal' && withinRange(r.date, { from, to })),
    [reservations, from, to],
  );

  const totals = useMemo(() => summarize(scoped, balance), [scoped, balance]);
  const programs = useMemo(() => programReport(scoped, balance), [scoped, balance]);
  const months = useMemo(() => monthReport(scoped, balance), [scoped, balance]);
  const balances = useMemo(() => balanceReport(scoped, balance), [scoped, balance]);
  const slots = useMemo(() => slotReport(scoped, balance), [scoped, balance]);

  if (!can('rapor.goruntule')) {
    return <Alert kind="error">Raporları görüntüleme yetkiniz bulunmuyor.</Alert>;
  }

  function exportCsv() {
    let csv = '';
    if (tab === 'program') {
      csv = toCsv(
        ['Organizasyon', 'Adet', 'Davetli', 'Toplam', 'Tahsilat', 'Kalan'],
        programs.map((p) => [p.organizationType, p.count, p.guests, p.total, p.collected, p.remaining]),
      );
    } else if (tab === 'ay') {
      csv = toCsv(
        ['Ay', 'Adet', 'Davetli', 'Toplam', 'Tahsilat', 'Kalan'],
        months.map((m) => [m.label, m.count, m.guests, m.total, m.collected, m.remaining]),
      );
    } else if (tab === 'bakiye') {
      csv = toCsv(
        ['Kod', 'Tarih', 'Müşteri', 'Telefon', 'Toplam', 'Ödenen', 'Kalan'],
        balances.map((b) => [
          b.reservation.code, formatDate(b.reservation.date), b.reservation.customerName,
          formatPhone(b.reservation.customerPhone), b.reservation.totalAmount, b.paid, b.remaining,
        ]),
      );
    } else {
      csv = toCsv(
        ['Seans', 'Adet', 'Davetli', 'Toplam', 'Tahsilat', 'Kalan'],
        slots.map((s) => [s.slot, s.count, s.guests, s.total, s.collected, s.remaining]),
      );
    }
    downloadCsv(`rapor-${tab}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  const maxProgram = Math.max(1, ...programs.map((p) => p.total));
  const maxMonth = Math.max(1, ...months.map((m) => m.count));

  return (
    <QueryBoundary isLoading={isLoading} error={error}>
      <Seo title="Raporlar - Düğün Takip Panel" noindex />

      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold text-brand">Raporlar</h1>
        <div className="flex gap-2">
          <button type="button" onClick={exportCsv} className="btn-outline btn-sm">
            <IconDownload size={16} /> CSV indir
          </button>
          <button type="button" onClick={() => window.print()} className="btn-outline btn-sm">
            <IconPrint size={16} /> Yazdır
          </button>
        </div>
      </div>

      <form className="no-print card mb-5 grid gap-3 p-4 sm:grid-cols-3" onSubmit={(e) => e.preventDefault()}>
        <div>
          <label htmlFor="rp-from" className="field-label">Başlangıç tarihi</label>
          <input id="rp-from" type="date" className="field-input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label htmlFor="rp-to" className="field-label">Bitiş tarihi</label>
          <input id="rp-to" type="date" className="field-input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="flex items-end">
          <button type="button" className="btn-outline w-full" onClick={() => { setFrom(''); setTo(''); }}>
            Tarih aralığını temizle
          </button>
        </div>
      </form>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Mini label="Rezervasyon" value={formatNumber(totals.count)} />
        <Mini label="Davetli" value={formatNumber(totals.guests)} />
        <Mini label="Toplam ciro" value={formatMoney(totals.total, currency)} />
        <Mini label="Tahsil edilen" value={formatMoney(totals.collected, currency)} />
        <Mini label="Kalan alacak" value={formatMoney(totals.remaining, currency)} />
      </div>

      <div className="no-print mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Rapor türü">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`btn-sm rounded-full px-4 py-2 text-sm transition ${
              tab === t.key ? 'bg-accent text-white' : 'border border-line bg-white text-brand hover:border-accent'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section className="card p-5" role="tabpanel" aria-label={TABS.find((t) => t.key === tab)?.label}>
        {scoped.length === 0 ? (
          <p className="py-10 text-center text-sm text-brand-muted">Seçilen tarih aralığında kayıt bulunmuyor.</p>
        ) : tab === 'program' ? (
          <>
            <div className="mb-6 space-y-3">
              {programs.map((p) => {
                const color = colors.find((c) => c.label === p.organizationType)?.color ?? '#47b2e4';
                return (
                  <div key={p.organizationType}>
                    <div className="mb-1 flex justify-between text-sm text-brand">
                      <span>{p.organizationType} ({p.count})</span>
                      <span>{formatMoney(p.total, currency)}</span>
                    </div>
                    <div className="h-2.5 rounded bg-surface">
                      <div className="h-full rounded" style={{ width: `${(p.total / maxProgram) * 100}%`, background: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <Table
              headers={['Organizasyon', 'Adet', 'Davetli', 'Toplam', 'Tahsilat', 'Kalan']}
              rows={programs.map((p) => [
                p.organizationType, formatNumber(p.count), formatNumber(p.guests),
                formatMoney(p.total, currency), formatMoney(p.collected, currency), formatMoney(p.remaining, currency),
              ])}
            />
          </>
        ) : tab === 'ay' ? (
          <>
            <div className="mb-6 flex h-56 items-end gap-2 overflow-x-auto">
              {months.map((m) => (
                <div key={m.label} className="flex min-w-[52px] flex-1 flex-col items-center gap-1.5">
                  <span className="text-xs font-medium text-brand">{m.count}</span>
                  <div className="w-full rounded-t bg-accent" style={{ height: `${Math.max(4, (m.count / maxMonth) * 150)}px` }} title={`${m.label}: ${m.count}`} />
                  <span className="text-center text-[10px] leading-tight text-brand-muted">{m.label}</span>
                </div>
              ))}
            </div>
            <Table
              headers={['Ay', 'Adet', 'Davetli', 'Toplam', 'Tahsilat', 'Kalan']}
              rows={months.map((m) => [
                m.label, formatNumber(m.count), formatNumber(m.guests),
                formatMoney(m.total, currency), formatMoney(m.collected, currency), formatMoney(m.remaining, currency),
              ])}
            />
          </>
        ) : tab === 'bakiye' ? (
          balances.length === 0 ? (
            <p className="py-10 text-center text-sm text-brand-muted">Kalan alacağı olan kayıt bulunmuyor.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface text-left text-xs uppercase text-brand-muted">
                    <th className="px-3 py-2.5 font-medium">Kod</th>
                    <th className="px-3 py-2.5 font-medium">Tarih</th>
                    <th className="px-3 py-2.5 font-medium">Müşteri</th>
                    <th className="px-3 py-2.5 font-medium">Telefon</th>
                    <th className="px-3 py-2.5 text-right font-medium">Toplam</th>
                    <th className="px-3 py-2.5 text-right font-medium">Ödenen</th>
                    <th className="px-3 py-2.5 text-right font-medium">Kalan</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((b) => (
                    <tr key={b.reservation.id} className="border-b border-line/60 last:border-0">
                      <td className="px-3 py-2.5 font-mono text-xs text-brand-muted">{b.reservation.code}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-brand">{formatDate(b.reservation.date)}</td>
                      <td className="px-3 py-2.5">
                        <Link to={`/panel/rezervasyonlar/${b.reservation.id}`}>{b.reservation.customerName}</Link>
                      </td>
                      <td className="px-3 py-2.5 text-brand-muted">{formatPhone(b.reservation.customerPhone)}</td>
                      <td className="px-3 py-2.5 text-right text-brand">{formatMoney(b.reservation.totalAmount, currency)}</td>
                      <td className="px-3 py-2.5 text-right text-[#15803d]">{formatMoney(b.paid, currency)}</td>
                      <td className="px-3 py-2.5 text-right font-medium text-[#b91c1c]">{formatMoney(b.remaining, currency)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-line font-semibold">
                    <td className="px-3 py-2.5 text-brand" colSpan={6}>Toplam kalan alacak</td>
                    <td className="px-3 py-2.5 text-right text-[#b91c1c]">
                      {formatMoney(balances.reduce((s, b) => s + b.remaining, 0), currency)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        ) : (
          <Table
            headers={['Seans', 'Adet', 'Davetli', 'Toplam', 'Tahsilat', 'Kalan']}
            rows={slots.map((s) => [
              s.slot, formatNumber(s.count), formatNumber(s.guests),
              formatMoney(s.total, currency), formatMoney(s.collected, currency), formatMoney(s.remaining, currency),
            ])}
          />
        )}
      </section>
    </QueryBoundary>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs text-brand-muted">{label}</p>
      <p className="mt-0.5 font-heading font-bold text-brand">{value}</p>
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-line bg-surface text-left text-xs uppercase text-brand-muted">
            {headers.map((h, i) => (
              <th key={h} className={`px-3 py-2.5 font-medium ${i > 0 ? 'text-right' : ''}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]} className="border-b border-line/60 last:border-0">
              {row.map((cell, i) => (
                <td key={i} className={`px-3 py-2.5 ${i > 0 ? 'text-right' : ''} text-brand`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
