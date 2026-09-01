import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import Seo from '../components/Seo';
import Alert from '../components/Alert';
import { repo } from '../lib/repo';
import { errorMessage } from '../lib/authHelpers';
import type { PublicReservation } from '../lib/repo';
import { formatDateLong, formatMoney } from '../lib/format';

export default function KodDogrulama() {
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<PublicReservation | null>(null);
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setResult(null);

    if (!code.trim()) {
      setError('Lütfen rezervasyon kodunu giriniz.');
      return;
    }

    setChecking(true);
    try {
      const found = await repo.verifyCode(code);
      if (!found) {
        setError('Girdiğiniz koda ait bir rezervasyon kaydı bulunamadı. Lütfen kodu kontrol ediniz.');
      } else {
        setResult(found);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setChecking(false);
    }
  }

  return (
    <>
      <Seo
        title="Rezervasyon Kod Doğrulama - Düğün Takip"
        description="Düğün Takip sistemindeki rezervasyon kodunuzu doğrulayın."
        path="/kod-dogrulama"
      />
      <PageHeader
        title="Rezervasyon Kod Doğrulama"
        breadcrumbs={[{ label: 'Kod Doğrulama' }]}
        description="Rezervasyon kaydınızda yer alan kod ile rezervasyonunuzun geçerliliğini kontrol edebilirsiniz."
      />

      <section className="py-12">
        <div className="container-dt max-w-2xl">
          <form onSubmit={(e) => { void onSubmit(e); }} noValidate className="card p-6">
            <label htmlFor="rez-kod" className="field-label">Rezervasyon Kodu</label>
            <input
              id="rez-kod"
              className="field-input font-mono uppercase"
              placeholder="DT-2026-0000"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'rez-kod-error' : undefined}
            />
            <button type="submit" className="btn-primary mt-4 text-white hover:text-white" disabled={checking}>
              {checking ? 'Lütfen bekleyiniz...' : 'Kodu Kontrol Et'}
            </button>
          </form>

          {error && (
            <div id="rez-kod-error" className="mt-5">
              <Alert kind="error">{error}</Alert>
            </div>
          )}

          {result && (
            <div className="mt-5">
              <Alert kind="success" className="mb-4">
                Rezervasyon kaydı doğrulandı.
              </Alert>
              <p className="mb-3 text-xs text-brand-muted">
                Gizlilik gereği telefon numarası kısmen gizlenmiş, ödeme bilgileri gösterilmemiştir.
              </p>
              <dl className="card divide-y divide-line">
                <Row label="Rezervasyon Kodu" value={result.code} />
                <Row label="İşletme" value={result.businessName || '—'} />
                <Row label="Müşteri" value={result.customerName} />
                <Row label="Telefon" value={result.customerPhone} />
                <Row label="Tarih" value={`${formatDateLong(result.date)} · ${result.slot}`} />
                <Row label="Organizasyon" value={result.organizationType} />
                <Row label="Davetli Sayısı" value={String(result.guestCount)} />
                <Row label="Durum" value={result.status} />
                <Row label="Toplam Tutar" value={formatMoney(result.totalAmount)} />
              </dl>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
      <dt className="text-sm text-brand-muted">{label}</dt>
      <dd className="font-heading text-sm font-semibold text-brand">{value}</dd>
    </div>
  );
}
