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
        'Hesabınıza ait bilgiler (e-posta, şifre vb.) hiçbir şekilde üçüncü şahıslarla paylaşılmaz.',
        'Panele erişim için hesabınız işletme yöneticisi tarafından tanımlanır; siteden kendi kendinize kayıt açılmaz.',
        'Şifrelerin başkasının eline geçmesi ya da çalınmasından sahratakip.com sorumlu değildir.',
      ],
    },
    {
      heading: 'İçerik Sorumluluğu',
      paragraphs: [
        'Sisteme girilen rezervasyon, müşteri ve muhasebe kayıtlarının içeriğinden kaydı giren işletme sorumludur.',
        'Sistemde yasa dışı, genel ahlaka aykırı, üçüncü kişilerin haklarını ihlal eden içerik barındırılamaz. Bu tür içerikler tespit edildiğinde ilgili hesap askıya alınır.',
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
        'Hesap verileri: ad soyad, e-posta adresi, cep telefonu ve işletme unvanı.',
        'İşlem güvenliği verileri: IP adresi, giriş denemeleri ve oturum kayıtları.',
        'Müşteri kayıtları: işletmenin kendi müşterilerine ait olarak sisteme girdiği ad, telefon ve organizasyon bilgileri. Bu verilerde veri sorumlusu işletmenin kendisidir; Sahra Takip veri işleyen sıfatıyla hareket eder.',
      ],
    },
    {
      heading: 'İşleme Amaçları',
      paragraphs: [
        'Hizmetin sunulması ve panel erişiminin sağlanması.',
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
        'Veriler, hesap etkin olduğu sürece ve mevzuatın öngördüğü zamanaşımı ve saklama süreleri boyunca (fatura ve ticari kayıtlar için 10 yıl) saklanır; sürenin dolmasıyla silinir, yok edilir veya anonim hâle getirilir.',
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
 * İade/İptal Prosedürü, Mesafeli Hizmet Sözleşmesi ve Üyelik Sözleşmesi
 * kaldırıldı: ilk ikisi bir satışın varlığını (paket satın alma, kredi
 * kartıyla ödeme, cayma hakkı), üçüncüsü siteden self servis üye olmayı
 * varsayıyordu. Sistemde ne satış ne de üyelik adımı var. Kalan metinler
 * işletmenin hukuk danışmanıyla birlikte gözden geçirilmelidir.
 */
export const LEGAL_DOCS: LegalDoc[] = [
  PRIVACY_POLICY, KVKK_NOTICE,
];
