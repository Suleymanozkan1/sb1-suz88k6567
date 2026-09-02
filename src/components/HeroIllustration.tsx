import { MONTH_NAMES } from '../data/constants';

/** Hero bölümündeki takvim/uygulama görseli (saf SVG, dış görsel bağımlılığı yok) */
export default function HeroIllustration() {
  const now = new Date();
  const monthLabel = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
  const cells = Array.from({ length: 35 }, (_, i) => i);
  const booked: Record<number, string> = {
    4: '#47b2e4', 6: '#18d26e', 9: '#f39c12', 12: '#47b2e4', 15: '#e74c3c',
    18: '#47b2e4', 20: '#8e44ad', 23: '#47b2e4', 27: '#16a085', 30: '#47b2e4',
  };

  return (
    <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl" role="img" aria-label="Rezervasyon takvimi önizlemesi">
      <div className="mb-4 flex items-center justify-between">
        <span className="font-heading font-bold text-brand">{monthLabel}</span>
        <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
          Rezervasyon Takvimi
        </span>
      </div>
      <div className="mb-2 grid grid-cols-7 gap-1.5 text-center text-[10px] font-semibold text-brand-muted">
        {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((i) => {
          const color = booked[i];
          return (
            <span
              key={i}
              className="flex h-9 items-center justify-center rounded text-[11px] font-medium"
              style={
                color
                  ? { backgroundColor: color, color: '#fff' }
                  : { backgroundColor: '#f3f5fa', color: '#8fa2c0' }
              }
            >
              {i + 1 <= 31 ? i + 1 : ''}
            </span>
          );
        })}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-4 text-[11px]">
        <Stat label="Bu ay rezervasyon" value="18" />
        <Stat label="Kalan alacak" value="142.500 ₺" />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface p-3">
      <div className="text-brand-muted">{label}</div>
      <div className="mt-0.5 font-heading text-base font-bold text-brand">{value}</div>
    </div>
  );
}
