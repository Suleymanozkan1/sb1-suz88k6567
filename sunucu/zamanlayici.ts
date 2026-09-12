/**
 * Zamanlanmış görevler.
 *
 * Cloudflare'in `triggers.crons` listesinin yerini alıyor. Cron
 * ifadeleri DEĞİŞMEDEN taşındı: taşıma sırasında davranışın da
 * değişmesi, sonradan çıkan bir sorunun sebebini bulunamaz hâle
 * getirirdi.
 *
 * Saatler UTC. Cloudflare de UTC çalışıyordu; yerel saate çevirmek
 * hatırlatmaların gönderim saatini sessizce üç saat kaydırırdı.
 * Hatırlatma kuralının kendi saat alanı zaten gün içinde hangi saatten
 * sonra gönderileceğine karar veriyor; buradaki cron yalnızca tarama
 * başlatıyor.
 */

/** Tek bir cron alanının verilen değeri kapsayıp kapsamadığı. */
export function alanEslesir(alan: string, deger: number): boolean {
  for (const parca of alan.split(',')) {
    if (parca === '*') return true;

    const adim = parca.match(/^(\*|\d+(?:-\d+)?)\/(\d+)$/);
    if (adim) {
      const bolen = Number(adim[2]);
      if (bolen <= 0) continue;
      if (adim[1] === '*') {
        if (deger % bolen === 0) return true;
        continue;
      }
      const [bas, son] = adim[1].split('-').map(Number);
      const ust = son ?? bas;
      if (deger >= bas && deger <= ust && (deger - bas) % bolen === 0) return true;
      continue;
    }

    const aralik = parca.match(/^(\d+)-(\d+)$/);
    if (aralik) {
      if (deger >= Number(aralik[1]) && deger <= Number(aralik[2])) return true;
      continue;
    }

    if (/^\d+$/.test(parca) && Number(parca) === deger) return true;
  }
  return false;
}

/**
 * Beş alanlı cron ifadesi verilen dakikada çalışır mı.
 * Alanlar: dakika saat ayın-günü ay haftanın-günü (UTC).
 */
export function cronEslesir(ifade: string, an: Date): boolean {
  const alanlar = ifade.trim().split(/\s+/);
  if (alanlar.length !== 5) return false;

  const [dakika, saat, ayinGunu, ay, haftaninGunu] = alanlar;
  return alanEslesir(dakika, an.getUTCMinutes())
    && alanEslesir(saat, an.getUTCHours())
    && alanEslesir(ayinGunu, an.getUTCDate())
    && alanEslesir(ay, an.getUTCMonth() + 1)
    && alanEslesir(haftaninGunu, an.getUTCDay());
}

export interface ZamanlayiciSecenek {
  /** Cron ifadesi -> çalıştırılacak iş. */
  gorevler: Record<string, () => Promise<unknown>>;
  /** Hata kaydı; sunucu günlüğüne yazmak için. */
  gunluk?: (mesaj: string, hata?: unknown) => void;
  /** Testte saati ileri almak için. */
  simdi?: () => Date;
}

/**
 * Dakika başında uyanıp eşleşen görevleri çalıştırır.
 *
 * Aynı dakika içinde iki kez çalışmaması için son çalıştığı dakika
 * tutuluyor: zamanlayıcı erken uyanırsa görev iki kez tetiklenir ve
 * örneğin SMS kuyruğu aynı mesajı iki defa gönderirdi.
 */
export function zamanlayiciBaslat(secenek: ZamanlayiciSecenek): () => void {
  const simdi = secenek.simdi ?? (() => new Date());
  const gunluk = secenek.gunluk ?? (() => {});
  let sonDakika = '';
  let calisiyor = false;

  async function tur() {
    if (calisiyor) return;
    calisiyor = true;
    try {
      const an = simdi();
      const damga = `${an.getUTCFullYear()}-${an.getUTCMonth()}-${an.getUTCDate()}`
        + `-${an.getUTCHours()}-${an.getUTCMinutes()}`;
      if (damga === sonDakika) return;
      sonDakika = damga;

      for (const [ifade, is] of Object.entries(secenek.gorevler)) {
        if (!cronEslesir(ifade, an)) continue;
        try {
          await is();
        } catch (hata) {
          // Bir görevin düşmesi diğerlerini durdurmamalı; yedek alınamadı
          // diye fatura gönderimi de durursa iki iş birden aksar.
          gunluk(`Zamanlanmış görev düştü: ${ifade}`, hata);
        }
      }
    } finally {
      calisiyor = false;
    }
  }

  void tur();
  const sayac = setInterval(() => { void tur(); }, 20_000);
  // Zamanlayıcı sürecin kapanmasını engellemesin.
  if (typeof sayac.unref === 'function') sayac.unref();
  return () => clearInterval(sayac);
}
