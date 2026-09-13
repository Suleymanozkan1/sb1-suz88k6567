# Dağıtım Kontrol Listesi

Seçilen kurulum: **kendi sunucusu (VPS) + PostgreSQL + PostgREST +
Netgsm + e-Fatura**. Cloudflare ve Supabase kullanılmıyor.

Fatura verisi Vergi Usul Kanunu gereği Türkiye'de tutulacaksa
**iki sunucu** gerekir; ayrıntı [`IKI-SUNUCU.md`](IKI-SUNUCU.md).
Tek sunucuyla da çalışır, o zaman 2. bölüm atlanır.

İYS yalnızca ticari ileti (kampanya, tanıtım) gönderecekseniz gerekir;
işlem bildirimi SMS'i için 6. bölümü atlayabilirsiniz.

Sırları **hiçbir zaman** depoya, sohbete veya `VITE_` önekli bir
değişkene koymayın. Hepsi sunucudaki `/etc/sahra.env` dosyasında durur
ve o dosya `chmod 600` olmalıdır.

Adım adım kurulum komutları [`KURULUM.md`](KURULUM.md) dosyasında; bu
liste ne alınacağını ve neyin doğrulanacağını takip eder.

---

## 1. Ana sunucu

- [ ] Ubuntu 24.04 LTS VPS kiralayın (8 GB RAM / 80 GB disk / 4 çekirdek
      önerilir — bkz. [`SUNUCU-SECIMI.md`](SUNUCU-SECIMI.md))
- [ ] Alan adını sunucunun IP adresine yönlendirin
- [ ] `KURULUM.md` bölüm 1-2: paketler ve PostgreSQL
- [ ] Göçleri **sırayla** uygulayın (`supabase/migrations/*.sql`,
      `0000`'dan başlayıp dosya adına göre sıralı)
- [ ] `KURULUM.md` bölüm 3-4: sırlar ve PostgREST
- [ ] `KURULUM.md` bölüm 5-6: uygulama, nginx ve Let's Encrypt sertifikası
- [ ] `KURULUM.md` bölüm 7: ilk yönetici hesabı

> **Göç sırası önemli.** Göçler yeniden çalıştırılabilir; aynı dosyayı
> ikinci kez uygulamak hata vermez. Ama sırayı atlamak verir.

## 2. Fatura sunucusu (Türkiye) — isteğe bağlı

Yalnızca fatura kayıtlarının Türkiye'de tutulması isteniyorsa.

- [ ] Türkiye'de konumlanmış küçük bir VPS kiralayın (1 çekirdek / 2 GB
      yeter). Sağlayıcının Türk firması olması yetmez; **veri merkezi**
      Türkiye'de olmalı.
- [ ] PostgreSQL ve PostgREST kurun (`KURULUM.md` bölüm 2 ve 4)
- [ ] Yalnızca fatura şemasını uygulayın:
      `supabase/fatura-sunucusu/0001_fatura_sunucusu.sql`
- [ ] Doğrulayın: `supabase/fatura-sunucusu/test_fatura_sunucusu.sql`
- [ ] **`JWT_SECRET` iki sunucuda AYNI olmalı** — giriş ana sunucuda
      yapılıyor, buradaki veritabanı yalnızca o jetonu doğruluyor
- [ ] Ana sunucuda `wal_level = logical` yapıp yetki kopyalarının
      çoğaltmasını kurun (`IKI-SUNUCU.md`)
- [ ] Türkiye'de doğrulayın: `select count(*) from public.profiles`
      ana sunucudaki kullanıcı sayısıyla eşleşmeli
- [ ] Türkiye'deki PostgREST'i **internete kapatın**; yalnızca ana
      sunucu erişebilsin (güvenlik duvarı + WireGuard ya da TLS vekil)
- [ ] Ana sunucuda `PGRST_FATURA_URL` değişkenini ayarlayıp servisi
      yeniden başlatın

> Kopyalar boşsa fatura ekranı **herkese boş** görünür: `owns_business()`
> hiçbir satır bulamaz. Belirti buysa önce çoğaltmaya bakın.

## 3. KVKK — veri yurt dışındaysa

Ana sunucu Türkiye dışındaysa müşteri adı, telefon ve TC kimlik numarası
yurt dışına aktarılıyor demektir (KVKK m.9). Fatura verisinin Türkiye'de
olması bu yükü **kaldırmaz**.

- [ ] Kurul'un yayımladığı **standart sözleşme**yi imzalayın
- [ ] İmza tarihinden itibaren **5 iş günü** içinde Kurul'a bildirin
- [ ] Aydınlatma metnindeki köşeli parantezli alanları doldurun
      (`src/data/legal.ts`: unvan, MERSİS, vergi dairesi, adres, KEP)
