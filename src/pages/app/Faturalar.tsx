import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Seo from '../../components/Seo';
import Alert from '../../components/Alert';
import ConfirmDialog from '../../components/ConfirmDialog';
import { QueryBoundary } from '../../components/QueryState';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../lib/authHelpers';
import {
  useCancelInvoice, useCreateInvoice, useInvoices, useReservation, useSendInvoice,
} from '../../lib/queries';
import {
  computeInvoice, fromKurus, invoiceDeadlineStatus, isValidTckn, isValidVkn,
  VAT_RATES, type InvoiceLineInput, type VatRate,
} from '../../lib/invoice';
import { formatDate, formatMoney, normalizeTr, todayIso } from '../../lib/format';
import { IconPlus, IconSearch, IconTrash } from '../../components/Icons';
import type { BuyerKind, Invoice } from '../../types';

const STATUS_LABELS: Record<Invoice['status'], string> = {
  taslak: 'Taslak', gonderiliyor: 'Gönderiliyor', gonderildi: 'Gönderildi',
  onaylandi: 'Onaylandı', reddedildi: 'Reddedildi', iptal: 'İptal',
};

const STATUS_STYLES: Record<Invoice['status'], string> = {
  taslak: 'bg-surface text-brand-muted',
  gonderiliyor: 'bg-[#e7f5fb] text-[#0c5e8a]',
  gonderildi: 'bg-[#e8f8ef] text-[#15803d]',
  onaylandi: 'bg-[#e8f8ef] text-[#15803d]',
  reddedildi: 'bg-[#fdecea] text-[#b91c1c]',
  iptal: 'bg-[#fdecea] text-[#b91c1c]',
};

const EMPTY_LINE: InvoiceLineInput = {
  description: '', quantity: 1, unit: 'Adet', unitPrice: 0, discountRate: 0, vatRate: 20,
};

