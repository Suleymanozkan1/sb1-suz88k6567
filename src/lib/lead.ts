/**
 * Müşteri adayı yardımcıları.
 *
 * Durum akışı, takip tarihi hesabı ve WhatsApp bağlantısı burada; ekranlar
 * yalnızca sonucu gösteriyor. Aynı kuralın iki ekranda iki türlü yazılması,
 * dashboard sayımı ile listenin birbirini tutmamasına yol açardı.
 */
import type { CustomerLead, LeadStatus } from '../types';
import { todayIso } from './format';

/**
 * Durumun görsel tonu.
 *
 * Kapanmış durumlar (olumsuz, iptal) soluk; iş bekleyenler vurgulu. Personel
 * listede önce yapılacak işi görmeli.
 */
export const LEAD_STATUS_TONE: Record<LeadStatus, string> = {
  'Aranmadı': 'bg-[#fef6e7] text-[#92600e]',
  'Arandı': 'bg-[#e7f5fb] text-[#0c5e8a]',
  'Ulaşılamadı': 'bg-[#fdeaea] text-[#b91c1c]',
  'Tekrar Aranacak': 'bg-[#fef6e7] text-[#92600e]',
  'Tekrar Arandı': 'bg-[#e7f5fb] text-[#0c5e8a]',
  "WhatsApp'tan İletişim Kuruldu": 'bg-[#e8f8ef] text-[#15803d]',
  'İletişim Sağlandı': 'bg-[#e8f8ef] text-[#15803d]',
  'Teklif Gönderildi': 'bg-[#ede9fe] text-[#5b21b6]',
  'Rezervasyona Döndü': 'bg-[#e8f8ef] text-[#15803d]',
  'Olumsuz': 'bg-surface text-brand-muted',
  'İptal': 'bg-surface text-brand-muted',
};

/** Kapanmış adaylar: artık iş beklemiyorlar. */
export const KAPANAN_DURUMLAR: LeadStatus[] = ['Rezervasyona Döndü', 'Olumsuz', 'İptal'];

export function acikMi(lead: CustomerLead): boolean {
  return !KAPANAN_DURUMLAR.includes(lead.status);
}

/** Takibi bugüne gelmiş mi? Kapanmış aday sayılmıyor. */
export function bugunAranacakMi(lead: CustomerLead, bugun = todayIso()): boolean {
  return acikMi(lead) && lead.nextFollowupAt === bugun;
}

/** Takip tarihi geçmiş mi? Gecikmiş iş, bekleyen işten önce görünmeli. */
export function gecikmisMi(lead: CustomerLead, bugun = todayIso()): boolean {
  return acikMi(lead) && Boolean(lead.nextFollowupAt) && lead.nextFollowupAt < bugun;
}

export interface LeadOzet {
  yeni: number;
  bugun: number;
  geciken: number;
  ulasilamayan: number;
  tekrarAranacak: number;
  teklif: number;
  rezervasyon: number;
  olumsuz: number;
}

/** Dashboard'daki müşteri takip özeti. */
export function leadOzeti(leads: CustomerLead[], bugun = todayIso()): LeadOzet {
  return {
    yeni: leads.filter((l) => l.status === 'Aranmadı').length,
    bugun: leads.filter((l) => bugunAranacakMi(l, bugun)).length,
    geciken: leads.filter((l) => gecikmisMi(l, bugun)).length,
    ulasilamayan: leads.filter((l) => l.status === 'Ulaşılamadı').length,
    tekrarAranacak: leads.filter((l) => l.status === 'Tekrar Aranacak').length,
    teklif: leads.filter((l) => l.status === 'Teklif Gönderildi').length,
    rezervasyon: leads.filter((l) => l.status === 'Rezervasyona Döndü').length,
    olumsuz: leads.filter((l) => l.status === 'Olumsuz' || l.status === 'İptal').length,
  };
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
