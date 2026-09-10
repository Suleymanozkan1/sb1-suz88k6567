import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import Seo from '../../components/Seo';
import Alert from '../../components/Alert';
import { useBusinesses, useMenus, useReservation, useReservationsWithBalances } from '../../lib/queries';
import { QueryBoundary } from '../../components/QueryState';
import { remainingBalance, totalPaid } from '../../lib/money';
import { formatDate, formatDateLong, formatMoney, formatPhone, formatTimeRange, todayIso } from '../../lib/format';
import { contractParties } from '../../lib/reports';
import { sozlesmeSartlari } from '../../data/sozlesme';
import { IconPrint } from '../../components/Icons';

/**
 * Salon Kiralama Sözleşmesi.
 *
 * Düzen işletmenin kendi basılı sözleşmesini izler: üstte adres bloğu,
 * ortada salon adı, solda bilgi sütunu, sağda menü içeriği, altta
 * sözleşme şartları ve imza yerleri. Tek sayfaya sığması gözetilmiştir;
 * salon çalışanı bunu yazıcıdan alıp müşteriye imzalatır.
 *
 * Boş kalan satır hiç yazılmaz. "TC : -" yazan bir sözleşme, doldurulmayı
 * bekleyen bir form gibi görünür.
 */
export default function Sozlesme() {
  const { id } = useParams();
  const reservationQuery = useReservation(id);
  const { balance, isLoading: listLoading } = useReservationsWithBalances();
  const { data: businesses = [] } = useBusinesses();
  const { data: menus = [] } = useMenus();

  const reservation = reservationQuery.data ?? undefined;
  const business = useMemo(
    () => businesses.find((b) => b.id === reservation?.businessId),
    [businesses, reservation],
  );
  const menu = useMemo(
    () => menus.find((m) => m.id === reservation?.menuId),
    [menus, reservation],
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

  // Ödeme satırındaki tarih: son tahsilatın günü, hiç tahsilat yoksa
  // kaydın açıldığı gün (kapora o gün alınmıştır).
  const sonOdemeTarihi = payments.length > 0
    ? payments.map((p) => p.date).sort().slice(-1)[0]
    : (reservation.createdAt || '').slice(0, 10);

  const saat = formatTimeRange(reservation.startTime, reservation.endTime);
  const sartlar = sozlesmeSartlari(business?.city ?? '');

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

      <article className="print-area card mx-auto max-w-3xl bg-white p-8 text-[13px] leading-snug text-black">
        <header className="mb-6 flex items-start justify-between gap-6">
          <p className="font-heading text-sm font-bold uppercase text-black">{business?.name ?? ''}</p>
          <address className="text-right text-[11px] not-italic leading-tight">
            {business?.address && <span className="block">{business.address}</span>}
            {(business?.district || business?.city) && (
              <span className="block">{[business?.district, business?.city].filter(Boolean).join(' / ')}</span>
            )}
            {business?.phone && <span className="block">Tel/Cep: {formatPhone(business.phone)}</span>}
            {business?.instagram && <span className="block">instagram.com/{business.instagram}</span>}
          </address>
        </header>

        <h2 className="mb-6 text-center font-heading text-xl font-bold text-black">
          {business?.name ?? 'Salon Kiralama Sözleşmesi'}
        </h2>

        <div className="mb-6 grid gap-6 sm:grid-cols-[1.05fr_1fr]">
          <dl className="space-y-0.5">
            <Satir label="Tarih" value={formatDateLong(reservation.date)} />
            <Satir label="Saat" value={saat} />
            <Satir label="Sözleşme No" value={reservation.code} mono />
            <Satir label="İşletme" value={business?.name ?? ''} />
            <Satir label="Ad Soyad" value={reservation.customerName} />
            <Satir label="TC" value={reservation.identityNo ?? ''} mono />
            <Satir label="Cep Telefonu" value={formatPhone(reservation.customerPhone)} />
            <Satir
              label="Gelin ve Damat"
              value={reservation.secondPersonName ? contractParties(reservation) : ''}
            />
            <Satir label="Gelin Cep" value={reservation.secondPhone ? formatPhone(reservation.secondPhone) : ''} />
            <Satir label="Adres" value={reservation.address ?? ''} />
            <Satir label="Rez. Türü" value={reservation.organizationType} />
            <Satir label="Davetli Sayısı" value={String(reservation.guestCount)} />
            <Satir label="Toplam Fiyat" value={formatMoney(reservation.totalAmount, reservation.currency)} />
            <Satir
              label="Ödeme"
              value={paid > 0
                ? `${formatMoney(paid, reservation.currency)}${sonOdemeTarihi ? ` (${formatDate(sonOdemeTarihi)})` : ''}`
                : ''}
            />
            <Satir label="Bakiye" value={formatMoney(remaining, reservation.currency)} />
          </dl>

          {/*
            Menü içeriği Menüler ekranındaki açıklamadan gelir. Büyük harfle
            yazılan satırlar (ANA YEMEK, TATLI…) başlık sayılıp kalın çıkar.
          */}
          <div className="border-black pl-4 sm:border-l">
            {menu ? (
              <>
                <p className="mb-1 font-bold">{menu.name}</p>
                {menu.description.split('\n').map((satir, i) => (
                  <p key={i} className={basliksaMi(satir) ? 'font-semibold' : ''}>{satir}</p>
                ))}
              </>
            ) : (
              <p className="text-black/60">Menü seçilmemiştir.</p>
            )}
            {reservation.services.length > 0 && (
              <div className="mt-2">
                <p className="font-semibold">EK HİZMETLER</p>
                {reservation.services.map((s) => <p key={s}>- {s}</p>)}
              </div>
            )}
          </div>
        </div>

        <section className="border-t border-black pt-3">
          <h3 className="mb-1 font-heading text-sm font-bold uppercase text-black">Sözleşme Şartları</h3>
          <p className="text-justify text-[11px] leading-snug">
            {sartlar.map((madde, i) => (
              <span key={i}>{i + 1}. ) {madde}{' '}</span>
            ))}
          </p>
        </section>

        {reservation.note && (
          <section className="mt-3">
            <h3 className="mb-1 font-heading text-sm font-bold uppercase text-black">Özel Notlar</h3>
            <p className="whitespace-pre-line text-[11px]">{reservation.note}</p>
          </section>
        )}

        <footer className="mt-8 grid gap-8 sm:grid-cols-2">
          <div className="text-center text-[12px]">
            <p>Kiraya Veren İmza</p>
            <p className="mt-10 font-semibold uppercase">{business?.name ?? ''}</p>
          </div>
          <div className="text-center text-[12px]">
            <p>Kiralayan İmza</p>
            <p className="mt-10 font-semibold uppercase">{reservation.customerName}</p>
          </div>
        </footer>

        <p className="mt-8 flex justify-between border-t border-black pt-1 text-[10px] font-semibold">
          <span>{formatDate(todayIso())}</span>
          <span>{business?.name ?? ''}</span>
          <span>1/1</span>
        </p>
      </article>
    </>
  );
}

/** Menü açıklamasında büyük harfle yazılan satır başlıktır. */
function basliksaMi(satir: string): boolean {
  const temiz = satir.trim();
  if (!temiz || temiz.startsWith('-')) return false;
  return temiz === temiz.toLocaleUpperCase('tr-TR');
}

/** Değeri boş olan satır sözleşmeye hiç basılmaz. */
function Satir({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  if (!value.trim()) return null;
  return (
    <div className="flex gap-2">
      <dt className="w-32 shrink-0 text-right text-black/80">{label} :</dt>
      <dd className={mono ? 'font-mono' : ''}>{value}</dd>
    </div>
  );
}
