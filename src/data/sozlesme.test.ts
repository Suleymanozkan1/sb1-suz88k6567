import { describe, expect, it } from 'vitest';
import { sozlesmeSartlari } from './sozlesme';

/**
 * Sözleşme şartları.
 *
 * Metin işletmenin basılı sözleşmesinden geldi; eksilmesi ya da bir
 * maddenin sessizce düşmesi hukuki sonuç doğurur. Testler madde sayısını
 * ve kilit ifadeleri sabitler.
 */
describe('sozlesmeSartlari', () => {
  it('on altı madde döndürür', () => {
    expect(sozlesmeSartlari('İstanbul')).toHaveLength(16);
  });

  it('hiçbir madde boş kalmaz', () => {
    sozlesmeSartlari('İstanbul').forEach((madde) => {
      expect(madde.trim().length).toBeGreaterThan(20);
    });
  });

  it('kilit hükümleri taşır', () => {
    const metin = sozlesmeSartlari('İstanbul').join(' ');
    expect(metin).toContain('CAYMA TAZMİNATI');
    expect(metin).toContain('1/3');
    expect(metin).toContain('156/2');
    expect(metin).toContain('60 gün önceden');
    expect(metin).toContain('%10 opsiyon');
    expect(metin).toContain('%15 gecikme faizi');
    expect(metin).toContain('+%20 KDV');
    expect(metin).toContain('iki nüsha');
  });

  it('yetkili mahkeme işletmenin şehrinden gelir', () => {
    expect(sozlesmeSartlari('İstanbul')[14]).toContain('İstanbul Mahkemeleri');
    expect(sozlesmeSartlari('Ankara')[14]).toContain('Ankara Mahkemeleri');
    // Başka ilde çalışan bir işletmede metne İstanbul yazılı kalmamalı.
    expect(sozlesmeSartlari('Ankara').join(' ')).not.toContain('İstanbul');
  });

  it('şehir boşsa cümle yine kurulur', () => {
    expect(sozlesmeSartlari('  ')[14]).toContain('yetkili Mahkemeleri');
  });

  it('PDF kopyalama artığı taşımaz', () => {
    const metin = sozlesmeSartlari('İstanbul').join(' ');
    expect(metin).not.toContain('&nbsp;');
    expect(metin).not.toContain('&amp;');
  });

  it('bilinen yazım yanlışları düzeltilmiştir', () => {
    const metin = sozlesmeSartlari('İstanbul').join(' ');
    expect(metin).toContain('sanatçı');
    expect(metin).toContain('muvafakat');
    expect(metin).toContain('feragat');
    expect(metin).not.toContain('sanaçtı');
    expect(metin).not.toContain('muafakat');
    expect(metin).not.toContain('feraget');
  });
});
