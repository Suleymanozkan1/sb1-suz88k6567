import { beforeEach, describe, expect, it } from 'vitest';
import { seedIfEmpty, TOHUM_SURUMU } from './seed';
import { clearAll, KEYS, read, write } from './storage';

/*
  Tanıtım sitesini daha önce açmış bir tarayıcı, yayına yeni veri çıktığında
  onu görebilmeli. Eskiden bayrak bir kez yazılıyor ve tohum bir daha
  çalışmıyordu; site kendini hiçbir zaman tazeleyemiyordu.
*/
describe('tohum sürümü', () => {
  beforeEach(() => { clearAll(); });

  it('eski sürümle açılmış tarayıcıyı tazeler', () => {
    // Eski kurulum: bayrak `true`, elde cılız veri.
    write(KEYS.seeded, true);
    write(KEYS.reservations, [{ id: 'eski_1', businessId: 'biz_demo' }]);
    write(KEYS.users, [{ id: 'user_demo' }]);

    seedIfEmpty();

    const rez = read(KEYS.reservations, [] as { id: string }[]);
    expect(rez.length).toBeGreaterThan(300);
    expect(rez.some((r) => r.id === 'eski_1')).toBe(false);
    expect(read(KEYS.seeded, 0)).toBe(TOHUM_SURUMU);
  });

  it('tazelemede oturumu düşürmez', () => {
    write(KEYS.seeded, true);
    write(KEYS.users, [{ id: 'user_demo' }]);
    write(KEYS.session, 'user_demo');

    seedIfEmpty();

    expect(read(KEYS.session, null)).toBe('user_demo');
  });

  it('güncel sürümde ikinci kez çalışmaz', () => {
    seedIfEmpty();
    const once = read(KEYS.reservations, [] as unknown[]).length;
    write(KEYS.reservations, [...read(KEYS.reservations, [] as unknown[]), { id: 'elle_eklenen' }]);

    seedIfEmpty();

    // Kullanıcının kendi eklediği kayıt silinmemeli.
    expect(read(KEYS.reservations, [] as unknown[]).length).toBe(once + 1);
  });
});
