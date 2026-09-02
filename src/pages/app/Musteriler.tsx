import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Seo from '../../components/Seo';
import { useAuth } from '../../context/AuthContext';
import { useReservationsWithBalances } from '../../lib/queries';
import { QueryBoundary } from '../../components/QueryState';
import { formatDate, formatMoney, formatPhone, normalizeTr } from '../../lib/format';
import { downloadCsv, toCsv } from '../../lib/reports';
import { IconDownload, IconSearch } from '../../components/Icons';

interface CustomerRow {
  name: string;
  phone: string;
  email?: string;
  count: number;
  total: number;
  paid: number;
  remaining: number;
  lastDate: string;
}

export default function Musteriler() {
  const { reservations, balance, isLoading, error } = useReservationsWithBalances();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const currency = user?.currency ?? 'TL';

  const customers = useMemo(() => {
    const map = new Map<string, CustomerRow>();
    reservations
      .filter((r) => r.status !== 'İptal')
      .forEach((r) => {
        const key = r.customerPhone || normalizeTr(r.customerName);
        const row = map.get(key) ?? {
          name: r.customerName,
          phone: r.customerPhone,
          email: r.customerEmail,
          count: 0,
          total: 0,
          paid: 0,
          remaining: 0,
          lastDate: r.date,
        };
        row.count += 1;
        row.total += r.totalAmount;
        row.paid += balance.paid(r);
        row.remaining += balance.remaining(r);
        if (r.date > row.lastDate) row.lastDate = r.date;
        if (!row.email && r.customerEmail) row.email = r.customerEmail;
        map.set(key, row);
      });
    return [...map.values()].sort((a, b) => b.lastDate.localeCompare(a.lastDate));
  }, [reservations, balance]);

  const filtered = useMemo(() => {
    const q = normalizeTr(query);
    if (!q) return customers;
    return customers.filter((c) => normalizeTr(`${c.name} ${c.phone} ${c.email ?? ''}`).includes(q));
  }, [customers, query]);

  function exportCsv() {
    const csv = toCsv(
      ['Müşteri', 'Telefon', 'E-Posta', 'Kayıt Adedi', 'Toplam', 'Ödenen', 'Kalan', 'Son Organizasyon'],
      filtered.map((c) => [c.name, formatPhone(c.phone), c.email ?? '', c.count, c.total, c.paid, c.remaining, formatDate(c.lastDate)]),
    );
    downloadCsv(`musteriler-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  return (
    <QueryBoundary isLoading={isLoading} error={error}>
      <Seo title="Müşteriler - Düğün Takip Panel" noindex />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold text-brand">Müşteriler</h1>
        <button type="button" onClick={exportCsv} className="btn-outline btn-sm" disabled={filtered.length === 0}>
          <IconDownload size={16} /> CSV indir
        </button>
      </div>

      <div className="card mb-5 p-4">
        <label htmlFor="ms-q" className="field-label">İsim veya telefon ile ara</label>
        <div className="relative max-w-md">
          <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
          <input id="ms-q" type="search" className="field-input pl-9" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <div className="card overflow-x-auto">
        {filtered.length === 0 ? (
          <p className="p-10 text-center text-sm text-brand-muted">Müşteri kaydı bulunamadı.</p>
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line bg-surface text-left text-xs uppercase text-brand-muted">
                <th className="px-4 py-3 font-medium">Müşteri</th>
                <th className="px-4 py-3 font-medium">Telefon</th>
                <th className="px-4 py-3 text-right font-medium">Kayıt</th>
                <th className="px-4 py-3 text-right font-medium">Toplam</th>
                <th className="px-4 py-3 text-right font-medium">Ödenen</th>
                <th className="px-4 py-3 text-right font-medium">Kalan</th>
                <th className="px-4 py-3 font-medium">Son Organizasyon</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.phone + c.name} className="border-b border-line/60 last:border-0 hover:bg-surface/60">
                  <td className="px-4 py-3 font-medium text-brand">{c.name}</td>
                  <td className="px-4 py-3">
                    <a href={`tel:${c.phone}`}>{formatPhone(c.phone)}</a>
                  </td>
                  <td className="px-4 py-3 text-right text-brand">{c.count}</td>
                  <td className="px-4 py-3 text-right text-brand">{formatMoney(c.total, currency)}</td>
                  <td className="px-4 py-3 text-right text-[#15803d]">{formatMoney(c.paid, currency)}</td>
                  <td className="px-4 py-3 text-right font-medium text-[#b91c1c]">{formatMoney(c.remaining, currency)}</td>
                  <td className="px-4 py-3 text-brand-muted">{formatDate(c.lastDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-4 text-sm text-brand-muted">
        Müşteri kayıtları rezervasyonlardan otomatik oluşturulur.{' '}
        <Link to="/panel/rezervasyonlar/yeni">Yeni rezervasyon ekleyin</Link>.
      </p>
    </QueryBoundary>
  );
}
