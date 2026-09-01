import type { ReactNode } from 'react';
import Alert from './Alert';

/** Panel ekranlarında ortak yükleniyor / hata / boş durum gösterimi */
export function Loading({ label = 'Yükleniyor' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16" role="status" aria-live="polite">
      <span className="h-8 w-8 animate-spin rounded-full border-4 border-line border-t-accent" />
      <span className="text-sm text-brand-muted">{label}…</span>
    </div>
  );
}

export function LoadError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'Veriler alınamadı.';
  return <Alert kind="error">{message}</Alert>;
}

/** Yükleniyor / hata durumlarını tek yerden yönetir */
export function QueryBoundary({
  isLoading, error, children,
}: {
  isLoading: boolean;
  error: unknown;
  children: ReactNode;
}) {
  if (isLoading) return <Loading />;
  if (error) return <LoadError error={error} />;
  return <>{children}</>;
}
