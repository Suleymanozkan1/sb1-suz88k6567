/**
 * `src/supabase` Expo yerel modüllerini içe aktarıyor; birim testleri
 * düğüm ortamında koştuğu için modül taklit ediliyor. Yapılandırma yok
 * demek, veri katmanının tanıtım dalını çalıştırmak demek.
 */
jest.mock('../src/supabase', () => ({
  supabase: null,
  yapilandirildi: false,
  SUPABASE_URL: '',
  SUPABASE_ANON: '',
  API_KOK: 'https://sahratakip.com',
}));

import * as veri from '../src/veri';
import { bugunIso } from '../src/bicim';

/**
 * Veri katmanı, tanıtım kipi.
 *
 * Supabase yapılandırılmadığında (mağaza incelemesi, ekran görüntüsü,
 * tanıtım) uygulama örnek veriyle çalışır. Bu veri ekranlarda gerçek gibi
 * görünüyor, o yüzden kendi içinde tutarlı olmak zorunda: ayrıntı
 * ekranındaki "TAHSİLAT" ile alttaki geçmiş listesi, masa planındaki
 * koltuk toplamı ile davetli sayısı ve kasa özetindeki alacak ile
 * rezervasyonların kalanı birbirini tutmalı. Üçü de daha önce tutmuyordu.
 *
 * Kapora ayrıca öne çıkarılıyor: kapora bir tahsilattır ve web paneli de
 * böyle hesaplıyor. Mobilde farklı hesaplanınca aynı kayıt iki ekranda
 * iki ayrı rakam gösteriyordu.
 */
describe('tanıtım kipi', () => {
  it('Supabase yapılandırılmadan tanıtım kipinde çalışır', () => {
    expect(veri.tanitim).toBe(true);
  });

  it('etkin işletme tanımlıdır', () => {
    expect(veri.ISLETME.id).toBeTruthy();
    expect(veri.ISLETME.ad).toBeTruthy();
  });
});

describe('rezervasyon listeleri', () => {
  it('yaklaşanlar yalnızca bugün ve sonrasını verir', async () => {
    const liste = await veri.yaklasanlar();
    expect(liste.length).toBeGreaterThan(0);
    for (const r of liste) expect(r.tarih >= bugunIso()).toBe(true);
  });

  it('yaklaşanlar tarihe göre artan sıradadır', async () => {
    const liste = await veri.yaklasanlar();
    const tarihler = liste.map((r) => r.tarih);
    expect([...tarihler].sort()).toEqual(tarihler);
  });

  it('tüm kayıtlar geçmişi de içerir ve en yeni başta gelir', async () => {
    const liste = await veri.tumKayitlar();
    const yaklasan = await veri.yaklasanlar();
    expect(liste.length).toBeGreaterThan(yaklasan.length);

    const tarihler = liste.map((r) => r.tarih);
    expect([...tarihler].sort().reverse()).toEqual(tarihler);
  });

  it('ayın kayıtları yalnızca o ayı verir', async () => {
    const bugun = new Date();
    const liste = await veri.ayinKayitlari(bugun.getFullYear(), bugun.getMonth());
    const onEk = `${bugun.getFullYear()}-${String(bugun.getMonth() + 1).padStart(2, '0')}`;
    for (const r of liste) expect(r.tarih.startsWith(onEk)).toBe(true);
  });

  it('boş bir ay boş liste döndürür', async () => {
    await expect(veri.ayinKayitlari(1990, 0)).resolves.toEqual([]);
  });

  it('kimliğe göre tek kayıt getirir, yoksa null verir', async () => {
    const [ilk] = await veri.tumKayitlar();
    await expect(veri.rezervasyon(ilk.id)).resolves.toMatchObject({ id: ilk.id });
    await expect(veri.rezervasyon('olmayan')).resolves.toBeNull();
  });
});

describe('kapora ve tahsilat tutarlılığı', () => {
  it('tahsilat kaporayı içerir', async () => {
    // Panel de deposit + payments topluyor. Mobilde kapora atlanınca
    // kalan tutar olduğundan yüksek görünüyordu.
    const liste = await veri.tumKayitlar();
    for (const r of liste) {
      expect(r.tahsilat).toBeGreaterThanOrEqual(r.kapora);
    }
  });

  it('tahsilat toplam tutarı aşmaz', async () => {
    const liste = await veri.tumKayitlar();
    for (const r of liste) expect(r.tahsilat).toBeLessThanOrEqual(r.toplam);
  });

  it('tahsilat geçmişinin toplamı kapora ile birlikte ekrandaki tutarı verir', async () => {
    const liste = await veri.tumKayitlar();
    for (const r of liste) {
      const gecmis = await veri.tahsilatlar(r.id);
      const toplam = gecmis.reduce((t, x) => t + x.tutar, 0);
      expect(r.kapora + toplam).toBe(r.tahsilat);
    }
  });

  it('ek tahsilatı olmayan kayıtta geçmiş boştur', async () => {
    const liste = await veri.tumKayitlar();
    const kaporaKadar = liste.find((r) => r.tahsilat === r.kapora);
    if (kaporaKadar) {
      await expect(veri.tahsilatlar(kaporaKadar.id)).resolves.toEqual([]);
    }
  });

  it('bilinmeyen rezervasyonun tahsilat geçmişi boştur', async () => {
    await expect(veri.tahsilatlar('olmayan')).resolves.toEqual([]);
  });
});

