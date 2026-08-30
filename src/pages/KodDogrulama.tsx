import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import Seo from '../components/Seo';
import Alert from '../components/Alert';
import { findReservationByCode, getBusiness, remainingBalance, totalPaid } from '../lib/db';
import { formatDateLong, formatMoney, formatPhone } from '../lib/format';
import type { Reservation } from '../types';

export default function KodDogrulama() {
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<Reservation | null>(null);
  const [error, setError] = useState('');

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setResult(null);

    if (!code.trim()) {
      setError('Lütfen rezervasyon kodunu giriniz.');
      return;
    }

    setChecking(true);
    window.setTimeout(() => {
      const found = findReservationByCode(code);
      if (!found) {
        setError('Girdiğiniz koda ait bir rezervasyon kaydı bulunamadı. Lütfen kodu kontrol ediniz.');
      } else {
        setResult(found);
      }
      setChecking(false);
    }, 500);
  }

  const business = result ? getBusiness(result.businessId) : undefined;

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
          <form onSubmit={onSubmit} noValidate className="card p-6">
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
              <dl className="card divide-y divide-line">
                <Row label="Rezervasyon Kodu" value={result.code} />
                <Row label="İşletme" value={business?.name ?? '—'} />
                <Row label="Müşteri" value={result.customerName} />
                <Row label="Telefon" value={formatPhone(result.customerPhone)} />
                <Row label="Tarih" value={`${formatDateLong(result.date)} · ${result.slot}`} />
                <Row label="Organizasyon" value={result.organizationType} />
                <Row label="Davetli Sayısı" value={String(result.guestCount)} />
                <Row label="Durum" value={result.status} />
                <Row label="Toplam Tutar" value={formatMoney(result.totalAmount, result.currency)} />
                <Row label="Ödenen" value={formatMoney(totalPaid(result), result.currency)} />
                <Row label="Kalan Alacak" value={formatMoney(remainingBalance(result), result.currency)} />
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
