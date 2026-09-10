/** Kimlik doğrulama yardımcıları: bileşen içermez, hızlı yenileme uyumlu. */
import { RepoError } from './repo';

/** Depo hatalarını kullanıcıya gösterilebilir metne çevirir. */
export function errorMessage(error: unknown): string {
  if (error instanceof RepoError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyiniz.';
}
