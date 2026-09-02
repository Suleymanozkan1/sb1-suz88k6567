import type { NewsItem, Testimonial } from '../types';

/** Anasayfa hero bölümü */
export const HERO = {
  tagline: 'Türkiye’nin ilk online düğün takip sistemi!',
  title: 'Düğün Takip',
  description:
    'Düğün Takip Programı Düğün Salonları için özel olarak geliştirilmiş Rezervasyon ve Ödeme Takip sistemidir.',
  primaryCta: '7 gün ücretsiz deneyin',
  videoCta: 'Tanıtım videosu',
  videoUrl: 'https://www.youtube.com/watch?v=qLCvjL0LbDg',
};

/** "Düğün Takip Ne İşe Yarar?" bölümü */
export const WHY_US = {
  title: 'Düğün Takip Ne İşe Yarar?',
  description:
    'Düğün Takip Programı ile; Düğün Salonunuzun, gündüz ve gece olmak üzere bütün yıl boyunca rezervasyonlarının takibi, Detaylı rezervasyon kaydı, Salon kiralama sözleşmesi oluşturma, Kaparo ve kalan alacak kaydı, Düğün, Sünnet, Nişan, Kına, Konferans, Kokteyl vs. organizasyonları ayrı ayrı kaydetme istenilen tarih aralığında rezervasyon ve alacak bakiyesi raporu alma, isim ve telefon no bazında detaylı kayıt arama, işlemlerini yapabilirsiniz.',
  bullets: [
    '%100 Yerli sermaye',
    'Sürekli güncelleme ve geliştirme',
    'Ücretsiz eğitim',
    'Ücretsiz telefon desteği',
    'Üst düzey güvenlik',
  ],
};

/** Anasayfadaki akordeon (mini SSS) */
export const HOME_ACCORDION: { no: string; question: string; answer: string; linkText?: string; linkTo?: string }[] = [
  {
    no: '01',
    question: 'Düğün Takip Programını satın almadan önce kullanıp test etme imkanı var mı?',
    answer: 'Evet sitemizden üye olarak 7 gün boyunca ücretsiz tam sürüm kullanabilirsiniz. Hemen üye olmak için ',
    linkText: 'tıklayınız',
    linkTo: '/uye-ol',
  },
  {
    no: '02',
    question: 'Düğün Takip Programını nasıl satın alırım?',
    answer:
      'Sisteme üye olup login olduktan sonra size özel yönetim sayfasından güvenli bir şekilde ödemenizi yapabilirsiniz.',
  },
  {
    no: '03',
    question: 'Kredi kartı ve kişisel bilgilerim kayıt altına alınıyormu ve Online alışveriş ne kadar güvenli?',
    answer:
      'İnternet sitemiz üzerinden yaptığınız alışverişlerinizde lisans işlemleriniz için sadece fatura ve iletişim bilgileriniz kayıt altına alınmaktadır. Kredi kartı bilgileriniz ise 128 bit SSL güvenlik katmanı üzerinden sadece bankanıza ödeme bilgisi için gönderilmektedir.',
  },
  {
    no: '04',
    question: 'Düğün Takip Programı tarafından sakladığınız bilgilerimi başka birileri görebilir mi ?',
    answer:
      'Sistemimizde saklamış olduğunuz bilgileri şifrenizi kimseye söylemediğiniz sürece başkaları tarafından görülemez ve görüntülenemez.',
  },
];

/** "Bizi tercih eden sektörler" */
export const SECTORS = {
  title: 'Bizi tercih eden sektörler',
  description: 'Duguntakip.com rezervasyon sistemimizi tercih eden sektör dağılımları aşağıdaki gibidir.',
  items: [
    { label: 'Düğün Salonları', value: 100 },
    { label: 'Organizasyon Firmaları', value: 90 },
    { label: 'Oteller', value: 75 },
    { label: 'Belediye Nikah Salonları', value: 55 },
  ],
};

/** "Hizmetlerimiz" */
export const SERVICES = {
  title: 'Hizmetlerimiz',
  description: 'Neden düğüntakip.com salon yönetim sistemini ve takvim programını seçmelisiniz?',
  items: [
    { icon: 'globe', title: 'Online', text: 'Yer, zaman ve cihazdan bağımsız, işletmenizi dilediğiniz yerden yönetin.' },
    { icon: 'chart', title: 'Raporlama', text: 'Geçmiş datalarınıza istinaden müthiş raporlama ve analiz yeteneği kazanın.' },
    { icon: 'clock', title: 'Zaman Kazanın', text: 'Rezervasyon işlemlerine daha az zaman ayırın, işinizi büyütmeye odaklanın.' },
    { icon: 'cursor', title: 'Kolay Kullanım', text: 'Kullanıcı dostu arayüzü sayesinde herkes, hemen kullanmaya başlayabilir.' },
  ],
};

