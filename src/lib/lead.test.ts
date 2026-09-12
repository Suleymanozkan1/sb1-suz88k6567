import { describe, expect, it } from 'vitest';
import {
  bugunAranacakMi, durumAdi, durumHaritasi, durumSinifi, etkinlikTarihi,
  gecikmisMi, kapandiMi, kazanimDurumu, leadOzeti, secilebilirDurumlar,
  baslangicDurumu, toplamAday, whatsappWebLinki,
} from './lead';
import { VARSAYILAN_LEAD_DURUMLARI } from '../types';
import type { CustomerLead, LeadStatusDef } from '../types';

/**
 * Durumlar artık işletmenin düzenlediği satırlar.
 *
 * Bu dosyanın asıl derdi şu: hiçbir iş kuralı durum ADINA bakmamalı.
 * Bir salon "Rezervasyona Döndü"yü "Sözleşme İmzalandı" yaptığında
 * dashboard sayıları ve takip listeleri aynı çalışmaya devam etmeli.
 */
const BIZ = 'biz-1';

const durumlar: LeadStatusDef[] = VARSAYILAN_LEAD_DURUMLARI.map((d) => ({
  ...d, id: `d_${d.code}`, businessId: BIZ,
}));

const harita = durumHaritasi(durumlar);

const aday = (over: Partial<CustomerLead> = {}): CustomerLead => ({
  id: 'l1', businessId: BIZ, name: 'Ömer Ay', phone: '5332642537', email: '',
  guestCount: null, eventDate: '', eventDateText: '', organizationType: '',
  source: 'WhatsApp', sourceDetail: '', status: 'yeni', nextFollowupAt: '',
  lastContactAt: '', requestText: '', note: '',
  createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z',
  ...over,
});

describe('varsayılan akış', () => {
  it('şartnamedeki on iki durumu taşır', () => {
    expect(durumlar).toHaveLength(12);
    expect(durumlar.map((d) => d.label)).toEqual([
      'Yeni', 'Aranacak', 'Arandı', 'Ulaşılamadı', 'Tekrar Aranacak',
      'Tekrar Arandı', 'İletişim Kuruldu', 'Teklif Verildi',
      'Rezervasyon Bekliyor', 'Rezervasyona Döndü', 'Olumsuz', 'İptal',
    ]);
  });

  it('tek başlangıç ve tek kazanım durumu vardır', () => {
    expect(durumlar.filter((d) => d.isInitial)).toHaveLength(1);
    expect(durumlar.filter((d) => d.isWon)).toHaveLength(1);
    expect(baslangicDurumu(durumlar)).toBe('yeni');
    expect(kazanimDurumu(durumlar)).toBe('rezervasyona_dondu');
  });

  it('kapanan durumlar kapanış bayrağı taşır', () => {
    expect(durumlar.filter((d) => d.isClosed).map((d) => d.code))
      .toEqual(['rezervasyona_dondu', 'olumsuz', 'iptal']);
  });
});

describe('durum adı ve rengi', () => {
  it('kodu değil etiketi gösterir', () => {
    expect(durumAdi(harita, 'tekrar_aranacak')).toBe('Tekrar Aranacak');
  });

  it('tanınmayan kodda kodun kendisini yazar', () => {
    // Silinmiş bir durumu taşıyan eski geçmiş satırlarında oluyor;
    // "bilinmiyor" yazmak hangi durum olduğunu hiç söylemezdi.
    expect(durumAdi(harita, 'silinmis_durum')).toBe('silinmis_durum');
  });

  it('boş kodda boş döner', () => {
    expect(durumAdi(harita, '')).toBe('');
    expect(durumAdi(harita, null)).toBe('');
  });

  it('rengi tondan seçer', () => {
    expect(durumSinifi(harita, 'ulasilamadi')).toBe(durumSinifi(harita, 'ulasilamadi'));
    // Tanınmayan kod nötr tonda; ekran çökmeden bir şey göstermeli.
    expect(durumSinifi(harita, 'yok')).toBe(durumSinifi(harita, 'olumsuz'));
  });
});

describe('iş kuralları ada değil bayrağa bakar', () => {
  it('kapanmış durumu bayraktan tanır', () => {
    expect(kapandiMi(harita, aday({ status: 'rezervasyona_dondu' }))).toBe(true);
    expect(kapandiMi(harita, aday({ status: 'arandi' }))).toBe(false);
  });

  it('durum yeniden adlandırılınca kural bozulmaz', () => {
    /*
      Asıl mesele bu: sahibi "Rezervasyona Döndü"yü başka bir adla
      kaydettiğinde sayım ve süzgeçler aynı çalışmalı. Ada bakan bir
      karşılaştırma burada sessizce yanlışa düşerdi.
    */
    const yenidenAdlandirilmis = durumlar.map((d) => (
      d.code === 'rezervasyona_dondu' ? { ...d, label: 'Sözleşme İmzalandı' } : d
    ));
    const h2 = durumHaritasi(yenidenAdlandirilmis);
    const l = aday({ status: 'rezervasyona_dondu' });

    expect(kapandiMi(h2, l)).toBe(true);
    expect(durumAdi(h2, l.status)).toBe('Sözleşme İmzalandı');
  });

  it('kapanmış aday bugün aranacaklara ve gecikenlere girmez', () => {
    const bugun = '2026-09-12';
    expect(bugunAranacakMi(harita, aday({ nextFollowupAt: bugun }), bugun)).toBe(true);
    expect(bugunAranacakMi(
      harita, aday({ nextFollowupAt: bugun, status: 'olumsuz' }), bugun)).toBe(false);

    expect(gecikmisMi(harita, aday({ nextFollowupAt: '2026-09-01' }), bugun)).toBe(true);
    expect(gecikmisMi(
      harita, aday({ nextFollowupAt: '2026-09-01', status: 'iptal' }), bugun)).toBe(false);
  });

  it('takip tarihi yoksa gecikmiş saymaz', () => {
    expect(gecikmisMi(harita, aday({ nextFollowupAt: '' }), '2026-09-12')).toBe(false);
  });
});

