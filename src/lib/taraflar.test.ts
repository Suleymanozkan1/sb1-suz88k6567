import { describe, expect, it } from 'vitest';
import { ciftOrganizasyonuMu, memleketOzeti, tarafEtiketleri } from './taraflar';

/*
  TARAF ETİKETLERİ.

  Sistem yalnızca düğün tutmuyor. Etiket sabit "Damat / Gelin" olsaydı
  bir şirket toplantısını giren kişi kendi müşterisini damat diye
  kaydetmek zorunda kalırdı.
*/
describe('tarafEtiketleri', () => {
  it('düğünde damat ve gelin der', () => {
    expect(tarafEtiketleri('Düğün')).toEqual({ birinci: 'Damat', ikinci: 'Gelin' });
  });

  it('nişan, kına ve nikâhta da çift vardır', () => {
    for (const tur of ['Nişan', 'Kına', 'Nikâh'] as const) {
      expect(tarafEtiketleri(tur).ikinci).toBe('Gelin');
    }
  });

  it('sünnette gelin demez', () => {
    // İkinci kişi anne/baba ya da akraba olabiliyor.
    expect(tarafEtiketleri('Sünnet')).toEqual({ birinci: 'Müşteri', ikinci: 'İkinci Kişi' });
  });

  it('çift olmayan türlerde genel kalır', () => {
    for (const tur of ['Konferans', 'Toplantı', 'Doğum Günü', 'Kokteyl', 'Diğer'] as const) {
      expect(tarafEtiketleri(tur)).toEqual({ birinci: 'Müşteri', ikinci: 'İkinci Kişi' });
    }
  });
});

describe('ciftOrganizasyonuMu', () => {
  it('düğün ailesini tanır, ötekileri tanımaz', () => {
    expect(ciftOrganizasyonuMu('Düğün')).toBe(true);
    expect(ciftOrganizasyonuMu('Nikâh')).toBe(true);
    expect(ciftOrganizasyonuMu('Sünnet')).toBe(false);
    expect(ciftOrganizasyonuMu('Konferans')).toBe(false);
  });
});

describe('memleketOzeti', () => {
  it('iki memleketi de türe uygun etiketle yazar', () => {
    expect(memleketOzeti('Düğün', 'Sivas', 'Konya'))
      .toBe('Damat memleketi: Sivas · Gelin memleketi: Konya');
  });

  it('çift olmayan türde genel etiket kullanır', () => {
    expect(memleketOzeti('Toplantı', 'Ankara', 'İzmir'))
      .toBe('Müşteri memleketi: Ankara · İkinci Kişi memleketi: İzmir');
  });

  it('boş olanı hiç yazmaz', () => {
    /*
      "Gelin memleketi: -" satırı, bilginin sorulup boş bırakıldığı
      izlenimi verirdi; oysa eski kayıtlarda bu alan hiç sorulmamıştı.
    */
    expect(memleketOzeti('Düğün', 'Sivas')).toBe('Damat memleketi: Sivas');
    expect(memleketOzeti('Düğün', undefined, 'Konya')).toBe('Gelin memleketi: Konya');
  });

  it('ikisi de boşsa boş metin döner', () => {
    expect(memleketOzeti('Düğün')).toBe('');
    expect(memleketOzeti('Düğün', '', '   ')).toBe('');
  });

  it('baştaki ve sondaki boşlukları atar', () => {
    expect(memleketOzeti('Düğün', '  Sivas  ')).toBe('Damat memleketi: Sivas');
  });
});
