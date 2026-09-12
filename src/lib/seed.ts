/**
 * Demo modu için örnek veri.
 *
 * Yalnızca tarayıcı belleği kullanıldığında (Supabase yapılandırılmamışsa)
 * devreye girer. Gerçek veritabanına hiçbir zaman yazmaz.
 */
import { KEYS, read, write } from './storage';
import { addDays, toIso, todayIso } from './format';
import { DEFAULT_COLOR_SETTINGS, ORG_TO_COLOR_KEY, OWNER_PERMISSIONS } from '../data/constants';
import type {
  Business, CashFlowEntry, Hall, LeadChannel, Menu, Payment, Reservation,
  CustomerLead, SafeMovement, User, Vendor,
} from '../types';

export { DEFAULT_COLOR_SETTINGS, OWNER_PERMISSIONS };

export const DEMO_CREDENTIALS = { email: 'demo@sahratakip.com', password: 'demo1234' };

const DEMO_CUSTOMERS: [string, string, string][] = [
  ['Ahmet & Elif Yılmaz', '5321234567', 'Düğün'],
  ['Mehmet & Zeynep Kaya', '5339876543', 'Düğün'],
  ['Burak & Selin Demir', '5445556677', 'Nişan'],
  ['Emre Çelik', '5051112233', 'Sünnet'],
  ['Hatice Arslan', '5364445566', 'Kına'],
  ['Yusuf & Merve Aydın', '5557778899', 'Düğün'],
  ['Kerem Şahin', '5382223344', 'Doğum Günü'],
  ['Ayşe Koç', '5316667788', 'Nikâh'],
  ['Volkan Öztürk', '5429998877', 'Kokteyl'],
  ['Ada Yazılım A.Ş.', '5301114455', 'Konferans'],
  ['Fatma & Ali Doğan', '5347778811', 'Düğün'],
  ['Serkan Polat', '5358889900', 'Toplantı'],
  ['Gizem & Onur Taş', '5461234599', 'Düğün'],
  ['Ceren Aksoy', '5372223311', 'Nişan'],
  ['Murat Güneş', '5384445599', 'Sünnet'],
];

/**
 * İlk açılışta demo hesabı ve örnek verileri oluşturur.
 * Bayrak kaybolsa dahi mevcut kayıtların üzerine yazmaz.
 */
