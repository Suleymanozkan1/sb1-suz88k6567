import { slugify } from '../lib/format';
import type { DirectoryMember } from '../types';

/** Referanslarımız sayfasında gösterilen toplam işletme sayısı */
export const TOTAL_MEMBER_COUNT = 4024;

const NAME_PREFIX = [
  'Grand', 'Yıldız', 'Beyaz', 'Altın', 'Gümüş', 'Kristal', 'Saray', 'Elit', 'Prestij', 'Zümrüt',
  'Hisar', 'Şölen', 'Orkide', 'Manzara', 'Hayal', 'Petra', 'Sude', 'Sevill', 'Lale', 'Gonca',
  'Nur', 'Sedef', 'Safir', 'İnci', 'Mercan', 'Bahar', 'Çınar', 'Palmiye', 'Vadi', 'Göl',
];

const NAME_SUFFIX: Record<string, string[]> = {
  'Düğün Salonu': ['Düğün Salonu', 'Düğün Sarayı', 'Davet', 'Balo Salonu'],
  'Kına Salonu': ['Kına Salonu', 'Kına Evi', 'Kına Konağı'],
  'Kır Düğünü / Bahçe': ['Kır Bahçesi', 'Kır Düğün Bahçesi', 'Garden', 'Havuz Başı'],
  'Düğün Oteli': ['Otel & Düğün', 'Resort Düğün', 'Hotel Wedding'],
  Otel: ['Otel', 'Hotel & Spa', 'Resort'],
  'Belediye Nikah Salonu': ['Belediyesi Nikah Salonu', 'Belediyesi Kültür Merkezi'],
  'Organizasyon Firması': ['Organizasyon', 'Event', 'Concept Organizasyon', 'Davet Organizasyon'],
  'Konferans Salonu': ['Konferans Salonu', 'Kongre Merkezi'],
  'Restoran / Cafe': ['Restaurant', 'Cafe & Restaurant', 'Kır Lokantası'],
  Fotoğrafçılar: ['Fotoğrafçılık', 'Studyo', 'Photography'],
};

const CITY_DISTRICTS: [string, string[]][] = [
  ['İstanbul', ['Çekmeköy', 'Tuzla', 'Bakırköy', 'Beylikdüzü', 'Ümraniye', 'Pendik', 'Esenyurt', 'Sancaktepe', 'Kartal', 'Silivri']],
  ['Ankara', ['Çankaya', 'Keçiören', 'Etimesgut', 'Sincan', 'Mamak', 'Yenimahalle', 'Gölbaşı']],
  ['İzmir', ['Bornova', 'Karşıyaka', 'Buca', 'Menemen', 'Torbalı', 'Çiğli', 'Gaziemir']],
  ['Bursa', ['Nilüfer', 'Osmangazi', 'İnegöl', 'Yıldırım', 'Gemlik', 'Mudanya']],
  ['Antalya', ['Muratpaşa', 'Kepez', 'Alanya', 'Manavgat', 'Serik', 'Konyaaltı']],
  ['Kocaeli', ['İzmit', 'Gebze', 'Darıca', 'Körfez', 'Gölcük']],
  ['Konya', ['Selçuklu', 'Meram', 'Karatay', 'Ereğli']],
  ['Adana', ['Seyhan', 'Çukurova', 'Yüreğir', 'Ceyhan']],
  ['Gaziantep', ['Şahinbey', 'Şehitkamil', 'Nizip']],
  ['Samsun', ['İlkadım', 'Atakum', 'Canik', 'Bafra']],
  ['Trabzon', ['Ortahisar', 'Akçaabat', 'Yomra']],
  ['Kayseri', ['Melikgazi', 'Kocasinan', 'Talas']],
  ['Mersin', ['Yenişehir', 'Toroslar', 'Mezitli', 'Tarsus']],
  ['Denizli', ['Merkezefendi', 'Pamukkale']],
  ['Sakarya', ['Adapazarı', 'Serdivan', 'Erenler']],
  ['Şanlıurfa', ['Haliliye', 'Karaköprü', 'Eyyübiye']],
  ['Balıkesir', ['Karesi', 'Altıeylül', 'Bandırma', 'Edremit']],
  ['Eskişehir', ['Tepebaşı', 'Odunpazarı']],
  ['Malatya', ['Battalgazi', 'Yeşilyurt']],
  ['Muğla', ['Bodrum', 'Fethiye', 'Marmaris', 'Menteşe']],
];

const CATEGORY_POOL = Object.keys(NAME_SUFFIX);

const STREETS = [
  'Merkez Mah. Cumhuriyet Cad.', 'Yeni Mah. Atatürk Bulvarı', 'Fatih Mah. Gül Sok.',
  'Bahçelievler Mah. İstasyon Cad.', 'Cumhuriyet Mah. Şehit Er Sok.', 'Yeşiltepe Mah. Sahil Yolu',
];

