import { useCallback, useEffect, useState } from 'react';
import { KEYS, read, write } from '../lib/storage';

/**
 * Uzun listelerin sayfalama şeridi.
 *
 * NEDEN ORTAK BİLEŞEN. Aynı şerit üç ekranda ayrı ayrı yazılmıştı (kasa,
 * rezervasyonlar, müşteriler). Sayfa başına kayıt seçimi eklenince aynı
 * mantığı üçüncü kez yazmak gerekecekti; biri düzeltilip diğerleri
 * unutulduğunda ekranlar birbirinden ayrı davranırdı.
 *
 * ŞERİT LİSTENİN ALTINDA VE ÜSTÜNDE DEĞİL. Üste konsaydı arama
 * kutusuyla arasına girer, kullanıcı filtreyi değiştirdiğinde gözü önce
 * sayfa numarasına takılırdı. Altta duruyor: liste bitti, devamı burada.
 */

/** Sayfa başına kayıt seçenekleri. */
export const SAYFA_SECENEKLERI = [10, 20, 50, 100] as const;

/** Tercih yapılmadığında kullanılan boyut. */
export const VARSAYILAN_BOYUT = 50;

/** Boyut değiştiğinde bütün listeler uysun diye yayınlanan olay. */
const OLAY = 'dt:sayfa-boyutu';

function okunanBoyut(): number {
  const deger = read<number>(KEYS.pageSize, VARSAYILAN_BOYUT);
  // Depoda elle bozulmuş bir değer listeyi boş bırakabilir; listeye
  // girmeyen her sayı varsayılana düşüyor.
  return (SAYFA_SECENEKLERI as readonly number[]).includes(deger) ? deger : VARSAYILAN_BOYUT;
}

/**
 * Sayfa boyutu tercihi.
 *
 * Olayla yayınlanıyor: iki liste aynı anda açık olabiliyor (örneğin
 * sekmeler arasında), biri değiştiğinde diğeri de uymalı.
 */
export function useSayfaBoyutu(): [number, (deger: number) => void] {
  const [boyut, setBoyut] = useState(okunanBoyut);

  useEffect(() => {
    const dinle = () => setBoyut(okunanBoyut());
    window.addEventListener(OLAY, dinle);
    window.addEventListener('storage', dinle);
    return () => {
      window.removeEventListener(OLAY, dinle);
      window.removeEventListener('storage', dinle);
    };
  }, []);

  const degistir = useCallback((deger: number) => {
    write(KEYS.pageSize, deger);
    setBoyut(deger);
    window.dispatchEvent(new Event(OLAY));
  }, []);

  return [boyut, degistir];
}

export default function Sayfalama({
  toplam, sayfa, boyut, gosterilen, onSayfa, onBoyut, kimlik, birim = 'kayıt',
}: {
  /** Filtre sonrası TOPLAM kayıt sayısı, sayfadaki değil. */
  toplam: number;
  /** Görüntülenen sayfa (1'den başlar). */
  sayfa: number;
  boyut: number;
  /** Bu sayfada çizilen satır sayısı; son sayfa eksik olabiliyor. */
  gosterilen: number;
  onSayfa: (deger: number) => void;
  onBoyut: (deger: number) => void;
  /** Seçim kutusunun `id`'si; sayfada birden çok şerit olabilir. */
  kimlik: string;
  /** "kayıt", "müşteri", "rezervasyon"... */
  birim?: string;
}) {
  /*
    En küçük seçenekten az kayıt varsa şerit HİÇ ÇİZİLMİYOR. Üç müşterisi
    olan salona "Sayfa 1 / 1" ve sayfa boyutu kutusu göstermek, ekranı
    işe yaramayan bir denetimle doldururdu.
  */
  if (toplam <= SAYFA_SECENEKLERI[0]) return null;

  const toplamSayfa = Math.max(1, Math.ceil(toplam / boyut));
  const gecerli = Math.min(sayfa, toplamSayfa);
  const ilkSira = (gecerli - 1) * boyut;

  return (
    <nav className="mt-3 flex flex-wrap items-center justify-between gap-3" aria-label="Kayıt sayfaları">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-brand-muted">
          {ilkSira + 1}-{ilkSira + gosterilen} / {toplam} {birim}
        </p>
        <div className="flex items-center gap-2">
          <label htmlFor={kimlik} className="text-sm text-brand-muted">Sayfada</label>
          <select
            id={kimlik}
            className="field-input h-9 w-auto py-0 text-sm"
            value={boyut}
            onChange={(e) => {
              /*
                Boyut değişince BİRİNCİ SAYFAYA dönülüyor. Kullanıcı 50'lik
                görünümün 4. sayfasındayken 100'e geçtiğinde 4. sayfa artık
                listenin dışında kalıyordu ve ekran boş geliyordu.
              */
              onBoyut(Number(e.target.value));
              onSayfa(1);
            }}
          >
            {SAYFA_SECENEKLERI.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button type="button" className="btn-ghost" disabled={gecerli <= 1}
          onClick={() => onSayfa(gecerli - 1)}>
          Önceki
        </button>
        <span className="text-sm text-brand">Sayfa {gecerli} / {toplamSayfa}</span>
        <button type="button" className="btn-ghost" disabled={gecerli >= toplamSayfa}
          onClick={() => onSayfa(gecerli + 1)}>
          Sonraki
        </button>
      </div>
    </nav>
  );
}
