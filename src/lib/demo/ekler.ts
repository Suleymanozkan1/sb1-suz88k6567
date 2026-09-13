/**
 * Demo modunun YAN KAYITLARI.
 *
 * uret.ts organizasyonu, parayı ve adayı üretiyor. Bu dosya onların
 * etrafındaki defterleri dolduruyor: gönderilmiş SMS'ler, İYS izinleri,
 * kuyruk, masa düzeni, iş emri, tedarikçi atamaları, tahsilat değişiklik
 * geçmişi ve hazır metinler.
 *
 * NEDEN AYRI DOSYA. uret.ts'in işi hacim; burası ise "hangi ekran boş
 * görünüyor" sorusunun cevabı. İkisi tek dosyada olsaydı, bir ekran
 * eklendiğinde hacim üreticisi de her seferinde elleniyor olurdu.
 *
 * TOHUM SABİT. Demo her açılışta aynı görünmeli: ekran görüntüleri ve
 * sunum buna dayanıyor.
 */
import { uretec } from './uret';
import type {
  ErrorReport, EventTask, PaymentAlertRecipient, PaymentEvent, QuickReply,
  Payment, Reservation, ReservationVendor, SeatingTable, SmsConsent, SmsLogEntry,
  SmsQueueEntry, Vendor, WhatsappAccount,
} from '../../types';

export interface EkKayitlar {
  sms: SmsLogEntry[];
  consents: SmsConsent[];
  queue: SmsQueueEntry[];
  seating: SeatingTable[];
  tasks: EventTask[];
  resVendors: ReservationVendor[];
  paymentEvents: PaymentEvent[];
  recipients: PaymentAlertRecipient[];
  quickReplies: QuickReply[];
  errorReports: ErrorReport[];
  whatsappAccounts: WhatsappAccount[];
}

export interface EkAyari {
  businessId: string;
  /** Kayıtların bağlanacağı organizasyonlar. */
  reservations: Reservation[];
  /** Değişiklik geçmişi gerçek tahsilat satırlarına bağlanır. */
  payments: Payment[];
  /** Atanabilecek tedarikçiler; yalnızca hizmet kalemleri atanır. */
  vendors: Vendor[];
  /** Bugün. Testte sabitlenebilsin diye dışarıdan veriliyor. */
  bugun: string;
  actorEmail: string;
  tohum?: number;
}

/** Etkinlik günü iş emri: her salonda aynı akış yürür. */
const IS_EMRI: [string, string, string][] = [
  ['16:00', 'Salon hazırlığı ve masa dizilimi', 'Salon şefi'],
  ['17:30', 'Ses ve ışık provası', 'Teknik ekip'],
  ['18:30', 'Karşılama masası ve nikâh şekeri', 'Ayşe Personel'],
  ['19:00', 'Misafir karşılama', 'Garson ekibi'],
  ['19:45', 'Gelin - damat girişi', 'Salon şefi'],
  ['20:30', 'Yemek servisi', 'Garson ekibi'],
  ['22:00', 'Pasta ve takı merasimi', 'Salon şefi'],
];

const HAZIR_METINLER: [string, string][] = [
  ['Fiyat bilgisi', 'Merhaba, kişi başı menü fiyatlarımız ve salon ücretimiz tarihe göre değişiyor. Uygun olduğunuz bir gün salonu gezmeye bekleriz.'],
  ['Salon gezme randevusu', 'Salonumuzu hafta içi 10:00-18:00, hafta sonu 12:00-17:00 arasında gezebilirsiniz. Size uygun günü yazarsanız randevu ayıralım.'],
  ['Kapora şartı', 'Tarihi kesinleştirmek için sözleşme ve kapora gerekiyor. Kapora tutarı toplam bedelin yüzde yirmisidir.'],
  ['Menü içeriği', 'Menülerimizde çorba, ara sıcak, ana yemek, salata, tatlı ve sınırsız içecek yer alıyor. Detaylı menü listesini paylaşabilirim.'],
  ['Otopark ve ulaşım', 'Salonumuzun 120 araçlık kapalı otoparkı var, vale hizmeti ücretsizdir.'],
  ['Tarih dolu', 'Belirttiğiniz tarih maalesef doludur. Bir hafta öncesi ve sonrası için uygunluk bakabilirim.'],
];

