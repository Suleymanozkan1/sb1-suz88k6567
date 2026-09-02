import type { ReactNode } from 'react';
import { IconAlert, IconCheck, IconInfo } from './Icons';

type Kind = 'success' | 'error' | 'info' | 'warning';

const STYLES: Record<Kind, string> = {
  success: 'bg-[#e8f8ef] text-[#15803d] border-[#bbe8cd]',
  error: 'bg-[#fdecea] text-[#b91c1c] border-[#f5c6c2]',
  info: 'bg-[#e7f5fb] text-[#0c5e8a] border-[#bfe4f5]',
  warning: 'bg-[#fef6e7] text-[#92600e] border-[#f5dfb0]',
};

export default function Alert({
  kind = 'info',
  children,
  className = '',
}: {
  kind?: Kind;
  children: ReactNode;
  className?: string;
}) {
  const Icon = kind === 'success' ? IconCheck : kind === 'info' ? IconInfo : IconAlert;
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-md border px-4 py-3 text-sm ${STYLES[kind]} ${className}`}
    >
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div className="flex-1">{children}</div>
    </div>
  );
}
