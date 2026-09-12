import { useExchangeRates } from '../lib/queries';
import { KUR_ADI, KUR_KODLARI } from '../types';

/**
 * Ana sayfanın üstündeki döviz ve altın şeridi (madde 28).
 *
 * Rakamlar SUNUCUNUN doldurduğu önbellekten geliyor; bu bileşen hiçbir
 * dış servise istek atmıyor. Tarayıcıdan çekilseydi sağlayıcının API
 * anahtarı istemciye inerdi ve her açılan sekme sağlayıcıya ayrı istek
 * atardı.
 *
 * Kur yoksa ŞERİT HİÇ ÇİZİLMİYOR. Boş kutucuklar ya da örnek rakamlar
 * konsaydı, salon sahibi ona bakıp fiyat belirlerdi.
 */
export default function KurSeridi() {
  const { data: kurlar = [] } = useExchangeRates();
  if (kurlar.length === 0) return null;

  // Sıra ekranda sabit: sağlayıcının döndürdüğü sıraya bırakılsaydı
  // dolar bir gün başta, ertesi gün ortada görünürdü.
  const sirali = KUR_KODLARI
    .map((kod) => kurlar.find((k) => k.code === kod))
    .filter((k): k is NonNullable<typeof k> => Boolean(k));

  /*
    Kur dört haneye kadar yazılıyor: altın gramı binlerle, dolar
    kuruşlarla anlam taşıyor ve ikisine tek bir ondalık sayısı vermek
    birini okunmaz yapıyor.
  */
  const yaz = (n: number) => new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2, maximumFractionDigits: 4,
  }).format(n);

  const tarih = sirali[0]?.quotedAt ?? '';

  return (
    <section className="card mb-4 px-4 py-3" aria-labelledby="kur-baslik">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <h2 id="kur-baslik" className="text-xs uppercase tracking-wide text-brand-muted">
          Döviz / Altın
        </h2>
        <dl className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {sirali.map((k) => (
            <div key={k.code} className="flex items-baseline gap-2">
              <dt className="text-xs font-medium text-brand">{KUR_ADI[k.code]}</dt>
              <dd className="whitespace-nowrap text-xs text-brand-muted">
                {/*
                  Alış ve satış AYRI: aradaki fark salonun bir dövizi
                  bozdurduğunda ne kaybedeceğini gösteriyor ve tek bir
                  "kur" rakamı o farkı gizlerdi.
                */}
                Alış <strong className="text-brand">{yaz(k.buy)}</strong>
                {' · '}
                Satış <strong className="text-brand">{yaz(k.sell)}</strong>
              </dd>
            </div>
          ))}
        </dl>
        {tarih && (
          <p className="ml-auto text-[11px] text-brand-muted">
            {/*
              Kurun kendi tarihi yazılıyor, çekildiği an değil: sağlayıcı
              eski bir değeri tekrar verdiğinde ekran "az önce
              güncellendi" demesin.
            */}
            {new Date(tarih).toLocaleDateString('tr-TR')} kuru
          </p>
        )}
      </div>
    </section>
  );
}
