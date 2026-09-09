import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Alert from './Alert';
import { IconBell, IconCheck, IconMessage } from './Icons';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../lib/authHelpers';
import { useBusinesses, useHalls, useSendSms, useTemplates } from '../lib/queries';
import { SABLON_ADI, degerler, doldur, olc } from '../lib/sablon';
import type { Payment, Reservation, SmsLogEntry } from '../types';

/**
 * Rezervasyon ekranından tek tuşla hatırlatma gönderimi.
 *
 * Metin panelde tanımlı taslaktan gelir ve gönderilmeden önce doldurulmuş
 * hâliyle gösterilir. Önizlemenin zorunlu olmasının sebebi, taslakta
 * bir yer tutucu yanlış yazıldığında bunun ancak müşteriye giden mesajda
 * fark edilmesiydi; artık gönderen önce görür.
 *
 * Gönderim doğrudan sağlayıcıya değil, kuyruğa gider: İYS kuralı orada
 * uygulanır ve sağlayıcı erişilemezse mesaj kaybolmaz.
 */
export default function HatirlatmaGonder({
  reservation, payments,
}: {
  reservation: Reservation;
  payments: Payment[];
}) {
  const { user } = useAuth();
  const businessId = user?.activeBusinessId ?? '';
  const { data: sablonlar = [] } = useTemplates(businessId);
  const { data: businesses = [] } = useBusinesses();
  const { data: halls = [] } = useHalls();
  const gonder = useSendSms();

  const [secili, setSecili] = useState<string>('');
  const [hata, setHata] = useState('');
  const [gonderilen, setGonderilen] = useState('');

  const isletmeAdi = businesses.find((b) => b.id === businessId)?.name ?? '';
  const salonAdi = halls.find((h) => h.id === reservation.hallId)?.name ?? '';

  const dolu = useMemo(
    () => degerler(reservation, payments, isletmeAdi, salonAdi),
    [reservation, payments, isletmeAdi, salonAdi],
  );

  const aktif = sablonlar.filter((s) => s.isActive);
  const sablon = aktif.find((s) => s.id === secili);
  const metin = sablon ? doldur(sablon.body, dolu) : '';
  const olcum = olc(metin);

  async function gonderilsin() {
    if (!sablon) return;
    setHata(''); setGonderilen('');
    try {
      const sonuc = await gonder.mutateAsync({
        to: reservation.customerPhone,
        body: metin,
        kind: sablon.kind as SmsLogEntry['kind'],
        category: sablon.category,
        reservationId: reservation.id,
      });
      if (sonuc.sent) {
        setGonderilen(sablon.id);
      } else if (sonuc.blocked) {
        setHata(sonuc.error ?? 'Mesaj gönderilemedi.');
      } else {
        setHata(sonuc.notConfigured
          ? 'SMS sağlayıcısı tanımlı olmadığı için mesaj şu an gönderilemedi; kuyrukta bekliyor ve otomatik olarak yeniden denenecek.'
          : sonuc.error ?? 'Mesaj kuyruğa alındı, gönderim yeniden denenecek.');
      }
    } catch (e) {
      setHata(errorMessage(e));
    }
  }

  return (
    <section className="card mb-6 p-5">
      <h2 className="mb-1 flex items-center gap-2 font-heading text-lg font-bold text-brand">
        <IconBell size={18} /> Hatırlatma gönder
      </h2>
      <p className="mb-4 text-sm text-brand-muted">
        Bir taslak seçin; metin bu rezervasyonun bilgileriyle doldurulur.
        Taslakları <Link to="/panel/hatirlatmalar">Hatırlatmalar</Link> ekranından
        düzenleyebilirsiniz.
      </p>

      {hata ? <Alert kind="error" className="mb-4">{hata}</Alert> : null}
      {gonderilen ? (
        <Alert kind="success" className="mb-4">Mesaj kuyruğa alındı ve kayıtlara işlendi.</Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {aktif.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => { setSecili(s.id === secili ? '' : s.id); setHata(''); setGonderilen(''); }}
            aria-pressed={s.id === secili}
            className={`btn btn-sm ${
              s.id === secili
                ? 'bg-accent-ink text-white hover:text-white'
                : 'border-2 border-line text-brand hover:border-accent-ink'
            }`}
          >
            {SABLON_ADI[s.key]}
          </button>
        ))}
      </div>

      {sablon ? (
        <div className="mt-4 rounded-lg border border-line bg-surface p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-muted">
            Gönderilecek metin
          </p>
          <p className="whitespace-pre-wrap text-sm text-ink">{metin}</p>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-brand-muted">
            <span>{olcum.karakter} karakter · {olcum.parca} SMS</span>
            <span>{formatAlici(reservation.customerPhone)}</span>
            {sablon.category === 'ticari' ? (
              <span className="text-warning">
                Ticari ileti: İYS onayı olmayan numaraya gönderilmez.
              </span>
            ) : null}
          </div>

          <button
            type="button"
            className="btn-primary btn-sm mt-4 text-white hover:text-white"
            disabled={gonder.isPending}
            onClick={() => { void gonderilsin(); }}
          >
            {gonder.isPending
              ? <>Gönderiliyor…</>
              : <><IconMessage size={16} /> Bu mesajı gönder</>}
          </button>
          {gonderilen === sablon.id ? (
            <span className="ml-3 inline-flex items-center gap-1 text-sm text-success">
              <IconCheck size={16} /> Gönderildi
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function formatAlici(ham: string): string {
  const r = ham.replace(/\D/g, '').replace(/^90/, '').replace(/^0/, '');
  return r.length === 10 ? `Alıcı: 0${r.slice(0, 3)} ${r.slice(3, 6)} ${r.slice(6, 8)} ${r.slice(8)}` : `Alıcı: ${ham}`;
}
