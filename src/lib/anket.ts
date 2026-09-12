/**
 * Deneyim anketi kuralları (madde 31).
 *
 * Puanların doğrulanması TEK YERDE: aynı kural hem anket sayfasında
 * (kullanıcıya hata göstermek için) hem de sunucuda (kaydı reddetmek
 * için) çalışıyor. İki ayrı kopya olsaydı tarayıcıyı atlayan bir istek
 * veritabanına 0 ya da 9 puan yazabilirdi.
 */
import {
  ANKET_EN_DUSUK, ANKET_EN_YUKSEK, ANKET_SORULARI, type Survey,
} from '../types';

/**
 * Gelen puanları süzer.
 *
 * Tanımadığımız anahtarlar ATILIYOR, hata verilmiyor: eski bir bağlantı
 * eski bir soru anahtarıyla gelebilir ve bu, bütün cevabı çöpe atmayı
 * gerektirmez. Aralık dışı bir puan ise reddediliyor -- 7 puan, 1-5
 * ölçeğinde ortalamayı bozar.
 *
 * Hiç geçerli puan yoksa `null`: boş bir anket "cevaplandı" sayılmamalı.
 */
export function puanlariSuz(girdi: unknown): Record<string, number> | null {
  if (!girdi || typeof girdi !== 'object' || Array.isArray(girdi)) return null;

  const kayit = girdi as Record<string, unknown>;
  const sonuc: Record<string, number> = {};

  for (const soru of ANKET_SORULARI) {
    const ham = kayit[soru.key];
    if (ham === undefined || ham === null || ham === '') continue;

    const puan = Number(ham);
    if (!Number.isInteger(puan)) return null;
    if (puan < ANKET_EN_DUSUK || puan > ANKET_EN_YUKSEK) return null;
    sonuc[soru.key] = puan;
  }

  return Object.keys(sonuc).length > 0 ? sonuc : null;
}

/** Bir anketin kendi ortalaması. Cevapsızsa null. */
export function anketOrtalamasi(scores: Record<string, number> | undefined): number | null {
  if (!scores) return null;
  const degerler = Object.values(scores);
  if (degerler.length === 0) return null;
  return degerler.reduce((t, d) => t + d, 0) / degerler.length;
}

export interface AnketOzeti {
  /** Gönderilmiş anket sayısı. */
  gonderilen: number;
  cevaplanan: number;
  /** Yüzde; gönderilen yoksa 0. */
  cevapOrani: number;
  /** Cevaplanan anketlerin genel ortalaması; cevap yoksa null. */
  ortalama: number | null;
  /** Soru bazında ortalama; o soruyu kimse cevaplamadıysa satır yok. */
  sorular: { key: string; label: string; ortalama: number; cevap: number }[];
}

/**
 * Anket sonuçlarının özeti.
 *
 * Cevaplanmamış anketler ortalamaya GİRMİYOR ama cevap oranında
 * sayılıyor: "kaç kişi memnun" ile "kaç kişi cevap verdi" ayrı sorular.
 */
export function anketOzeti(anketler: Survey[]): AnketOzeti {
  const gonderilen = anketler.filter((a) => Boolean(a.sentAt)).length;
  const cevaplananlar = anketler.filter((a) => Boolean(a.answeredAt) && a.scores);

  const sorular = ANKET_SORULARI.map((soru) => {
    const puanlar = cevaplananlar
      .map((a) => a.scores?.[soru.key])
      .filter((p): p is number => typeof p === 'number');
    return {
      key: soru.key,
      label: soru.label,
      cevap: puanlar.length,
      ortalama: puanlar.length > 0
        ? puanlar.reduce((t, p) => t + p, 0) / puanlar.length
        : 0,
    };
  }).filter((s) => s.cevap > 0);

  const tumPuanlar = cevaplananlar.flatMap((a) => Object.values(a.scores ?? {}));

  return {
    gonderilen,
    cevaplanan: cevaplananlar.length,
    cevapOrani: gonderilen > 0 ? (cevaplananlar.length / gonderilen) * 100 : 0,
    ortalama: tumPuanlar.length > 0
      ? tumPuanlar.reduce((t, p) => t + p, 0) / tumPuanlar.length
      : null,
    sorular,
  };
}

/**
 * Anketin gönderileceği gün: organizasyondan bir hafta sonra.
 *
 * Ertesi gün sorulsaydı çift henüz balayında olurdu; bir ay sonra
 * sorulsaydı ayrıntı hatırlanmazdı.
 */
export const ANKET_GECIKMESI_GUN = 7;

/** `gun` tarihindeki organizasyonun anket tarihi (yyyy-mm-dd). */
export function anketTarihi(gun: string): string {
  const tarih = new Date(`${gun}T00:00:00Z`);
  tarih.setUTCDate(tarih.getUTCDate() + ANKET_GECIKMESI_GUN);
  return tarih.toISOString().slice(0, 10);
}
