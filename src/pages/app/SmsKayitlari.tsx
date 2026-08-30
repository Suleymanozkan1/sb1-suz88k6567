import { useMemo, useState } from 'react';
import Seo from '../../components/Seo';
import { useBusinessData } from '../../hooks/useBusinessData';
import { getSmsLog } from '../../lib/db';
import { formatPhone, normalizeTr } from '../../lib/format';
import { IconSearch } from '../../components/Icons';

const KIND_STYLES: Record<string, string> = {
  Rezervasyon: 'bg-[#e7f5fb] text-[#0c5e8a]',
  Doğrulama: 'bg-[#fef6e7] text-[#92600e]',
  Hatırlatma: 'bg-[#e8f8ef] text-[#15803d]',
  Bilgilendirme: 'bg-surface text-brand-muted',
};

export default function SmsKayitlari() {
  const { businessId } = useBusinessData();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('');

  const logs = useMemo(() => getSmsLog(businessId), [businessId]);

  const filtered = useMemo(() => {
    const q = normalizeTr(query);
    return logs.filter((l) => {
      if (kind && l.kind !== kind) return false;
      if (q && !normalizeTr(`${l.to} ${l.body}`).includes(q)) return false;
      return true;
    });
  }, [logs, query, kind]);

  return (
    <>
      <Seo title="SMS Kayıtları - Düğün Takip Panel" noindex />

      <h1 className="mb-2 font-heading text-2xl font-bold text-brand">SMS Kayıtları</h1>
      <p className="mb-6 text-sm text-brand-muted">
        Rezervasyon kaydettiğinizde müşterinize SMS otomatik olarak gönderilir. Gönderilen tüm mesajlar burada listelenir.
      </p>

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
  );
}
