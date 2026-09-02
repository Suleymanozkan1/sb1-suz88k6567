import { useMemo, useState } from 'react';
import Seo from '../../components/Seo';
import Alert from '../../components/Alert';
import { QueryBoundary } from '../../components/QueryState';
import { useAuditLog } from '../../lib/queries';
import { useAuth } from '../../context/AuthContext';
import { formatDateTime, normalizeTr } from '../../lib/format';
import { IconSearch } from '../../components/Icons';
import type { AuditEntry } from '../../types';

const ACTION_LABELS: Record<AuditEntry['action'], string> = {
  INSERT: 'Ekleme',
  UPDATE: 'Değişiklik',
  DELETE: 'Silme',
};

const ACTION_STYLES: Record<AuditEntry['action'], string> = {
  INSERT: 'bg-[#e8f8ef] text-[#15803d]',
  UPDATE: 'bg-[#e7f5fb] text-[#0c5e8a]',
  DELETE: 'bg-[#fdecea] text-[#b91c1c]',
};

const TABLE_LABELS: Record<string, string> = {
  reservations: 'Rezervasyon',
  payments: 'Tahsilat',
  cash_flow: 'Gelir / Gider',
  businesses: 'İşletme',
  profiles: 'Kullanıcı',
};

/** Alan adlarını okunabilir Türkçe karşılıklarına çevirir */
const FIELD_LABELS: Record<string, string> = {
  customer_name: 'Müşteri adı', customer_phone: 'Telefon', customer_email: 'E-posta',
  date: 'Tarih', slot: 'Seans', organization_type: 'Organizasyon türü',
  guest_count: 'Davetli sayısı', total_amount: 'Toplam tutar', deposit: 'Kaparo',
  status: 'Durum', note: 'Not', services: 'Hizmetler', color_key: 'Renk',
  amount: 'Tutar', category: 'Kategori', description: 'Açıklama', kind: 'Tür',
  name: 'Ad', capacity: 'Kapasite', phone: 'Telefon', address: 'Adres',
  full_name: 'Ad soyad', permissions: 'Yetkiler', mobile: 'Cep telefonu',
  company_name: 'Firma adı', city: 'Şehir', district: 'İlçe', currency: 'Para birimi',
};

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function DenetimKaydi() {
  const { can, isDemoMode } = useAuth();
  const { data, isLoading, error } = useAuditLog();
  const [query, setQuery] = useState('');
  const [action, setAction] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  const entries = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const q = normalizeTr(query);
    return entries.filter((e) => {
      if (action && e.action !== action) return false;
      if (q && !normalizeTr(`${e.actorEmail} ${e.summary ?? ''} ${TABLE_LABELS[e.tableName] ?? e.tableName}`).includes(q)) {
        return false;
      }
      return true;
    });
  }, [entries, query, action]);

  if (!can('ayarlar.duzenle')) {
    return <Alert kind="error">Denetim kaydını görüntüleme yetkiniz bulunmuyor.</Alert>;
  }

  return (
    <QueryBoundary isLoading={isLoading} error={error}>
      <Seo title="Denetim Kaydı - Düğün Takip Panel" noindex />

      <h1 className="mb-2 font-heading text-2xl font-bold text-brand">Denetim Kaydı</h1>
      <p className="mb-6 text-sm text-brand-muted">
        Sistemde yapılan tüm ekleme, değişiklik ve silme işlemleri; kim tarafından ve ne zaman
        yapıldığı ile birlikte kayıt altına alınır. Bu kayıtlar değiştirilemez.
      </p>

      {isDemoMode && (
        <Alert kind="info" className="mb-5">
          Denetim kaydı veritabanı tetikleyicileriyle yazılır ve yalnızca veritabanı bağlıyken
          çalışır. Demo modunda kayıt tutulmaz.
        </Alert>
      )}

      <form className="card mb-5 grid gap-3 p-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()} role="search">
        <div>
          <label htmlFor="au-q" className="field-label">Kullanıcı veya kayıt ara</label>
          <div className="relative">
            <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
            <input id="au-q" type="search" className="field-input pl-9" value={query}
              onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        <div>
          <label htmlFor="au-action" className="field-label">İşlem türü</label>
          <select id="au-action" className="field-input" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">Tümü</option>
            <option value="INSERT">Ekleme</option>
            <option value="UPDATE">Değişiklik</option>
            <option value="DELETE">Silme</option>
          </select>
        </div>
      </form>

      <div className="card overflow-x-auto">
        {filtered.length === 0 ? (
          <p className="p-10 text-center text-sm text-brand-muted">
            {isDemoMode ? 'Demo modunda denetim kaydı tutulmaz.' : 'Kayıt bulunamadı.'}
          </p>
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line bg-surface text-left text-xs uppercase text-brand-muted">
                <th className="px-4 py-3 font-medium">Zaman</th>
                <th className="px-4 py-3 font-medium">Kullanıcı</th>
                <th className="px-4 py-3 font-medium">İşlem</th>
                <th className="px-4 py-3 font-medium">Kayıt</th>
                <th className="px-4 py-3 font-medium">Ayrıntı</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => {
                const changedKeys = Object.keys(entry.changed ?? {});
                const isOpen = expanded === entry.id;
                return (
                  <tr key={entry.id} className="border-b border-line/60 align-top last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-brand-muted">
                      {formatDateTime(entry.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-brand">{entry.actorEmail}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs ${ACTION_STYLES[entry.action]}`}>
                        {ACTION_LABELS[entry.action]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="block text-brand">{TABLE_LABELS[entry.tableName] ?? entry.tableName}</span>
                      {entry.summary && <span className="block text-xs text-brand-muted">{entry.summary}</span>}
                    </td>
                    <td className="px-4 py-3">
                      {changedKeys.length === 0 ? (
                        <span className="text-xs text-brand-muted">—</span>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="text-xs text-accent hover:text-accent-dark"
                            aria-expanded={isOpen}
                            onClick={() => setExpanded(isOpen ? null : entry.id)}
                          >
                            {changedKeys.length} alan değişti {isOpen ? '▲' : '▼'}
                          </button>
                          {isOpen && (
                            <ul className="mt-2 space-y-1 text-xs">
                              {changedKeys.map((key) => (
                                <li key={key} className="rounded bg-surface px-2 py-1">
                                  <span className="font-medium text-brand">{fieldLabel(key)}: </span>
                                  <span className="text-[#b91c1c] line-through">
                                    {formatValue(entry.changed![key].eski)}
                                  </span>
                                  {' → '}
                                  <span className="text-[#15803d]">
                                    {formatValue(entry.changed![key].yeni)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </QueryBoundary>
  );
}