/** Demo talebi CTA bandı */
export const CTA = {
  title: 'Demo Talebi',
  description: 'Ücretsiz demo ve eğitim talebinde bulunmak yada sizi aramamızı istermisiniz?',
  button: 'Talepte bulun',
};

/** Anasayfada gösterilen üye düşünceleri */
export const TESTIMONIALS: Testimonial[] = [
  {
    business: 'Hisar Düğün Sarayı',
    author: 'Mehmet YARAŞ',
    text: 'sistem mükemel düğün.com üyeliğimiz vardı ordaki tüm hizmetler bu sayfanızda birleştirmişsiniz orda üyeliğimizi bittiriyoruz gerek yok başka sayfalara para ödemeye herşey busayfada olduğu için çok memnunuz sonsuz tşkler öz yaraşlar düğün salon yönetimi',
  },
  { business: 'Şölen düğün salonu', author: 'Mert dadaşer', text: 'Guzel' },
  { business: 'ORKİDE NEW DAVET', author: 'OZAN ÇETİN', text: 'ÇOK MEMNUNUZ. HEPİMİZ İÇİN HAYIRLISI OLSUN.' },
  {
    business: 'GRAND FLORYA DÜĞÜN SALONU',
    author: 'Sefa sarı',
    text: 'mükemmel bir program ajanda tutma devrinin bittiğini gösteriyor ve daha profosyonel daha imaj sağlıyor',
  },
  {
    business: 'Mert Düğün Sarayı',
    author: 'EMRAH KILIÇ',
    text: 'Sistem çok başarılı ve gün geçtikçe yeniliklerin olması daha da güzel yapıyor sistemi.ihtiyaç duyulan herşeye karşılık veriyor.Tavsiye ederim mert düğün sarayı olarak başarıların devamını dileriz',
  },
  {
    business: 'Bizim Ora Kır Düğün Bahçesi',
    author: 'ahmet yaz',
    text: 'düğün takip programı severek kullandığım bir program oldu ve tek programda müşterilerin planlamalarını hesabını takip edebiliyorum işimi okadar kolaylaştırıyor ki her yerden rezervasyon takibi yapabiliyorum, sms ile her şeyi bana bildirdiği için personellerimin de yapmış olduğu anlık rezervasyonları takip edebildim kesinlikle her meslektaşımın kullanması gereken bir program',
  },
  {
    business: 'Florya Wedding',
    author: 'AHMET YAZ',
    text: 'takriben 5 yıl dır üyeliğim var bu süre zarfı içinde düğün takip programı iş yükümü çok hafifletti, bütün rezervasyonlarımı tek ekrandan takip edebiliyorum.',
  },
  {
    business: 'Sevill Concept Organizasyon',
    author: 'Sevil Karakuş',
    text: 'Çok harika ve olağan üstü bir uygulama işlerimizi gerçekten kolaylaştırdınız',
  },
  {
    business: 'Sude Erdoğan event organısatıon',
    author: 'Sude Erdoğan çiftçi',
    text: 'İŞİMİZİ ÇOK RAHATLATTI MÜKEMMEL BİR PROGRAM. HERKESE TAVSİYE EDERİZ.',
  },
  {
    business: 'Petra Konferans ve Düğün Salonu',
    author: 'İrfan EFLATUN',
    text: 'Salonu actıgımızdan belli kullanıyoruz memnunuz',
  },
  { business: 'MANZARA PARK', author: 'MUSTAFA AKPINAR', text: 'Program çok akıcı ve kullanışlı, teşekkür ederiz.' },
  {
    business: 'Hayal Event Tuzla',
    author: 'Buket AY',
    text: '2019 Yılından beri kullanmaktayım, hiçbir sorun yaşamadım. Destek ekibi çok ilgili.',
  },
];

