# Sunucu seçimi ve maliyet

Cloudflare ve Supabase'e ödeme yapılmayacak. Ödenecek kalemler:
**hosting, SMS, İYS ve e-fatura**. Bu belge hostingin ne olması
gerektiğini ve yaklaşık maliyeti anlatır.

## Öneri: iki küçük VPS

**Neden VPS, paylaşımlı hosting değil?**

Sistemin çekirdeğinde 6.545 satırlık bir PostgreSQL şeması var: 44 tablo,
72 RLS politikası, 39 tetikleyici, 21 enum ve 53 `security definer`
fonksiyon.
Kiracı izolasyonu — yani bir salonun başkasının verisini görememesi —
uygulama kodunda değil, **veritabanı seviyesinde** sağlanıyor. Uygulama
katmanında hata yapılsa bile veri karışmıyor.

Paylaşımlı hosting (cPanel) PostgreSQL değil MySQL verir. MySQL'de RLS
yok; bu güvence uygulama koduna taşınmak zorunda kalır. O zaman
korumanın gücü, 67 veri erişim yönteminin **her birinde** doğru filtre
yazılmış olmasına bağlanır. Bir tanesinin unutulması yeterlidir ve
unutulduğu ancak bir müşteri başkasının rezervasyonunu gördüğünde
anlaşılır.

Bu yüzden PostgreSQL çalıştırabilen bir VPS öneriyorum. Aynı zamanda en
az kod değişikliği gerektiren yol; mevcut şema ve testler olduğu gibi
korunuyor.

Kaç tane gerektiği bir sonraki bölümde.

## Kaç sunucu

**İki sunucu.** Sebebi tek başına KVKK değil, Vergi Usul Kanunu:
e-belgeler ve fatura kayıtları Türkiye sınırları içinde muhafaza
edilmek zorunda. Verinin geri kalanının yurt dışında durması
istendiğinde tek çözüm ikiye ayırmak.

| | Sunucu 1 | Sunucu 2 |
|---|---|---|
| Nerede | Almanya | Türkiye |
| Ne çalışır | Node sunucusu, site, PostgreSQL, PostgREST, zamanlanmış görevler | Yalnızca PostgreSQL + PostgREST |
| Ne tutar | Rezervasyon, müşteri, kasa, SMS, raporlar — her şey | `invoices`, `invoice_lines`, `invoice_series` |
| Yük | Tüm trafik | Yılda birkaç yüz fatura satırı |

Kullanıcı açısından fark yok: tek adres, tek giriş, tek ekran. Ayrım
sunucunun içinde. Ayrıntı ve kurulum: [`IKI-SUNUCU.md`](IKI-SUNUCU.md).

**Bölme zorunlu değil.** `PGRST_FATURA_URL` boş bırakılırsa her şey tek
veritabanında kalır ve sistem aynen çalışır. Sonradan ayırmak ya da
birleştirmek yalnızca bu değişkenin meselesi; kod değişmiyor.

## Gereken özellikler

| | Almanya (her şey) | Türkiye (yalnızca fatura) |
|---|---|---|
| RAM | 8 GB | 2 GB |
| Disk | 80 GB NVMe | 20 GB |
| İşlemci | 4 çekirdek | 1 çekirdek |
| Sistem | Ubuntu 24.04 LTS | Ubuntu 24.04 LTS |

Almanya tarafında aynı makinede PostgreSQL, PostgREST, Node ve gece
yedeği birlikte çalışıyor. 4 GB ile çalışır ama PostgreSQL'e ayıracak
yer kalmaz; 8 GB rahat eder.

Türkiye tarafı gerçekten küçük: orada yalnızca fatura tabloları var ve
yılda birkaç MB büyüyorlar.

## Almanya sunucusu: Hetzner Cloud

Özellikler hetzner.com/cloud/cost-optimized sayfasından doğrulandı;
fiyatlar Eylül 2026'da sipariş ekranında görünen tutarlar.

| Paket | vCPU | RAM | Disk | Trafik | Aylık |
|---|---|---|---|---|---|
| CX23 | 2 (Intel/AMD) | 4 GB | 40 GB NVMe | 20 TB | 5,99 € |
| **CX33** | **4 (Intel/AMD)** | **8 GB** | **80 GB NVMe** | **20 TB** | **8,99 €** |
| CAX21 | 4 (Ampere/ARM) | 8 GB | 80 GB NVMe | 20 TB | 10,99 € |

