import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Seo from '../../components/Seo';
import Alert from '../../components/Alert';
import ConfirmDialog from '../../components/ConfirmDialog';
import MasaDuzeni from '../../components/MasaDuzeni';
import IsEmri from '../../components/IsEmri';
import TedarikciAtama from '../../components/TedarikciAtama';
import HatirlatmaGonder from '../../components/HatirlatmaGonder';
import DugunGiderleri from '../../components/DugunGiderleri';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../lib/authHelpers';
import {
  useAddPayment, useDeletePayment, useDeleteReservation,
  useReservation, useReservationsWithBalances, useUpdatePayment, useWeather,
} from '../../lib/queries';
import { kasayaGirdiMi } from '../../lib/odemeOlayi';
import { havaMetni, tahminBul } from '../../lib/hava';
import OdemeGecmisi from '../../components/OdemeGecmisi';
import { QueryBoundary } from '../../components/QueryState';
import { remainingBalance, totalPaid } from '../../lib/money';
import { formatDate, formatDateLong, formatMoney, formatPhone, formatTimeRange, todayIso } from '../../lib/format';
import { PAYMENT_METHODS } from '../../data/constants';
import { IconEdit, IconPlus, IconPrint, IconReport, IconTrash } from '../../components/Icons';
import type { Payment } from '../../types';