/** Sık Sorulan Sorular */
export const FAQ: { question: string; answer: string }[] = [
  {
    question: 'Tavsiye Et butonu hakkında detaylı bilgi alabilirmiyiz',
    answer:
      'Tavsiye et butonunu Hem uygulamalarınızda (Mobil Paylaşma Butonu için Uygulamanız güncel olmalıdır), hem pcnizde bulabilirsiniz. Kodu kopyalayın yada uygulamadan paylaşın (whatsapp,instagram,sms) Arkadaşınıza gönderin o linkten üye olduğunda Yıllık abonelik ücretini yatırdığında Hemen 1 AY süreniz otomatik sisteminize yüklenecektir. Üye sınırı yoktur , Ne kadar ücretli üyelik o kadar EK süre.',
  },
  {
    question: 'Sistemimi benden başka kimse görebilirmi',
    answer:
      'Sisteminiz size özeldir.Şifrenizi paylaşmadığınız sürece hiç bir kişi, kurum yada kuruluş bilgilerinize erişememektedir.',
  },
  {
    question: 'Studyo takip in İOS ve Android APP si varmı?',
    answer: 'Markete studyo takip yada düğün takip yazdığınızda uygulamamızı indirebilirsiniz.',
  },
  {
    question: 'Rezervasyon Kayıtlarını Müşteriye SMS atabilirmiyiz ?',
    answer: 'Rezervasyon Kayıt ettiğinizde SMS OTOMATİK OLARAK GİDER',
  },
  {
    question: 'Çıktı alamıyorum',
    answer:
      "Crome kullanıyorsanız Popup engellemiş olabilir. AYARLAR-GELİŞMİŞ-İÇERİK AYARLARI-POP-UP'lar-İZİNVER EKLE kısmına www.duguntakip.com yazmanız yeterli",
  },
  {
    question: 'Rezervasyon Kaydı sınırı var mı?',
    answer: 'Sisteme istediğiniz kadar rezervasyon kaydı ekleyebilirsiniz. Sınır yok!',
  },
  {
    question: "PC'ye kurulan Program var mı ?",
    answer:
      "PC'ye Kurulan program mevcut değildir. PC göçmesi , PC bozulması , PC çalınması gibi durumlarda Veri kaybı yaşamamanız için iptal edilmiştir. www.duguntakip.com sadece internet üzerinden kontrol imkanı sağlamaktadır.",
  },
  {
    question: 'Birden fazla düğün salonu sahibiyim ne yapmam gerekir ?',
    answer:
      'Her salonunuz için 1 üyelik açıp , FİRMALARIM ADMİNLER - YENİ İŞLETME EKLE kısmından yeni işletme ekleyebilirsiniz.',
  },
  {
    question: 'Duguntakip.com ne kadar Güvenilir',
    answer: "SSL Güvenlik Paketi duguntakip.com 'a eklenmiştir verileriniz artık daha güvende",
  },
  {
    question: 'Geçmiş tarihli Düğünleri silemiyorum',
    answer:
      'Geçmiş tarihli düğünü silemezsiniz ancak silmek istediğiniz düğünün içerisine girip tarihi bugünün tarihinden ileri bir tarihe transfer edip KAYDET dedikten sonra ileri aldığınız tarihin içerisinden silebilirsiniz.',
  },
  {
    question: 'Kullanım süresi bitti bilgilerim silinirmi',
    answer:
      'Kullanım süreniz bittiğinde satış ve pazarlama departmanımız tarafından bilgilendirilirsiniz. Süreniz bitse de bilgileriniz duguntakip.com sitesinde saklanmaktadır.',
  },
  {
    question: 'Programı Masa Üstüne Nasıl Alabilirim',
    answer:
      'Fotoğrafçılara, Organizasyonculara, Gelinlikçilere,Düğün salonlarına, araç kiralama firmalarına tavsiye et butonu ile üyelik açtırın, her yeni ücretli üye için 1 ay kazanın.',
  },
];

