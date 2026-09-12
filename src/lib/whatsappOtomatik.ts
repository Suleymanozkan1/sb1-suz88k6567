/**
 * WhatsApp otomatik cevabı: hangi mesaj, ne zaman gönderilir.
 *
 * Kapsam bilerek dar tutuldu. Sistem yalnızca "mesajınız alındı" ve "şu
 * saatte döneceğiz" der; fiyat, tarih ve doluluk sorusuna cevap vermez.
 * Müsaitlik söyleyen bir otomatik yanıtlayıcı, müşteri tarafında salon
 * adına verilmiş bir taahhüt gibi okunur ve dolu bir günü sattırır.
 *
 * Burada ağ yok, veritabanı yok: yalnızca karar. Böylece gece yarısı
 * gelen bir mesajın ne alacağı testle sabitlenebiliyor.
 */

/** Otomatik gönderilen mesajın türü; geçmişte `auto_kind` olarak durur. */
export type OtomatikTur = 'karsilama' | 'mesai_disi';

export interface OtomatikAyar {
  autoReplyEnabled: boolean;
  welcomeMessage: string;
  afterHoursEnabled: boolean;
  afterHoursMessage: string;
  /** "HH:MM" ya da "HH:MM:SS", işletmenin yerel saati. */
  workStart: string;
  workEnd: string;
  /** ISO gün numaraları: 1 pazartesi … 7 pazar. */
  workDays: number[];
}

export const VARSAYILAN_AYAR: OtomatikAyar = {
  autoReplyEnabled: false,
  welcomeMessage: 'Mesajınız bize ulaştı. En kısa sürede size döneceğiz.',
  afterHoursEnabled: false,
  afterHoursMessage:
    'Mesajınız bize ulaştı. Şu an çalışma saatlerimiz dışındayız, ilk iş günü size döneceğiz.',
  workStart: '09:00',
  workEnd: '19:00',
  workDays: [1, 2, 3, 4, 5, 6, 7],
};

/**
 * Türkiye saati UTC+3. 2016'dan beri yaz saati uygulaması yok, bu yüzden
 * sabit. Sunucu UTC çalışıyor; çevrim yapılmazsa "mesai dışı" kararı üç
 * saat kayar ve akşam 21:00'de gelen mesaj mesai içi sayılırdı.
 */
export const TURKIYE_OFFSET_DK = 180;

/** "09:00" / "09:00:00" → gece yarısından beri geçen dakika. Bozuksa null. */
export function saatiDakikayaCevir(saat: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(saat.trim());
  if (!m) return null;
  const sa = Number(m[1]);
  const dk = Number(m[2]);
  if (sa > 23 || dk > 59) return null;
  return sa * 60 + dk;
}

/** UTC an → işletmenin yerel gün numarası (1-7) ve dakikası. */
export function yerelAn(zaman: Date): { gun: number; dakika: number } {
  const kaydirilmis = new Date(zaman.getTime() + TURKIYE_OFFSET_DK * 60 * 1000);
  const jsGun = kaydirilmis.getUTCDay(); // 0 pazar
  return {
    gun: jsGun === 0 ? 7 : jsGun,
    dakika: kaydirilmis.getUTCHours() * 60 + kaydirilmis.getUTCMinutes(),
  };
}

/**
 * Verilen an çalışma saatleri içinde mi.
 *
 * Başlangıç dahil, bitiş hariç: 19:00 kapanışında saat 19:00'da gelen
 * mesaj mesai dışıdır. Bitiş başlangıçtan küçükse aralık gece yarısını
 * aşıyor demektir (20:00-02:00); yanlış yapılandırılmış bir salonun
 * "hep kapalı" sayılmaması için bu da destekleniyor.
 */
export function mesaiIcindeMi(ayar: OtomatikAyar, zaman: Date): boolean {
  const bas = saatiDakikayaCevir(ayar.workStart);
  const bit = saatiDakikayaCevir(ayar.workEnd);
  // Saat okunamıyorsa mesai dışı denmiyor: bozuk bir ayar yüzünden
  // müşteriye "kapalıyız" yazmak, hiç yazmamaktan kötüdür.
  if (bas === null || bit === null) return true;

  const { gun, dakika } = yerelAn(zaman);
  if (bas === bit) return true; // 24 saat açık

  if (bas < bit) {
    return ayar.workDays.includes(gun) && dakika >= bas && dakika < bit;
  }
  // Gece yarısını aşan aralık: akşam kısmı bugüne, sabah kısmı dünkü güne ait.
  if (dakika >= bas) return ayar.workDays.includes(gun);
  if (dakika < bit) return ayar.workDays.includes(gun === 1 ? 7 : gun - 1);
  return false;
}

/**
 * Mesai dışı bilgilendirmesi bu kadar süre içinde tekrarlanmaz.
 *
 * Bir akşam beş mesaj yazan müşteri beş bilgilendirme almamalı; iki gün
 * sonra tekrar yazdığında ise almalı. On iki saat, tek bir akşamı
 * kapsayan en küçük aralık.
 */
export const MESAI_DISI_ARALIK_SAAT = 12;

export interface OtomatikGirdi {
  /** Bu mesajla birlikte yeni bir aday mı açıldı. */
  yeniAday: boolean;
  /** Adaya daha önce gönderilmiş otomatik mesajlar (en yenisi önce olmak zorunda değil). */
  gecmis: { kind: OtomatikTur; at: string }[];
  zaman: Date;
}

/**
 * Gönderilecek otomatik mesajı seçer; gönderilecek bir şey yoksa null.
 *
 * Mesai dışı bilgilendirmesi karşılamanın önüne geçer: ikisi birden
 * gönderilirse müşteri arka arkaya iki mesaj alır, ve "ne zaman
 * döneceğiz" bilgisi "mesajınız alındı"dan daha çok işe yarar.
 */
export function otomatikCevapSec(
  ayar: OtomatikAyar,
  girdi: OtomatikGirdi,
): { kind: OtomatikTur; body: string } | null {
  const disarida = !mesaiIcindeMi(ayar, girdi.zaman);

  if (ayar.afterHoursEnabled && disarida && ayar.afterHoursMessage.trim()) {
    const sonu = girdi.gecmis
      .filter((g) => g.kind === 'mesai_disi')
      .map((g) => new Date(g.at).getTime())
      .filter((t) => Number.isFinite(t))
      .sort((a, b) => b - a)[0];
    const sinir = MESAI_DISI_ARALIK_SAAT * 60 * 60 * 1000;
    if (sonu === undefined || girdi.zaman.getTime() - sonu >= sinir) {
      return { kind: 'mesai_disi', body: ayar.afterHoursMessage.trim() };
    }
    return null;
  }

  // Karşılama adaya bir kez gider. İkinci kez göndermek, müşteriye
  // konuşmanın hatırlanmadığını söyler.
  if (ayar.autoReplyEnabled && ayar.welcomeMessage.trim()) {
    const gonderildi = girdi.gecmis.some((g) => g.kind === 'karsilama');
    if (girdi.yeniAday && !gonderildi) {
      return { kind: 'karsilama', body: ayar.welcomeMessage.trim() };
    }
  }

  return null;
}
