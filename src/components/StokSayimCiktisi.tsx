import { formatMoney, formatNumber } from '../lib/format';
import { SAYIM_BASLIKLARI, sayimSatirlari, stokDegeri } from '../lib/stok';
import type { Vendor } from '../types';

/**
 * A4 stok sayım kâğıdı.
 *
 * Depoya götürülüp elle doldurulan liste. Ekranda görünmez; yalnızca
 * yazdırmada çıkar (`print-only`), çünkü ekranda zaten aynı verinin
 * düzenlenebilir hâli duruyor -- ikisi aynı anda görünseydi hangisinin
 * güncel olduğu belirsiz kalırdı.
 *
 * SON SÜTUN BOŞ. Sistemdeki adet "Toplam Adet" sütununda duruyor,
 * yanındaki "Sayım" sütunu elle dolduruluyor. İkisi yan yana olmasaydı
 * sayan kişi farkı depoda göremez, karşılaştırmayı sonra ekran başında
 * yapmak zorunda kalırdı.
 */
export default function StokSayimCiktisi({
  urunler, currency, isletmeAdi, secimVarMi,
}: {
  urunler: Vendor[];
  currency: string;
  isletmeAdi: string;
  /** Liste seçimle daraltıldıysa başlıkta belirtiliyor. */
  secimVarMi: boolean;
}) {
  const satirlar = sayimSatirlari(urunler);
  const toplamDeger = stokDegeri(urunler);
  const toplamAdet = satirlar.reduce((t, s) => t + s.toplamAdet, 0);

  /*
    Tarih kâğıdın üstünde. Sayım kâğıtları biriktiğinde hangisinin ne
    zaman alındığı yazmıyorsa iki sayım karşılaştırılamaz.
  */
  const tarih = new Date().toLocaleDateString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

  return (
    <section className="print-only print-area text-black">
      <header className="mb-3 border-b border-black/30 pb-2">
        <h2 className="font-heading text-lg font-bold">Stok Sayım Listesi</h2>
        <p className="text-[11px]">
          {isletmeAdi ? `${isletmeAdi} · ` : ''}{tarih}
          {secimVarMi ? ' · seçili ürünler' : ''} · {satirlar.length} kalem
        </p>
      </header>

      <table className="w-full border-collapse text-[11px]">
        <caption className="sr-only">Stok sayım listesi</caption>
        <thead>
          <tr>
            {SAYIM_BASLIKLARI.map((baslik, i) => (
              <th
                key={baslik}
                className={`border border-black/40 px-1.5 py-1 font-semibold ${
                  i === 0 || i === 1 ? 'text-left' : 'text-right'
                }`}
              >
                {baslik}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {satirlar.map((s) => (
            <tr key={s.id}>
              <td className="border border-black/40 px-1.5 py-1">{s.ad}</td>
              <td className="border border-black/40 px-1.5 py-1">{s.kategori}</td>
              <td className="border border-black/40 px-1.5 py-1 text-right">{formatNumber(s.koli)}</td>
              <td className="border border-black/40 px-1.5 py-1 text-right">{formatNumber(s.koliIci)}</td>
              <td className="border border-black/40 px-1.5 py-1 text-right">{formatNumber(s.tekAdet)}</td>
              <td className="border border-black/40 px-1.5 py-1 text-right font-semibold">
                {formatNumber(s.toplamAdet)}
              </td>
              <td className="border border-black/40 px-1.5 py-1 text-right">
                {s.birimFiyat > 0 ? formatMoney(s.birimFiyat, currency) : '-'}
              </td>
              <td className="border border-black/40 px-1.5 py-1 text-right">
                {s.tutar > 0 ? formatMoney(s.tutar, currency) : '-'}
              </td>
              {/* Elle doldurulacak. Yüksekliği yazı için değil kalem için. */}
              <td className="border border-black/40 px-1.5 py-3" />
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="border border-black/40 px-1.5 py-1 font-semibold" colSpan={5}>
              Toplam
            </td>
            <td className="border border-black/40 px-1.5 py-1 text-right font-semibold">
              {formatNumber(toplamAdet)}
            </td>
            <td className="border border-black/40 px-1.5 py-1" />
            <td className="border border-black/40 px-1.5 py-1 text-right font-semibold">
              {formatMoney(toplamDeger, currency)}
            </td>
            <td className="border border-black/40 px-1.5 py-1" />
          </tr>
        </tfoot>
      </table>

      <div className="mt-6 flex justify-between text-[11px]">
        <span>Sayan: ............................................</span>
        <span>İmza: ............................................</span>
      </div>
    </section>
  );
}