const ABOUT_TEMPLATES = [
  'Şehrin merkezinde, geniş otoparkı ve modern ses-ışık sistemleri ile hizmetinizde.',
  'Düğün, nişan, kına ve sünnet organizasyonlarınız için profesyonel ekip ve uygun fiyat.',
  'Açık ve kapalı alan seçenekleriyle her mevsim organizasyon imkânı sunuyoruz.',
  'Deneyimli kadromuz ve zengin menü seçenekleri ile özel gününüzde yanınızdayız.',
  'Havuz başı konsept düğünler, kır düğünü ve gece organizasyonları düzenlenmektedir.',
  'Vale, otopark, nikah masası ve süsleme hizmetleri paketlerimize dahildir.',
  'Şehrin en çok tercih edilen mekânlarından biri olarak siz değerli misafirlerimizi ağırlıyoruz.',
  'Kişiye özel organizasyon planlaması ve profesyonel sunum ekibi ile fark yaratıyoruz.',
];

/** Deterministik sözde-rastgele sayı üreteci (her açılışta aynı liste üretilsin diye) */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function buildDirectory(count: number): DirectoryMember[] {
  const rnd = seeded(20260830);
  const out: DirectoryMember[] = [];
  const used = new Set<string>();
  let guard = 0;

  while (out.length < count && guard < count * 20) {
    guard += 1;
    const category = CATEGORY_POOL[Math.floor(rnd() * CATEGORY_POOL.length)];
    const [city, districts] = CITY_DISTRICTS[Math.floor(rnd() * CITY_DISTRICTS.length)];
    const district = districts[Math.floor(rnd() * districts.length)];
    const suffixes = NAME_SUFFIX[category];
    const prefix = NAME_PREFIX[Math.floor(rnd() * NAME_PREFIX.length)];
    const suffix = suffixes[Math.floor(rnd() * suffixes.length)];
    const name =
      category === 'Belediye Nikah Salonu' ? `${district} ${suffix}` : `${prefix} ${suffix}`;

    const key = `${name}|${district}`;
    if (used.has(key)) continue;
    used.add(key);

    const hasCapacity = category !== 'Fotoğrafçılar' && category !== 'Organizasyon Firması';
    // Aynı ada sahip iki işletme olabileceği için slug'a ilçe eklenir.
    const slug = slugify(`${name} ${district}`);
    out.push({
      id: `m${out.length + 1}`,
      slug,
      name,
      category,
      city,
      district,
      capacity: hasCapacity ? 100 + Math.floor(rnd() * 18) * 50 : undefined,
      address: `${STREETS[Math.floor(rnd() * STREETS.length)]} No:${1 + Math.floor(rnd() * 120)}`,
      phone: `5${3 + Math.floor(rnd() * 6)}${String(Math.floor(rnd() * 100000000)).padStart(8, '0')}`,
      about: ABOUT_TEMPLATES[Math.floor(rnd() * ABOUT_TEMPLATES.length)],
    });
  }
  return out;
}

/** Referans listesinde gösterilen örnek işletmeler */
export const DIRECTORY: DirectoryMember[] = buildDirectory(240);

export function findMemberBySlug(slug: string): DirectoryMember | undefined {
  return DIRECTORY.find((m) => m.slug === slug);
}

/** Footer'daki salon kategorisi sayfaları */
export const VENUE_PAGES: {
  slug: string;
  title: string;
  heading: string;
  intro: string;
  categories: string[];
}[] = [
  {
    slug: 'dugun-salonlari',
    title: 'Düğün Salonları',
    heading: 'Düğün Salonları',
    intro:
      'Türkiye genelinde Düğün Takip sistemini kullanan düğün salonları. Şehir ve ilçe seçerek size en yakın salonu bulabilir, kapasite bilgisine göre karşılaştırma yapabilirsiniz.',
    categories: ['Düğün Salonu'],
  },
  {
    slug: 'kina-salonlari',
    title: 'Kına Salonları',
    heading: 'Kına Salonları',
    intro:
      'Kına gecesi organizasyonu için tercih edebileceğiniz, Düğün Takip üyesi kına salonları ve kına evleri.',
    categories: ['Kına Salonu'],
  },
  {
    slug: 'dugun-otelleri',
    title: 'Düğün Otelleri',
    heading: 'Düğün Otelleri',
    intro:
      'Konaklamalı düğün organizasyonu düzenleyebileceğiniz, Düğün Takip üyesi düğün otelleri ve resortlar.',
    categories: ['Düğün Oteli', 'Otel'],
  },
  {
    slug: 'kir-dugunu-mekanlari',
    title: 'Kır Düğünü Mekanları',
    heading: 'Kır Düğünü Mekanları',
    intro:
      'Açık havada, doğayla iç içe kır düğünü yapabileceğiniz bahçeler, havuz başı mekânlar ve gardenlar.',
    categories: ['Kır Düğünü / Bahçe'],
  },
];
