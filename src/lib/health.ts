/**
 * Sistem sağlığı değerlendirmesi.
 *
 * Eşikler ve sorun metinleri burada tutulur; ekran yalnızca gösterir.
 * Böylece kurallar bileşenden bağımsız olarak test edilebilir.
 */
import type { SystemHealth } from '../types';

/** Yedeğin kabul edilebilir azami yaşı (saat) */
export const BACKUP_MAX_AGE_HOURS = 48;
/** Kuyrukta bekleyen mesajın kabul edilebilir azami yaşı (dakika) */
export const QUEUE_MAX_AGE_MINUTES = 30;
/** 24 saatte bu sayıyı aşan hatalı giriş dikkat gerektirir */
export const FAILED_LOGIN_WARNING = 20;

export interface HealthIssue {
  level: 'error' | 'warning';
  message: string;
  hint?: string;
}

/**
 * Sağlık özetinden kullanıcıya gösterilecek sorunları çıkarır.
 * Demo modunda yedekleme çalışmadığı için yedek uyarıları verilmez.
 */
export function findIssues(health: SystemHealth, isDemoMode: boolean): HealthIssue[] {
  const issues: HealthIssue[] = [];

  if (health.kuyrukEnEskiDakika > QUEUE_MAX_AGE_MINUTES) {
    issues.push({
      level: 'error',
      message: `SMS kuyruğunda ${health.kuyrukEnEskiDakika} dakikadır bekleyen mesaj var.`,
      hint: 'Kuyruk işleyici çalışmıyor olabilir. CRON_SECRET tanımlı mı kontrol edin.',
    });
  }

  if (health.kuyrukBasarisiz > 0) {
    issues.push({
      level: 'error',
      message: `${health.kuyrukBasarisiz} mesaj kalıcı olarak gönderilemedi.`,
      hint: 'SMS Kayıtları → Kuyruk sekmesinden hata gerekçelerine bakın.',
    });
  }

  if (health.kuyrukEngellenen > 0) {
    issues.push({
      level: 'warning',
      message: `${health.kuyrukEngellenen} ticari mesaj İYS onayı olmadığı için engellendi.`,
      hint: 'İYS İzinleri ekranından onay kaydı ekleyebilirsiniz.',
    });
  }

  if (health.iysAktarilmamis > 0) {
    issues.push({
      level: 'warning',
      message: `${health.iysAktarilmamis} izin kaydı İYS'ye aktarılmadı.`,
      hint: 'Mevzuat yeni onayların 3 iş günü içinde aktarılmasını gerektirir.',
    });
  }

  if (health.basarisizGiris24s > FAILED_LOGIN_WARNING) {
    issues.push({
      level: 'warning',
      message: `Son 24 saatte ${health.basarisizGiris24s} hatalı giriş denemesi yapıldı.`,
      hint: 'Şifrenizi güçlendirmeyi ve denetim kaydını incelemeyi düşünün.',
    });
  }

  // Demo modunda otomatik yedekleme çalışmaz; eksik yedek hata sayılmaz.
  if (!isDemoMode) {
    if (!health.sonYedek) {
      issues.push({
        level: 'error',
        message: 'Henüz başarılı bir yedek alınmamış.',
        hint: 'CRON_SECRET ve yedek kovası (Storage) tanımlı mı kontrol edin.',
      });
    } else if (health.sonYedek.yasSaat > BACKUP_MAX_AGE_HOURS) {
      issues.push({
        level: 'error',
        message: `Son yedek ${health.sonYedek.yasSaat} saat önce alınmış.`,
        hint: 'Günlük yedekleme görevi çalışmıyor olabilir.',
      });
    }
  }

  return issues;
}