describe('masa düzeni', () => {
  it('koltuk toplamı davetli sayısına eşittir', async () => {
    // Sabit sekiz masa kullanılırken 320 kişilik düğünde "eksik koltuk"
    // uyarısı çıkıyordu.
    const liste = await veri.tumKayitlar();
    for (const r of liste) {
      const masalar = await veri.masalar(r.id);
      const koltuk = masalar.reduce((t, m) => t + m.koltuk, 0);
      expect(koltuk).toBe(r.davetli);
    }
  });

  it('masalar birden başlayarak numaralanır', async () => {
    const [ilk] = await veri.tumKayitlar();
    const masalar = await veri.masalar(ilk.id);
    expect(masalar.map((m) => m.no)).toEqual(masalar.map((_, i) => i + 1));
  });

  it('ilk iki masa etiketlenir', async () => {
    const [ilk] = await veri.tumKayitlar();
    const masalar = await veri.masalar(ilk.id);
    expect(masalar[0].not).toBe('Gelin ve damat masası');
    expect(masalar[1].not).toBe('Aile masası');
  });

  it('bilinmeyen rezervasyonda tek boş masa döner', async () => {
    const masalar = await veri.masalar('olmayan');
    expect(masalar).toHaveLength(1);
    expect(masalar[0].koltuk).toBe(0);
  });
});

describe('iş emri', () => {
  it('saate göre sıralıdır', async () => {
    const satirlar = await veri.isEmri('1');
    const saatler = satirlar.map((s) => s.saat);
    expect([...saatler].sort()).toEqual(saatler);
  });

  it('her satırın saati, işi ve sorumlusu vardır', async () => {
    for (const s of await veri.isEmri('1')) {
      expect(s.saat).toMatch(/^\d{2}:\d{2}$/);
      expect(s.is).toBeTruthy();
      expect(s.sorumlu).toBeTruthy();
    }
  });
});

describe('kasa', () => {
  it('bakiye gelir ile giderin farkıdır', async () => {
    const ozet = await veri.kasaOzeti();
    expect(ozet.bakiye).toBe(ozet.gelir - ozet.gider);
  });

  it('alacak, rezervasyonların kalan tutarlarının toplamıdır', async () => {
    // Özetteki alacak sabit yazılırsa listedeki rakamlarla çelişir.
    const ozet = await veri.kasaOzeti();
    const kayitlar = await veri.tumKayitlar();
    const beklenen = kayitlar.reduce((t, r) => t + Math.max(0, r.toplam - r.tahsilat), 0);
    expect(ozet.alacak).toBe(beklenen);
  });

  it('hareketler tarihe göre yeniden eskiye sıralıdır', async () => {
    const satirlar = await veri.kasaHareketleri();
    const tarihler = satirlar.map((s) => s.tarih);
    expect([...tarihler].sort().reverse()).toEqual(tarihler);
  });

  it('her hareket gelir ya da giderdir', async () => {
    for (const s of await veri.kasaHareketleri()) {
      expect(['Gelir', 'Gider']).toContain(s.tur);
      expect(s.tutar).toBeGreaterThan(0);
    }
  });
});

describe('tanımlar', () => {
  it('salonlar listelenir', async () => {
    const liste = await veri.salonlar();
    expect(liste.length).toBeGreaterThan(0);
    for (const s of liste) expect(s.kapasite).toBeGreaterThan(0);
  });

  it('menüler fiyat türüyle birlikte listelenir', async () => {
    for (const m of await veri.menuler()) {
      expect(['kisi_basi', 'sabit']).toContain(m.fiyatTuru);
      expect(m.fiyat).toBeGreaterThan(0);
    }
  });

  it('tedarikçiler listelenir ve pasif olanlar işaretlidir', async () => {
    const liste = await veri.tedarikciler();
    expect(liste.some((t) => !t.aktif)).toBe(true);
  });
});

describe('müşteri defteri', () => {
  it('rezervasyonlardan türetilir ve telefona göre birleştirir', async () => {
    const kayitlar = await veri.tumKayitlar();
    const liste = await veri.musteriler();
    const benzersizTelefon = new Set(kayitlar.map((r) => r.telefon || r.musteri));
    expect(liste).toHaveLength(benzersizTelefon.size);
  });

  it('toplam tutar ve kayıt sayısı doğru toplanır', async () => {
    const kayitlar = await veri.tumKayitlar();
    for (const m of await veri.musteriler()) {
      const kendi = kayitlar.filter((r) => (r.telefon || r.musteri) === (m.telefon || m.ad));
      expect(m.kayitSayisi).toBe(kendi.length);
      expect(m.toplam).toBe(kendi.reduce((t, r) => t + r.toplam, 0));
    }
  });

  it('en son organizasyonu olan başta gelir', async () => {
    const liste = await veri.musteriler();
    const tarihler = liste.map((m) => m.sonTarih);
    expect([...tarihler].sort().reverse()).toEqual(tarihler);
  });
});

