import { useMemo } from 'react';
import { formatDateTime, formatMoney } from '../lib/format';
import { usePaymentEvents } from '../lib/queries';
import { ODEME_OLAY_ADI, type PaymentEvent } from '../types';

/**
 * Bir sözleşmedeki tahsilat değişikliklerinin geçmişi.
 *
 * Satırları veritabanı tetikleyicisi yazıyor ve kimse DÜZELTEMİYOR:
 * yazma hakkı verilseydi "bu parayı kim değiştirdi" sorusunun cevabı da
 * değiştirilebilirdi ve kayıt hiçbir işe yaramazdı.
 *
 * Silinen tahsilatın satırı da duruyor. Silinseydi "bu para neden
 * kayboldu" sorusu cevapsız kalırdı; kaydın asıl sebebi bu.
 */
export default function OdemeGecmisi({
  reservationId, currency,
}: {
  reservationId: string;
  currency: string;
}) {
  const { data: hepsi = [] } = usePaymentEvents();

  const olaylar = useMemo(
    () => hepsi
      .filter((o) => o.reservationId === reservationId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [hepsi, reservationId],
  );

  if (olaylar.length === 0) return null;

  return (
    <section className="card mb-6 p-5" aria-labelledby="odeme-gecmis-baslik">
      <h2 id="odeme-gecmis-baslik" className="mb-1 font-heading text-lg font-bold text-brand">
        Ödeme Değişiklik Geçmişi
      </h2>
      <p className="mb-4 text-sm text-brand-muted">
        Tahsilatlarda rakam içeren her değişiklik buraya düşer. Kayıtlar silinemez ve
        düzeltilemez.
      </p>

      <ol className="divide-y divide-line">
        {olaylar.map((o) => (
          <li key={o.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
            <div className="min-w-0">
              <p className="text-sm text-brand">
                <span className="font-medium">{ODEME_OLAY_ADI[o.event]}</span>
                {' · '}
                {olayAciklamasi(o, currency)}
              </p>
              <p className="text-xs text-brand-muted">
                {o.actorEmail || 'Kullanıcı bilinmiyor'}
              </p>
            </div>
            <span className="whitespace-nowrap text-xs text-brand-muted">
              {formatDateTime(o.createdAt)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Olayın tek satırlık anlatımı.
 *
 * Eski değer VARSA gösteriliyor: "tutar değişti" tek başına hangi
 * rakamdan hangi rakama gidildiğini söylemiyor ve kayıt işe yaramıyor.
 */
function olayAciklamasi(o: PaymentEvent, currency: string): string {
  const tutar = o.amount === undefined ? '-' : formatMoney(o.amount, currency);

  switch (o.event) {
    case 'tutar_degisti':
      return o.oldAmount === undefined
        ? tutar
        : `${formatMoney(o.oldAmount, currency)} → ${tutar}`;
    case 'tip_degisti':
      return `${o.oldMethod ?? '-'} → ${o.method ?? '-'} (${tutar})`;
    case 'kasaya_girmedi':
      return `${tutar} · ${o.method ?? '-'} tahsil edilmedi`;
    default:
      return o.method ? `${tutar} · ${o.method}` : tutar;
  }
}