export function seedIfEmpty(): void {
  if (read<boolean>(KEYS.seeded, false)) return;
  const hasData =
    read<User[]>(KEYS.users, []).length > 0 ||
    read<Business[]>(KEYS.businesses, []).length > 0 ||
    read<Reservation[]>(KEYS.reservations, []).length > 0;
  write(KEYS.seeded, true);
  if (hasData) return;

  const now = new Date().toISOString();
  const ownerId = 'user_demo';
  const businessId = 'biz_demo';

  const owner: User = {
    id: ownerId,
    companyName: 'Grand Sahra Düğün ve Davet Salonu',
    fullName: 'Demo Kullanıcı',
    email: DEMO_CREDENTIALS.email,
    password: DEMO_CREDENTIALS.password,
    mobile: '5320001122',
    role: 'owner',
    permissions: OWNER_PERMISSIONS,
    city: 'İstanbul',
    district: 'Beylikdüzü',
    category: 'Düğün Salonu',
    capacity: 600,
    currency: 'TL',
    instagram: 'grandyildizdugun',
    createdAt: now,
    activeBusinessId: businessId,
  };

  const staff: User = {
    ...owner,
    id: 'user_staff',
    fullName: 'Ayşe Personel',
    email: 'personel@sahratakip.com',
    password: 'personel1234',
    mobile: '5320003344',
    role: 'staff',
    ownerId,
    permissions: ['rezervasyon.goruntule', 'rezervasyon.duzenle', 'rapor.goruntule'],
    instagram: undefined,
  };

  write(KEYS.users, [owner, staff]);

  write(KEYS.businesses, [
    {
      id: businessId, ownerId, name: 'Grand Sahra Düğün ve Davet Salonu', category: 'Düğün Salonu',
      city: 'İstanbul', district: 'Beylikdüzü', phone: '5320001122', capacity: 600, currency: 'TL',
      address: 'Barış Mah. Gül Cad. No:12 Beylikdüzü / İstanbul', instagram: 'grandyildizdugun',
      about: 'Şehrin merkezinde, geniş otoparkı ve modern ses-ışık sistemleri ile hizmetinizde.',
      createdAt: now,
    },
    {
      id: 'biz_demo2', ownerId, name: 'Yıldız Kır Bahçesi', category: 'Kır Düğünü / Bahçe',
      city: 'İstanbul', district: 'Silivri', phone: '5320005566', capacity: 350, currency: 'TL',
      address: 'Selimpaşa Mah. Sahil Yolu No:44 Silivri / İstanbul',
      about: 'Havuz başı konsept düğünler ve kır düğünü organizasyonları.', createdAt: now,
    },
  ] satisfies Business[]);

  // Salonlar: her işletmenin en az bir salonu olmalı (0007 ile aynı kural)
  const demoHalls: Hall[] = [
    { id: 'hall_demo1', businessId, name: 'Kristal Salon', capacity: 500,
      note: 'Ana salon, sahne ve balkon dahil.', isActive: true, createdAt: now },
    { id: 'hall_demo2', businessId, name: 'Zümrüt Salon', capacity: 250,
      note: 'Nişan ve kına için orta ölçekli salon.', isActive: true, createdAt: now },
    { id: 'hall_demo3', businessId: 'biz_demo2', name: 'Bahçe', capacity: 350,
      note: 'Havuz başı açık alan.', isActive: true, createdAt: now },
  ];
  write(KEYS.halls, [
    ...read<Hall[]>(KEYS.halls, []).filter((h) => !demoHalls.some((d) => d.id === h.id)),
    ...demoHalls,
  ]);

  const demoMenus: Menu[] = [
    { id: 'menu_demo1', businessId, name: 'Açık Büfe Ziyafet', pricing: 'kisi_basi',
      priceKurus: 45_000,
      description: [
        'ANA YEMEK', '- Et Kavurma', '- Tereyağlı Pirinç Pilavı', '- İçli Köfte',
        '- Patates Püresi', '- Roll Ekmek',
        'TATLI', '- Dondurmalı Pasta veya 2 Dilim Baklava',
        'SERPMELER', '- Limon Suyu Eşliğinde Salatalık ve Havuç',
        '- Soslu ve Sossuz Patates Cipsi',
        'İÇECEKLER', '- Litrelik Soft İçecek ve Su',
      ].join('\n'),
      isActive: true, createdAt: now },
    { id: 'menu_demo2', businessId, name: 'Kokteyl İkramı', pricing: 'kisi_basi',
      priceKurus: 22_000,
      description: ['SERPMELER', '- Kanepe Çeşitleri', '- Mini Börek',
        'TATLI', '- Profiterol', 'İÇECEKLER', '- Soft İçecek ve Su'].join('\n'),
      isActive: true, createdAt: now },
    { id: 'menu_demo3', businessId, name: 'Salon Kirası (yemeksiz)', pricing: 'sabit',
      priceKurus: 12_000_000, description: 'Yalnızca salon ve ses sistemi.',
      isActive: true, createdAt: now },
    { id: 'menu_demo4', businessId: 'biz_demo2', name: 'Kır Düğünü Paketi', pricing: 'kisi_basi',
      priceKurus: 38_000,
      description: ['ANA YEMEK', '- Barbekü Izgara Çeşitleri', '- Mevsim Salata',
        'TATLI', '- Meyve Tabağı', 'İÇECEKLER', '- Limitsiz Soft İçecek'].join('\n'),
      isActive: true, createdAt: now },
  ];
  write(KEYS.menus, [
    ...read<Menu[]>(KEYS.menus, []).filter((m) => !demoMenus.some((d) => d.id === m.id)),
    ...demoMenus,
  ]);

  const demoVendors: Vendor[] = [
    { id: 'vendor_demo1', businessId, name: 'Yıldız Orkestra', category: 'Orkestra / Müzik',
      phone: '5321230001', note: 'Ses sistemi dahil.', isActive: true, createdAt: now },
    { id: 'vendor_demo2', businessId, name: 'Kare Fotoğraf', category: 'Fotoğraf / Video',
      phone: '5321230002', note: 'Drone çekimi ayrı ücretli.', isActive: true, createdAt: now },
    { id: 'vendor_demo3', businessId, name: 'Lale Çiçekçilik', category: 'Çiçek / Süsleme',
      phone: '5321230003', note: '', isActive: true, createdAt: now },
    { id: 'vendor_demo4', businessId: 'biz_demo2', name: 'Bahçe Işık', category: 'Ses ve Işık',
      phone: '5321230004', note: '', isActive: true, createdAt: now },
  ];
  write(KEYS.vendors, [
    ...read<Vendor[]>(KEYS.vendors, []).filter((v) => !demoVendors.some((d) => d.id === v.id)),
    ...demoVendors,
  ]);

  /*
    Tanıtımdaki kanal dağılımı. Gerçek bir salonun dağılımına yakın:
    Instagram başta, bir kısmı hiç kaydedilmemiş.
  */
  const KANAL_DAGILIMI: (LeadChannel | undefined)[] = [
    'Instagram', 'Instagram', 'Düğün.com', 'Google', 'Referans',
    'Instagram', undefined, 'Diğer', 'Google', undefined,
  ];

  const list: Reservation[] = [];
  const paid: Payment[] = [];

  // Sözleşme numarası yıl başına 1'den başlar; tek bir sayaçla üretilirse
  // 2027'nin ilk kaydı 2027-9 gibi görünürdü.
  const siralar = new Map<number, number>();
  const siraAl = (yil: number) => {
    const sonraki = (siralar.get(yil) ?? 0) + 1;
    siralar.set(yil, sonraki);
    return sonraki;
  };
  const base = new Date();
  base.setDate(1);

  // Saatler seanstan türetilir: gündüz töreni 13:00-17:00, gece 19:00-23:00.
  // Program raporunda aynı gün aynı salondaki iki organizasyonu ayıran da budur.
  const SEANS_SAATI = {
    'Gündüz': { start: '13:00', end: '17:00' },
    'Gece': { start: '19:00', end: '23:00' },
  } as const;

  DEMO_CUSTOMERS.forEach(([name, phone, org], i) => {
    const d = new Date(base);
    d.setMonth(base.getMonth() - 4 + i);
    d.setDate(5 + ((i * 7) % 22));
    const date = toIso(d);
    const total = 60000 + (i % 7) * 25000;
    const deposit = Math.round(total * (0.2 + (i % 4) * 0.1));
    const isPast = date < todayIso();
    const orgType = org as Reservation['organizationType'];
    const slot: Reservation['slot'] = i % 3 === 0 ? 'Gündüz' : 'Gece';

    list.push({
      id: `res_seed_${i}`,
      businessId: i % 5 === 4 ? 'biz_demo2' : businessId,
      hallId: i % 5 === 4 ? 'hall_demo3' : i % 3 === 1 ? 'hall_demo2' : 'hall_demo1',
      menuId: i % 5 === 4 ? 'menu_demo4' : i % 4 === 3 ? 'menu_demo3' : 'menu_demo1',
      code: `${d.getFullYear()}-${siraAl(d.getFullYear())}`,
      // Kanal dağılımı tanıtımda da anlamlı olsun: rapor boş bir tabloyla
      // açılırsa özelliğin ne işe yaradığı anlaşılmıyor. Bir kısmı bilerek
      // boş bırakılıyor; "Belirtilmemiş" satırı da raporun bir parçası.
      sourceChannel: KANAL_DAGILIMI[i % KANAL_DAGILIMI.length],
      sourceDetail: KANAL_DAGILIMI[i % KANAL_DAGILIMI.length] === 'Referans'
        ? 'Önceki müşteri tavsiyesi'
        : KANAL_DAGILIMI[i % KANAL_DAGILIMI.length] === 'Diğer' ? 'Tabela' : undefined,
      customerName: name, customerPhone: phone, customerEmail: '',
      // Çift isimli kayıtlarda ikinci kişi sözleşmede "Gelin ve Damat"
      // satırında görünür.
      secondPersonName: name.includes('&') ? name.split('&').map((p) => p.trim()).join(' / ') : undefined,
      secondPhone: name.includes('&') ? `533${String(1000000 + i * 4321).slice(0, 7)}` : undefined,
      date,
      startTime: SEANS_SAATI[slot].start,
      endTime: SEANS_SAATI[slot].end,
      slot,
      organizationType: orgType, guestCount: 120 + (i % 9) * 45,
      totalAmount: total, deposit, currency: 'TL',
      status: isPast ? 'Tamamlandı' : i % 6 === 5 ? 'Ön Rezervasyon' : 'Kesin Rezervasyon',
      colorKey: ORG_TO_COLOR_KEY[orgType] ?? 'diger',
      note: i % 4 === 0 ? 'Nikâh masası ve sahne süslemesi dahil.' : '',
      services: ['Yemek (Açık Büfe)', 'Orkestra', 'Masa Süsleme'].slice(0, 1 + (i % 3)),
      createdAt: now, updatedAt: now,
    });

    if (isPast) {
      paid.push({
        id: `pay_seed_${i}`, reservationId: `res_seed_${i}`, date,
        amount: total - deposit, method: i % 2 === 0 ? 'Nakit' : 'Havale/EFT',
        note: 'Organizasyon günü kalan tahsilat', createdAt: now,
      });
    }
  });

  /*
    Program çizelgesi haftalık bir çıktıdır; yukarıdaki tohum ayda bir kayıt
    ürettiği için çizelge tanıtımda boş görünüyordu. Bu blok içinde
    bulunulan haftayı doldurur: iki salon, kına ve düğün karışık, bir günde
    aynı salonda gündüz ve gece iki ayrı tören.
  */
  const haftaBasi = (() => {
    const g = new Date();
    // Pazartesi'ye çek (getDay: 0 = Pazar).
    g.setDate(g.getDate() - ((g.getDay() + 6) % 7));
    return g;
  })();
  const haftaGunu = (n: number) => {
    const g = new Date(haftaBasi);
    g.setDate(haftaBasi.getDate() + n);
    return toIso(g);
  };

  const HAFTA: {
    gun: number; hall: string; slot: Reservation['slot']; org: Reservation['organizationType'];
    ad: string; ikinci?: string; tel: string; kisi: number; menu?: string; hizmet: string[];
    not?: string;
  }[] = [
    { gun: 1, hall: 'hall_demo1', slot: 'Gece', org: 'Kına', ad: 'Rabia Yıldız',
      tel: '5331000011', kisi: 200, menu: 'menu_demo2', hizmet: [] },
    { gun: 2, hall: 'hall_demo1', slot: 'Gece', org: 'Kına', ad: 'Esra Kaplan',
      tel: '5331000012', kisi: 300, menu: 'menu_demo2', hizmet: [] },
    { gun: 3, hall: 'hall_demo1', slot: 'Gece', org: 'Kına', ad: 'İlknur Ateş',
      tel: '5331000013', kisi: 300, menu: 'menu_demo2', hizmet: ['Masa Süsleme'] },
    { gun: 4, hall: 'hall_demo1', slot: 'Gece', org: 'Kına', ad: 'Şevval Erdem',
      tel: '5331000014', kisi: 200, menu: 'menu_demo2', hizmet: ['Masa Süsleme'] },
    { gun: 4, hall: 'hall_demo2', slot: 'Gece', org: 'Düğün', ad: 'Rabia Şen', ikinci: 'Emre Şen',
      tel: '5331000015', kisi: 250, menu: 'menu_demo1', hizmet: ['Orkestra'] },
    { gun: 5, hall: 'hall_demo1', slot: 'Gece', org: 'Düğün', ad: 'Zuhal Rana Emen', ikinci: 'Mustafa Sezgin',
      tel: '5331000016', kisi: 300, menu: 'menu_demo1', hizmet: ['Orkestra', 'Masa Süsleme'] },
    // Aynı gün aynı salonda iki tören: çizelgede saat bandıyla ayrılır.
    { gun: 5, hall: 'hall_demo2', slot: 'Gündüz', org: 'Düğün', ad: 'Afra Sude Kılıç', ikinci: 'Ömer Faruk Kılıç',
      tel: '5331000017', kisi: 450, menu: 'menu_demo1', hizmet: ['Su Böreği', 'Salata'],
      not: 'Sahne 12:00 kurulacak.' },
    { gun: 5, hall: 'hall_demo2', slot: 'Gece', org: 'Düğün', ad: 'Zehra Bulut', ikinci: 'Özgür Bulut',
      tel: '5331000018', kisi: 800, menu: 'menu_demo1', hizmet: ['Orkestra'] },
    { gun: 6, hall: 'hall_demo1', slot: 'Gece', org: 'Düğün', ad: 'Emine Toprak', ikinci: 'Ethem Toprak',
      tel: '5331000019', kisi: 300, menu: 'menu_demo1', hizmet: ['Orkestra'] },
    { gun: 6, hall: 'hall_demo2', slot: 'Gece', org: 'Düğün', ad: 'Beyzanur Çetin', ikinci: 'Fatih Çetin',
      tel: '5331000020', kisi: 600, menu: 'menu_demo1', hizmet: ['Orkestra', 'Masa Süsleme'] },
  ];

  HAFTA.forEach((h, i) => {
    const tarih = haftaGunu(h.gun);
    const toplam = 80000 + h.kisi * 350;
    const kapora = Math.round(toplam * 0.3);
    list.push({
      id: `res_hafta_${i}`,
      businessId,
      hallId: h.hall,
      menuId: h.menu,
      code: `${new Date().getFullYear()}-${siraAl(new Date().getFullYear())}`,
      customerName: h.ad,
      customerPhone: h.tel,
      secondPersonName: h.ikinci,
      secondPhone: h.ikinci ? `533200${String(1000 + i).slice(-4)}` : undefined,
      // Tanıtım verisi: gerçek bir kimlik numarası değil, 11 haneli örnek.
      identityNo: `1${String(10000000000 + i * 137).slice(1)}`,
      date: tarih,
      startTime: SEANS_SAATI[h.slot].start,
      endTime: SEANS_SAATI[h.slot].end,
      slot: h.slot,
      organizationType: h.org,
      guestCount: h.kisi,
      totalAmount: toplam,
      deposit: kapora,
      currency: 'TL',
      status: 'Kesin Rezervasyon',
      colorKey: ORG_TO_COLOR_KEY[h.org] ?? 'diger',
      note: h.not ?? '',
      services: h.hizmet,
      address: 'Tahtakale Mah. Abdi İpekçi Cad. No:31',
      createdAt: now,
      updatedAt: now,
    });
  });

  write(KEYS.reservations, list);
  write(KEYS.payments, paid);

  const flow: CashFlowEntry[] = [];
  for (let i = 0; i < 14; i += 1) {
    const d = new Date(base);
    d.setMonth(base.getMonth() - (i % 6));
    d.setDate(3 + (i % 20));
    flow.push({
      id: `cf_seed_${i}`, businessId,
      kind: i % 3 === 0 ? 'Gider' : 'Gelir',
      date: toIso(d),
      category: i % 3 === 0 ? ['Personel Maaş', 'Elektrik', 'Yemek / Catering'][i % 3] : 'Rezervasyon Tahsilatı',
      amount: i % 3 === 0 ? 12000 + i * 900 : 35000 + i * 2500,
      description: i % 3 === 0 ? 'Aylık sabit gider' : 'Organizasyon tahsilatı',
      createdAt: now,
    });
  }
  write(KEYS.cashflow, flow);

  /*
    Çelik kasa tanıtım hareketleri.

    Kasadaki para ile muhasebe bakiyesinin neden ayrı olduğunu bir bakışta
    göstermek için üç örnek: nakit alınıp kasada duran bir gelir, kasaya
    girip sonra bankaya yatırılan bir gelir (net etkisi sıfır) ve kasadan
    ödenen bir gider.
  */
  const kasaHareketleri: SafeMovement[] = [];
  const nakitGelir = flow.filter((f) => f.kind === 'Gelir').slice(0, 2);
  const nakitGider = flow.find((f) => f.kind === 'Gider');

  nakitGelir.forEach((f, i) => {
    kasaHareketleri.push({
      id: `kasa_seed_${i}_giris`, businessId, date: f.date, direction: 'Giriş',
      amount: f.amount, description: `${f.category} · ${f.description ?? ''}`.trim(),
      sourceKind: 'cash_flow', sourceId: f.id, createdAt: now,
    });
  });
  // İlk gelir bankaya yatırıldı: kasaya girdi, sonra kasadan çıktı.
  if (nakitGelir[0]) {
    kasaHareketleri.push({
      id: 'kasa_seed_0_cikis', businessId, date: nakitGelir[0].date, direction: 'Çıkış',
      amount: nakitGelir[0].amount, description: 'Bankaya yatırıldı',
      sourceKind: 'cash_flow', sourceId: nakitGelir[0].id, createdAt: now,
    });
  }
  if (nakitGider) {
    kasaHareketleri.push({
      id: 'kasa_seed_gider', businessId, date: nakitGider.date, direction: 'Çıkış',
      amount: nakitGider.amount, description: `${nakitGider.category} · kasadan ödendi`,
      sourceKind: 'cash_flow', sourceId: nakitGider.id, createdAt: now,
    });
  }
  write(KEYS.safeMovements, kasaHareketleri);

  /*
    Tanıtım müşteri adayları.

    Farklı durumlarda ve farklı eksikliklerde: takip ekranının ve
    dashboard sayımlarının boş bir tabloyla açılması özelliğin ne işe
    yaradığını anlatmıyor. Biri bugün aranacak, biri gecikmiş.
  */
  const adaylar: CustomerLead[] = [
    {
      id: 'lead_seed_1', businessId, name: 'Ömer Ay', phone: '5332642537',
      email: 'oay685126@gmail.com', guestCount: 1000, eventDate: '',
      eventDateText: 'Mayısın ilk haftası', organizationType: 'Düğün',
      source: 'Instagram', sourceDetail: 'WhatsApp hattına yönlendirildi',
      status: 'yeni', nextFollowupAt: todayIso(), lastContactAt: now,
      requestText: 'Fiyat tahminen yemekli ve yemeksiz', note: '',
      createdAt: now, updatedAt: now,
    },
    {
      id: 'lead_seed_2', businessId, name: 'Elif Kara', phone: '5551112233',
      email: '', guestCount: 250, eventDate: addDays(todayIso(), 120),
      eventDateText: '', organizationType: 'Nişan',
      source: 'WhatsApp', sourceDetail: '', status: 'ulasilamadi',
      nextFollowupAt: addDays(todayIso(), -3), lastContactAt: now,
      requestText: 'Nişan için salon ve ikram fiyatı',
      note: 'İki kez arandı, açmadı.', createdAt: now, updatedAt: now,
    },
    {
      id: 'lead_seed_3', businessId, name: 'Burak Şen', phone: '5449998877',
      email: 'burak@ornek.com', guestCount: 400, eventDate: addDays(todayIso(), 200),
      eventDateText: '', organizationType: 'Düğün',
      source: 'Web Sitesi', sourceDetail: '', status: 'teklif_verildi',
      nextFollowupAt: addDays(todayIso(), 4), lastContactAt: now,
      requestText: 'Cumartesi akşam seansı müsait mi', note: '',
      createdAt: now, updatedAt: now,
    },
  ];
  write(KEYS.leads, adaylar);

  write(KEYS.leadMessages, adaylar.flatMap((a) => ([
    {
      id: `${a.id}_m1`, businessId, leadId: a.id, direction: 'gelen' as const,
      channel: 'whatsapp' as const,
      body: a.id === 'lead_seed_1'
        ? 'Ömer Ay\np:+905332642537\noay685126@gmail.com\nFiyat tahminen yemekli ve yemeksiz\n1000\nMayısın ilk haftası\ndüğün'
        : 'Merhaba, salon hakkında bilgi alabilir miyim?',
      actorEmail: '', createdAt: now,
    },
    {
      id: `${a.id}_m2`, businessId, leadId: a.id, direction: 'olay' as const,
      channel: 'sistem' as const, body: 'Müşteri adayı oluşturuldu.',
      actorEmail: '', createdAt: now,
    },
  ])));

  write(KEYS.leadStatusHistory, adaylar.map((a) => ({
    id: `${a.id}_d1`, leadId: a.id, fromStatus: null,
    toStatus: a.status, actorEmail: '', createdAt: now,
  })));

  write(KEYS.sms, [{
    id: 'sms_seed_0', businessId, to: '5321234567',
    body: 'Sayin Ahmet & Elif Yilmaz, rezervasyonunuz kayit edilmistir. Kod: 2026-1',
    kind: 'Rezervasyon' as const, sentAt: addDays(todayIso(), -30) + 'T10:00:00.000Z',
  }]);
}
