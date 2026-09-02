import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import Seo from '../../components/Seo';
import Alert from '../../components/Alert';
import { useBusinesses, useReservation, useReservationsWithBalances } from '../../lib/queries';
import { QueryBoundary } from '../../components/QueryState';
import { remainingBalance, totalPaid } from '../../lib/money';
import { formatDateLong, formatMoney, formatPhone } from '../../lib/format';
import { IconPrint } from '../../components/Icons';

/** Salon Kiralama Sözleşmesi — yazdırılabilir çıktı */
export default function Sozlesme() {
  const { id } = useParams();
  const reservationQuery = useReservation(id);
  const { balance, isLoading: listLoading } = useReservationsWithBalances();
  const { data: businesses = [] } = useBusinesses();

  const reservation = reservationQuery.data ?? undefined;
  const business = useMemo(
    () => businesses.find((b) => b.id === reservation?.businessId),
    [businesses, reservation],
  );

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

  const payments = balance.paymentsOf(reservation.id);
  const paid = totalPaid(reservation, payments);
  const remaining = remainingBalance(reservation, payments);

  return (
    <>
      <Seo title="Salon Kiralama Sözleşmesi" noindex />

      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold text-brand">Salon Kiralama Sözleşmesi</h1>
        <div className="flex gap-2">
          <Link to={`/panel/rezervasyonlar/${reservation.id}`} className="btn-outline btn-sm">Geri dön</Link>
          <button type="button" onClick={() => window.print()} className="btn-primary btn-sm text-white hover:text-white">
            <IconPrint size={16} /> Yazdır
          </button>
        </div>
      </div>

      <article className="print-area card mx-auto max-w-3xl p-8 text-sm leading-relaxed text-black">
        <header className="mb-6 border-b border-line pb-4 text-center">
          <h2 className="font-heading text-xl font-bold text-brand">SALON KİRALAMA SÖZLEŞMESİ</h2>
          <p className="mt-1 text-xs text-brand-muted">Sözleşme No: {reservation.code}</p>
        </header>

        <section className="mb-5">
          <h3 className="mb-2 font-heading font-bold text-brand">1. TARAFLAR</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="font-semibold">KİRAYA VEREN</p>
              <p>{business?.name ?? '—'}</p>
              <p>{business?.address ?? `${business?.district ?? ''} / ${business?.city ?? ''}`}</p>
              <p>Tel: {business ? formatPhone(business.phone) : '—'}</p>
            </div>
            <div>
              <p className="font-semibold">KİRACI</p>
              <p>{reservation.customerName}</p>
              {reservation.secondPersonName && <p>{reservation.secondPersonName}</p>}
              <p>{reservation.address ?? '—'}</p>
              <p>Tel: {formatPhone(reservation.customerPhone)}</p>
            </div>
          </div>
        </section>

        <section className="mb-5">
          <h3 className="mb-2 font-heading font-bold text-brand">2. ORGANİZASYON BİLGİLERİ</h3>
          <table className="w-full border-collapse text-sm">
            <tbody>
              <Row label="Organizasyon Türü" value={reservation.organizationType} />
              <Row label="Tarih" value={formatDateLong(reservation.date)} />
              <Row label="Seans" value={reservation.slot} />
              <Row label="Davetli Sayısı" value={`${reservation.guestCount} kişi`} />
              <Row label="Salon" value={business?.name ?? '—'} />
              {reservation.services.length > 0 && <Row label="Dahil Hizmetler" value={reservation.services.join(', ')} />}
            </tbody>
          </table>
        </section>

        <section className="mb-5">
          <h3 className="mb-2 font-heading font-bold text-brand">3. ÜCRET VE ÖDEME</h3>
          <table className="w-full border-collapse text-sm">
            <tbody>
              <Row label="Toplam Kira Bedeli" value={formatMoney(reservation.totalAmount, reservation.currency)} />
              <Row label="Alınan Kaparo" value={formatMoney(reservation.deposit, reservation.currency)} />
              <Row label="Toplam Tahsilat" value={formatMoney(paid, reservation.currency)} />
              <Row label="Kalan Bakiye" value={formatMoney(remaining, reservation.currency)} />
            </tbody>
          </table>
          <p className="mt-2 text-xs">
            Kalan bakiyenin organizasyon tarihinden önce ödenmesi esastır. Ödemeler nakit, kredi kartı veya havale/EFT
            yoluyla yapılabilir.
          </p>
        </section>

        <section className="mb-5">
          <h3 className="mb-2 font-heading font-bold text-brand">4. GENEL HÜKÜMLER</h3>
          <ol className="list-decimal space-y-1.5 pl-5 text-xs">
            <li>Kiracı, belirtilen tarih ve seansta salonu kullanma hakkına sahiptir.</li>
            <li>Kaparo, kiracının organizasyonu iptal etmesi hâlinde iade edilmez.</li>
            <li>Davetli sayısının sözleşmede belirtilen sayıyı aşması hâlinde kişi başı ek ücret uygulanır.</li>
            <li>Salona ve demirbaşlara verilecek zararlardan kiracı sorumludur.</li>
            <li>Kiraya veren, mücbir sebep hâlinde tarihi karşılıklı mutabakat ile değiştirebilir.</li>
            <li>Taraflar arasında doğacak uyuşmazlıklarda {business?.city ?? '—'} Mahkemeleri ve İcra Daireleri yetkilidir.</li>
            <li>İşbu sözleşme iki nüsha olarak düzenlenmiş ve taraflarca imzalanmıştır.</li>
          </ol>
        </section>

        {reservation.note && (
          <section className="mb-5">
            <h3 className="mb-2 font-heading font-bold text-brand">5. ÖZEL NOTLAR</h3>
            <p className="text-xs">{reservation.note}</p>
          </section>
        )}

        <footer className="mt-10 grid gap-8 sm:grid-cols-2">
          <div className="text-center">
            <p className="mb-12 text-xs font-semibold">KİRAYA VEREN</p>
            <p className="border-t border-black pt-1 text-xs">{business?.name ?? ''}</p>
          </div>
          <div className="text-center">
            <p className="mb-12 text-xs font-semibold">KİRACI</p>
            <p className="border-t border-black pt-1 text-xs">{reservation.customerName}</p>
          </div>
        </footer>
      </article>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-line/70">
      <th scope="row" className="w-1/3 py-1.5 text-left font-medium text-brand-muted">{label}</th>
      <td className="py-1.5">{value}</td>
    </tr>
  );
}
