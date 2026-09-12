import { useWeather } from '../lib/queries';
import { havaMetni, tahminBul } from '../lib/hava';
import { todayIso } from '../lib/format';

/**
 * Güncel hava durumu (madde 29).
 *
 * Veriyi sunucudaki zamanlanmış görev çekiyor; bu bileşen yalnızca
 * okuyor. Sağlayıcı anahtarı tarayıcıya hiç inmiyor.
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

  return (
    <p className={`text-sm text-brand-muted ${className}`}>
      <span className="sr-only">Bugünün hava durumu: </span>
      {simdi !== null && <strong className="text-brand">{simdi}° </strong>}
      {havaMetni(tahmin)}
    </p>
  );
}
