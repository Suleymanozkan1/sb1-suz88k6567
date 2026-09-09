# Sunuma hazırlık notları

26 slayt. Rahat tempoda 30–35 dakika, soru–cevapla birlikte 45 dakika.
Bu notlar slaytların üstünde yazmaz; slayt notları ayrıca PowerPoint'in
konuşmacı bölümünde duruyor.

---

## 1. Açılışta söylenecek tek cümle

> "Bu, salonun rezervasyonunu, parasını ve organizasyon gününü tek yerde
> tutan bir sistem. Bugün defterde, WhatsApp'ta ve Excel'de dağınık duran
> her şey burada."

Bunu söyledikten sonra doğrudan takvim slaydına geçin. Ürünü tarif ederek
değil, ekranı göstererek anlatın; en ikna edici slayt ekran görüntüsü olan
slayttır.

## 2. Tempo

| Bölüm | Slayt | Süre | Ne anlatılıyor |
| --- | --- | --- | --- |
| Açılış ve kapsam | 1–2 | 3 dk | Sistem ne, neleri kapsıyor |
| Çekirdek | 3–11 | 12 dk | Takvim, rezervasyon, para, belgeler, organizasyon |
| Mobil | 12–14 | 4 dk | Telefon uygulaması |
| İletişim ve mevzuat | 15–20 | 7 dk | SMS, İYS, fatura, talepler |
| Yönetim ve altyapı | 21–24 | 5 dk | Yetkiler, altyapı, veri |
| Kurulum ve maliyet | 25–26 | 4 dk | Ne gerekiyor, ne tutuyor |

Vakit daralırsa 10 (tedarikçiler) ve 11 (masa düzeni) atlanabilir; bunlar
"ayrıca bunu da yapıyor" slaytlarıdır, omurga değil.

## 3. Her bölümün tek cümlesi

Slayt başına ezberlenecek tek cümleler. Gerisi zaten ekranda.

- **Takvim (3):** "Bir salona aynı gün ve seansta ikinci kayıt açılamaz;
  bu kural arayüzde değil veritabanında."
- **Salonlar (4):** "Kaç salonunuz varsa o kadar tanımlanır, çakışma her
  salon için ayrı hesaplanır."
- **Rezervasyon (5):** "Kalan alacak elle girilmez, tahsilatlardan
  hesaplanır."
- **Ödeme planı (6):** "Taksitlerin toplamı her zaman kalan tutara eşittir;
  yuvarlama artığı ilk taksite eklenir."
- **Menüler (7):** "Menü seçilince tutar önerilir, kullanıcı değiştirebilir."
- **Belgeler (8):** "Sözleşme ve makbuz rezervasyondan üretilir, bilgi
  ikinci kez girilmez."
- **İş emri (9):** "Etkinlik günü kimin ne saatte ne yapacağı; otelde BEO
  denen belgenin karşılığı."
- **Mobil (12–14):** "Telefon görüntülemek ve para almak içindir; kayıt
  açmak, fatura kesmek masaüstünde kalır. Bu bir eksiklik değil, karar."
- **SMS (15):** "Sağlayıcı tanımlı değilse mesaj gitmez ama kaydı tutulur."
- **İYS (16):** "Rezervasyon onayı ticari ileti değildir, onay gerekmez.
  Kampanya ticari iletidir, onaysız gönderilemez."
- **Kod doğrulama (17):** "Müşteri kendi rezervasyonunu sorgular; ödeme
  bilgisi dışarı açılmaz, telefon maskelidir."
- **Yetkiler (21):** "Her personelin ayrı hesabı var, kim neyi değiştirdi
  kaydediliyor ve bu kayıt silinemiyor."
- **Altyapı (22):** "İki şey zorunlu, gerisi isteğe bağlı. Birini
  kapatırsanız yalnızca o özellik kapanır."
- **Neden (23):** "Kendi sunucumuz olsaydı yazılım aynı çalışırdı; fark,
  yedek ve güvenliğin kimin üzerinde kaldığında."
- **Maliyet (26):** "Sabit gider iki abonelik, ayda yaklaşık 30 dolar.
  Gerisi kullandıkça."

## 4. Ezberlenecek sayılar

Yanlış sayı söylemektense "slaytta var, birlikte bakalım" demek daha iyi.
Şu birkaçı akılda kalsın:

- Sabit aylık gider: **Supabase 25 $ + Cloudflare 5 $ ≈ 30 $**
- Mobil mağazalar: **Apple 99 $/yıl**, **Google Play 25 $ tek sefer**
- SMS: **1.000 adet 370 ₺**, paketsiz **0,42 ₺/adet**
- İYS: onayları elle yönetirseniz **ücretsiz**; otomatik aktarım için
  **5.000 izin 4.601 ₺**
- e-Fatura: **Paraşüt 150 ₺/ay** (KDV hariç) + **mali mühür 1.620 ₺ / 3 yıl**
- Fatura düzenleme süresi: **7 gün** (VUK)
- İYS'ye onay bildirme süresi: **3 iş günü**
- Veriler **AB bölgesinde (Frankfurt)**

