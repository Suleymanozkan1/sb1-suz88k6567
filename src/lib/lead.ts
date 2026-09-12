/**
 * Müşteri adayı yardımcıları.
 *
 * Durum akışı, takip tarihi hesabı ve WhatsApp bağlantısı burada; ekranlar
 * yalnızca sonucu gösteriyor. Aynı kuralın iki ekranda iki türlü yazılması,
 * dashboard sayımı ile listenin birbirini tutmamasına yol açardı.
 *
 * Durumlar işletmenin düzenlediği satırlar olduğundan buradaki hiçbir kural
 * durum ADINA bakmıyor. "Rezervasyona Döndü" yazan bir karşılaştırma,
 * sahibi durumu "Sözleşme İmzalandı" yaptığı anda sessizce yanlış sayardı;
 * sayı ekranda durmaya devam eder, kimse fark etmezdi. Kurallar bayrağa
 * bakıyor: isClosed, isWon.
 */
import type { CustomerLead, LeadStatusDef, LeadStatusTone } from '../types';
import { todayIso } from './format';

/**
 * Durum tonunun ekran karşılığı.
 *
 * Kapanmış durumlar soluk, iş bekleyenler vurgulu. Personel listede önce
 * yapılacak işi görmeli.
 */
export const TON_SINIFI: Record<LeadStatusTone, string> = {
  bekleyen: 'bg-[#fef6e7] text-[#92600e]',
  ilerleyen: 'bg-[#e7f5fb] text-[#0c5e8a]',
  olumlu: 'bg-[#e8f8ef] text-[#15803d]',
  teklif: 'bg-[#ede9fe] text-[#5b21b6]',
  dikkat: 'bg-[#fdeaea] text-[#b91c1c]',
  kapali: 'bg-surface text-brand-muted',
  notr: 'bg-surface text-brand-muted',
};

/** Durum kodu -> tanım. Ekranlar etiketi ve rengi buradan okur. */
export type DurumHaritasi = Map<string, LeadStatusDef>;

export function durumHaritasi(durumlar: LeadStatusDef[]): DurumHaritasi {
  return new Map(durumlar.map((d) => [d.code, d]));
}

/**
 * Durumun ekranda görünecek adı.
 *
 * Tanım bulunamazsa kodun kendisi yazılıyor. Bu, silinmiş bir durumu
 * taşıyan eski geçmiş satırlarında oluyor; "bilinmiyor" yazmak yerine
 * kodu göstermek en azından hangi durum olduğunu söyler.
 */
export function durumAdi(harita: DurumHaritasi, kod: string | null | undefined): string {
  if (!kod) return '';
  return harita.get(kod)?.label ?? kod;
}

export function durumSinifi(harita: DurumHaritasi, kod: string): string {
  return TON_SINIFI[harita.get(kod)?.tone ?? 'notr'];
}

/** Yeni adayın açılacağı durum. */
export function baslangicDurumu(durumlar: LeadStatusDef[]): string {
  return (durumlar.find((d) => d.isInitial) ?? durumlar[0])?.code ?? '';
}

/** Rezervasyona dönüşü işaretleyen durum. */
export function kazanimDurumu(durumlar: LeadStatusDef[]): string {
  return durumlar.find((d) => d.isWon)?.code ?? '';
}

/**
 * Durum seçim listesi.
 *
 * Pasife alınmış durumlar listeden düşer AMA adayın o an taşıdığı durum,
 * pasif olsa bile listede kalır: yoksa kartı açan personel select'te
 * kendi kaydının durumunu göremez ve ilk değişiklikte sessizce başka bir
 * duruma atlar.
 */
export function secilebilirDurumlar(
  durumlar: LeadStatusDef[], mevcutKod?: string,
): LeadStatusDef[] {
  return durumlar.filter((d) => d.active || d.code === mevcutKod);
}

/** Kapanmış aday: artık iş beklemiyor. */
export function kapandiMi(harita: DurumHaritasi, lead: CustomerLead): boolean {
  return harita.get(lead.status)?.isClosed ?? false;
}

