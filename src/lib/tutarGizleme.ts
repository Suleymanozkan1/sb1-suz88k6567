/**
 * Özet ekranındaki tutarların açık mı gizli mi duracağı.
 *
 * NEDEN. Özet, panelin açılış ekranı ve gün boyu açık duruyor. Ciro,
 * tahsilat ve kalan alacak orada sürekli okunur hâlde beklerse, ekranın
 * yanından geçen herkes salonun cirosunu görüyor. Rakamlar varsayılan
 * olarak perdeleniyor; imleç üstüne gelince o tutar açılıyor, düğmeyle de
 * hepsi sürekli açık bırakılabiliyor.
 *
 * BU BİR GÜVENLİK DUVARI DEĞİL, PERDE. Veri zaten tarayıcıda; gerçek
 * koruma yetki sisteminde (`rapor.goruntule`, `kasa.goruntule`). Buradaki
 * perde, yetkili kullanıcının omzunun üstünden bakılmasına karşı.
 *
 * Tercih TARAYICIDA saklanıyor: kullanıcının kendi ekranına ait bir
 * seçim, hesabın ayarı değil. Aynı hesapla salonun tablet'inden girildiğinde
 * oradaki seçim geçerli oluyor.
 */
import { useCallback, useEffect, useState } from 'react';
import { KEYS, read, write } from './storage';

/** Perdeyi kaldıran olay; aynı sayfadaki bütün tutarlar birlikte değişsin. */
const OLAY = 'dt:tutar-gorunurluk';

export function tutarGorunurMu(): boolean {
  return read<boolean>(KEYS.amountsVisible, false);
}

/**
 * Görünürlük durumu ve değiştiricisi.
 *
 * Olayla yayınlanıyor: düğme ekranın bir yerinde, tutarlar başka yerinde.
 * Durum yalnızca düğmenin içinde tutulsaydı, kartların haberi olmazdı.
 */
export function useTutarGorunur(): [boolean, (deger: boolean) => void] {
  const [gorunur, setGorunur] = useState(tutarGorunurMu);

  useEffect(() => {
    const dinle = () => setGorunur(tutarGorunurMu());
    window.addEventListener(OLAY, dinle);
    // Başka sekmede değiştirilirse burası da uysun.
    window.addEventListener('storage', dinle);
    return () => {
      window.removeEventListener(OLAY, dinle);
      window.removeEventListener('storage', dinle);
    };
  }, []);

  const degistir = useCallback((deger: boolean) => {
    write(KEYS.amountsVisible, deger);
    setGorunur(deger);
    window.dispatchEvent(new Event(OLAY));
  }, []);

  return [gorunur, degistir];
}