export default function RezervasyonDetay() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const reservationQuery = useReservation(id);
  const { balance, isLoading: listLoading } = useReservationsWithBalances();
  const addPaymentMutation = useAddPayment();
  const updatePaymentMutation = useUpdatePayment();
  const deletePaymentMutation = useDeletePayment();
  const deleteReservationMutation = useDeleteReservation();
  const { data: havaTahminleri = [] } = useWeather();
  const [actionError, setActionError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<Payment | null>(null);

  const [payForm, setPayForm] = useState({ date: todayIso(), amount: '', method: 'Nakit', note: '' });
  const [payError, setPayError] = useState('');
  const [duzenlenen, setDuzenlenen] = useState<
    { id: string; date: string; amount: string; method: string; note: string } | null
  >(null);
  /*
    Madde 9: kaydedilen tahsilat kasaya GİRMEDİYSE (çek/senet) uyarı
    çıkıyor. Kasaya giren bir tahsilatta uyarı yok; her kayıtta pencere
    açan bir sistem birkaç günde tıklanmadan geçilir hâle gelir.
  */
  const [kasaUyarisi, setKasaUyarisi] = useState<Payment | null>(null);

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
      const kayit: Payment = {
        id: crypto.randomUUID(),
        reservationId: reservation!.id,
        date: payForm.date,
        amount,
        method: payForm.method as Payment['method'],
        note: payForm.note.trim() || undefined,
        createdAt: new Date().toISOString(),
      };
      await addPaymentMutation.mutateAsync(kayit);
      setPayForm({ date: todayIso(), amount: '', method: 'Nakit', note: '' });
      if (!kasayaGirdiMi(kayit.method)) setKasaUyarisi(kayit);
    } catch (err) {
      setPayError(errorMessage(err));
    }
  }

  function duzenlemeyeAl(p: Payment) {
    setPayError('');
    setDuzenlenen({
      id: p.id, date: p.date, amount: String(p.amount),
      method: p.method, note: p.note ?? '',
    });
  }

  async function tahsilatGuncelle(e: React.FormEvent) {
    e.preventDefault();
    setPayError('');
    if (!duzenlenen) return;

    const onceki = payments.find((p) => p.id === duzenlenen.id);
    if (!onceki) { setDuzenlenen(null); return; }

    const amount = Number(duzenlenen.amount);
    if (!duzenlenen.amount || !Number.isFinite(amount) || amount <= 0) {
      setPayError('Geçerli bir tahsilat tutarı giriniz.');
      return;
    }
    // Kendi eski tutarı kalan alacağa geri ekleniyor; yoksa bir tahsilatı
    // yükseltmek kendi tutarı kadar imkânsız görünürdü.
    const tavan = remaining + onceki.amount;
    if (amount > tavan) {
      setPayError(`Tahsilat tutarı kalan alacaktan (${formatMoney(tavan, reservation!.currency)}) fazla olamaz.`);
      return;
    }

    try {
      const kayit: Payment = {
        ...onceki,
        date: duzenlenen.date,
        amount,
        method: duzenlenen.method as Payment['method'],
        note: duzenlenen.note.trim() || undefined,
      };
      await updatePaymentMutation.mutateAsync(kayit);
      setDuzenlenen(null);
      if (!kasayaGirdiMi(kayit.method)) setKasaUyarisi(kayit);
    } catch (err) {
      setPayError(errorMessage(err));
    }
  }

  /** Uyarıdaki "kasaya gönder": tahsilatı nakde çevirip kasaya alır. */
  async function kasayaGonder() {
    const hedef = kasaUyarisi;
    setKasaUyarisi(null);
    if (!hedef) return;
    try {
      await updatePaymentMutation.mutateAsync({ ...hedef, method: 'Nakit' });
    } catch (err) {
      setActionError(errorMessage(err));
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
          {can('rezervasyon.duzenle') && (
            <Link to={`/panel/rezervasyonlar/${reservation.id}/duzenle`} className="btn-primary btn-sm text-white hover:text-white">
              <IconEdit size={16} /> Düzenle
            </Link>
          )}
          {can('rezervasyon.sil') && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="btn btn-sm border-2 border-danger text-danger hover:bg-danger hover:text-white"
              disabled={isPast}
              title={isPast ? 'Geçmiş tarihli kayıt silinemez' : undefined}
            >
              <IconTrash size={16} /> Sil
            </button>
          )}
        </div>
      </div>

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
            <Info label="İkinci Kişi" value={reservation.secondPersonName || '-'} />
            <Info label="Telefon" value={formatPhone(reservation.customerPhone)} />
            <Info label="İkinci Kişi Telefonu" value={reservation.secondPhone ? formatPhone(reservation.secondPhone) : '-'} />
            <Info label="E-Posta" value={reservation.customerEmail || '-'} />
            <Info label="TC Kimlik No" value={reservation.identityNo || '-'} />
            <Info label="Tarih / Seans" value={`${formatDateLong(reservation.date)} · ${reservation.slot}`} />
            <Info label="Saat" value={formatTimeRange(reservation.startTime, reservation.endTime) || '-'} />
            <Info label="Organizasyon" value={reservation.organizationType} />
            <Info label="Davetli Sayısı" value={`${reservation.guestCount} kişi`} />
            <Info label="Durum" value={reservation.status} />
            {/*
              Organizasyon gününün hava tahmini (madde 29). Sağlayıcı
              uzak tarihlere tahmin vermiyor; o zaman rakam değil AÇIK
              BİR MESAJ yazıyor. Boş bırakılsaydı alan hiç doldurulmamış
              gibi görünürdü.
            */}
            <Info
              label="Hava durumu"
              value={havaMetni(tahminBul(havaTahminleri, reservation.date))}
            />
            <Info label="Adres" value={reservation.address || '-'} className="sm:col-span-2" />
            <Info
              label="Bize nereden ulaştı"
              value={reservation.sourceChannel
                ? `${reservation.sourceChannel}${reservation.sourceDetail ? ` · ${reservation.sourceDetail}` : ''}`
                : '-'}
              className="sm:col-span-2"
            />
            <Info label="Not" value={reservation.note || '-'} className="sm:col-span-2" />
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
            <Money label="Kapora" value={formatMoney(reservation.deposit, reservation.currency)} />
            <Money label="Toplam Tahsilat" value={formatMoney(paid, reservation.currency)} tone="success" />
            <Money label="Kalan Alacak" value={formatMoney(remaining, reservation.currency)} tone={remaining > 0 ? 'danger' : 'success'} />
          </dl>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-surface">
            <div
              className="h-full bg-success"
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
            {payError && <p className="sm:col-span-2 lg:col-span-5 text-xs text-danger" role="alert">{payError}</p>}
          </form>
        )}

        {payments.length === 0 ? (
          <p className="py-6 text-center text-sm text-brand-muted">Kapora dışında tahsilat kaydı bulunmuyor.</p>
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
                {payments.map((p) => (duzenlenen?.id === p.id ? (
                  <tr key={p.id} className="border-b border-line/60 bg-surface last:border-0">
                    <td className="py-2" colSpan={5}>
                      <form onSubmit={(e) => { void tahsilatGuncelle(e); }} noValidate
                        className="grid gap-2 p-2 sm:grid-cols-2 lg:grid-cols-5">
                        <div>
                          <label htmlFor="duz-date" className="field-label">Tarih</label>
                          <input id="duz-date" type="date" className="field-input" value={duzenlenen.date}
                            onChange={(e) => setDuzenlenen((d) => (d ? { ...d, date: e.target.value } : d))} />
                        </div>
                        <div>
                          <label htmlFor="duz-amount" className="field-label">Tutar</label>
                          <input id="duz-amount" inputMode="decimal" className="field-input"
                            value={duzenlenen.amount}
                            onChange={(e) => setDuzenlenen((d) => (d ? { ...d, amount: e.target.value } : d))} />
                        </div>
                        <div>
                          <label htmlFor="duz-method" className="field-label">Ödeme Şekli</label>
                          <select id="duz-method" className="field-input" value={duzenlenen.method}
                            onChange={(e) => setDuzenlenen((d) => (d ? { ...d, method: e.target.value } : d))}>
                            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </div>
                        <div>
                          <label htmlFor="duz-note" className="field-label">Açıklama</label>
                          <input id="duz-note" className="field-input" value={duzenlenen.note}
                            onChange={(e) => setDuzenlenen((d) => (d ? { ...d, note: e.target.value } : d))} />
                        </div>
                        <div className="flex items-end gap-2">
                          <button type="submit" className="btn-primary flex-1 text-white hover:text-white">
                            Kaydet
                          </button>
                          <button type="button" className="btn-secondary" onClick={() => setDuzenlenen(null)}>
                            Vazgeç
                          </button>
                        </div>
                        {payError && <p className="text-xs text-danger sm:col-span-2 lg:col-span-5" role="alert">{payError}</p>}
                      </form>
                    </td>
                  </tr>
                ) : (
                  <tr key={p.id} className="border-b border-line/60 last:border-0">
                    <td className="py-2.5 text-brand">{formatDate(p.date)}</td>
                    <td className="py-2.5 text-brand">
                      {p.method}
                      {/*
                        Çek ve senet kasaya GİRMEZ: tahsil edilmemiş bir
                        vaattir. Satırda görünmezse o para kasadaymış gibi
                        sayılır ve olmayan paraya göre karar alınır.
                      */}
                      {!kasayaGirdiMi(p.method) && (
                        <span className="ml-2 rounded bg-[#fef3c7] px-1.5 py-0.5 text-[11px] text-[#92400e]">
                          kasaya girmedi
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-brand-muted">{p.note || '-'}</td>
                    <td className="py-2.5 text-right font-medium text-brand">{formatMoney(p.amount, reservation.currency)}</td>
                    <td className="py-2.5 text-right">
                      <Link
                        to={`/panel/rezervasyonlar/${reservation.id}/makbuz?tahsilat=${p.id}`}
                        className="mr-1 text-xs text-brand underline"
                      >
                        Makbuz
                      </Link>
                      {can('kasa.duzenle') && (
                        <>
                          <button type="button" onClick={() => duzenlemeyeAl(p)}
                            aria-label={`${formatDate(p.date)} tahsilatını düzenle`}
                            className="rounded p-1 text-brand-muted hover:text-brand">
                            <IconEdit size={15} />
                          </button>
                          <button type="button" onClick={() => setPaymentToDelete(p)} aria-label="Tahsilatı sil" className="rounded p-1 text-brand-muted hover:text-danger">
                            <IconTrash size={15} />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/*
        Düğün içi giderler tahsilatların hemen altında: ikisi birlikte
        "elime ne geçecek" sorusunun cevabını veriyor.
      */}
      <DugunGiderleri
        reservation={reservation}
        payments={payments}
        kalanBakiye={remaining}
        duzenlenebilir={can('kasa.duzenle')}
      />

      {/* Para hareketleri bitti; ne değiştiği hemen altında duruyor. */}
      {can('kasa.goruntule') && (
        <OdemeGecmisi reservationId={reservation.id} currency={reservation.currency} />
      )}

      <HatirlatmaGonder reservation={reservation} payments={payments} />

      <section className="card mb-6 p-5">
        <h2 className="mb-1 font-heading text-lg font-bold text-brand">Etkinlik İş Emri</h2>
        <p className="mb-4 text-sm text-brand-muted">
          Organizasyon gününün saat saat planı: hangi iş, ne zaman, kimin sorumluluğunda.
        </p>
        <IsEmri reservationId={reservation.id} canEdit={can('rezervasyon.duzenle')} />
      </section>

      <section className="card mb-6 p-5">
        <h2 className="mb-1 font-heading text-lg font-bold text-brand">Ürün ve Hizmet</h2>
        <p className="mb-4 text-sm text-brand-muted">
          Bu organizasyonda çalışacak dış firmalar, geliş saatleri ve ücretleri.
        </p>
        <TedarikciAtama
          reservationId={reservation.id}
          currency={reservation.currency}
          canEdit={can('rezervasyon.duzenle')}
        />
      </section>

      <section className="card mb-6 p-5">
        <h2 className="mb-1 font-heading text-lg font-bold text-brand">Masa Oturma Düzeni</h2>
        <p className="mb-4 text-sm text-brand-muted">
          Davetli sayısına göre masa planı oluşturun; planın koltuk toplamı davetli sayısını
          karşılamıyorsa uyarı gösterilir.
        </p>
        <MasaDuzeni
          reservationId={reservation.id}
          guestCount={reservation.guestCount}
          canEdit={can('rezervasyon.duzenle')}
        />
      </section>

      <ConfirmDialog
        open={confirmDelete}
        title="Rezervasyon kaydını silmek istiyor musunuz?"
        description="Bu işlem geri alınamaz. Kayıt ve ilgili tüm tahsilatlar silinecektir."
        confirmLabel="Evet, sil"
        onConfirm={() => { void removeReservation(); }}
        onCancel={() => setConfirmDelete(false)}
      />
      {/*
        Madde 9: kaydedilen tahsilat kasaya girmediyse sorulur. Kasaya
        giren bir tahsilatta uyarı YOK -- her kayıtta pencere açan bir
        sistem birkaç günde tıklanmadan geçilir hâle gelir.
      */}
      <ConfirmDialog
        open={Boolean(kasaUyarisi)}
        title="Bu tahsilat kasaya girmedi"
        description={kasaUyarisi
          ? `${formatMoney(kasaUyarisi.amount, reservation.currency)} tutarındaki tahsilat `
            + `${kasaUyarisi.method} olarak kaydedildi; tahsil edilmediği için kasa toplamına `
            + 'girmiyor. Para elinize geçtiyse nakde çevirip kasaya gönderebilirsiniz.'
          : ''}
        confirmLabel="Nakde çevir, kasaya gönder"
        cancelLabel="Şimdilik kalsın"
        onConfirm={() => { void kasayaGonder(); }}
        onCancel={() => setKasaUyarisi(null)}
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