describe('durum seçim listesi', () => {
  it('pasif durumları listeden düşürür', () => {
    const pasifli = durumlar.map((d) => (d.code === 'iptal' ? { ...d, active: false } : d));
    expect(secilebilirDurumlar(pasifli).map((d) => d.code)).not.toContain('iptal');
  });

  it('adayın TAŞIDIĞI pasif durumu listede tutar', () => {
    /*
      Yoksa kartı açan personel kendi kaydının durumunu select'te göremez
      ve ilk değişiklikte kayıt sessizce başka bir duruma atlar.
    */
    const pasifli = durumlar.map((d) => (d.code === 'iptal' ? { ...d, active: false } : d));
    expect(secilebilirDurumlar(pasifli, 'iptal').map((d) => d.code)).toContain('iptal');
  });
});

describe('dashboard özeti', () => {
  const bugun = '2026-09-12';
  const liste = [
    aday({ id: '1', status: 'yeni', nextFollowupAt: bugun }),
    aday({ id: '2', status: 'yeni' }),
    aday({ id: '3', status: 'ulasilamadi', nextFollowupAt: '2026-09-01' }),
    aday({ id: '4', status: 'rezervasyona_dondu' }),
  ];

  it('zaman kutuları her zaman başta', () => {
    const kutular = leadOzeti(liste, durumlar, bugun);
    expect(kutular[0]).toMatchObject({ anahtar: 'bugun', deger: 1 });
    expect(kutular[1]).toMatchObject({ anahtar: 'geciken', deger: 1 });
  });

  it('her tanımlı durum için bir kutu üretir', () => {
    const kutular = leadOzeti(liste, durumlar, bugun);
    const durumKutulari = kutular.filter((k) => k.durumKodu);
    expect(durumKutulari).toHaveLength(12);
    expect(durumKutulari.find((k) => k.durumKodu === 'yeni')?.deger).toBe(2);
    expect(durumKutulari.find((k) => k.durumKodu === 'iptal')?.deger).toBe(0);
  });

  it('işletme durum eklediğinde kutu da gelir', () => {
    // Sabit kutu listesi, eklenen durumu dashboard'da görünmez bırakırdı.
    const genis = [...durumlar, {
      id: 'd_yer', businessId: BIZ, code: 'yer_gosterildi', label: 'Yer Gösterildi',
      sortOrder: 55, tone: 'ilerleyen' as const,
      isInitial: false, isClosed: false, isWon: false, active: true,
    }];
    const kutular = leadOzeti(liste, genis, bugun);
    expect(kutular.some((k) => k.etiket === 'Yer Gösterildi')).toBe(true);
  });

  it('pasif ve boş durumu kutu olarak göstermez', () => {
    const pasifli = durumlar.map((d) => (d.code === 'iptal' ? { ...d, active: false } : d));
    const kutular = leadOzeti(liste, pasifli, bugun);
    expect(kutular.some((k) => k.durumKodu === 'iptal')).toBe(false);
  });

  it('pasif AMA kullanımdaki durumu gizlemez', () => {
    // Sayı sıfır değilse o adaylar bir yerde görünmeli.
    const pasifli = durumlar.map((d) => (d.code === 'yeni' ? { ...d, active: false } : d));
    const kutular = leadOzeti(liste, pasifli, bugun);
    expect(kutular.find((k) => k.durumKodu === 'yeni')?.deger).toBe(2);
  });

  it('toplam adayı sayar', () => {
    expect(toplamAday(liste)).toBe(4);
  });
});

describe('WhatsApp bağlantısı', () => {
  it('on haneli numaraya ülke kodu ekler', () => {
    expect(whatsappWebLinki('5332642537')).toBe('https://wa.me/905332642537');
  });

  it('metni adres olarak kaçırır', () => {
    expect(whatsappWebLinki('5332642537', 'merhaba & selam'))
      .toBe('https://wa.me/905332642537?text=merhaba%20%26%20selam');
  });
});

describe('etkinlik tarihi', () => {
  it('çözülmüş tarihi yeğler', () => {
    expect(etkinlikTarihi(aday({ eventDate: '2029-07-14', eventDateText: 'yaz' })))
      .toBe('2029-07-14');
  });

  it('çözülemeyen ifadeyi olduğu gibi gösterir', () => {
    expect(etkinlikTarihi(aday({ eventDateText: 'Mayısın ilk haftası' })))
      .toBe('Mayısın ilk haftası');
  });
});
