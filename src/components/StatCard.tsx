import type { ComponentType, ReactNode } from 'react';

interface Props {
  label: string;
  /* Metin ya da bileşen: perdelenmiş tutar da buradan geçiyor. */
  value: ReactNode;
  hint?: ReactNode;
  /**
   * İmleç kartın üzerine gelince çıkan açıklama.
   *
   * `hint` ile aynı şey DEĞİL: `hint` her zaman görünen kısa satır,
   * bu ise rakamın nasıl hesaplandığını anlatan uzun metin. İkisi tek
   * alanda toplansaydı ya kart uzar ya açıklama kısalırdı.
   *
   * PERDE İLE UYUMLU OLMALI: tutarlar gizliyken ipucuna rakam
   * yazılmamalı, yoksa perde fare üstünde durunca anlamsızlaşır
   * (`Dashboard.tsx` bunu gözetiyor).
   */
  ipucu?: string;
  icon?: ComponentType<{ size?: number; className?: string }>;
  tone?: 'brand' | 'accent' | 'success' | 'danger';
}

const TONES = {
  brand: 'bg-brand/10 text-brand',
  accent: 'bg-accent/10 text-accent-ink',
  success: 'bg-success/10 text-[#15803d]',
  danger: 'bg-danger/10 text-[#b91c1c]',
};

export default function StatCard({ label, value, hint, ipucu, icon: Icon, tone = 'accent' }: Props) {
  return (
    <div className="card flex items-start gap-4 p-5" title={ipucu}>
      {Icon && (
        <span className={`shrink-0 rounded-lg p-3 ${TONES[tone]}`}>
          <Icon size={22} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-wide text-brand-muted">{label}</p>
        {/* Para değerleri kısaltılmaz: uzun tutarlar kesilmek yerine sarmalanır. */}
        <p className="mt-1 break-words font-heading text-lg font-bold leading-tight text-brand xl:text-xl">
          {value}
        </p>
        {hint && <p className="mt-0.5 text-xs text-brand-muted">{hint}</p>}
      </div>
    </div>
  );
}