export default function Faturalar() {
  const [params] = useSearchParams();
  const reservationId = params.get('rezervasyon') ?? undefined;

  const { can, isDemoMode } = useAuth();
  const { data, isLoading, error } = useInvoices();
  const reservationQuery = useReservation(reservationId);
  const createMutation = useCreateInvoice();
  const sendMutation = useSendInvoice();
  const cancelMutation = useCancelInvoice();

  const [showForm, setShowForm] = useState(Boolean(reservationId));
  const [query, setQuery] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [toCancel, setToCancel] = useState<Invoice | null>(null);

  const reservation = reservationQuery.data ?? undefined;

  const [buyer, setBuyer] = useState({
    kind: 'bireysel' as BuyerKind, name: '', taxId: '', taxOffice: '', address: '', email: '',
  });
  const [lines, setLines] = useState<InvoiceLineInput[]>([{ ...EMPTY_LINE }]);

  // Rezervasyondan geldiyse alıcı ve satırı önceden doldur
  const prefilled = useMemo(() => {
    if (!reservation || buyer.name) return false;
    setBuyer((b) => ({ ...b, name: reservation.customerName, email: reservation.customerEmail ?? '' }));
    setLines([{
      ...EMPTY_LINE,
      description: `${reservation.organizationType} organizasyonu — ${formatDate(reservation.date)}`,
      unitPrice: reservation.totalAmount,
    }]);
    return true;
  }, [reservation, buyer.name]);
  void prefilled;

  const totals = useMemo(() => computeInvoice(lines), [lines]);

  const invoices = useMemo(() => data ?? [], [data]);
  const filtered = useMemo(() => {
    const q = normalizeTr(query);
    if (!q) return invoices;
    return invoices.filter((i) => normalizeTr(`${i.invoiceNumber} ${i.buyerName}`).includes(q));
  }, [invoices, query]);

  const deadline = reservation ? invoiceDeadlineStatus(reservation.date, todayIso()) : null;

  function updateLine(index: number, patch: Partial<InvoiceLineInput>) {
    setLines((current) => current.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setNotice('');

    if (!buyer.name.trim()) { setFormError('Alıcı adını giriniz.'); return; }
    if (buyer.kind === 'kurumsal') {
      if (!isValidVkn(buyer.taxId)) { setFormError('Geçerli bir vergi kimlik numarası (10 hane) giriniz.'); return; }
    } else if (buyer.taxId && !isValidTckn(buyer.taxId)) {
      setFormError('Geçerli bir T.C. kimlik numarası (11 hane) giriniz.');
      return;
    }
    if (lines.length === 0) { setFormError('En az bir fatura satırı ekleyiniz.'); return; }
    if (lines.some((l) => !l.description.trim())) { setFormError('Tüm satırlarda açıklama zorunludur.'); return; }
    if (lines.some((l) => l.quantity <= 0)) { setFormError('Miktar sıfırdan büyük olmalıdır.'); return; }
    if (totals.totalKurus <= 0) { setFormError('Fatura tutarı sıfırdan büyük olmalıdır.'); return; }

    try {
      const created = await createMutation.mutateAsync({
        reservationId,
        // Alıcı e-Fatura mükellefiyse e-Fatura, değilse e-Arşiv düzenlenir
        kind: buyer.kind === 'kurumsal' ? 'e-Fatura' : 'e-Arsiv',
        serviceDate: reservation?.date,
        buyerKind: buyer.kind,
        buyerName: buyer.name.trim(),
        buyerTaxId: buyer.taxId.replace(/\D/g, '') || undefined,
        buyerTaxOffice: buyer.taxOffice.trim() || undefined,
        buyerAddress: buyer.address.trim() || undefined,
        buyerEmail: buyer.email.trim() || undefined,
        lines,
      });

      const result = await sendMutation.mutateAsync(created.id);
      setNotice(result.sent
        ? `Fatura ${created.invoiceNumber} oluşturuldu ve entegratöre gönderildi.`
        : `Fatura ${created.invoiceNumber} taslak olarak kaydedildi. ${result.reason ?? ''}`);

      setShowForm(false);
      setBuyer({ kind: 'bireysel', name: '', taxId: '', taxOffice: '', address: '', email: '' });
      setLines([{ ...EMPTY_LINE }]);
    } catch (err) {
      setFormError(errorMessage(err));
    }
  }

  async function cancel() {
    if (!toCancel) return;
    const target = toCancel;
    setToCancel(null);
    try {
      await cancelMutation.mutateAsync({ id: target.id, reason: 'Kullanıcı talebiyle iptal edildi' });
    } catch (err) {
      setFormError(errorMessage(err));
    }
  }

  if (!can('kasa.goruntule')) {
    return <Alert kind="error">Faturaları görüntüleme yetkiniz bulunmuyor.</Alert>;
  }

  return (
    <QueryBoundary isLoading={isLoading} error={error}>
      <Seo title="Faturalar - Düğün Takip Panel" noindex />

      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold text-brand">Faturalar</h1>
        {can('kasa.duzenle') && (
          <button type="button" onClick={() => setShowForm((v) => !v)} className="btn-primary btn-sm text-white hover:text-white">
            <IconPlus size={16} /> Yeni Fatura
          </button>
        )}
      </div>
      <p className="mb-6 max-w-3xl text-sm leading-relaxed text-brand-muted">
        Vergi mükellefi olmayan müşterilere <strong>e-Arşiv Fatura</strong>, e-Fatura mükellefi
        kurumlara <strong>e-Fatura</strong> düzenlenir. Alıcı türünü seçtiğinizde belge türü
        otomatik belirlenir.
      </p>

      {isDemoMode && (
        <Alert kind="warning" className="mb-5">
          Demo modunda fatura entegratöre gönderilmez; yalnızca taslak olarak kaydedilir.
        </Alert>
      )}
      {notice && <Alert kind="success" className="mb-5">{notice}</Alert>}
      {deadline && showForm && (
        <Alert kind={deadline.overdue ? 'error' : 'info'} className="mb-5">
          {deadline.overdue
            ? `Hizmet tarihinden bu yana ${Math.abs(deadline.daysLeft)} gün geçti; fatura düzenleme süresi (7 gün) aşıldı.`
            : `Fatura düzenleme süresi: ${deadline.daysLeft} gün kaldı.`}
        </Alert>
      )}

      {showForm && can('kasa.duzenle') && (
        <form onSubmit={(e) => { void submit(e); }} noValidate className="card mb-6 p-6">
          <h2 className="mb-4 font-heading text-lg font-bold text-brand">Yeni Fatura</h2>
          {formError && <Alert kind="error" className="mb-4">{formError}</Alert>}

          <fieldset className="mb-6">
            <legend className="mb-3 font-heading font-semibold text-brand">Alıcı</legend>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div>
                <label htmlFor="fb-kind" className="field-label">Alıcı Türü</label>
                <select id="fb-kind" className="field-input" value={buyer.kind}
                  onChange={(e) => setBuyer((b) => ({ ...b, kind: e.target.value as BuyerKind }))}>
                  <option value="bireysel">Bireysel (e-Arşiv Fatura)</option>
                  <option value="kurumsal">Kurumsal (e-Fatura)</option>
                </select>
              </div>
              <div>
                <label htmlFor="fb-name" className="field-label">
                  {buyer.kind === 'kurumsal' ? 'Ünvan' : 'Ad Soyad'}
                </label>
                <input id="fb-name" className="field-input" value={buyer.name}
                  onChange={(e) => setBuyer((b) => ({ ...b, name: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="fb-taxid" className="field-label">
                  {buyer.kind === 'kurumsal' ? 'Vergi Kimlik No (10 hane)' : 'T.C. Kimlik No (isteğe bağlı)'}
                </label>
                <input id="fb-taxid" inputMode="numeric" className="field-input" value={buyer.taxId}
                  onChange={(e) => setBuyer((b) => ({ ...b, taxId: e.target.value }))} />
              </div>
              {buyer.kind === 'kurumsal' && (
                <div>
                  <label htmlFor="fb-office" className="field-label">Vergi Dairesi</label>
                  <input id="fb-office" className="field-input" value={buyer.taxOffice}
                    onChange={(e) => setBuyer((b) => ({ ...b, taxOffice: e.target.value }))} />
                </div>
              )}
              <div>
                <label htmlFor="fb-email" className="field-label">E-Posta</label>
                <input id="fb-email" type="email" className="field-input" value={buyer.email}
                  onChange={(e) => setBuyer((b) => ({ ...b, email: e.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <label htmlFor="fb-address" className="field-label">Adres</label>
                <input id="fb-address" className="field-input" value={buyer.address}
                  onChange={(e) => setBuyer((b) => ({ ...b, address: e.target.value }))} />
              </div>
            </div>
          </fieldset>

          <fieldset className="mb-6">
            <legend className="mb-3 font-heading font-semibold text-brand">Satırlar</legend>
            <div className="space-y-3">
              {lines.map((line, index) => (
                <div key={index} className="grid gap-3 rounded-md border border-line p-3 md:grid-cols-12">
                  <div className="md:col-span-4">
                    <label htmlFor={`ln-desc-${index}`} className="field-label">Açıklama</label>
                    <input id={`ln-desc-${index}`} className="field-input" value={line.description}
                      onChange={(e) => updateLine(index, { description: e.target.value })} />
                  </div>
                  <div className="md:col-span-2">
                    <label htmlFor={`ln-qty-${index}`} className="field-label">Miktar</label>
                    <input id={`ln-qty-${index}`} inputMode="decimal" className="field-input"
                      value={line.quantity}
                      onChange={(e) => updateLine(index, { quantity: Number(e.target.value) || 0 })} />
                  </div>
                  <div className="md:col-span-2">
                    <label htmlFor={`ln-price-${index}`} className="field-label">Birim Fiyat</label>
                    <input id={`ln-price-${index}`} inputMode="decimal" className="field-input"
                      value={line.unitPrice}
                      onChange={(e) => updateLine(index, { unitPrice: Number(e.target.value) || 0 })} />
                  </div>
                  <div className="md:col-span-2">
                    <label htmlFor={`ln-vat-${index}`} className="field-label">KDV %</label>
                    <select id={`ln-vat-${index}`} className="field-input" value={line.vatRate}
                      onChange={(e) => updateLine(index, { vatRate: Number(e.target.value) as VatRate })}>
                      {VAT_RATES.map((r) => <option key={r} value={r}>%{r}</option>)}
                    </select>
                  </div>
                  <div className="flex items-end md:col-span-2">
                    <span className="flex-1 text-sm text-brand">
                      {formatMoney(fromKurus(totals.lines[index]?.totalKurus ?? 0))}
                    </span>
                    {lines.length > 1 && (
                      <button type="button" aria-label={`${index + 1}. satırı sil`}
                        onClick={() => setLines((c) => c.filter((_, i) => i !== index))}
                        className="rounded p-1.5 text-brand-muted hover:text-[#e74c3c]">
                        <IconTrash size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setLines((c) => [...c, { ...EMPTY_LINE }])}
              className="btn-outline btn-sm mt-3">
              <IconPlus size={14} /> Satır ekle
            </button>
          </fieldset>

          <div className="mb-6 rounded-md bg-surface p-4">
            <dl className="ml-auto max-w-xs space-y-1.5 text-sm">
              <Row label="Matrah" value={formatMoney(fromKurus(totals.baseKurus))} />
              {totals.discountKurus > 0 && (
                <Row label="İskonto" value={`− ${formatMoney(fromKurus(totals.discountKurus))}`} />
              )}
              {totals.vatBreakdown.map((v) => (
                <Row key={v.rate} label={`KDV %${v.rate}`} value={formatMoney(fromKurus(v.vatKurus))} />
              ))}
              <div className="flex justify-between border-t border-line pt-1.5">
                <dt className="font-heading font-bold text-brand">Genel Toplam</dt>
                <dd className="font-heading font-bold text-brand">
                  {formatMoney(fromKurus(totals.totalKurus))}
                </dd>
              </div>
            </dl>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary text-white hover:text-white"
              disabled={createMutation.isPending || sendMutation.isPending}>
              {createMutation.isPending ? 'Oluşturuluyor…' : 'Faturayı oluştur ve gönder'}
            </button>
            <button type="button" className="btn-outline" onClick={() => setShowForm(false)}>Vazgeç</button>
          </div>
        </form>
      )}

      <div className="card mb-5 p-4">
        <label htmlFor="inv-q" className="field-label">Fatura no veya alıcı ile ara</label>
        <div className="relative max-w-md">
          <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
          <input id="inv-q" type="search" className="field-input pl-9" value={query}
            onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <div className="card overflow-x-auto">
        {filtered.length === 0 ? (
          <p className="p-10 text-center text-sm text-brand-muted">Fatura kaydı bulunamadı.</p>
        ) : (
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-line bg-surface text-left text-xs uppercase text-brand-muted">
                <th className="px-4 py-3 font-medium">Fatura No</th>
                <th className="px-4 py-3 font-medium">Tarih</th>
                <th className="px-4 py-3 font-medium">Alıcı</th>
                <th className="px-4 py-3 font-medium">Tür</th>
                <th className="px-4 py-3 text-right font-medium">Matrah</th>
                <th className="px-4 py-3 text-right font-medium">KDV</th>
                <th className="px-4 py-3 text-right font-medium">Toplam</th>
                <th className="px-4 py-3 font-medium">Durum</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((invoice) => (
                <tr key={invoice.id} className="border-b border-line/60 last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-brand">
                    {invoice.invoiceNumber}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-brand-muted">
                    {formatDate(invoice.issueDate)}
                  </td>
                  <td className="px-4 py-3 text-brand">{invoice.buyerName}</td>
                  <td className="px-4 py-3 text-xs text-brand-muted">{invoice.kind}</td>
                  <td className="px-4 py-3 text-right text-brand">{formatMoney(fromKurus(invoice.baseKurus))}</td>
                  <td className="px-4 py-3 text-right text-brand-muted">{formatMoney(fromKurus(invoice.vatKurus))}</td>
                  <td className="px-4 py-3 text-right font-medium text-brand">
                    {formatMoney(fromKurus(invoice.totalKurus))}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs ${STATUS_STYLES[invoice.status]}`}>
                      {STATUS_LABELS[invoice.status]}
                    </span>
                    {invoice.providerError && (
                      <span className="mt-1 block text-xs text-[#b91c1c]">{invoice.providerError}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {can('kasa.duzenle') && invoice.status !== 'iptal' && (
                      <button type="button" onClick={() => setToCancel(invoice)}
                        className="text-xs text-[#b91c1c] hover:underline">
                        İptal et
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {reservationId && (
        <p className="mt-4 text-sm">
          <Link to={`/panel/rezervasyonlar/${reservationId}`}>← Rezervasyona dön</Link>
        </p>
      )}

      <ConfirmDialog
        open={Boolean(toCancel)}
        title="Faturayı iptal etmek istiyor musunuz?"
        description={
          toCancel
            ? `${toCancel.invoiceNumber} numaralı fatura iptal edilecek. Vergi belgesi silinmez; iptal kaydı olarak saklanır.`
            : ''
        }
        confirmLabel="Evet, iptal et"
        onConfirm={() => { void cancel(); }}
        onCancel={() => setToCancel(null)}
      />
    </QueryBoundary>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-brand-muted">{label}</dt>
      <dd className="text-brand">{value}</dd>
    </div>
  );
}
