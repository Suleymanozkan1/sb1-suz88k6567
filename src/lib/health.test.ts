import { describe, expect, it } from 'vitest';
import { BACKUP_MAX_AGE_HOURS, findIssues, QUEUE_MAX_AGE_MINUTES } from './health';
import type { SystemHealth } from '../types';

function health(over: Partial<SystemHealth> = {}): SystemHealth {
  return {
    kuyrukBekleyen: 0, kuyrukBasarisiz: 0, kuyrukEngellenen: 0,
    kuyrukEnEskiDakika: 0, iysAktarilmamis: 0, basarisizGiris24s: 0,
    sonYedek: { zaman: '2026-09-01T02:30:00Z', durum: 'basarili', yasSaat: 2, yasDakika: 120 },
    ...over,
  };
}

describe('findIssues — sistem sağlığı değerlendirmesi', () => {
  it('her şey yolundayken sorun bildirmez', () => {
    expect(findIssues(health(), false)).toEqual([]);
  });

  it('kuyruk işleyici durduğunda hata verir', () => {
    const issues = findIssues(health({ kuyrukEnEskiDakika: QUEUE_MAX_AGE_MINUTES + 1 }), false);
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe('error');
    expect(issues[0].message).toMatch(/bekleyen mesaj/);
  });

  it('eşiğin altındaki kuyruk gecikmesini sorun saymaz', () => {
    expect(findIssues(health({ kuyrukEnEskiDakika: QUEUE_MAX_AGE_MINUTES }), false)).toEqual([]);
  });

  it('kalıcı gönderilemeyen mesajı hata olarak bildirir', () => {
    const issues = findIssues(health({ kuyrukBasarisiz: 3 }), false);
    expect(issues[0].level).toBe('error');
    expect(issues[0].message).toContain('3 mesaj');
  });

  it('İYS nedeniyle engellenen mesajı uyarı olarak bildirir', () => {
    const issues = findIssues(health({ kuyrukEngellenen: 2 }), false);
    expect(issues[0].level).toBe('warning');
    expect(issues[0].message).toMatch(/İYS onayı/);
  });

  it('aktarılmamış izin kaydını uyarır ve 3 iş gününü hatırlatır', () => {
    const issues = findIssues(health({ iysAktarilmamis: 5 }), false);
    expect(issues[0].hint).toMatch(/3 iş günü/);
  });

  it('yedek hiç alınmamışsa hata verir', () => {
    const issues = findIssues(health({ sonYedek: null }), false);
    expect(issues.some((i) => i.level === 'error' && /yedek alınmamış/.test(i.message))).toBe(true);
  });

  it('yedek bayatladığında hata verir', () => {
    const stale = health({
      sonYedek: { zaman: '2026-08-20T02:30:00Z', durum: 'basarili',
        yasSaat: BACKUP_MAX_AGE_HOURS + 1, yasDakika: 0 },
    });
    expect(findIssues(stale, false).some((i) => /saat önce alınmış/.test(i.message))).toBe(true);
  });

  it('eşiğin altındaki yedek yaşını sorun saymaz', () => {
    const fresh = health({
      sonYedek: { zaman: '', durum: 'basarili', yasSaat: BACKUP_MAX_AGE_HOURS, yasDakika: 0 },
    });
    expect(findIssues(fresh, false)).toEqual([]);
  });

  it('demo modunda yedek uyarısı vermez (otomatik yedekleme yok)', () => {
    expect(findIssues(health({ sonYedek: null }), true)).toEqual([]);
  });

  it('yoğun hatalı giriş denemesini uyarır', () => {
    const issues = findIssues(health({ basarisizGiris24s: 50 }), false);
    expect(issues.some((i) => /hatalı giriş/.test(i.message))).toBe(true);
  });

  it('birden fazla sorunu birlikte bildirir', () => {
    const issues = findIssues(
      health({ kuyrukBasarisiz: 1, iysAktarilmamis: 1, sonYedek: null }), false,
    );
    expect(issues).toHaveLength(3);
    expect(issues.filter((i) => i.level === 'error')).toHaveLength(2);
  });
});
