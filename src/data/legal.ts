export interface LegalDoc {
  slug: string;
  title: string;
  sections: { heading?: string; paragraphs: string[] }[];
}

export const PRIVACY_POLICY: LegalDoc = {
  slug: 'gizlilik-politikasi',
  title: 'Gizlilik Politikası',
  sections: [
    {
      paragraphs: [
        'Bu gizlilik politikası sahratakip.com’la başlayan tüm URL’li sitelerde geçerlidir.',
        'Size ait üyelik bilgileri (e-posta, şifre vb.) hiçbir şekilde üçüncü şahıslarla paylaşılmaz.',
        'Sitemizi ziyaret için herhangi bir kişisel bilginizi bize vermek zorunda değilsiniz.',
        'Ancak, hizmetlerimizden faydalanmak için üye olmanız ve bazı kişisel bilgilerinizi vermeniz gerekmektedir.',
        'Size ait üyelik bilgileri (e-posta, şifre vb.) hiçbir şekilde üçüncü şahıslarla paylaşılmaz, şifrelerin başkasının eline geçmesi ya da çalınmasından sahratakip.com sorumlu değildir.',
        'Üye ve ziyaretçilerin site ile ilgili tarafımıza ulaştırdıkları her türlü öneri, istek, soru ve şikâyetleri içeren bilgiler site performansını ölçmek açısından saklanmaktadır.',
        'Bu bilgiler kişilerin kendilerine yanıt vermek dışında herhangi bir amaç için kullanılamaz.',
      ],
    },
    {
      heading: 'İçerik Sorumluluğu',
      paragraphs: [
        'Üyelerimizin sisteme girmiş olduğu rezervasyon, müşteri ve muhasebe kayıtlarının içeriğinden üyenin kendisi sorumludur.',
        'Sistemde yasa dışı, genel ahlaka aykırı, üçüncü kişilerin haklarını ihlal eden içerik barındırılamaz. Bu tür içerikler tespit edildiğinde üyelik askıya alınır.',
      ],
    },
    {
      heading: 'IP Adresi Kullanımı',
      paragraphs: [
        'IP adresiniz, sisteme giriş güvenliğinin sağlanması, olası kötüye kullanımların tespiti ve genel istatistiklerin oluşturulması amacıyla kayıt altına alınmaktadır.',
        'IP adresleri, kullanıcıların kişisel kimliğini belirlemek amacıyla kullanılmaz; yalnızca güvenlik ve teknik analiz amacıyla saklanır.',
      ],
    },
    {
      heading: 'Çerez (Cookie) Politikası',
      paragraphs: [
        'Sitemiz, oturumunuzun açık kalması ve tercihlerinizin hatırlanması amacıyla çerez kullanmaktadır.',
        'Çerezler kişisel bilgilerinizi içermez; tarayıcı ayarlarınızdan çerezleri silebilir veya engelleyebilirsiniz. Ancak bu durumda sistemin bazı bölümleri düzgün çalışmayabilir.',
      ],
    },
    {
      heading: 'Veri Güvenliği',
      paragraphs: [
        '128 bit SSL güvenlik katmanı ile tüm veri trafiği şifrelenmektedir.',
        'Sistemimizde saklamış olduğunuz bilgileri şifrenizi kimseye söylemediğiniz sürece başkaları tarafından görülemez ve görüntülenemez.',
      ],
    },
  ],
};

export const MEMBERSHIP_AGREEMENT: LegalDoc = {
  slug: 'uyelik-sozlesmesi',
  title: 'Üyelik Sözleşmesi',
  sections: [
    {
      paragraphs: [
        'İşbu üyelik sözleşmesi, sahratakip.com sitesine üye olan kullanıcı ile Sahra Takip arasında akdedilmiştir.',
        'Üye, kayıt sırasında verdiği bilgilerin doğru ve güncel olduğunu kabul eder.',
        'Üye, hesabını üçüncü kişilerle paylaşmayacağını; paylaşması hâlinde doğacak zararlardan kendisinin sorumlu olduğunu kabul eder.',
        'Üye, sisteme yüklediği tüm verilerin içeriğinden bizzat sorumludur.',
        'Sahra Takip, üyelik kurallarına aykırı davranan üyelerin üyeliğini önceden bildirimde bulunmaksızın askıya alma veya sonlandırma hakkına sahiptir.',
        'Üyelik süresi boyunca sunulan hizmetlerin kapsamı, geliştirmeler doğrultusunda genişletilebilir.',
      ],
    },
  ],
};


/**
 * KVKK m.10 aydınlatma metni.
 *
 * Gizlilik Politikası mevcuttu ama KVKK'nın aradığı unsurları (veri
 * sorumlusunun kimliği, işleme amacı, hukuki sebep, aktarım ve ilgili kişinin
 * m.11 hakları) karşılamıyordu. Köşeli parantez içindeki alanlar işletmenin
 * kendi sicil bilgileriyle doldurulmalı ve metin bir hukuk danışmanına
 * doğrulatılmalıdır.
 */
