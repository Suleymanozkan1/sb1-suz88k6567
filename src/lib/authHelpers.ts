/** Kimlik doğrulama yardımcıları — bileşen içermez, hızlı yenileme uyumlu. */
import { isDemoMode } from './repo';
import { RepoError } from './repo';

/**
 * Kendi şirketiniz için kurulumda dışarıya açık kayıt kapalıdır.
 * Demo modunda (veritabanı bağlı değilken) sistemi denemek için açıktır.
 */
export const SIGNUP_ENABLED =
  (import.meta.env.VITE_ALLOW_SIGNUP as string | undefined) === 'true' || isDemoMode;

/** Depo hatalarını kullanıcıya gösterilebilir metne çevirir. */
export function errorMessage(error: unknown): string {
  if (error instanceof RepoError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyiniz.';
}
