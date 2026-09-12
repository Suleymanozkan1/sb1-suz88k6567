import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { formatNumber } from '../lib/format';
import { stokDurumu } from '../lib/stok';
import { useVendors } from '../lib/queries';

/**
 * Özet sayfasındaki stok çubukları.
 *
 * Çubuk uzunluğu listedeki EN BÜYÜK stoğa göre; mutlak sayıya göre
 * çizilseydi 240 şişe suyun yanında 12 paket peçete hiç görünmezdi.
 *
 * Kritik seviyenin altındakiler başta ve kırmızı: ekranı açan kişinin
 * görmesi gereken şey neyin bittiği, neyin bol olduğu değil.
 */
export default function StokDurumu() {
  const { data: kayitlar = [] } = useVendors();
  const satirlar = useMemo(() => stokDurumu(kayitlar), [kayitlar]);
  const kritik = satirlar.filter((s) => s.kritik).length;

  return (
    <section className="card p-5" aria-labelledby="stok-title">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="stok-title" className="font-heading text-lg font-bold text-brand">Stok durumu</h2>
        <Link to="/panel/urun-hizmet" className="text-sm">Tümü →</Link>
      </div>

      {satirlar.length === 0 ? (
        <p className="py-6 text-center text-sm text-brand-muted">
          Ürün tanımlanmamış. <Link to="/panel/urun-hizmet">Ürün ve Hizmet</Link> ekranından
          ekleyebilirsiniz.
        </p>
      ) : (
        <>
          {kritik > 0 && (
            <p className="mb-3 rounded-md bg-[#fef3c7] px-3 py-2 text-xs text-[#92400e]">
              {kritik} ürün kritik seviyede.
            </p>
          )}
          <ul className="space-y-3">
            {satirlar.map((s) => (
              <li key={s.id}>
                <div className="mb-1 flex justify-between gap-2 text-xs">
                  <span className="truncate text-brand">{s.name}</span>
                  <span className={s.kritik ? 'font-medium text-danger' : 'text-brand-muted'}>
                    {formatNumber(s.toplam)} adet
                  </span>
                </div>
                <div
                  className="h-2 rounded bg-surface"
                  role="progressbar"
                  aria-valuenow={s.toplam}
                  aria-valuemin={0}
                  aria-label={`${s.name} stoğu`}
                  title={s.minCount > 0
                    ? `${s.name}: ${formatNumber(s.toplam)} adet · kritik seviye ${formatNumber(s.minCount)}`
                    : `${s.name}: ${formatNumber(s.toplam)} adet`}
                >
                  <div
                    className={`h-full rounded ${s.kritik ? 'bg-danger' : 'bg-accent'}`}
                    style={{ width: `${Math.max(s.oran, 2)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