export const KVKK_NOTICE: LegalDoc = {
  slug: 'kvkk-aydinlatma-metni',
  title: 'KVKK Aydınlatma Metni',
  sections: [
    {
      paragraphs: [
        '6698 sayılı Kişisel Verilerin Korunması Kanunu’nun ("KVKK") 10. maddesi uyarınca, veri sorumlusu sıfatıyla kişisel verilerinizi hangi amaçla ve hangi hukuki sebeple işlediğimiz aşağıda açıklanmıştır.',
      ],
    },
    {
      heading: 'Veri Sorumlusunun Kimliği',
      paragraphs: [
        'Veri sorumlusu: [Ticaret unvanı], MERSİS No: [MERSİS numarası], Vergi Dairesi/No: [vergi dairesi ve numarası].',
        'Adres: [merkez adresi]. Telefon: [telefon]. E-posta: info@sahratakip.com. KEP: [kayıtlı elektronik posta adresi].',
      ],
    },
    {
      heading: 'İşlenen Kişisel Veriler',
      paragraphs: [
        'Üyelik verileri: ad soyad, e-posta adresi, cep telefonu, işletme unvanı ve fatura bilgileri.',
        'İşlem güvenliği verileri: IP adresi, giriş denemeleri ve oturum kayıtları.',
        'Müşteri kayıtları: üyenin kendi müşterilerine ait olarak sisteme girdiği ad, telefon ve organizasyon bilgileri. Bu verilerde veri sorumlusu üyenin kendisidir; Sahra Takip veri işleyen sıfatıyla hareket eder.',
      ],
    },
    {
      heading: 'İşleme Amaçları',
      paragraphs: [
        'Üyelik sözleşmesinin kurulması ve ifası, hizmetin sunulması ve faturalandırılması.',
        'Giriş güvenliğinin sağlanması, kötüye kullanımın tespiti ve denetim kaydının tutulması.',
        'Talep, şikâyet ve destek başvurularının karşılanması.',
        'Mevzuattan doğan saklama ve bilgi verme yükümlülüklerinin yerine getirilmesi.',
      ],
    },
    {
      heading: 'Hukuki Sebep',
      paragraphs: [
        'Veriler; KVKK m.5/2-(c) sözleşmenin kurulması veya ifası, m.5/2-(ç) hukuki yükümlülüğün yerine getirilmesi ve m.5/2-(f) meşru menfaat hukuki sebeplerine dayanılarak işlenir.',
        'Ticari elektronik ileti gönderimi yalnızca İleti Yönetim Sistemi üzerinden alınmış açık rızaya dayanır; rıza her zaman geri alınabilir.',
      ],
    },
    {
      heading: 'Aktarım',
      paragraphs: [
        'Veriler; barındırma ve veritabanı hizmeti, SMS sağlayıcısı ve e-fatura entegratörü olmak üzere hizmetin sunulabilmesi için zorunlu tedarikçilere aktarılır.',
        'Veritabanı ve yedekler Avrupa Birliği bölgesinde (Frankfurt) tutulmaktadır. Yurt dışına aktarım KVKK m.9 çerçevesinde yapılır.',
      ],
    },
    {
      heading: 'Saklama Süresi',
      paragraphs: [
        'Veriler, üyelik süresince ve mevzuatın öngördüğü zamanaşımı ve saklama süreleri boyunca (fatura ve ticari kayıtlar için 10 yıl) saklanır; sürenin dolmasıyla silinir, yok edilir veya anonim hâle getirilir.',
      ],
    },
    {
      heading: 'İlgili Kişinin Hakları (KVKK m.11)',
      paragraphs: [
        'Kişisel verinizin işlenip işlenmediğini öğrenme, işlenmişse bilgi talep etme, işleme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme.',
        'Yurt içinde veya yurt dışında verilerin aktarıldığı üçüncü kişileri bilme, eksik veya yanlış işlenmişse düzeltilmesini isteme.',
        'KVKK m.7 çerçevesinde silinmesini veya yok edilmesini isteme, bu işlemlerin verilerin aktarıldığı üçüncü kişilere bildirilmesini isteme.',
        'Münhasıran otomatik sistemlerle analiz edilmesi suretiyle aleyhinize bir sonuç doğmasına itiraz etme ve kanuna aykırı işleme sebebiyle zarara uğramanız hâlinde zararın giderilmesini talep etme.',
        'Başvurularınızı info@sahratakip.com adresine ya da [merkez adresi] adresine yazılı olarak iletebilirsiniz. Başvurular en geç 30 gün içinde sonuçlandırılır.',
      ],
    },
  ],
};

/**
 * Yayındaki yasal metinler.
 *
 * İade/İptal Prosedürü ve Mesafeli Hizmet Sözleşmesi kaldırıldı: ikisi de
 * bir satışın varlığını varsayıyordu (paket satın alma, kredi kartıyla
 * ödeme, cayma hakkı). Sistemde abonelik ya da ödeme adımı yok, dolayısıyla
 * mesafeli satış da yok. Metinler işletmenin hukuk danışmanıyla birlikte
 * gözden geçirilmelidir.
 */
export const LEGAL_DOCS: LegalDoc[] = [
  PRIVACY_POLICY, KVKK_NOTICE, MEMBERSHIP_AGREEMENT,
];
