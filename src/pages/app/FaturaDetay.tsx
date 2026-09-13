import { Link, useParams } from 'react-router-dom';
import Seo from '../../components/Seo';
import Alert from '../../components/Alert';
import { QueryBoundary } from '../../components/QueryState';
import { useAuth } from '../../context/AuthContext';
import { useBusinesses, useInvoice, useReservations } from '../../lib/queries';
import { formatDate, formatMoney } from '../../lib/format';
import { fromKurus } from '../../lib/invoice';
import { IconPrint } from '../../components/Icons';

const BELGE_TURU = { 'e-Arsiv': 'e-Arşiv Fatura', 'e-Fatura': 'e-Fatura' } as const;

const DURUM_ADI: Record<string, string> = {
  taslak: 'Taslak', gonderiliyor: 'Gönderiliyor', gonderildi: 'Gönderildi',
  onaylandi: 'Onaylandı', reddedildi: 'Reddedildi', iptal: 'İptal',
};

/**
 * Kesilmiş faturanın görüntüsü (madde 21).
 *
 * Belge ekrandan okunabilir ve yazdırılabilir olmalı: liste satırındaki
 * toplam, "hangi kalemden geldi" sorusunu cevaplamıyor ve müşteri
 * aradığında personelin bakacağı bir yer kalmıyordu.
 *
 * Entegratöre gönderilen resmî belge BU SAYFA DEĞİL; burada görünen,
 * sistemdeki kaydın kendisi. İkisi karışmasın diye durum rozeti belgenin
 * üstünde duruyor.
 */
export default function FaturaDetay() {
  const { id } = useParams();
  const { user, can } = useAuth();
  const { data: fatura, isLoading, error } = useInvoice(id);
  const { data: businesses = [] } = useBusinesses();
  const { data: rezervasyonlar = [] } = useReservations();

  if (!can('kasa.goruntule')) {
    return <Alert kind="error">Faturaları görüntüleme yetkiniz bulunmuyor.</Alert>;
  }

  const isletme = businesses.find((b) => b.id === user?.activeBusinessId) ?? businesses[0];
  const rezervasyon = rezervasyonlar.find((r) => r.id === fatura?.reservationId);

  return (
    <QueryBoundary isLoading={isLoading} error={error}>
      {!fatura ? (
        <Alert kind="error">
          Fatura kaydı bulunamadı. <Link to="/panel/faturalar">Listeye dönün</Link>.
        </Alert>
      ) : (
        <>
          <Seo title={`Fatura ${fatura.invoiceNumber} - Sahra Takip Panel`} noindex />

          <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
            <Link to="/panel/faturalar" className="text-sm text-brand-muted hover:text-brand">
              ← Faturalar
            </Link>
            <button type="button" onClick={() => window.print()} className="btn-outline btn-sm">
              <IconPrint size={16} /> Yazdır
            </button>
          </div>

          <article className="card p-6">
            <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
              <div>
                <h1 className="font-heading text-xl font-bold text-brand">
                  {BELGE_TURU[fatura.kind]}
                </h1>
                <p className="mt-1 font-mono text-sm text-brand-muted">{fatura.invoiceNumber}</p>
              </div>
              <div className="text-right text-sm">
                <p className="text-brand-muted">Düzenleme tarihi</p>
                <p className="font-medium text-brand">{formatDate(fatura.issueDate)}</p>
                <p className="mt-1 text-xs text-brand-muted">Durum: {DURUM_ADI[fatura.status] ?? fatura.status}</p>
              </div>
            </header>

            {fatura.providerError && (
              <Alert kind="error" className="mb-4">{fatura.providerError}</Alert>
            )}

            <div className="mb-6 grid gap-6 sm:grid-cols-2">
              <section>
                <h2 className="mb-2 text-xs uppercase tracking-wide text-brand-muted">Satıcı</h2>
                <p className="font-medium text-brand">{isletme?.name ?? '-'}</p>
                {isletme?.address && <p className="text-sm text-brand-muted">{isletme.address}</p>}
              </section>
              <section>
                <h2 className="mb-2 text-xs uppercase tracking-wide text-brand-muted">Alıcı</h2>
                <p className="font-medium text-brand">{fatura.buyerName}</p>
                {fatura.buyerTaxId && (
                  <p className="text-sm text-brand-muted">
                    {fatura.buyerKind === 'kurumsal' ? 'VKN' : 'TCKN'}: {fatura.buyerTaxId}
                    {fatura.buyerTaxOffice ? ` · ${fatura.buyerTaxOffice}` : ''}
                  </p>
                )}
                {fatura.buyerAddress && <p className="text-sm text-brand-muted">{fatura.buyerAddress}</p>}
                {fatura.buyerEmail && <p className="text-sm text-brand-muted">{fatura.buyerEmail}</p>}
              </section>
            </div>

            {/* Hangi sözleşmeye ait olduğu belgenin üstünde: müşteri arayınca
                personelin ilk baktığı bilgi bu. */}
            {rezervasyon && (
              <p className="mb-4 rounded-md bg-surface px-3 py-2 text-sm text-brand">
                Sözleşme:{' '}
                <Link to={`/panel/rezervasyonlar/${rezervasyon.id}`} className="font-mono">
                  {rezervasyon.code}
                </Link>
                {' · '}{rezervasyon.customerName} · {formatDate(rezervasyon.date)}
              </p>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <caption className="sr-only">Fatura kalemleri</caption>
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase text-brand-muted">
                    <th className="pb-2 font-medium">Açıklama</th>
                    <th className="pb-2 text-right font-medium">Miktar</th>
                    <th className="pb-2 text-right font-medium">Birim Fiyat</th>
                    <th className="pb-2 text-right font-medium">KDV %</th>
                    <th className="pb-2 text-right font-medium">Tutar</th>
                  </tr>
                </thead>
                <tbody>
                  {(fatura.lines ?? []).map((l) => (
                    <tr key={l.lineNo} className="border-b border-line/60 last:border-0">
                      <td className="py-2.5 text-brand">{l.description}</td>
                      <td className="py-2.5 text-right text-brand">{l.quantity} {l.unit}</td>
                      <td className="py-2.5 text-right text-brand">{formatMoney(fromKurus(l.unitPriceKurus))}</td>
                      <td className="py-2.5 text-right text-brand-muted">{l.vatRate}</td>
                      <td className="py-2.5 text-right font-medium text-brand">
                        {formatMoney(fromKurus(l.totalKurus))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <dl className="mt-5 ml-auto max-w-xs space-y-1.5 text-sm">
              <Satir etiket="Matrah" tutar={fatura.baseKurus} />
              {fatura.discountKurus > 0 && <Satir etiket="İskonto" tutar={fatura.discountKurus} />}
              <Satir etiket="KDV" tutar={fatura.vatKurus} />
              <div className="flex justify-between border-t border-line pt-2 font-heading font-bold text-brand">
                <dt>Genel Toplam</dt>
                <dd>{formatMoney(fromKurus(fatura.totalKurus))}</dd>
              </div>
            </dl>
          </article>
        </>
      )}
    </QueryBoundary>
  );
}

function Satir({ etiket, tutar }: { etiket: string; tutar: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-brand-muted">{etiket}</dt>
      <dd className="text-brand">{formatMoney(fromKurus(tutar))}</dd>
    </div>
  );
}
