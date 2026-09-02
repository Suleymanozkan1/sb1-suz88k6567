import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from '../lib/monitoring';

interface Props { children: ReactNode }
interface State { hasError: boolean }

/**
 * Beklenmeyen bir hatada uygulamanın tamamen boş sayfaya düşmesini engeller;
 * hatayı izleme servisine bildirir ve kullanıcıya anlaşılır bir çıkış sunar.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError(error, { componentStack: info.componentStack });
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-surface p-6">
        <div className="card max-w-md p-8 text-center">
          <h1 className="font-heading text-xl font-bold text-brand">Beklenmeyen bir hata oluştu</h1>
          <p className="mt-3 text-sm leading-relaxed">
            İşleminiz tamamlanamadı. Sayfayı yenileyip tekrar deneyebilirsiniz. Sorun sürerse
            bizimle iletişime geçin.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              className="btn-primary text-white hover:text-white"
              onClick={() => window.location.reload()}
            >
              Sayfayı yenile
            </button>
            <a href="/" className="btn-outline">Anasayfaya dön</a>
          </div>
        </div>
      </div>
    );
  }
}
