import { useState } from 'react';
import Seo from '../../components/Seo';
import Alert from '../../components/Alert';
import { QueryBoundary } from '../../components/QueryState';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../lib/authHelpers';
import { useExportData, useSystemHealth } from '../../lib/queries';
import { formatNumber } from '../../lib/format';
import { IconAlert, IconCheck, IconDownload, IconShield } from '../../components/Icons';
import { findIssues } from '../../lib/health';

export default function SistemDurumu() {
  const { can, isDemoMode } = useAuth();
  const { data, isLoading, error } = useSystemHealth();
  const exportMutation = useExportData();
  const [downloadError, setDownloadError] = useState('');

  async function downloadBackup() {
    setDownloadError('');
    try {
      const payload = await exportMutation.mutateAsync();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `duguntakip-yedek-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(errorMessage(err));
    }
  }

  if (!can('ayarlar.duzenle')) {
    return <Alert kind="error">Sistem durumunu görüntüleme yetkiniz bulunmuyor.</Alert>;
  }

  const health = data ?? null;
  const issues = health ? findIssues(health, isDemoMode) : [];
  const healthy = issues.length === 0;

  return (
    <QueryBoundary isLoading={isLoading} error={error}>
      <Seo title="Sistem Durumu - Düğün Takip Panel" noindex />

      <h1 className="mb-2 font-heading text-2xl font-bold text-brand">Sistem Durumu</h1>
      <p className="mb-6 text-sm text-brand-muted">
        Yedekleme, SMS kuyruğu ve İYS aktarımının sağlığı. Sorun varsa aşağıda listelenir.
      </p>

      <div className={`card mb-6 flex items-center gap-4 p-6 ${healthy ? '' : 'border-[#f5c6c2]'}`}>
        <span className={`rounded-full p-3 ${healthy ? 'bg-[#e8f8ef] text-[#15803d]' : 'bg-[#fdecea] text-[#b91c1c]'}`}>
          {healthy ? <IconCheck size={26} /> : <IconAlert size={26} />}
        </span>
        <div>
          <p className="font-heading text-lg font-bold text-brand">
            {healthy ? 'Sistem sağlıklı' : `${issues.length} sorun tespit edildi`}
          </p>
          <p className="text-sm text-brand-muted">
            {healthy
              ? 'Tüm kontroller başarılı. Durum her dakika yenilenir.'
              : 'Aşağıdaki maddeleri gözden geçirin.'}
          </p>
        </div>
      </div>

      {issues.length > 0 && (
        <ul className="mb-6 space-y-3">
          {issues.map((issue) => (
            <li key={issue.message}>
              <Alert kind={issue.level}>
                <strong>{issue.message}</strong>
                {issue.hint && <span className="mt-1 block text-xs opacity-90">{issue.hint}</span>}
              </Alert>
            </li>
          ))}
        </ul>
      )}

      {health && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Kuyrukta bekleyen" value={formatNumber(health.kuyrukBekleyen)}
            hint={health.kuyrukEnEskiDakika > 0 ? `En eski: ${health.kuyrukEnEskiDakika} dk` : 'Kuyruk boş'} />
          <Metric label="Gönderilemeyen" value={formatNumber(health.kuyrukBasarisiz)}
            tone={health.kuyrukBasarisiz > 0 ? 'danger' : 'ok'} />
          <Metric label="İYS'ye aktarılmamış" value={formatNumber(health.iysAktarilmamis)}
            tone={health.iysAktarilmamis > 0 ? 'warning' : 'ok'} />
          <Metric label="24 saatte hatalı giriş" value={formatNumber(health.basarisizGiris24s)}
            tone={health.basarisizGiris24s > 20 ? 'warning' : 'ok'} />
        </div>
      )}

      <section className="card p-6">
        <h2 className="mb-2 flex items-center gap-2 font-heading text-lg font-bold text-brand">
          <IconShield size={20} className="text-accent" /> Yedekleme
        </h2>

        {isDemoMode ? (
          <Alert kind="info" className="mb-4">
            Demo modunda otomatik yedekleme yapılmaz. Aşağıdaki düğme, tarayıcıdaki kayıtları
            dosya olarak indirir.
          </Alert>
        ) : health?.sonYedek ? (
          <p className="mb-4 text-sm">
            Son başarılı yedek:{' '}
            <strong className="text-brand">
              {new Date(health.sonYedek.zaman).toLocaleString('tr-TR')}
            </strong>{' '}
            <span className="text-brand-muted">
              ({health.sonYedek.yasSaat > 0
                ? `${health.sonYedek.yasSaat} saat önce`
                : `${health.sonYedek.yasDakika} dakika önce`})
            </span>
          </p>
        ) : (
          <p className="mb-4 text-sm text-brand-muted">Henüz otomatik yedek alınmamış.</p>
        )}

        <p className="mb-4 text-sm leading-relaxed text-brand-muted">
          Otomatik yedek her gece 02:30'da alınır ve Storage'a yazılır. Buna ek olarak, verinizin
          bir kopyasını dilediğiniz zaman indirip kendi bilgisayarınızda saklayabilirsiniz.
        </p>

        {downloadError && <Alert kind="error" className="mb-4">{downloadError}</Alert>}

        <button
          type="button"
          onClick={() => { void downloadBackup(); }}
          className="btn-primary text-white hover:text-white"
          disabled={exportMutation.isPending}
        >
          <IconDownload size={16} />
          {exportMutation.isPending ? 'Hazırlanıyor…' : 'Yedeği indir (JSON)'}
        </button>
      </section>
    </QueryBoundary>
  );
}

function Metric({
  label, value, hint, tone = 'ok',
}: {
  label: string; value: string; hint?: string; tone?: 'ok' | 'warning' | 'danger';
}) {
  const color =
    tone === 'danger' ? 'text-[#b91c1c]' : tone === 'warning' ? 'text-[#92600e]' : 'text-brand';
  return (
    <div className="card p-5">
      <p className="text-xs uppercase tracking-wide text-brand-muted">{label}</p>
      <p className={`mt-1 font-heading text-2xl font-bold ${color}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-brand-muted">{hint}</p>}
    </div>
  );
}
