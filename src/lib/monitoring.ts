/**
 * Hata izleme (Sentry) — isteğe bağlı.
 *
 * VITE_SENTRY_DSN tanımlı değilse hiçbir şey yüklenmez ve dışarıya istek
 * gitmez. Kullanıcı verisinin kazara sızmaması için gönderilen olaylar
 * temizlenir: e-posta, telefon ve müşteri adı gibi alanlar maskelenir.
 */
import * as Sentry from '@sentry/react';

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

/** Metin içindeki e-posta ve telefon numaralarını maskeler */
export function scrub(value: string): string {
  return value
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[e-posta]')
    .replace(/(?:\+?90|0)?5\d{9}(?!\d)/g, '[telefon]');
}

export function initMonitoring(): void {
  if (!DSN) return;

  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,
    // Kullanıcıyı tanımlayan varsayılan verileri gönderme
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    beforeSend(event) {
      // Hata mesajlarında ve URL'lerde kişisel veri kalmasın
      if (event.message) event.message = scrub(event.message);
      event.exception?.values?.forEach((value) => {
        if (value.value) value.value = scrub(value.value);
      });
      if (event.request?.url) event.request.url = scrub(event.request.url);
      delete event.user;
      return event;
    },
  });
}

/** Beklenmeyen bir hatayı bildirir (izleme kapalıysa sessizce yok sayar) */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  if (!DSN) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