/** Haberler */
export const NEWS: NewsItem[] = [
  {
    slug: 'guvenlik-seviyesi-artirildi',
    title: "DugunTakip.com'da Güvenlik Seviyesi Artırıldı",
    date: '2026-02-14',
    excerpt:
      'Platforma giriş işlemlerinde tüm kullanıcılar için SMS doğrulama zorunlu hale getirilmiştir.',
    body: [
      'Platforma giriş işlemlerinde tüm kullanıcılar için SMS doğrulama zorunlu hale getirilmiştir.',
      'Bu sayede e-posta adresi ve şifrenizi bilen üçüncü şahıslar sisteminize giriş yapamayacak.',
      'Alt kullanıcılar için kişiye özel giriş yöntemi oluşturulabilmektedir. Dilerseniz personellerinizin yalnızca belirli ekranlara erişmesini sağlayabilirsiniz.',
      'SSL Güvenlik Paketi duguntakip.com’a eklenmiştir, verileriniz artık daha güvende.',
    ],
  },
  {
    slug: 'basari',
    title: 'BAŞARI',
    date: '2026-01-08',
    excerpt: "2000'den fazla firma Düğün Takip'i kullanmaktadır.",
    body: [
      "2000'den fazla firma Düğün Takip'i kullanmaktadır.",
      'Bize duyduğunuz güven için teşekkür ederiz. Sistemimizi her gün geliştirmeye, sizden gelen talepleri hızlıca hayata geçirmeye devam ediyoruz.',
      '"Ödüllerin en büyüğü, yaptığımız işleri başarmış olmamızdır." — Montaigne',
    ],
  },
  {
    slug: 'tavsiye-et-kazan',
    title: 'Tavsiye Et Kazan',
    date: '2025-11-20',
    excerpt:
      '"Tavsiye Et Kazan" butonunu kullan, arkadaşını davet et. Arkadaşın üye olduğunda, senin üyeliğin +1 AY uzasın.',
    body: [
      '"Tavsiye Et Kazan" butonunu kullan, arkadaşını davet et. Arkadaşın üye olduğunda, senin üyeliğin +1 AY uzasın.',
      'Üye sınırı yoktur. Ne kadar ücretli üyelik, o kadar EK süre.',
      'Tavsiye kodunuzu üye panelinizdeki "Tavsiye Et Kazan" ekranından kopyalayabilir; WhatsApp, Instagram veya SMS ile paylaşabilirsiniz.',
    ],
  },
  {
    slug: 'gecis-indirimi',
    title: 'Ajandadan Dijitale Geçiş İndirimi',
    date: '2025-09-05',
    excerpt:
      "Mevcut ajanda sisteminizi bırakıp DüğünTakip'i tercih eden tüm firmalara özel geçiş indirimi.",
    body: [
      "Mevcut ajanda sisteminizi bırakıp DüğünTakip'i tercih eden tüm firmalara özel geçiş indirimi sunuyoruz.",
      'Geçiş sürecinde mevcut rezervasyon kayıtlarınızın sisteme aktarılması ve personelinizin eğitimi ücretsizdir.',
      'Detaylı bilgi için demo talebinde bulunabilir ya da info@duguntakip.com adresinden bize ulaşabilirsiniz.',
    ],
  },
];

/** Ekranlar sayfasındaki uygulama görselleri */
export const SCREENS: { title: string; description: string; kind: string }[] = [
  {
    title: 'Rezervasyon Takvimi',
    kind: 'calendar',
    description:
      'Gündüz ve gece seansları ile bütün yılın rezervasyonlarını tek ekrandan görün. Organizasyon türüne göre renklendirilmiş takvim.',
  },
  {
    title: 'Program bazlı rapor',
    kind: 'report-program',
    description:
      'Düğün, sünnet, nişan, kına, konferans ve kokteyl organizasyonlarının adet ve ciro bazında dağılımını görün.',
  },
  {
    title: 'Ay bazlı rapor',
    kind: 'report-month',
    description: 'Aylara göre rezervasyon adedi, tahsilat ve kalan alacak bakiyesi dağılımı.',
  },
  {
    title: 'Rezervasyon Renk Ayarları',
    kind: 'colors',
    description: 'Her organizasyon türü için takvimde görünecek rengi kendiniz belirleyin.',
  },
  {
    title: 'Gelir Gider Kayıtları',
    kind: 'cashflow',
    description: 'İşletmenizin gelir ve gider kalemlerini kategori bazında kaydedin, kasa durumunuzu anlık görün.',
  },
  {
    title: 'Detaylı Rezervasyon Kaydı',
    kind: 'reservation',
    description:
      'Müşteri bilgisi, davetli sayısı, hizmetler, toplam tutar, kaparo ve kalan alacak tek formda kayıt altına alınır.',
  },
  {
    title: 'Salon Kiralama Sözleşmesi',
    kind: 'contract',
    description: 'Rezervasyon kaydından tek tıkla yazdırılabilir salon kiralama sözleşmesi oluşturun.',
  },
  {
    title: 'Firmalarım / Adminler',
    kind: 'business',
    description: 'Birden fazla salonunuz varsa yeni işletme ekleyin, alt kullanıcı yetkilerini yönetin.',
  },
];

export const CONTACT = {
  email: 'info@duguntakip.com',
  title: 'Düğün Takip Salon Takip Programı İletişim',
  formFields: {
    name: 'Adınız Soyadınız',
    email: 'Email',
    phone: 'Telefon',
    message: 'Mesajınız',
  },
  submit: 'Mesajımı gönder',
  submitting: 'Gönderiliyor',
};

export const SOCIAL = {
  twitter: 'https://twitter.com/duguntakip',
  facebook: 'https://facebook.com/duguntakip',
  instagram: 'https://instagram.com/duguntakip',
  youtube: 'https://www.youtube.com/watch?v=qLCvjL0LbDg',
};

export const COPYRIGHT = '© 2009-2026 Duguntakip.com';
