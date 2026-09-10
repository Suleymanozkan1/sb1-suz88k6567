import { describe, expect, it } from 'vitest';
import { errorMessage } from './authHelpers';
import { RepoError } from './repo';

/**
 * Hata metni çevirisi.
 *
 * Kullanıcıya "undefined" ya da yığın izi göstermek, hiçbir şey
 * göstermemekten kötüdür: ne olduğunu anlamaz ve destek arar.
 */
describe('errorMessage', () => {
  it('depo hatasının kendi metnini gösterir', () => {
    expect(errorMessage(new RepoError('Bu e-posta adresi ile kayıtlı hesap bulunamadı.')))
      .toBe('Bu e-posta adresi ile kayıtlı hesap bulunamadı.');
  });

  it('sıradan bir hatanın metnini gösterir', () => {
    expect(errorMessage(new Error('Ağ bağlantısı kesildi'))).toBe('Ağ bağlantısı kesildi');
  });

  it('metni boş olan hatada genel açıklamaya düşer', () => {
    expect(errorMessage(new Error(''))).toBe('Beklenmeyen bir hata oluştu. Lütfen tekrar deneyiniz.');
  });

  it('hata olmayan değerlerde genel açıklamaya düşer', () => {
    for (const deger of [null, undefined, 'metin', 42, { kod: 500 }]) {
      expect(errorMessage(deger)).toBe('Beklenmeyen bir hata oluştu. Lütfen tekrar deneyiniz.');
    }
  });

  it('depo hatasının altındaki ham nedeni kullanıcıya sızdırmaz', () => {
    const ham = new Error('permission denied for table reservations');
    expect(errorMessage(new RepoError('Rezervasyonlar alınamadı.', ham)))
      .toBe('Rezervasyonlar alınamadı.');
  });
});