describe('faturalar', () => {
  it('matrah ve KDV toplamı fatura tutarını verir', async () => {
    for (const f of await veri.faturalar()) {
      expect(f.matrah + f.kdv).toBe(f.toplam);
    }
  });

  it('taslak faturanın numarası henüz yoktur', async () => {
    const taslak = (await veri.faturalar()).find((f) => f.durum === 'Taslak');
    expect(taslak?.no).toBe('-');
  });
});

describe('raporlar', () => {
  it('aylık ciro tüm kayıtları kapsar', async () => {
    const kayitlar = await veri.tumKayitlar();
    const ciro = await veri.aylikCiro();
    expect(ciro.reduce((t, a) => t + a.adet, 0)).toBe(kayitlar.length);
    expect(ciro.reduce((t, a) => t + a.tutar, 0))
      .toBe(kayitlar.reduce((t, r) => t + r.toplam, 0));
  });

  it('tür dağılımı tüm kayıtları kapsar ve her türe renk verir', async () => {
    const kayitlar = await veri.tumKayitlar();
    const dagilim = await veri.turDagilimi();
    expect(dagilim.reduce((t, d) => t + d.adet, 0)).toBe(kayitlar.length);
    for (const d of dagilim) expect(d.renk).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('sms, izin ve şablonlar', () => {
  it('sms kayıtları sınıflandırılmıştır', async () => {
    for (const s of await veri.smsKayitlari()) {
      expect(['islem', 'ticari']).toContain(s.sinif);
    }
  });

  it('izin kayıtları onay ya da rettir', async () => {
    for (const i of await veri.izinler()) {
      expect(['ONAY', 'RET']).toContain(i.durum);
    }
  });

  it('şablonlar sınıfıyla birlikte gelir', async () => {
    const liste = await veri.sablonlar();
    expect(liste.length).toBeGreaterThan(0);
    for (const s of liste) {
      expect(['islem', 'ticari']).toContain(s.sinif);
      expect(s.metin).toBeTruthy();
    }
  });

  it('tanıtımda şablon kaydı sunucuya gitmez ve hata vermez', async () => {
    await expect(veri.sablonKaydet('x', 'yeni metin')).resolves.toBeUndefined();
  });

  it('tanıtımda mesaj kuyruğa alınmış sayılır', async () => {
    await expect(veri.mesajGonder('5321234567', 'metin', 'Hatırlatma', 'islem'))
      .resolves.toEqual({ kuyruga: true, gerekce: '' });
  });
});

describe('yönetim ekranları', () => {
  it('kullanıcılar rolüyle listelenir', async () => {
    const liste = await veri.kullanicilar();
    expect(liste.some((u) => u.rol === 'Yönetici')).toBe(true);
    expect(liste.some((u) => u.rol === 'Personel')).toBe(true);
  });

  it('denetim kaydı yeniden eskiye sıralıdır', async () => {
    const satirlar = await veri.denetimKaydi();
    const tarihler = satirlar.map((s) => s.tarih);
    expect([...tarihler].sort().reverse()).toEqual(tarihler);
  });

  it('sistem durumu sayısal alanları negatif değildir', async () => {
    const durum = await veri.sistemDurumu();
    expect(durum.kuyrukBekleyen).toBeGreaterThanOrEqual(0);
    expect(durum.kuyrukBasarisiz).toBeGreaterThanOrEqual(0);
    expect(durum.iysBekleyen).toBeGreaterThanOrEqual(0);
    expect(durum.sonYedek).toBeTruthy();
  });
});

describe('tanıtımda yazma işlemleri sunucuya gitmez', () => {
  it('tahsilat eklemek hata vermez', async () => {
    await expect(veri.tahsilatEkle('1', 1000, 'Nakit', '')).resolves.toBeUndefined();
  });

  it('iş durumu değiştirmek hata vermez', async () => {
    await expect(veri.isDurumu('i1', true)).resolves.toBeUndefined();
  });

  it('kasa kaydı eklemek hata vermez', async () => {
    await expect(veri.kasaEkle('Gider', 'Deneme', 'Diğer', 1000)).resolves.toBeUndefined();
  });

  it('rezervasyon eklemek kimlik döndürmez', async () => {
    await expect(veri.rezervasyonEkle({
      musteri: 'Deneme', telefon: '5321234567', tarih: '2026-12-01', seans: 'Gece',
      tur: 'Düğün', salon: 'Kristal Salon', davetli: 100, toplam: 100000,
      kapora: 20000, durum: 'Ön Rezervasyon',
    })).resolves.toBeNull();
  });
});
