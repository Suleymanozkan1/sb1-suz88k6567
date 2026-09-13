import { afterEach, describe, expect, it, vi } from 'vitest';
import { istasyonBul } from './hava';

/*
  Uç noktanın kendisi (fetch + veritabanı) burada koşturulmuyor;
  MGM yanıtlarını çözen katman `api/_mgm.test.ts`'te sınanıyor. Burada
  yalnızca ISTASYON SEÇME kararı var: hangi durumda arama yapılıyor,
  hangi durumda yapılmıyor.
*/

function isletme(over: Record<string, string> = {}) {
  return {
    id: 'b1', name: 'Sahra', city: 'Konya', district: '',
    weather_station: '', weather_station_hourly: '', weather_station_current: '',
    ...over,
  };
}

/* Gerçek MGM yanıtının şekli: üç numara ayrı, öncelik alanı var. */
const MERAM = {
  il: 'Konya', ilce: 'Meram', oncelik: 1,
  gunlukTahminIstNo: 94201, saatlikTahminIstNo: 17245, sondurumIstNo: 17245,
};
const EREGLI = {
  il: 'Konya', ilce: 'Ereğli', oncelik: 3,
  gunlukTahminIstNo: 17902, saatlikTahminIstNo: 17903, sondurumIstNo: 17903,
};

afterEach(() => vi.restoreAllMocks());

describe('istasyonBul', () => {
  it('kayıtlı numara varsa MGM’ye HİÇ sormaz', async () => {
    // Her çalışmada arama yapmak, işletme başına fazladan bir istek demek.
    const cek = vi.fn();
    const sonuc = await istasyonBul(isletme({
      weather_station: '94201', weather_station_hourly: '17245',
      weather_station_current: '17245',
    }), cek);
    expect(sonuc).toEqual({ gunluk: '94201', saatlik: '17245', sonDurum: '17245', yeni: false });
    expect(cek).not.toHaveBeenCalled();
  });

  it('0038 öncesi tek numaralı kayıtta günlüğe düşer', async () => {
    // Eski kayıtta yalnızca günlük numara var; saatlik boş kalmasın.
    const sonuc = await istasyonBul(isletme({ weather_station: '17244' }), vi.fn());
    expect(sonuc).toEqual({ gunluk: '17244', saatlik: '17244', sonDurum: '17244', yeni: false });
  });

  it('boş numarada ÜÇ numarayı da bulur', async () => {
    const cek = vi.fn().mockResolvedValue([MERAM]);
    const sonuc = await istasyonBul(isletme({ district: 'Meram' }), cek);
    expect(sonuc).toEqual({ gunluk: '94201', saatlik: '17245', sonDurum: '17245', yeni: true });
  });

  it('ilçe biliniyorsa ÖNCE ilçeyle sorar', async () => {
    /*
      `?il=Konya` ilin yalnızca birincil merkezini (Meram) döndürüyor;
      ilçesi Ereğli olan salon o listede hiç yok ve il merkezinin
      havasını görürdü.
    */
    const cek = vi.fn().mockResolvedValue([EREGLI]);
    const sonuc = await istasyonBul(isletme({ district: 'Ereğli' }), cek);
    expect(cek).toHaveBeenNthCalledWith(1, '/merkezler?il=Konya&ilce=Ere%C4%9Fli');
    expect(sonuc?.gunluk).toBe('17902');
  });

  it('ilçe sorgusu boş dönerse il sorgusuna düşer', async () => {
    const cek = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([MERAM]);
    const sonuc = await istasyonBul(isletme({ district: 'Çumra' }), cek);
    expect(cek).toHaveBeenCalledTimes(2);
    expect(cek).toHaveBeenNthCalledWith(2, '/merkezler?il=Konya');
    expect(sonuc?.gunluk).toBe('94201');
  });

  it('ili girilmemiş işletmede aramaya çıkmaz', async () => {
    const cek = vi.fn();
    expect(await istasyonBul(isletme({ city: '  ' }), cek)).toBeNull();
    expect(cek).not.toHaveBeenCalled();
  });

  it('MGM yanıt vermezse null döner, çökmez', async () => {
    const cek = vi.fn().mockRejectedValue(new Error('MGM 503 döndü'));
    expect(await istasyonBul(isletme(), cek)).toBeNull();
  });

  it('MGM boş liste döndürürse null döner', async () => {
    const cek = vi.fn().mockResolvedValue([]);
    expect(await istasyonBul(isletme(), cek)).toBeNull();
  });

  it('il adını adres satırına güvenli biçimde koyar', async () => {
    const cek = vi.fn().mockResolvedValue([MERAM]);
    await istasyonBul(isletme({ city: 'Afyonkarahisar & Test' }), cek);
    expect(cek).toHaveBeenCalledWith('/merkezler?il=Afyonkarahisar%20%26%20Test');
  });
});
