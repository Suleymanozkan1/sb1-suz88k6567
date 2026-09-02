import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Seo from '../../components/Seo';
import Alert from '../../components/Alert';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../lib/authHelpers';
import {
  useAddPayment, useDeletePayment, useDeleteReservation, useSendSms,
  useReservation, useReservationsWithBalances,
} from '../../lib/queries';
import { QueryBoundary } from '../../components/QueryState';
import { remainingBalance, totalPaid } from '../../lib/money';
import { formatDate, formatDateLong, formatMoney, formatPhone, todayIso } from '../../lib/format';
import { PAYMENT_METHODS } from '../../data/constants';
import { IconEdit, IconMessage, IconPlus, IconPrint, IconReport, IconTrash } from '../../components/Icons';
import type { Payment } from '../../types';

export default function RezervasyonDetay() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const reservationQuery = useReservation(id);
  const { balance, isLoading: listLoading } = useReservationsWithBalances();
  const addPaymentMutation = useAddPayment();
  const deletePaymentMutation = useDeletePayment();
  const deleteReservationMutation = useDeleteReservation();
  const sendSmsMutation = useSendSms();
  const [actionError, setActionError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<Payment | null>(null);
  const [smsSent, setSmsSent] = useState(false);

  const [payForm, setPayForm] = useState({ date: todayIso(), amount: '', method: 'Nakit', note: '' });
  const [payError, setPayError] = useState('');

  const reservation = reservationQuery.data ?? undefined;
  const payments = id
    ? [...balance.paymentsOf(id)].sort((a, b) => b.date.localeCompare(a.date))
    : [];

  if (reservationQuery.isLoading || listLoading) {
    return <QueryBoundary isLoading error={null}>{null}</QueryBoundary>;
  }

  if (!reservation) {
    return (
      <Alert kind="error">
        Rezervasyon kaydı bulunamadı. <Link to="/panel/rezervasyonlar">Listeye dönün</Link>.
      </Alert>
    );
  }

  const paid = totalPaid(reservation, payments);
  const remaining = remainingBalance(reservation, payments);
  const isPast = reservation.date < todayIso();

  async function addPayment(e: React.FormEvent) {
    e.preventDefault();
    setPayError('');
    const amount = Number(payForm.amount);
    if (!payForm.amount || !Number.isFinite(amount) || amount <= 0) {
      setPayError('Geçerli bir tahsilat tutarı giriniz.');
      return;
    }
    if (amount > remaining) {
      setPayError(`Tahsilat tutarı kalan alacaktan (${formatMoney(remaining, reservation!.currency)}) fazla olamaz.`);
      return;
    }
    try {
      await addPaymentMutation.mutateAsync({
        id: crypto.randomUUID(),
        reservationId: reservation!.id,
        date: payForm.date,
        amount,
        method: payForm.method as Payment['method'],
        note: payForm.note.trim() || undefined,
        createdAt: new Date().toISOString(),
      });
      setPayForm({ date: todayIso(), amount: '', method: 'Nakit', note: '' });
    } catch (err) {
      setPayError(errorMessage(err));
    }
  }

  async function removePayment() {
    if (!paymentToDelete) return;
    const target = paymentToDelete;
    setPaymentToDelete(null);
    try {
      await deletePaymentMutation.mutateAsync(target.id);
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  async function removeReservation() {
    setConfirmDelete(false);
    try {
      await deleteReservationMutation.mutateAsync(reservation!.id);
      navigate('/panel/rezervasyonlar', { replace: true });
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  async function sendReminder() {
    const result = await sendSmsMutation.mutateAsync({
      to: reservation!.customerPhone,
      body: `Sayin ${reservation!.customerName}, ${formatDate(reservation!.date)} tarihli rezervasyonunuz icin hatirlatma. Kalan bakiye: ${remaining.toLocaleString('tr-TR')} TL. Kod: ${reservation!.code}`,
      kind: 'Hatırlatma',
      // Randevu hatırlatma işlem bildirimidir: İYS onayı gerekmez.
      category: 'islem',
      reservationId: reservation!.id,
    });
    if (result.sent) {
      setSmsSent(true);
      window.setTimeout(() => setSmsSent(false), 4000);
    } else if (result.blocked) {
      setActionError(result.error ?? 'Mesaj gönderilemedi.');
    } else {
      setActionError(
        result.notConfigured
          ? 'SMS sağlayıcısı tanımlı olmadığı için mesaj şu an gönderilemedi; kuyrukta bekliyor ve otomatik olarak yeniden denenecek.'
          : result.error ?? 'Mesaj kuyruğa alındı, gönderim yeniden denenecek.',
      );
    }
  }

  return (
    <>
      <Seo title={`${reservation.customerName} - Rezervasyon Detayı`} noindex />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-brand">{reservation.customerName}</h1>
          <p className="mt-1 text-sm text-brand-muted">
            <span className="font-mono">{reservation.code}</span> · {formatDateLong(reservation.date)} · {reservation.slot}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/panel/rezervasyonlar/${reservation.id}/sozlesme`} className="btn-outline btn-sm">
            <IconPrint size={16} /> Sözleşme
          </Link>
          {can('kasa.duzenle') && (
            <Link to={`/panel/faturalar?rezervasyon=${reservation.id}`} className="btn-outline btn-sm">
              <IconReport size={16} /> Fatura Kes
            </Link>
          )}
          <button type="button" onClick={() => { void sendReminder(); }} className="btn-outline btn-sm">
            <IconMessage size={16} /> SMS Gönder
          </button>
          {can('rezervasyon.duzenle') && (
            <Link to={`/panel/rezervasyonlar/${reservation.id}/duzenle`} className="btn-primary btn-sm text-white hover:text-white">
              <IconEdit size={16} /> Düzenle
            </Link>
          )}
          {can('rezervasyon.sil') && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="btn btn-sm border-2 border-[#e74c3c] text-[#e74c3c] hover:bg-[#e74c3c] hover:text-white"
              disabled={isPast}
              title={isPast ? 'Geçmiş tarihli kayıt silinemez' : undefined}
            >
              <IconTrash size={16} /> Sil
            </button>
          )}
        </div>
      </div>

      {smsSent && <Alert kind="success" className="mb-5">SMS gönderildi ve kayıtlara işlendi.</Alert>}
      {actionError && <Alert kind="error" className="mb-5">{actionError}</Alert>}
      {isPast && can('rezervasyon.sil') && (
        <Alert kind="info" className="mb-5">
          Geçmiş tarihli düğünü silemezsiniz. Silmek için kaydın tarihini bugünden ileri bir tarihe alıp kaydettikten
          sonra silme işlemini yapabilirsiniz.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <h2 className="mb-4 font-heading text-lg font-bold text-brand">Rezervasyon Bilgileri</h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Info label="Müşteri" value={reservation.customerName} />
            <Info label="İkinci Kişi" value={reservation.secondPersonName || '—'} />
            <Info label="Telefon" value={formatPhone(reservation.customerPhone)} />
            <Info label="E-Posta" value={reservation.customerEmail || '—'} />
            <Info label="Tarih / Seans" value={`${formatDateLong(reservation.date)} · ${reservation.slot}`} />
            <Info label="Organizasyon" value={reservation.organizationType} />
            <Info label="Davetli Sayısı" value={`${reservation.guestCount} kişi`} />
            <Info label="Durum" value={reservation.status} />
            <Info label="Adres" value={reservation.address || '—'} className="sm:col-span-2" />
            <Info label="Not" value={reservation.note || '—'} className="sm:col-span-2" />
          </dl>

          {reservation.services.length > 0 && (
            <>
              <h3 className="mb-2 mt-6 font-heading font-semibold text-brand">Hizmetler</h3>
              <ul className="flex flex-wrap gap-2">
                {reservation.services.map((s) => (
                  <li key={s} className="rounded-full bg-surface px-3 py-1 text-xs text-brand">{s}</li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="card p-5">
          <h2 className="mb-4 font-heading text-lg font-bold text-brand">Ödeme Durumu</h2>
          <dl className="space-y-3">
            <Money label="Toplam Tutar" value={formatMoney(reservation.totalAmount, reservation.currency)} />
            <Money label="Kaparo" value={formatMoney(reservation.deposit, reservation.currency)} />
            <Money label="Toplam Tahsilat" value={formatMoney(paid, reservation.currency)} tone="success" />
            <Money label="Kalan Alacak" value={formatMoney(remaining, reservation.currency)} tone={remaining > 0 ? 'danger' : 'success'} />
          </dl>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-surface">
            <div
              className="h-full bg-[#18d26e]"
              style={{ width: `${reservation.totalAmount > 0 ? Math.min(100, (paid / reservation.totalAmount) * 100) : 0}%` }}
              role="progressbar"
              aria-valuenow={reservation.totalAmount > 0 ? Math.round((paid / reservation.totalAmount) * 100) : 0}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Tahsilat oranı"
            />
          </div>
        </section>
      </div>

      <section className="card mt-6 p-5">
        <h2 className="mb-4 font-heading text-lg font-bold text-brand">Tahsilatlar</h2>

        {can('kasa.duzenle') && remaining > 0 && (
          <form onSubmit={(e) => { void addPayment(e); }} noValidate className="mb-5 grid gap-3 rounded-md bg-surface p-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label htmlFor="pay-date" className="field-label">Tarih</label>
              <input id="pay-date" type="date" className="field-input" value={payForm.date} onChange={(e) => setPayForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="pay-amount" className="field-label">Tutar</label>
              <input id="pay-amount" inputMode="decimal" className="field-input" value={payForm.amount} onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))} aria-invalid={Boolean(payError)} />
            </div>
            <div>
              <label htmlFor="pay-method" className="field-label">Ödeme Şekli</label>
              <select id="pay-method" className="field-input" value={payForm.method} onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value }))}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="pay-note" className="field-label">Açıklama</label>
              <input id="pay-note" className="field-input" value={payForm.note} onChange={(e) => setPayForm((f) => ({ ...f, note: e.target.value }))} />
            </div>
            <div className="flex items-end">
              <button type="submit" className="btn-primary w-full text-white hover:text-white">
                <IconPlus size={16} /> Ekle
              </button>
            </div>
            {payError && <p className="sm:col-span-2 lg:col-span-5 text-xs text-[#e74c3c]" role="alert">{payError}</p>}
          </form>
        )}

        {payments.length === 0 ? (
          <p className="py-6 text-center text-sm text-brand-muted">Kaparo dışında tahsilat kaydı bulunmuyor.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase text-brand-muted">
                  <th className="pb-2 font-medium">Tarih</th>
                  <th className="pb-2 font-medium">Ödeme Şekli</th>
                  <th className="pb-2 font-medium">Açıklama</th>
                  <th className="pb-2 text-right font-medium">Tutar</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-line/60 last:border-0">
                    <td className="py-2.5 text-brand">{formatDate(p.date)}</td>
                    <td className="py-2.5 text-brand">{p.method}</td>
                    <td className="py-2.5 text-brand-muted">{p.note || '—'}</td>
                    <td className="py-2.5 text-right font-medium text-brand">{formatMoney(p.amount, reservation.currency)}</td>
                    <td className="py-2.5 text-right">
                      {can('kasa.duzenle') && (
                        <button type="button" onClick={() => setPaymentToDelete(p)} aria-label="Tahsilatı sil" className="rounded p-1 text-brand-muted hover:text-[#e74c3c]">
                          <IconTrash size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirmDelete}
        title="Rezervasyon kaydını silmek istiyor musunuz?"
        description="Bu işlem geri alınamaz. Kayıt ve ilgili tüm tahsilatlar silinecektir."
        confirmLabel="Evet, sil"
        onConfirm={() => { void removeReservation(); }}
        onCancel={() => setConfirmDelete(false)}
      />
      <ConfirmDialog
        open={Boolean(paymentToDelete)}
        title="Tahsilat kaydını silmek istiyor musunuz?"
        description={paymentToDelete ? `${formatDate(paymentToDelete.date)} · ${formatMoney(paymentToDelete.amount, reservation.currency)}` : ''}
        confirmLabel="Evet, sil"
        onConfirm={() => { void removePayment(); }}
        onCancel={() => setPaymentToDelete(null)}
      />
    </>
  );
}

function Info({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs uppercase tracking-wide text-brand-muted">{label}</dt>
      <dd className="mt-0.5 text-brand">{value}</dd>
    </div>
  );
}

function Money({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'danger' }) {
  const color = tone === 'success' ? 'text-[#15803d]' : tone === 'danger' ? 'text-[#b91c1c]' : 'text-brand';
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-sm text-brand-muted">{label}</dt>
      <dd className={`font-heading font-bold ${color}`}>{value}</dd>
    </div>
  );
}
