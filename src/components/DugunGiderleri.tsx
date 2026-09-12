import { useMemo, useState } from 'react';
import Alert from './Alert';
import ConfirmDialog from './ConfirmDialog';
import { IconPlus, IconTrash } from './Icons';
import { formatMoney } from '../lib/format';
import { errorMessage } from '../lib/authHelpers';
import { uid } from '../lib/ids';
import {
  useDeleteReservationExpense, useReservationExpenses, useSaveReservationExpense,
} from '../lib/queries';
import { giderToplami, netHesap } from '../lib/dugunGideri';
import type { Payment, Reservation, ReservationExpense } from '../types';

/**
 * Bir organizasyonun kendi içinde harcananlar.
 *
 * Garson, DJ, vale, fotoğrafçı. Bu kalemler gelir/gider defterine
 * "Personel Maaş" gibi genel bir kategoriyle yazıldığında hangi düğünün
 * ne kadara mal olduğu hiçbir yerde görünmüyordu.
 *
 * Toplam sütunu hesaplanıyor (birim x birim fiyat), elle girilmiyor: üç
 * sayı birbirini tutmadığında hangisinin doğru olduğu bilinemezdi.
 */
export default function DugunGiderleri({
  reservation, payments, kalanBakiye, duzenlenebilir,
}: {
  reservation: Reservation;
  payments: Payment[];
  kalanBakiye: number;
  duzenlenebilir: boolean;
}) {
  const { data: hepsi = [] } = useReservationExpenses();
  const kaydet = useSaveReservationExpense();
  const sil = useDeleteReservationExpense();

  const [hata, setHata] = useState('');
  const [silinecek, setSilinecek] = useState<ReservationExpense | null>(null);
  const [form, setForm] = useState({ kind: '', unitCount: '1', unitPrice: '' });

  const giderler = useMemo(
    () => hepsi.filter((g) => g.reservationId === reservation.id),
    [hepsi, reservation.id],
  );

  const hesap = useMemo(
    () => netHesap(reservation, payments, giderler, kalanBakiye),
    [reservation, payments, giderler, kalanBakiye],
  );

  async function ekle(e: React.FormEvent) {
    e.preventDefault();
    setHata('');

    const tur = form.kind.trim();
    if (!tur) { setHata('Gider türü giriniz.'); return; }

    const adet = Number(form.unitCount);
    if (!Number.isFinite(adet) || adet <= 0) { setHata('Geçerli bir birim giriniz.'); return; }

    // Sıfır fiyat kabul ediliyor: bedelsiz gelen bir hizmet de listede
    // görünmeli, yoksa o gün kimin çalıştığı kayıtta kalmaz.
    const fiyat = Number(form.unitPrice);
    if (!Number.isFinite(fiyat) || fiyat < 0) { setHata('Geçerli bir birim fiyat giriniz.'); return; }

    try {
      await kaydet.mutateAsync({
        id: uid('gider'),
        businessId: reservation.businessId,
        reservationId: reservation.id,
        kind: tur, unitCount: adet, unitPrice: fiyat, note: '',
        createdAt: '', updatedAt: '',
      });
      setForm({ kind: '', unitCount: '1', unitPrice: '' });
    } catch (err) {
      setHata(errorMessage(err));
    }
  }

  async function kaldir() {
    if (!silinecek) return;
    const hedef = silinecek;
    setSilinecek(null);
    setHata('');
    try {
      await sil.mutateAsync(hedef.id);
    } catch (err) {
      setHata(errorMessage(err));
    }
  }

  const para = (t: number) => formatMoney(t, reservation.currency);

  return (
    <section className="card mb-6 p-5" aria-labelledby="dugun-gideri-baslik">
      <h2 id="dugun-gideri-baslik" className="mb-1 font-heading text-lg font-bold text-brand">
        Düğün İçi Giderler
      </h2>
      <p className="mb-4 text-sm text-brand-muted">
        Bu organizasyon için harcananlar. Gelir/gider defterinde{' '}
        <strong className="text-brand">Düğün İçi Gider</strong> kategorisiyle ve bu
        sözleşmenin numarasıyla görünür.
      </p>

      {hata && <Alert kind="error" className="mb-4">{hata}</Alert>}

      {giderler.length === 0 ? (
        <p className="py-6 text-center text-sm text-brand-muted">
          Bu organizasyon için gider girilmemiş.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <caption className="sr-only">Düğün içi giderler</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase text-brand-muted">
                <th className="pb-2 font-medium">Tür</th>
                <th className="pb-2 text-right font-medium">Birim</th>
                <th className="pb-2 text-right font-medium">Birim Fiyat</th>
                <th className="pb-2 text-right font-medium">Toplam</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {giderler.map((g) => (
                <tr key={g.id} className="border-b border-line/60 last:border-0">
                  <td className="py-2.5 text-brand">{g.kind}</td>
                  <td className="py-2.5 text-right text-brand">{g.unitCount}</td>
                  <td className="py-2.5 text-right text-brand">{para(g.unitPrice)}</td>
                  <td className="py-2.5 text-right font-medium text-brand">{para(giderToplami(g))}</td>
                  <td className="py-2.5 text-right">
                    {duzenlenebilir && (
                      <button type="button" onClick={() => setSilinecek(g)}
                        aria-label={`${g.kind} giderini sil`}
                        className="rounded p-1 text-brand-muted hover:text-danger">
                        <IconTrash size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line font-medium text-brand">
                <td className="pt-2.5" colSpan={3}>Toplam gider</td>
                <td className="pt-2.5 text-right">{para(hesap.giderler)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {duzenlenebilir && (
        <form onSubmit={(e) => { void ekle(e); }} noValidate
          className="mt-4 grid gap-3 sm:grid-cols-[1fr_6rem_8rem_auto]">
          <div>
            <label htmlFor="gd-kind" className="field-label">Tür</label>
            <input id="gd-kind" className="field-input" placeholder="Garson, DJ, Vale..."
              value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))} />
          </div>
          <div>
            <label htmlFor="gd-count" className="field-label">Birim</label>
            <input id="gd-count" inputMode="decimal" className="field-input"
              value={form.unitCount}
              onChange={(e) => setForm((f) => ({ ...f, unitCount: e.target.value }))} />
          </div>
          <div>
            <label htmlFor="gd-price" className="field-label">Birim fiyat</label>
            <input id="gd-price" inputMode="decimal" className="field-input"
              value={form.unitPrice}
              onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))} />
          </div>
          <div className="flex items-end">
            <button type="submit" className="btn-primary w-full text-white hover:text-white"
              disabled={kaydet.isPending}>
              <IconPlus size={16} /> Gider Ekle
            </button>
          </div>
        </form>
      )}

      {/*
        Net tutar. Tabanın neye dayandığı AÇIKÇA yazılıyor: "kalan
        bakiyeden mi, son tahsilattan mı" sorusunun cevabı ekranda
        görünmezse rakam güvenilmez olur.
      */}
      <dl className="mt-5 rounded-lg bg-surface p-4">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-sm text-brand-muted">{TABAN_ETIKETI[hesap.tabanKaynagi]}</dt>
          <dd className="font-medium text-brand">{para(hesap.taban)}</dd>
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <dt className="text-sm text-brand-muted">Düğün içi giderler</dt>
          <dd className="font-medium text-brand">− {para(hesap.giderler)}</dd>
        </div>
        <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-3">
          <dt className="font-heading font-bold text-brand">Net tutar</dt>
          <dd className={`font-heading text-xl font-bold ${hesap.net >= 0 ? 'text-[#15803d]' : 'text-danger'}`}>
            {para(hesap.net)}
          </dd>
        </div>
        {hesap.net < 0 && (
          <p className="mt-2 text-xs text-danger">
            Giderler tabandan fazla; bu organizasyondan para çıkıyor.
          </p>
        )}
      </dl>

      <ConfirmDialog
        open={Boolean(silinecek)}
        title="Gideri silmek istiyor musunuz?"
        description={silinecek
          ? `${silinecek.kind} · ${silinecek.unitCount} × ${para(silinecek.unitPrice)}`
          : ''}
        confirmLabel="Evet, sil"
        onConfirm={() => { void kaldir(); }}
        onCancel={() => setSilinecek(null)}
      />
    </section>
  );
}

/** Net hesabın tabanı neye dayanıyor; kullanıcıya olduğu gibi söyleniyor. */
const TABAN_ETIKETI: Record<'kalan' | 'sonOdeme' | 'yok', string> = {
  kalan: 'Kalan bakiye',
  sonOdeme: 'Son tahsilat (kalan bakiye yok)',
  yok: 'Taban yok (hiç tahsilat girilmemiş)',
};
