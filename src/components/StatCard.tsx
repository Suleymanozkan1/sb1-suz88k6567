import type { ComponentType } from 'react';

interface Props {
  label: string;
  value: string;
  hint?: string;
  icon?: ComponentType<{ size?: number; className?: string }>;
  tone?: 'brand' | 'accent' | 'success' | 'danger';
}

const TONES = {
  brand: 'bg-brand/10 text-brand',
  accent: 'bg-accent/10 text-accent',
  success: 'bg-[#18d26e]/10 text-[#15803d]',
  danger: 'bg-[#e74c3c]/10 text-[#b91c1c]',
};

export default function StatCard({ label, value, hint, icon: Icon, tone = 'accent' }: Props) {
  return (
    <div className="card flex items-start gap-4 p-5">
      {Icon && (
        <span className={`shrink-0 rounded-lg p-3 ${TONES[tone]}`}>
          <Icon size={22} />
        </span>
      )}
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-brand-muted">{label}</p>
        <p className="mt-1 truncate font-heading text-xl font-bold text-brand">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-brand-muted">{hint}</p>}
      </div>
    </div>
  );
}
