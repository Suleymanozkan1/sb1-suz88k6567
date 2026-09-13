import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS, YETKI_SURUMU, yetkileriTasi } from '../types';
import { OWNER_PERMISSIONS } from '../data/constants';
import { YOL_YETKILERI, yolunYetkisi } from './yetkiAlanlari';

describe('yetkileriTasi', () => {
  it('0036 öncesi kaydı bugünkü listeye çevirir', () => {
    const yeni = yetkileriTasi(['rezervasyon.goruntule', 'kasa.goruntule'], 0);
    // Kasayı görebilen fatura ekranını da görebiliyordu.
    expect(yeni).toContain('fatura.goruntule');
    // Sözleşme yazdırmak rezervasyonu görenin yapabildiği işti.
    expect(yeni).toContain('rezervasyon.sozlesme');
    // Eskiden hiçbir yetkiye bağlı olmayan ekranlar kapanmamalı.
    expect(yeni).toContain('musteri.goruntule');
    expect(yeni).toContain('stok.duzenle');
    expect(yeni).toContain('mesaj.goruntule');
  });

  it('ayarlar.duzenle yönetim tarafının tamamına açılır', () => {
    const yeni = yetkileriTasi(['ayarlar.duzenle'], 0);
    expect(yeni).toEqual(expect.arrayContaining([
      'ayarlar.duzenle', 'tanim.duzenle', 'denetim.goruntule', 'sistem.yonet',
    ]));
  });

  it('bugünkü sürümdeki dar listeyi GENİŞLETMEZ', () => {
    /*
      Sezgisel göç burada hata yapıyordu: yönetici bilerek yalnızca
      "gelir/gider görüntüle" verdiğinde, liste eski sanılıp dokuz yetki
      daha ekleniyordu. Sürüm damgası bunu kesiyor.
    */
    expect(yetkileriTasi(['kasa.goruntule'], YETKI_SURUMU)).toEqual(['kasa.goruntule']);
  });

  it('tanınmayan anahtarı ayıklar', () => {
    expect(yetkileriTasi(['uydurma.yetki'], YETKI_SURUMU)).toEqual([]);
  });

  it('boş listeyi bugünkü sürümde boş bırakır', () => {
    expect(yetkileriTasi([], YETKI_SURUMU)).toEqual([]);
  });

  it('sonucu ALL_PERMISSIONS sırasında verir', () => {
    const karisik = yetkileriTasi(['sistem.yonet', 'rezervasyon.goruntule'], YETKI_SURUMU);
    expect(karisik).toEqual(['rezervasyon.goruntule', 'sistem.yonet']);
  });
});

describe('yetki listesi', () => {
  it('işletme sahibi listenin tamamını taşır', () => {
    expect(OWNER_PERMISSIONS).toHaveLength(ALL_PERMISSIONS.length);
  });

  it('anahtarlar benzersiz', () => {
    const anahtarlar = ALL_PERMISSIONS.map((p) => p.key);
    expect(new Set(anahtarlar).size).toBe(anahtarlar.length);
  });
});

describe('yolunYetkisi', () => {
  it('alt yolları da kapsar', () => {
    expect(yolunYetkisi('/panel/rezervasyonlar/abc/duzenle')).toBe('rezervasyon.goruntule');
    expect(yolunYetkisi('/panel/faturalar/f1')).toBe('fatura.goruntule');
  });

  it('en uzun eşleşmeyi seçer', () => {
    // /panel/musteri-adaylari ile /panel/musteri-adaylari/durumlar ayrı
    // kayıtlar olsaydı uzun olan kazanmalıydı; bugün ikisi de aynı yetki.
    expect(yolunYetkisi('/panel/musteri-adaylari/durumlar')).toBe('aday.goruntule');
  });

  it('Özet ekranı yetkiye bağlı değil', () => {
    expect(yolunYetkisi('/panel')).toBeUndefined();
  });

  it('her yol geçerli bir yetkiye bağlanıyor', () => {
    const anahtarlar = new Set(ALL_PERMISSIONS.map((p) => p.key));
    YOL_YETKILERI.forEach((k) => {
      expect(anahtarlar.has(k.yetki), `${k.yol} -> ${k.yetki}`).toBe(true);
    });
  });
});
