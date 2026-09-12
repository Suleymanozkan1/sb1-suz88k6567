# Sunucu seçimi ve maliyet

Cloudflare ve Supabase'e ödeme yapılmayacak. Ödenecek kalemler:
**hosting, SMS, İYS ve e-fatura**. Bu belge hostingin ne olması
gerektiğini ve yaklaşık maliyeti anlatır.

## Öneri: küçük bir VPS

**Neden VPS, paylaşımlı hosting değil?**

Sistemin çekirdeğinde 3.568 satırlık bir PostgreSQL şeması var: 39 RLS
politikası, 27 tetikleyici, 20 enum ve 41 `security definer` fonksiyon.
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

## Gereken özellikler

| | En az | Rahat |
|---|---|---|
| RAM | 2 GB | 4 GB |
| Disk | 20 GB SSD | 40 GB SSD |
| İşlemci | 1 çekirdek | 2 çekirdek |
| Sistem | Ubuntu 22.04 / 24.04 LTS | aynı |

Tek salon, birkaç kullanıcı ve yılda birkaç yüz rezervasyon için 2 GB
fazlasıyla yeter. 4 GB'ı, yedek alırken ve rapor çıkarırken rahat olmak
için öneriyorum.

## Nerede kiralanır

**KVKK açısından Türkiye ya da AB tercih edilmeli.** Veri müşteri adı,
telefon ve TC kimlik numarası içeriyor; yurt dışına aktarımın ayrı
kuralları var. Türkiye'de sunucu, bu konuyu tümüyle gündemden çıkarır.

| Sağlayıcı | Konum | Yaklaşık aylık |
|---|---|---|
| Türk sağlayıcılar (Turhost, Natro, Hetzner TR vb.) VDS | İstanbul / Ankara | 200-400 ₺ |
| Hetzner Cloud CX22 | Almanya / Finlandiya | ~5 € (≈220 ₺) |
| DigitalOcean / Vultr | Frankfurt | ~6 $ (≈250 ₺) |

Buna **alan adı** (~150-300 ₺/yıl) eklenir. TLS sertifikası Let's
Encrypt ile ücretsiz.

> Fiyatlar Eylül 2026 civarı için kabaca verilmiştir; kur ve kampanyalara
> göre değişir. Sipariş öncesi güncel fiyatı kendiniz doğrulayın.

## Toplam aylık maliyet

| Kalem | Aylık | Not |
|---|---|---|
| VPS | 200-400 ₺ | ödenecek |
| Alan adı | ~25 ₺ | yıllık ücretin aylığa bölümü |
| SMS | kullanıma göre | ödenecek, mevcut anlaşma |
| İYS | kullanıma göre | ödenecek, yasal zorunluluk |
| e-Fatura entegratörü | kullanıma göre | ödenecek |
| Cloudflare | **0 ₺** | kaldırıldı |
| Supabase | **0 ₺** | kaldırıldı |

## Sunucuda ne çalışacak

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

Kurulum adımları [`KURULUM.md`](KURULUM.md) dosyasında.

## Neden Supabase'in ücretsiz planı değil?

Olabilirdi: tek salonluk kullanım Supabase'in de Cloudflare'in de
ücretsiz sınırının altında kalır. Kendi sunucusunda çalışmanın farkı
bağımlılık: ücretsiz planın koşulları değişirse, proje kapanırsa ya da
hesap askıya alınırsa sistem durur. Kendi sunucunuzda bu riskler yok,
karşılığında sunucunun bakımı size ait.

## Bakım yükü, dürüst hâliyle

Kendi sunucusunun bedeli para değil, ilgi:

- **Güvenlik güncellemeleri** ayda bir `apt upgrade` (otomatik
  güncelleme kurulumda açılıyor).
- **Yedek** her gece otomatik alınıyor, ama **sunucunun kendisi
  bozulursa yedek de gider**. Yedek dosyalarını düzenli olarak başka bir
  yere indirmek gerekiyor; KURULUM.md bunun nasıl yapılacağını yazıyor.
- **Disk dolarsa** sistem durur; izleme bölümü bunu bildiriyor.

Bu üç maddeyi üstlenecek biri yoksa, yönetilen bir servisin ücretsiz
planı daha az riskli olabilir. Karar sizin.