Aylık 30 organizasyon kaydeden bir salon, onay ve hatırlatma ile yaklaşık
**100–150 SMS** gönderir; 1.000'lik paket birkaç ay yeter. Bu örnek soru
gelmeden söylenmeye değer, çünkü SMS maliyeti gözde büyüyor.

## 5. Gelmesi kesin sorular

**"Verilerimiz nerede, başkası görebilir mi?"**
AB bölgesinde, Frankfurt'ta. Her hesap yalnızca kendi verisini görür ve bu
ayrım arayüzde değil sunucuda tanımlı — yani yazılımda bir hata olsa bile
başka bir işletmenin kaydı gelmez. Gece otomatik yedek alınır.

**"Neden bir sürü servise para veriyoruz? Kendi sunucumuz olsun."**
23. slayt tam bu soru için. Yazılım kendi sunucunuzda da aynı çalışır. Fark
şu: güvenlik yamaları, sertifika yenileme, yedek alma ve o yedeğin
gerçekten geri yüklenebildiğini denemek sizin üzerinizde kalır. Ayda 30
dolar bu işi devretmenin bedeli. Ekleyin: veritabanı standart PostgreSQL,
istenirse başka bir sunucuya taşınır — kilitlenme yok.

**"Hazır programlar var, neden bu?"**
Savunmaya geçmeyin. "Hangisine baktınız?" diye sorun, sonra somut farka
gidin: sözleşme ve makbuzun rezervasyondan üretilmesi, çakışmanın
veritabanında engellenmesi, İYS'nin sistemin içinde olması. Bilmediğiniz
bir ürün hakkında yorum yapmayın.

**"SMS'i biz gönderiyoruz zaten, gerek var mı?"**
Fark, gönderimin kayda geçmesi ve iznin takip edilmesi. Ticari ileti için
onay şart; onaysız gönderim ceza konusu. Sistem onaysız numaraya ticari
ileti göndermeyi kayıt aşamasında reddeder.

**"e-Fatura'ya geçmek zorunda mıyız?"**
Bunu bilmiyorsanız bilmediğinizi söyleyin. Mükellefiyet durumu ciroya ve
sektöre göre değişir, mali müşavire sorulmalıdır. Sistemin tarafı şu:
entegratör tanımlı değilse fatura taslak olarak kalır, sistem çalışmaya
devam eder.

**"Mobilde neden rezervasyon açılmıyor?"**
Bilinçli karar. Rezervasyon formu çok alanlı; telefonda yanlış giriş
ihtimali yüksek ve düzeltmesi pahalı. Telefonun asıl işi bakmak ve para
almak. Tahsilat girişi mobilde var.

**"İnternet giderse ne olur?"**
Sistem tarayıcıdan çalışır, internet gerekir. Bunu saklamayın. Telefon
uygulaması da aynı veriyi okur, ayrı bir kopya tutmaz.

**"Kaç kullanıcı açabiliriz?"**
Kullanıcı başına ücret yok; personel sayısınca hesap açılır ve her birinin
yetkisi ayrı belirlenir.

**"Ne zaman kullanmaya başlayabiliriz?"**
Yazılım tarafı hazır. Bekleten tek şey Netgsm marka başlığı onayı; birkaç
iş günü sürüyor ve en erken başlatılması gereken adım bu.

## 6. Söylememeniz gerekenler

- Rakip ürünler hakkında incelemediğiniz iddialar.
- "Hiç hata olmaz", "kesinlikle güvenli" gibi mutlak cümleler.
- Vergi ve mükellefiyet yorumu. Cevap: "Mali müşavirinize sormak gerekir."
- Fiyatları yuvarlayarak. Sağlayıcı fiyatları Eylül 2026 listelerinden;
  değişebileceğini söyleyin.

## 7. Demo yapacaksanız sıra

Sunumdan sonra canlı gösterecekseniz kısa tutun, beş adım yeter:

1. Takvimden dolu bir güne bakın, ikinci kaydın açılmadığını gösterin.
2. Bir rezervasyon açın, menü seçin, tutarın önerildiğini gösterin.
3. Tahsilat girin; kalan alacağın kendiliğinden düştüğünü gösterin.
4. Sözleşmeyi ve makbuzu ekrana getirin.
5. Telefondan aynı rezervasyona girip tahsilat ekleyin.

Demoda bir şey ters giderse üstünü örtmeyin, "buna sonra bakacağım" deyip
devam edin. Toparlamaya çalışmak süreyi ve dikkati yiyor.

## 8. Son slayttan sonra

Maliyet slaytında bitirip susun. Kapanış cümlesi:

> "Zorunlu olan iki kalem var, gerisi ihtiyaca göre açılıp kapanıyor.
> Nereden başlamak istediğinize göre bir kurulum sırası çıkarabiliriz."

Bu, konuşmayı "beğendiniz mi" yerine "nereden başlıyoruz" sorusuna taşır.