/** Yan kayıtları üretir. */
export function ekKayitlar(ayar: EkAyari): EkKayitlar {
  const { businessId, reservations, payments, vendors, bugun, actorEmail, tohum = 20260913 } = ayar;
  const rnd = uretec(tohum);
  const sec = <T,>(liste: T[]): T => liste[Math.floor(rnd() * liste.length)]!;
  const tam = (alt: number, ust: number) => alt + Math.floor(rnd() * (ust - alt + 1));

  const bizim = reservations.filter((r) => r.businessId === businessId);
  const gecmis = bizim.filter((r) => r.date < bugun);
  const gelecek = bizim.filter((r) => r.date >= bugun);

  const sms: SmsLogEntry[] = [];
  const consents: SmsConsent[] = [];
  const queue: SmsQueueEntry[] = [];
  const seating: SeatingTable[] = [];
  const tasks: EventTask[] = [];
  const resVendors: ReservationVendor[] = [];
  const paymentEvents: PaymentEvent[] = [];

  /*
    SMS kayıtları. Sözleşme açıldığında bilgilendirme, düğünden bir hafta
    önce hatırlatma gider; ikisi de gerçekte kuyruktan geçtiği için
    kayıtta tarih sırası bozulmamalı.
  */
  bizim.forEach((r, i) => {
    if (i % 2 !== 0) return;
    const acilis = (r.createdAt || '').slice(0, 10);
    sms.push({
      id: `sms_kayit_${i}`, businessId, to: r.customerPhone,
      body: `Sayin ${r.customerName}, rezervasyonunuz kayit edilmistir. Sozlesme no: ${r.code}`,
      kind: 'Rezervasyon', sentAt: `${acilis}T10:15:00.000Z`,
    });
    // Hatırlatma yalnızca düğünü geçmiş kayıtlarda gönderilmiş olabilir.
    if (r.date < bugun && i % 4 === 0) {
      sms.push({
        id: `sms_hatirlatma_${i}`, businessId, to: r.customerPhone,
        body: `Sayin ${r.customerName}, ${r.date} tarihli organizasyonunuz icin hazirliklarimiz tamam. Iyi gunler dileriz.`,
        kind: 'Hatırlatma', sentAt: `${r.date}T09:00:00.000Z`,
      });
    }
  });

  /*
    İYS izinleri. Ticari mesaj ancak ONAY'lı numaraya gider; RET'li ve
    henüz İYS'ye yazılamamış satırlar da var, çünkü ekranın asıl işi bu
    üç durumu ayırt etmek.
  */
  bizim.slice(0, 60).forEach((r, i) => {
    const ret = i % 9 === 0;
    const senkronsuz = i % 13 === 0;
    consents.push({
      id: `izin_${i}`, businessId, phone: r.customerPhone,
      status: ret ? 'RET' : 'ONAY',
      source: i % 3 === 0 ? 'Sözleşme' : 'Web formu',
      consentDate: `${(r.createdAt || '').slice(0, 10)}T10:00:00.000Z`,
      iysSyncedAt: senkronsuz ? undefined : `${(r.createdAt || '').slice(0, 10)}T10:05:00.000Z`,
      iysError: senkronsuz ? 'İYS servisine ulaşılamadı, yeniden denenecek.' : undefined,
      note: '',
    });
  });

  /*
    Kuyruk. Bekleyen, gönderilen ve başarısız satırlar bir arada: kuyruk
    ekranının işi hangi mesajın nerede takıldığını göstermek.
  */
  gelecek.slice(0, 24).forEach((r, i) => {
    const durum = i % 6 === 0 ? 'basarisiz' : i % 3 === 0 ? 'bekliyor' : 'gonderildi';
    queue.push({
      id: `kuyruk_${i}`, phone: r.customerPhone,
      body: `Sayin ${r.customerName}, ${r.date} tarihli organizasyonunuzu hatirlatiriz.`,
      kind: 'Hatırlatma', category: 'islem',
      status: durum as SmsQueueEntry['status'],
      attempts: durum === 'basarisiz' ? 3 : 1,
      nextAttemptAt: `${bugun}T08:00:00.000Z`,
      lastError: durum === 'basarisiz' ? 'Operatör geçici hata döndü (500).' : undefined,
      createdAt: `${bugun}T07:00:00.000Z`,
      sentAt: durum === 'gonderildi' ? `${bugun}T07:05:00.000Z` : undefined,
    });
  });

  /*
    Masa düzeni ve iş emri: yaklaşan organizasyonlarda hazırlanır, geçmiş
    kayıtlarda iş emri tamamlanmış görünür.
  */
  const duzenlenecek = [...gelecek.slice(0, 12), ...gecmis.slice(0, 8)];
  duzenlenecek.forEach((r, i) => {
    const masaSayisi = Math.max(6, Math.ceil(r.guestCount / 10));
    for (let m = 0; m < masaSayisi; m += 1) {
      seating.push({
        id: `masa_${i}_${m}`, reservationId: r.id, tableNo: m + 1, seats: 10,
        label: m === 0 ? 'Gelin - damat masası' : m < 3 ? 'Aile' : '',
      });
    }
    IS_EMRI.forEach(([atTime, title, responsible], t) => {
      tasks.push({
        id: `is_${i}_${t}`, reservationId: r.id, atTime, title, responsible,
        done: r.date < bugun,
      });
    });
  });

  /*
    Tedarikçi atamaları. Yalnızca HİZMET kalemleri atanabilir; ürün
    (su, gazoz) stoktan düşer, organizasyona atanmaz.
  */
  const hizmetler = vendors.filter((v) => v.kind === 'hizmet' && v.isActive);
  if (hizmetler.length > 0) {
    duzenlenecek.forEach((r, i) => {
      const kac = tam(1, Math.min(3, hizmetler.length));
      const secilen = new Set<string>();
      for (let k = 0; k < kac; k += 1) {
        const v = sec(hizmetler);
        if (secilen.has(v.id)) continue;
        secilen.add(v.id);
        resVendors.push({
          id: `atama_${i}_${k}`, reservationId: r.id, vendorId: v.id,
          arriveAt: ['17:00', '18:00', '18:30', '19:00'][k % 4],
          cost: v.unitPrice > 0 ? v.unitPrice * tam(1, 4) : tam(3, 30) * 1000,
          note: '',
        });
      }
    });
  }

  /*
    Tahsilat değişiklik geçmişi. Ekranın vaadi "rakama kim dokundu"
    sorusunun cevabı; bu yüzden düzeltme ve silme de var, yalnızca
    ekleme değil.
  */
  const tahsilatlar = new Map<string, Payment[]>();
  for (const p of payments) {
    const liste = tahsilatlar.get(p.reservationId);
    if (liste) liste.push(p); else tahsilatlar.set(p.reservationId, [p]);
  }

  gecmis.filter((r) => tahsilatlar.has(r.id)).slice(0, 30).forEach((r, i) => {
    // Olay GERÇEK tahsilat satırına bağlanıyor: uydurulmuş bir kimlik,
    // geçmişten makbuza gidilemeyen bir satır bırakırdı.
    const ode = tahsilatlar.get(r.id)![0]!;
    paymentEvents.push({
      id: `olay_${i}_a`, businessId, reservationId: r.id, paymentId: ode.id,
      event: 'tahsilat_eklendi', amount: ode.amount, method: ode.method, actorEmail,
      createdAt: `${ode.date}T11:00:00.000Z`,
    });
    if (i % 5 === 0) {
      paymentEvents.push({
        id: `olay_${i}_b`, businessId, reservationId: r.id, paymentId: ode.id,
        event: 'tutar_degisti', amount: ode.amount, oldAmount: Math.max(ode.amount - 5000, 500),
        method: ode.method, actorEmail,
        createdAt: `${ode.date}T15:20:00.000Z`,
      });
    }
    if (i % 7 === 0) {
      paymentEvents.push({
        id: `olay_${i}_c`, businessId, reservationId: r.id, paymentId: ode.id,
        event: 'tip_degisti', amount: ode.amount, method: ode.method, oldMethod: 'Nakit',
        actorEmail, createdAt: `${ode.date}T16:00:00.000Z`,
      });
    }
  });

  const recipients: PaymentAlertRecipient[] = [
    { id: 'alici_1', businessId, name: 'İşletme sahibi', phone: '5320001122', enabled: true, channel: 'whatsapp' },
    { id: 'alici_2', businessId, name: 'Muhasebe', phone: '5320003344', enabled: true, channel: 'sms' },
    { id: 'alici_3', businessId, name: 'Salon şefi', phone: '5320005566', enabled: false, channel: 'whatsapp' },
  ];

  const quickReplies: QuickReply[] = HAZIR_METINLER.map(([title, body], i) => ({
    id: `hazir_${i}`, businessId, title, body, sortOrder: i,
  }));

  /*
    Hata bildirimleri: ekranın sağ alt köşesindeki düğmeden gelir.
    Demoda üç örnek var, biri başka kullanıcıdan -- liste kimin
    bildirdiğini de göstermeli.
  */
  const errorReports: ErrorReport[] = [
    {
      id: 'hata_1', businessId, actorEmail, path: '/panel/raporlar',
      message: 'Ay bazlı raporda geçen yılın aralık ayı görünmüyor.',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      createdAt: `${bugun}T09:12:00.000Z`,
    },
    {
      id: 'hata_2', businessId, actorEmail: 'personel@sahratakip.com', path: '/panel/kasa',
      message: 'Gider eklerken kategori listesi bazen boş geliyor.',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      createdAt: `${bugun}T14:40:00.000Z`,
    },
    {
      id: 'hata_3', businessId, actorEmail: 'personel@sahratakip.com', path: '/panel/takvim',
      message: 'Telefonda takvimde gün kutuları üst üste biniyor.',
      userAgent: 'Mozilla/5.0 (Linux; Android 14)',
      createdAt: `${bugun}T18:05:00.000Z`,
    },
  ];

  /*
    WhatsApp hesabı. Numara demo numarasıdır; gerçek bir hesaba
    bağlanmaz, ekranın ayarlarını göstermek için duruyor.
  */
  const whatsappAccounts: WhatsappAccount[] = [{
    phoneNumberId: 'demo-phone-id',
    businessId,
    displayPhone: '5320001122',
    autoReplyEnabled: true,
    welcomeMessage: 'Merhaba, Grand Sahra Düğün ve Davet Salonu. Mesajınızı aldık, en kısa sürede dönüş yapacağız.',
    afterHoursEnabled: true,
    afterHoursMessage: 'Şu anda mesai saatleri dışındayız. Mesajınızı ilk iş günü yanıtlayacağız.',
    workStart: '10:00',
    workEnd: '19:00',
    workDays: [1, 2, 3, 4, 5, 6],
    createdAt: `${bugun}T08:00:00.000Z`,
  }];

  return {
    sms, consents, queue, seating, tasks, resVendors,
    paymentEvents, recipients, quickReplies, errorReports, whatsappAccounts,
  };
}