- [ ] Metni hukuk danışmanınıza doğrulatın

> Türkiye'nin hiçbir ülke için yeterlilik kararı yok; sunucu AB'de olsa
> bile bu adımlar gerekiyor.

## 4. Ortam değişkenleri

`/etc/sahra.env`, `chmod 600`. Tam liste `KURULUM.md` bölüm 5'te.

| Değişken | Nereden | Zorunlu |
|---|---|---|
| `PORT`, `DIST_DIZINI` | sabit | ✅ |
| `PGRST_URL` | `http://127.0.0.1:3000` | ✅ |
| `PGRST_FATURA_URL` | Türkiye sunucusunun PostgREST adresi | fatura ayrımı için |
| `JWT_SECRET` | `openssl rand -hex 32`, PostgREST ile aynı | ✅ |
| `CRON_SECRET` | `openssl rand -hex 32` | ✅ |
| `YEDEK_DIZINI` | `/var/lib/sahra/yedekler` | ✅ |
| `OTP_SECRET` | `openssl rand -hex 32` | Girişte SMS doğrulaması için |
| `NETGSM_USER` / `NETGSM_PASS` / `NETGSM_HEADER` | Netgsm paneli | SMS için |
| `IYS_*` | iys.org.tr | ticari ileti için |
| `PARASUT_*` | Paraşüt → Ayarlar → API | e-Fatura (entegratör yolu) |
| `GIB_*` | GİB portalı ve mali mühür | e-Fatura (doğrudan yol) |
| `WHATSAPP_*` | Meta geliştirici paneli | WhatsApp için |
| `KUR_SAGLAYICI` | `tcmb` (varsayılan, anahtarsız) | isteğe bağlı |
| `VITE_SENTRY_DSN` | Sentry → Project → DSN | isteğe bağlı |

> `JWT_SECRET` ile `service_role` jetonu üretilebilir ve o rol RLS'i
> tamamen atlar. Tarayıcıya **asla** gitmez, `VITE_` öneki **asla**
> verilmez.

## 5. Netgsm

- [ ] Kurumsal hesap açın
- [ ] Vergi levhanızla **başlık (marka) başvurusu** yapın, birkaç iş günü sürer
- [ ] Başlık onaylandıktan sonra SMS paketi satın alın
- [ ] API kullanıcı adı ve şifresini `/etc/sahra.env` dosyasına yazın

> Başlık onaylanmadan gönderim yapılamaz. Onay beklerken sistem çalışır;
> mesajlar kuyruğa girer ve arayüzde "gönderilemedi" olarak görünür.

## 6. e-Fatura

İki yol var ve sistem hangisini kullanacağına **kendisi** karar veriyor:

**Özel entegratör (Paraşüt) — varsayılan.** Sahra Takip'i kullanan
salonların faturaları buradan gider.

- [ ] Mali müşavirinizle mükellefiyet durumunuzu teyit edin
- [ ] Paraşüt hesabı açın, e-Arşiv/e-Fatura kontörü tanımlayın
- [ ] Ayarlar → API bölümünden `client_id` ve `client_secret` alın
- [ ] Firma numarasını panel adresinden okuyun

**GİB doğrudan — yalnızca kendi firmanız.** Doğrudan entegrasyon izni,
izni alan mükellefin **kendi** faturaları içindir; başkası adına fatura
kesmek özel entegratör lisansı gerektirir. Bu ayrım kodda zorlanıyor:
yalnızca `GIB_VKN` ile eşleşen işletmenin faturaları bu yoldan gider.

- [ ] GİB'den doğrudan entegrasyon başvurusu yapın
- [ ] Kamu SM'den **mali mühür** temin edin
- [ ] Sertifika ve anahtar dosyalarını sunucuya koyun, `chmod 600`
- [ ] `.env` dosyasına dosya **yollarını** yazın, içeriklerini değil
- [ ] Önce test ortamında deneyin (`GIB_SERVIS_URL` test adresi)

Her iki yolda da:

- [ ] **İlk faturayı düşük tutarlı bir test olarak kesin** ve Faturalar
      ekranındaki `provider_error` alanını kontrol edin

## 7. İYS, yalnızca ticari ileti gönderecekseniz

Rezervasyon onayı, hatırlatma, doğrulama kodu ve tahsilat bildirimi
**işlem bildirimidir**; bu bölümü atlayabilirsiniz. Kampanya, indirim ve
tanıtım mesajı **ticari iletidir** ve alıcının İYS onayı olmadan
gönderilemez.

