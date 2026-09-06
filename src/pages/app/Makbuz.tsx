import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Seo from '../../components/Seo';
import Alert from '../../components/Alert';
import { QueryBoundary } from '../../components/QueryState';
import { useBusinesses, usePayments, useReservation } from '../../lib/queries';
import { formatDateLong, formatMoney, formatPhone } from '../../lib/format';
import { IconPrint } from '../../components/Icons';

/** Tahsilat Makbuzu — tek bir ödeme için yazdırılabilir belge. */
export default function Makbuz() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const paymentId = params.get('tahsilat') ?? '';

  const reservationQuery = useReservation(id);
  const paymentsQuery = usePayments();
  const { data: businesses = [] } = useBusinesses();

  const reservation = reservationQuery.data ?? undefined;
  const payment = useMemo(
    () => (paymentsQuery.data ?? []).find((p) => p.id === paymentId),
    [paymentsQuery.data, paymentId],
  );
  const business = useMemo(
    () => businesses.find((b) => b.id === reservation?.businessId),
    [businesses, reservation],
  );

  if (reservationQuery.isLoading || paymentsQuery.isLoading) {
    return <QueryBoundary isLoading error={null}>{null}</QueryBoundary>;
  }
  if (!reservation) return <Alert kind="error">Rezervasyon bulunamadı.</Alert>;
  if (!payment) return <Alert kind="error">Tahsilat kaydı bulunamadı.</Alert>;

  return (
    <>
      <Seo title="Tahsilat Makbuzu - Düğün Takip Panel" noindex />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to={`/panel/rezervasyonlar/${reservation.id}`} className="btn-outline btn-sm">
          Rezervasyona dön
        </Link>
        <button type="button" onClick={() => window.print()} className="btn-primary btn-sm text-white hover:text-white">
          <IconPrint size={16} /> Yazdır
        </button>
      </div>

      <article className="card mx-auto max-w-3xl p-8 print:border-0 print:shadow-none">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
          <div>
            <h1 className="font-heading text-xl font-bold text-brand">{business?.name ?? 'İşletme'}</h1>
            {business?.address && <p className="text-sm text-brand-muted">{business.address}</p>}
            {business?.phone && <p className="text-sm text-brand-muted">{formatPhone(business.phone)}</p>}
          </div>
          <div className="text-right">
            <p className="font-heading text-lg font-bold text-brand">TAHSİLAT MAKBUZU</p>
            <p className="text-sm text-brand-muted">Belge No: {payment.id.slice(-8).toUpperCase()}</p>
            <p className="text-sm text-brand-muted">Tarih: {formatDateLong(payment.date)}</p>
          </div>
        </header>

        <section className="mb-8">
          <h2 className="mb-3 font-heading font-bold text-brand">Tahsil Edilen</h2>
          <p className="font-heading text-3xl font-bold text-brand">
            {formatMoney(payment.amount, reservation.currency)}
          </p>
          <p className="mt-1 text-sm text-brand-muted">
            Ödeme şekli: {payment.method}
            {payment.note ? ` · ${payment.note}` : ''}
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 font-heading font-bold text-brand">Ödeyen / Organizasyon</h2>
          <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-brand-muted">Müşteri</dt>
              <dd className="text-brand">{reservation.customerName}</dd>
            </div>
            <div>
              <dt className="text-brand-muted">Telefon</dt>
              <dd className="text-brand">{formatPhone(reservation.customerPhone)}</dd>
            </div>
            <div>
              <dt className="text-brand-muted">Rezervasyon Kodu</dt>
              <dd className="text-brand">{reservation.code}</dd>
            </div>
            <div>
              <dt className="text-brand-muted">Organizasyon</dt>
              <dd className="text-brand">
                {reservation.organizationType} · {formatDateLong(reservation.date)} · {reservation.slot}
              </dd>
            </div>
          </dl>
        </section>

        <footer className="grid gap-10 border-t border-line pt-8 sm:grid-cols-2">
          <div>
            <p className="mb-12 text-sm text-brand-muted">Teslim Eden</p>
            <p className="border-t border-line pt-2 text-sm text-brand">{reservation.customerName}</p>
          </div>
          <div>
            <p className="mb-12 text-sm text-brand-muted">Teslim Alan</p>
            <p className="border-t border-line pt-2 text-sm text-brand">{business?.name ?? ''}</p>
          </div>
        </footer>
      </article>
    </>
  );
}