export function acikMi(harita: DurumHaritasi, lead: CustomerLead): boolean {
  return !kapandiMi(harita, lead);
}

/** Takibi bugüne gelmiş mi? Kapanmış aday sayılmıyor. */
export function bugunAranacakMi(
  harita: DurumHaritasi, lead: CustomerLead, bugun = todayIso(),
): boolean {
  return acikMi(harita, lead) && lead.nextFollowupAt === bugun;
}

/** Takip tarihi geçmiş mi? Gecikmiş iş, bekleyen işten önce görünmeli. */
export function gecikmisMi(
  harita: DurumHaritasi, lead: CustomerLead, bugun = todayIso(),
): boolean {
  return acikMi(harita, lead)
    && Boolean(lead.nextFollowupAt) && lead.nextFollowupAt < bugun;
}

export interface LeadOzetKutusu {
  /** Kutunun tıklandığında listeyi hangi süzgeçle açacağı. */
  anahtar: string;
  etiket: string;
  deger: number;
  /** Durum koduna bağlı kutular için; zaman kutularında boş. */
  durumKodu?: string;
  ton: LeadStatusTone;
}

/**
 * Dashboard'daki müşteri takip özeti.
 *
 * Kutular sabit değil: zaman temelli iki kutu (bugün, geciken) her zaman
 * var, geri kalanı işletmenin tanımladığı durumlardan üretiliyor. Sabit
 * kutu listesi, sahibi yeni bir durum eklediğinde o durumu dashboard'da
 * görünmez bırakırdı.
 */
export function leadOzeti(
  leads: CustomerLead[], durumlar: LeadStatusDef[], bugun = todayIso(),
): LeadOzetKutusu[] {
  const harita = durumHaritasi(durumlar);
  const sayac = new Map<string, number>();
  for (const l of leads) sayac.set(l.status, (sayac.get(l.status) ?? 0) + 1);

  const kutular: LeadOzetKutusu[] = [
    {
      anahtar: 'bugun',
      etiket: 'Bugün aranacak',
      deger: leads.filter((l) => bugunAranacakMi(harita, l, bugun)).length,
      ton: 'bekleyen',
    },
    {
      anahtar: 'geciken',
      etiket: 'Geciken takip',
      deger: leads.filter((l) => gecikmisMi(harita, l, bugun)).length,
      ton: 'dikkat',
    },
  ];

  for (const d of durumlar) {
    // Pasif ve boş durum kutusu gösterilmiyor: sahibi akıştan çıkardığı
    // bir durumu dashboard'da sıfır olarak görmeye devam etmemeli.
    const adet = sayac.get(d.code) ?? 0;
    if (!d.active && adet === 0) continue;
    kutular.push({
      anahtar: `durum:${d.code}`, etiket: d.label, deger: adet,
      durumKodu: d.code, ton: d.tone,
    });
  }
  return kutular;
}

/** Dashboard'da toplam aday sayısı. */
export function toplamAday(leads: CustomerLead[]): number {
  return leads.length;
}

/**
 * WhatsApp Web bağlantısı.
 *
 * Bu, Cloud API DEĞİLDİR: tarayıcıda konuşmayı açar, mesajı personel kendi
 * eliyle gönderir. Ücreti yoktur ve 24 saat kuralı işlemez. Programla mesaj
 * göndermek isteniyorsa o ayrı bir yoldur (api/whatsapp-gonder.ts).
 */
export function whatsappWebLinki(phone: string, metin = ''): string {
  const rakam = phone.replace(/\D/g, '');
  const tam = rakam.length === 10 ? `90${rakam}` : rakam;
  const ek = metin ? `?text=${encodeURIComponent(metin)}` : '';
  return `https://wa.me/${tam}${ek}`;
}

/**
 * Adayın hangi tarihle anıldığı.
 *
 * Çözülemeyen ifade ("Mayıs ilk hafta") olduğu gibi gösteriliyor; boş
 * bırakmak müşteriyle konuşurken elde bir şey bırakmazdı.
 */
export function etkinlikTarihi(lead: CustomerLead): string {
  return lead.eventDate || lead.eventDateText || '';
}