- [ ] iys.org.tr üzerinden hizmet sağlayıcı (marka) kaydınızı açın
- [ ] Onayları nasıl yöneteceğinize karar verin:
      **elle** (İYS panelinden, Temel Hizmetler paketiyle ücretsiz) ya da
      **otomatik** (bu sistemden aktarım; adres sayınıza uygun paket gerekir)
- [ ] Otomatik aktarım seçtiyseniz `IYS_BRAND_CODE`, `IYS_USERNAME` ve
      `IYS_PASSWORD` değerlerini `/etc/sahra.env` dosyasına yazın
- [ ] Panelde İzin Yönetimi ekranından mevcut onaylarınızı girin
- [ ] Ertesi sabah "İYS: aktarıldı" durumunu kontrol edin

> İzin adedinin süre sınırı yoktur; yüklendikçe paketten düşer. Bazı
> firmalar İYS'ye doğrudan değil, SMS sağlayıcısı (ör. Netgsm) üzerinden
> bağlanır; o durumda `IYS_*` boş kalır ve onay aktarımı sağlayıcı
> panelinden yapılır. Paket fiyatlarını iys.org.tr üzerinden doğrulayın.
>
> Mevzuat, yeni onayın **3 iş günü** içinde İYS'ye aktarılmasını ve ret
> talebinin **3 iş günü** içinde uygulanmasını ister. Sistem her iki yönü
> de her gece 03:00'te senkronize eder.

## 8. Dağıtım sonrası doğrulama

- [ ] `/uye-girisi` → giriş yapılıyor, "Demo modu" uyarısı **görünmüyor**
- [ ] Yeni rezervasyon oluştur → kaydediliyor, kod üretiliyor
- [ ] Tahsilat ekle → kalan alacak doğru hesaplanıyor
- [ ] `/kod-dogrulama` → rezervasyon kodu doğrulanıyor, telefon maskeli
- [ ] Siteden iletişim formu gönder → **Talepler** ekranında görünüyor
- [ ] Fatura oluştur → kaydediliyor (ayrım varsa Türkiye sunucusuna gitti mi
      diye oradaki `invoices` tablosuna bakın)
- [ ] Panel → **Sistem Durumu** → uyarı yoksa altyapı ayakta
- [ ] Ertesi gün Sistem Durumu'nda "son yedek" değeri dolu olmalı
- [ ] Yedek dosyasını açıp fatura kayıtlarının da içinde olduğunu görün

### Zamanlanmış görevler

Sunucu bunları kendisi çalıştırıyor; ayrı bir cron kurulumu gerekmiyor.

| Ne zaman | Ne yapar |
|---|---|
| 5 dakikada bir | SMS kuyruğunu işler |
| 15 dakikada bir | Bekleyen faturaları gönderir |
| Saat başı | Döviz kuru; saatlik hava durumu (:20) |
| 02:30 | Yedek |
| 03:00 | İYS senkronizasyonu |
| 05:15 | Günlük hava durumu (MGM) |
| 07:00 | Hatırlatmalar |
| 09:00 | Anket gönderimi |
| Ayın 1'i 06:00 | Aylık rapor |
| Ayın 2'si 04:00 | Özel günler (bayram, kandil) |
| Ayın 3'ü 04:00 | MEB okul takvimi |

## 9. Bir şey çalışmazsa

`journalctl -u sahra -n 200` ve `journalctl -u postgrest -n 200`. Hata
metnini kopyalarken sırları maskeleyin. Fatura hataları ayrıca Faturalar
ekranındaki `provider_error` alanında Türkçe olarak görünür.

Sık karşılaşılanlar:

| Belirti | Olası neden |
|---|---|
| "Demo modu" uyarısı çıkıyor | PostgREST ayakta değil ya da `/veri/*` vekili çalışmıyor |
| Her sorgu 401 dönüyor | `JWT_SECRET` ile PostgREST'in `jwt-secret` değeri farklı |
| Fatura ekranı **herkese** boş | İki sunuculu kurulumda yetki kopyaları çoğaltılmamış |
| Fatura ekranı yalnızca bazı kullanıcıda boş | `fatura.goruntule` yetkisi verilmemiş |
| SMS gitmiyor, kayıt "gönderilemedi" | Netgsm başlığı henüz onaylanmamış |
| Kuyrukta mesaj birikiyor | `CRON_SECRET` tanımsız ya da servis durmuş |
| Giriş kilidi devrede değil | `JWT_SECRET` tanımsız (sunucu `service_role` jetonu üretemiyor) |
| Fatura taslakta kalıyor | `PARASUT_*` / `GIB_*` eksik, `provider_error`'a bakın |
| Yedek alınmamış uyarısı | `YEDEK_DIZINI` yok ya da servis kullanıcısı yazamıyor |
