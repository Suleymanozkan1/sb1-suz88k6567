import { useMemo, useState } from 'react';
import Seo from '../../components/Seo';
import { useSmsLog, useSmsQueue } from '../../lib/queries';
import { QueryBoundary } from '../../components/QueryState';
import Alert from '../../components/Alert';
import { formatPhone, normalizeTr } from '../../lib/format';
import type { SmsQueueEntry } from '../../types';
import { IconSearch } from '../../components/Icons';

const KIND_STYLES: Record<string, string> = {
  Rezervasyon: 'bg-[#e7f5fb] text-[#0c5e8a]',
  Doğrulama: 'bg-[#fef6e7] text-[#92600e]',
  Hatırlatma: 'bg-[#e8f8ef] text-[#15803d]',
  Bilgilendirme: 'bg-surface text-brand-muted',
};

export default function SmsKayitlari() {
  const { data, isLoading, error } = useSmsLog();
  const queueQuery = useSmsQueue();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('');
  const [tab, setTab] = useState<'gonderilen' | 'kuyruk'>('gonderilen');

  const logs = useMemo(() => data ?? [], [data]);
  const queue = useMemo(() => queueQuery.data ?? [], [queueQuery.data]);

  const queueSummary = useMemo(() => ({
    bekleyen: queue.filter((q) => q.status === 'bekliyor' || q.status === 'gonderiliyor').length,
    basarisiz: queue.filter((q) => q.status === 'basarisiz').length,
    engellenen: queue.filter((q) => q.status === 'iptal').length,
  }), [queue]);

  const filtered = useMemo(() => {
    const q = normalizeTr(query);
    return logs.filter((l) => {
      if (kind && l.kind !== kind) return false;
      if (q && !normalizeTr(`${l.to} ${l.body}`).includes(q)) return false;
      return true;
    });
  }, [logs, query, kind]);

  return (
    <QueryBoundary isLoading={isLoading} error={error}>
      <Seo title="SMS Kayıtları - Düğün Takip Panel" noindex />

      <h1 className="mb-2 font-heading text-2xl font-bold text-brand">SMS Kayıtları</h1>
      <p className="mb-6 text-sm text-brand-muted">
        Rezervasyon kaydettiğinizde müşterinize SMS otomatik olarak gönderilir. Gönderilemeyen
        mesajlar kuyrukta bekler ve otomatik olarak yeniden denenir.
      </p>

      {(queueSummary.basarisiz > 0 || queueSummary.engellenen > 0) && (
        <Alert kind="warning" className="mb-5">
          {queueSummary.basarisiz > 0 && <>{queueSummary.basarisiz} mesaj gönderilemedi. </>}
          {queueSummary.engellenen > 0 && (
            <>{queueSummary.engellenen} ticari mesaj İYS onayı olmadığı için engellendi. </>
          )}
          Ayrıntılar için <strong>Kuyruk</strong> sekmesine bakınız.
        </Alert>
      )}

      <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="SMS görünümü">
        <button type="button" role="tab" aria-selected={tab === 'gonderilen'}
          onClick={() => setTab('gonderilen')}
          className={`btn-sm rounded-full px-4 py-2 text-sm transition ${
            tab === 'gonderilen' ? 'bg-accent text-white' : 'border border-line bg-white text-brand hover:border-accent'
          }`}>
          Gönderilen mesajlar
        </button>
        <button type="button" role="tab" aria-selected={tab === 'kuyruk'}
          onClick={() => setTab('kuyruk')}
          className={`btn-sm rounded-full px-4 py-2 text-sm transition ${
            tab === 'kuyruk' ? 'bg-accent text-white' : 'border border-line bg-white text-brand hover:border-accent'
          }`}>
          Kuyruk {queueSummary.bekleyen > 0 && `(${queueSummary.bekleyen} bekliyor)`}
        </button>
      </div>

      {tab === 'kuyruk' ? (
        <QueueTable rows={queue} />
      ) : (
      <>
      <form className="card mb-5 grid gap-3 p-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()} role="search">
        <div>
          <label htmlFor="sms-q" className="field-label">Numara veya mesaj içeriği</label>
          <div className="relative">
            <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
            <input id="sms-q" type="search" className="field-input pl-9" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        <div>
          <label htmlFor="sms-kind" className="field-label">Mesaj türü</label>
          <select id="sms-kind" className="field-input" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">Tümü</option>
            <option value="Rezervasyon">Rezervasyon</option>
            <option value="Doğrulama">Doğrulama</option>
            <option value="Hatırlatma">Hatırlatma</option>
            <option value="Bilgilendirme">Bilgilendirme</option>
          </select>
        </div>
      </form>

      <div className="card overflow-x-auto">
        {filtered.length === 0 ? (
          <p className="p-10 text-center text-sm text-brand-muted">SMS kaydı bulunamadı.</p>
        ) : (
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-line bg-surface text-left text-xs uppercase text-brand-muted">
                <th className="px-4 py-3 font-medium">Gönderim</th>
                <th className="px-4 py-3 font-medium">Numara</th>
                <th className="px-4 py-3 font-medium">Tür</th>
                <th className="px-4 py-3 font-medium">Mesaj</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className="border-b border-line/60 last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-brand-muted">
                    {new Date(l.sentAt).toLocaleString('tr-TR')}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-brand">{formatPhone(l.to)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs ${KIND_STYLES[l.kind] ?? ''}`}>{l.kind}</span>
                  </td>
                  <td className="px-4 py-3 text-brand-muted">{l.body}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      </>
      )}
    </QueryBoundary>
  );
}

const QUEUE_STATUS_LABELS: Record<string, string> = {
  bekliyor: 'Bekliyor',
  gonderiliyor: 'Gönderiliyor',
  gonderildi: 'Gönderildi',
  basarisiz: 'Başarısız',
  iptal: 'Engellendi',
};

const QUEUE_STATUS_STYLES: Record<string, string> = {
  bekliyor: 'bg-[#fef6e7] text-[#92600e]',
  gonderiliyor: 'bg-[#e7f5fb] text-[#0c5e8a]',
  gonderildi: 'bg-[#e8f8ef] text-[#15803d]',
  basarisiz: 'bg-[#fdecea] text-[#b91c1c]',
  iptal: 'bg-surface text-brand-muted',
};

/** Gönderim kuyruğu: bekleyen, başarısız ve İYS nedeniyle engellenen mesajlar */
function QueueTable({ rows }: { rows: SmsQueueEntry[] }) {
  if (rows.length === 0) {
    return <p className="card p-10 text-center text-sm text-brand-muted">Kuyrukta mesaj bulunmuyor.</p>;
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="border-b border-line bg-surface text-left text-xs uppercase text-brand-muted">
            <th className="px-4 py-3 font-medium">Oluşturma</th>
            <th className="px-4 py-3 font-medium">Numara</th>
            <th className="px-4 py-3 font-medium">Tür</th>
            <th className="px-4 py-3 font-medium">Durum</th>
            <th className="px-4 py-3 font-medium">Deneme</th>
            <th className="px-4 py-3 font-medium">Mesaj / Hata</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-line/60 align-top last:border-0">
              <td className="whitespace-nowrap px-4 py-3 text-brand-muted">
                {new Date(row.createdAt).toLocaleString('tr-TR')}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-brand">{formatPhone(row.phone)}</td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                  row.category === 'ticari' ? 'bg-[#fef6e7] text-[#92600e]' : 'bg-surface text-brand-muted'
                }`}>
                  {row.category === 'ticari' ? 'Ticari' : 'İşlem'}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2.5 py-1 text-xs ${QUEUE_STATUS_STYLES[row.status]}`}>
                  {QUEUE_STATUS_LABELS[row.status]}
                </span>
              </td>
              <td className="px-4 py-3 text-brand-muted">{row.attempts}</td>
              <td className="px-4 py-3">
                <span className="block text-brand-muted">{row.body}</span>
                {row.lastError && (
                  <span className="mt-1 block text-xs text-[#b91c1c]">{row.lastError}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
