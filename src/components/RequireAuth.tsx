import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';

/** Panel rotalarını koruyan sarmalayıcı */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" role="status" aria-live="polite">
        <span className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-accent" />
        <span className="sr-only">Yükleniyor</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/uye-girisi" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