**CX33 öneriliyor.** CAX21 ile birebir aynı özellikleri 2 € daha ucuza
veriyor ve x86 olduğu için mimariye bağlı sürpriz yok. (ARM da
çalışırdı: çalışma zamanı bağımlılıkları saf JavaScript, derleme
araçlarının da arm64 sürümleri var. Bu listede ARM ucuz olmadığı için
tercih edilmiyor.)

**Fiyatta görünmeyen kalem:** Hetzner IPv4 adresini sunucudan ayrı
faturalıyor ("We bill Primary IPs (IPv4, IPv6) and cloud servers
separately" — docs.hetzner.com). Yani 8,99 € tam maliyet değil; üstüne
bir IPv4 ücreti biniyor. Tutarı sunucu oluşturma ekranında görürsünüz.

**Konum: Falkenstein (FSN1) veya Nürnberg (NBG1).** İkisi de Almanya.
ARM (CAX) yalnızca bu ikisinde ve Helsinki'de var.

### Hetzner sunucu vermiyorsa

26 Haziran 2026'dan beri açık bir kapasite kısıtı var
(status.hetzner.com, "Limited availability of cloud instances"). Hetzner
kendi ifadesiyle "yeni müşterilerin ve mevcut müşterilerin bir
bölümünün" yeni sunucu oluşturmasını kısıtlıyor; etkilenen mevcut
müşteriler **rastgele** seçiliyor ve tek tek talepler
önceliklendirilemiyor.

Belirtisi tam olarak budur: sipariş ekranında paketlerin **hepsi** "not
available" görünür. Sırayla:

1. Lokasyonu değiştirip deneyin (kısıt lokasyon bazlı da işliyor).
2. Olmazsa destek talebi açıp kapasite açıldığında bildirim isteyin.
   Süre taahhüdü vermiyorlar.
3. Beklemek istemiyorsanız sağlayıcı değiştirin.

Yeni bir hesapsanız 1. adım büyük ihtimalle işe yaramaz: kısıt
doğrudan yeni müşterilere uygulanıyor.

## Almanya için alternatif: netcup

Hetzner kapalıyken denenmiş seçenek. Nürnberg lokasyonu var, yani
Almanya şartı bozulmuyor.

| Paket | vCore | RAM | Disk | Aylık |
|---|---|---|---|---|
| VPS 500 G12 | 2 | 4 GB DDR5 ECC | 128 GB NVMe | 5,91 € |
| **VPS 1000 G12** | **4** | **8 GB DDR5 ECC** | **256 GB NVMe** | **10,37 €** |

**Fiyatlar %19 Alman KDV'si dahil**; Hetzner'in gösterdiği rakamlar
tipik olarak KDV hariç. İkisini doğrudan karşılaştırmayın — KDV'siz
netcup yaklaşık 8,7 € eder, yani CX33'le neredeyse aynı paraya üç kat
disk ve ECC bellek.

Kurulum adımlarının hiçbiri sağlayıcıya bağlı değil; ikisi de Ubuntu
24.04 LTS bir VPS.

## Türkiye sunucusu

Yalnızca fatura veritabanı çalışacağı için **en küçük VDS paketi**
yeterli (1 vCPU / 2 GB / 20 GB).

Natro'nun güncel fiyatı bu belgeye yazılmadı: site otomatik erişimi
engelliyor (HTTP 403) ve doğrulanamayan bir rakam yazmak, bütçeyi
yanlış kurmaktan başka işe yaramaz. Sipariş öncesi sağlayıcının kendi
sayfasından bakın. Türkiye'de konumlanmış olması şart; sağlayıcının
Türk firması olması yetmez, **sunucunun bulunduğu veri merkezi**
Türkiye'de olmalı.

## Toplam aylık maliyet

| Kalem | Aylık | Not |
|---|---|---|
| Almanya VPS | 9-11 € | Hetzner CX33 ya da netcup VPS 1000 G12 |
| Almanya IPv4 | ayrı ücret | Hetzner'de ayrı faturalanıyor |
| Türkiye VDS (en küçük) | sağlayıcıya göre | ödenecek |
| Alan adı | ~25 ₺ | yıllık ücretin aylığa bölümü |
| SMS | kullanıma göre | ödenecek, mevcut anlaşma |
| İYS | kullanıma göre | ödenecek, yasal zorunluluk |
| e-Fatura | kullanıma göre | ödenecek |
| Cloudflare | **0 ₺** | kaldırıldı |
| Supabase | **0 ₺** | kaldırıldı |

TLS sertifikası Let's Encrypt ile ücretsiz.

## KVKK: ikinci sunucu bu yükü kaldırmıyor

Fatura verisinin Türkiye'de olması VUK'u karşılıyor, KVKK'yı değil.
Müşteri adı, telefon ve TC kimlik numarası Almanya'daki sunucuda
duruyor ve bu, KVKK m.9 kapsamında **yurt dışına aktarım**.

Almanya AB üyesi olsa da bu bir muafiyet değil: Türkiye'nin hiçbir ülke
için yeterlilik kararı yok. Gereken:

* Kurul'un yayımladığı **standart sözleşme**nin imzalanması,
* imzadan itibaren **5 iş günü** içinde Kurul'a bildirim,
* aydınlatma metninde aktarımın ve ülkenin belirtilmesi (bu yapıldı,
  `src/data/legal.ts`).

Her şeyi Türkiye'de tutmak bu üç maddeyi tümüyle gündemden çıkarırdı;
verinin yurt dışında olması istendiği için bunlar işin bedeli.

## Sunucuda ne çalışacak

### Almanya

Üç servis, hepsi ücretsiz ve açık kaynak:

1. **PostgreSQL** — veritabanı
2. **PostgREST** — veritabanını HTTP'ye açan tek dosyalık program
3. **Sahra Takip sunucusu** — siteyi sunar, `/api/*` uç noktalarını
   karşılar, zamanlanmış görevleri çalıştırır

Önlerinde **nginx** ters vekil olarak durur ve TLS'i üstlenir.

PostgREST dışarı **açılmaz**; yalnızca kendi sunucumuz üzerinden
erişilir. Böylece tarayıcıda CORS'a gerek kalmaz, içerik güvenlik
politikası `connect-src 'self'` kadar dar tutulabilir ve veritabanı
arayüzü internete ayrı bir kapı açmaz.

### Türkiye

İki servis: **PostgreSQL** ve **PostgREST**. Site, uç noktalar ve
zamanlanmış görevler orada çalışmıyor. Bu sunucudaki PostgREST de
internete açılmaz; yalnızca Almanya'daki sunucu erişebilir.

Kurulum adımları [`KURULUM.md`](KURULUM.md) dosyasında; ikinci sunucu
ve çoğaltma [`IKI-SUNUCU.md`](IKI-SUNUCU.md) dosyasında.

## Neden Supabase'in ücretsiz planı değil?

Olabilirdi: tek salonluk kullanım Supabase'in de Cloudflare'in de
ücretsiz sınırının altında kalır. Kendi sunucusunda çalışmanın farkı
bağımlılık: ücretsiz planın koşulları değişirse, proje kapanırsa ya da
hesap askıya alınırsa sistem durur. Kendi sunucunuzda bu riskler yok,
karşılığında sunucunun bakımı size ait.

## Bakım yükü, dürüst hâliyle

Kendi sunucusunun bedeli para değil, ilgi:

- **Güvenlik güncellemeleri** ayda bir `apt upgrade` (otomatik
  güncelleme kurulumda açılıyor). İki sunucuda da.
- **Yedek** her gece otomatik alınıyor, ama **sunucunun kendisi
  bozulursa yedek de gider**. Yedek dosyalarını düzenli olarak başka bir
  yere indirmek gerekiyor; KURULUM.md bunun nasıl yapılacağını yazıyor.
- **İki sunucu iki kat bakım değil ama sıfır da değil.** Türkiye tarafı
  çok az iş yapıyor; buna karşılık iki yeni arıza biçimi geliyor: aradaki
  bağlantının kopması ve yetki kopyalarının çoğaltmasının durması. İkisi
  de `/api/health` tarafından izleniyor.
- **Disk dolarsa** sistem durur; izleme bölümü bunu bildiriyor.

Bu üç maddeyi üstlenecek biri yoksa, yönetilen bir servisin ücretsiz
planı daha az riskli olabilir. Karar sizin.
