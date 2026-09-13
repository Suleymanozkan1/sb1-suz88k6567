import { useWeather, useWeatherHours } from '../lib/queries';
import { havaMetni, tahminBul } from '../lib/hava';
import { hadiseAdi, hadiseSimgesi } from '../lib/mgm';
import { todayIso } from '../lib/format';

/**
 * Güncel hava durumu (madde 29).
 *
 * Veriyi sunucudaki zamanlanmış görev Meteoroloji Genel Müdürlüğü'nden
 * çekiyor; bu bileşen yalnızca okuyor.
 *
 * Bugünün satırı yoksa hiç çizilmiyor: "—°" gibi bir yer tutucu, veri
 * varmış ama okunamamış gibi görünürdü.
 */
export default function HavaDurumu({ className = '' }: { className?: string }) {
  const { data: tahminler = [] } = useWeather();
  const bugun = todayIso();
  const tahmin = tahminBul(tahminler, bugun);

  if (!tahmin) return null;

  const simdi = typeof tahmin.currentC === 'number' ? Math.round(tahmin.currentC) : null;
  const simge = hadiseSimgesi(tahmin.hadise ?? tahmin.icon);

  return (
    <p className={`text-sm text-brand-muted ${className}`}>
      <span className="sr-only">Bugünün hava durumu: </span>
      {simge && <span aria-hidden="true">{simge} </span>}
      {simdi !== null && <strong className="text-brand">{simdi}° </strong>}
      {havaMetni(tahmin)}
    </p>
  );
}

/**
 * Bugünün saat saat hava durumu.
 *
 * Günlük tahmin "30 derece, açık" diyor olabilir ama düğün 19:00'da
 * başlıyor ve 19:00'da sağanak var. Gün ortalaması bu soruyu
 * yanıtlamıyor; bu şerit yanıtlıyor.
 *
 * GEÇMİŞ SAATLER GİZLENMİYOR, soluk gösteriliyor: "sabah yağdı mı"
 * sorusu da salonun bahçe kurulumu için gerçek bir soru.
 */
export function SaatlikHava({ gun, className = '' }: { gun?: string; className?: string }) {
  const { data: saatler = [] } = useWeatherHours();
  const hedef = gun ?? todayIso();
  const gununSaatleri = saatler.filter((s) => s.hour.startsWith(hedef));

  if (gununSaatleri.length === 0) return null;

  const simdi = new Date();
  const suAn = `${todayIso()}T${String(simdi.getHours()).padStart(2, '0')}:00`;

  return (
    <div className={className}>
      <h3 className="mb-2 font-heading text-sm font-bold text-brand">Saat saat hava durumu</h3>
      {/*
        Yatay kaydırma: yirmi dört saat dar ekranda yan yana sığmıyor ve
        hücreleri ezmek, punto küçültmek demekti.
      */}
      <div className="overflow-x-auto">
        <ul className="flex gap-1.5 pb-1">
          {gununSaatleri.map((s) => {
            const gecmis = s.hour < suAn;
            const derece = typeof s.tempC === 'number' ? Math.round(s.tempC) : null;
            const ad = hadiseAdi(s.hadise);
            return (
              <li
                key={s.hour}
                title={[
                  ad,
                  typeof s.feelsC === 'number' ? `Hissedilen ${Math.round(s.feelsC)}°` : '',
                  typeof s.humidity === 'number' ? `Nem %${Math.round(s.humidity)}` : '',
                  typeof s.windKmh === 'number' ? `Rüzgâr ${Math.round(s.windKmh)} km/s` : '',
                ].filter(Boolean).join(' · ')}
                className={`flex w-[4.5rem] shrink-0 flex-col items-center rounded border px-1 py-2 text-center ${
                  gecmis ? 'border-line bg-surface/60 opacity-60' : 'border-line bg-white'
                }`}
              >
                <span className="text-sm font-semibold text-brand">{s.hour.slice(11, 16)}</span>
                <span className="my-0.5 text-lg leading-none" aria-hidden="true">
                  {hadiseSimgesi(s.hadise)}
                </span>
                <span className="text-base font-bold text-brand">
                  {derece === null ? '–' : `${derece}°`}
                </span>
                <span className="mt-0.5 text-[11px] leading-tight text-brand-muted [overflow-wrap:anywhere] line-clamp-2">
                  {ad}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
