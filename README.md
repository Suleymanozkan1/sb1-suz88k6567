# Düğün Takip

Düğün salonları için rezervasyon ve ödeme takip sistemi. `duguntakip.com` sitesinin
tüm herkese açık sayfaları ve üye panelinin tüm ekranları React + TypeScript ile
yeniden inşa edilmiştir.

## Hızlı başlangıç

```bash
npm install
cp .env.example .env.local   # boş bırakılırsa demo modunda çalışır
npm run dev                  # http://localhost:5173
```

### Çalışma modları

| Mod | Ne zaman | Davranış |
|-----|----------|----------|
| **Demo** | `VITE_SUPABASE_URL` boş | Veriler yalnızca tarayıcıda saklanır, arayüzde uyarı gösterilir |
| **Gerçek** | Supabase değişkenleri tanımlı | Veriler Postgres'te, şifreler sunucuda hash'li |

### Demo hesabı

| Alan    | Değer                  |
|---------|------------------------|
| E-posta | `demo@duguntakip.com`  |
| Şifre   | `demo1234`             |

Personel (kısıtlı yetki) hesabı: `personel@duguntakip.com` / `personel1234`

Demo hesapları yalnızca demo modunda vardır.

## Komutlar

| Komut               | Açıklama                                        |
|---------------------|-------------------------------------------------|
| `npm run dev`       | Geliştirme sunucusu                              |
| `npm run build`     | Tip kontrolü + üretim derlemesi (`dist/`)        |
| `npm run preview`   | Derlenmiş çıktıyı yerel olarak sunar             |
| `npm run lint`      | ESLint                                           |
| `npm test`          | Vitest birim + entegrasyon testleri (169 test)   |
| `npm run e2e`       | Playwright uçtan uca testleri (53 test)          |

## Sayfa haritası

### Herkese açık

| Yol | Açıklama |
|-----|----------|
| `/` | Anasayfa — hero, "Ne İşe Yarar?", sektör dağılımı, hizmetler, demo talebi, üye yorumları |
| `/nedir` | Programın tanıtımı, yetenek listesi, ekran özetleri |
| `/haberler`, `/haberler/:slug` | Haberler listesi ve detay sayfaları |
| `/ekranlar` | Uygulama ekranlarının önizlemeleri |
| `/uyeler` | Referanslarımız — kategori/il filtreleri, arama, sayfalama |
| `/salon/:slug` | İşletme detay sayfası — bilgiler, fiyat teklifi/rezervasyon formu, aynı ildeki diğer işletmeler |
| `/dugun-salonlari`, `/kina-salonlari`, `/dugun-otelleri`, `/kir-dugunu-mekanlari` | Kategoriye göre daraltılmış salon listeleri |
| `/dusunceler` | Üye yorumları (aranabilir) |
| `/sss` | Sık sorulan sorular (akordeon) |
| `/iletisim`, `/demo-talebi` | İletişim ve demo talebi formları |
| `/kod-dogrulama` | Rezervasyon kodu sorgulama |
| `/uye-ol` | Üyelik formu (81 il, 24 kategori, sözleşme onayları) |
| `/uye-girisi` | Giriş + zorunlu SMS doğrulama |
| `/gizlilik-politikasi`, `/iade-proseduru`, `/mesafeli-hizmet-sozlesmesi`, `/uyelik-sozlesmesi` | Yasal metinler |

### Üye paneli (`/panel`, oturum gerekir)

| Yol | Açıklama |
|-----|----------|
| `/panel` | Özet — istatistik kartları, yaklaşan organizasyonlar, program ve ay dağılımı, tahsilat oranı |
| `/panel/takvim` | Rezervasyon takvimi — gündüz/gece seansları, organizasyon türüne göre renklendirme |
| `/panel/rezervasyonlar` | Liste — isim/telefon/kod araması, tür, durum, tarih aralığı, sıralama, CSV dışa aktarım |
| `/panel/rezervasyonlar/yeni`, `/:id`, `/:id/duzenle` | Detaylı rezervasyon kaydı, tahsilat yönetimi |
| `/panel/rezervasyonlar/:id/sozlesme` | Yazdırılabilir salon kiralama sözleşmesi |
| `/panel/musteriler` | Rezervasyonlardan türetilen müşteri listesi |
| `/panel/kasa` | Gelir gider kayıtları, kasa bakiyesi |
| `/panel/raporlar` | Program bazlı, ay bazlı, alacak bakiyesi ve gündüz/gece raporları |
| `/panel/renk-ayarlari` | Organizasyon türü başına takvim rengi |
| `/panel/isletmeler` | Firmalarım / Adminler — çok işletmeli kullanım |
| `/panel/kullanicilar` | Alt kullanıcılar ve yetkileri |
| `/panel/sms` | Gönderilen SMS kayıtları |
| `/panel/izinler` | İYS izin yönetimi — ticari ileti onay/ret kayıtları |
| `/panel/denetim` | Denetim kaydı — kim, neyi, ne zaman değiştirdi |
| `/panel/sistem` | Sistem durumu — yedek, kuyruk ve İYS sağlığı; elle yedek indirme |
| `/panel/ayarlar` | Profil, şifre değiştirme, veri sıfırlama |

## Mimari

```
api/            Sunucu tarafı fonksiyonlar (Vercel)
  sms.ts        SMS gönderimi — sağlayıcı anahtarı yalnızca burada
  otp.ts        Giriş SMS doğrulaması (HMAC imzalı, 5 dk geçerli)
  login.ts      Korumalı giriş — hesap kilidi ve hız sınırı
  sms-queue.ts  Kuyruk işleyici (cron, üstel geri çekilme)
  iys.ts        İYS onay aktarımı ve ret çekimi (cron)
  backup.ts     Günlük yedek — Storage'a JSON anlık görüntü (cron)
  health.ts     Sağlık kontrolü — uptime izleme için
supabase/
  migrations/   Veritabanı şeması ve RLS politikaları
  tests/        RLS izolasyon testleri (yerel Postgres ile çalıştırılır)
src/
  components/   Paylaşılan arayüz bileşenleri
  context/      AuthContext — oturum ve yetkiler
  data/         Site içeriği, sabitler, yasal metinler, referans listesi
  layouts/      PublicLayout (site) ve AppLayout (panel)
  lib/
    repo/       Veri erişim sözleşmesi + Supabase ve yerel uygulamaları
    queries.ts  TanStack Query kancaları
    money.ts    Tahsilat / bakiye hesapları (saf)
    reports.ts  Rapor hesapları (saf)
    sms.ts      SMS istemcisi
  pages/        Herkese açık sayfalar
  pages/app/    Panel ekranları
```

### Veri katmanı

Arayüz katmanı yalnızca `src/lib/repo` sözleşmesini tanır. İki uygulaması vardır:
Supabase (gerçek Postgres) ve yerel (demo/test). Hangisinin kullanılacağına ortam
değişkenleri karar verir; ekran kodu değişmez.

Kiracı izolasyonu **veritabanı seviyesinde** satır bazlı güvenlik (RLS) ile
sağlanır. Uygulama katmanında hata yapılsa dahi bir hesap başkasının verisine
erişemez; bu `supabase/tests/01_rls_test.sql` ile doğrulanmıştır.

Panel ekranları `React.lazy` ile ayrı paketlere bölünmüştür; giriş yapmamış
ziyaretçiler yalnızca tanıtım sitesinin paketini indirir.

## Veritabanı kurulumu

1. [supabase.com](https://supabase.com) üzerinde proje açın (**bölge: Frankfurt** — KVKK açısından AB tercih edilir).
2. SQL Editor'da migration dosyalarını **sırayla** çalıştırın:
   `0001_init.sql` → `0002_security.sql` → `0003_iys_queue.sql` → `0004_backup_health.sql`
3. Project Settings → API bölümünden `URL` ve `anon key` değerlerini alın.
4. Bu değerleri `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` olarak tanımlayın.
5. Authentication → Users bölümünden kendi hesabınızı oluşturun.
6. İlk girişten sonra Firmalarım ekranından işletmenizi ekleyin.

Personel hesapları da Supabase → Authentication → Users bölümünden açılır;
yetkileri panelin **Kullanıcılar** ekranından düzenlenir.

### RLS testlerini çalıştırma

```bash
psql -d <veritabani> -f supabase/tests/00_supabase_stub.sql   # yalnızca yerel: auth şeması taklidi
psql -d <veritabani> -f supabase/migrations/0001_init.sql
psql -d <veritabani> -f supabase/migrations/0002_security.sql
psql -d <veritabani> -f supabase/migrations/0003_iys_queue.sql
psql -d <veritabani> -f supabase/tests/01_rls_test.sql        # 8 izolasyon senaryosu
psql -d <veritabani> -f supabase/tests/02_security_test.sql   # 15 güvenlik senaryosu
psql -d <veritabani> -f supabase/tests/03_iys_test.sql        # 16 İYS ve kuyruk senaryosu
psql -d <veritabani> -f supabase/tests/04_backup_restore_test.sql  # 13 yedek/geri yükleme senaryosu
```

Toplam **52 senaryo**. `04_backup_restore_test.sql` yedeği temiz bir şemaya
gerçekten geri yükler ve satır sayıları, parasal değerler, Türkçe karakterler
ile ilişkisel bütünlüğün korunduğunu kanıtlar.

## Güvenlik

| Koruma | Nerede | Davranış |
|--------|--------|----------|
| **Veri izolasyonu** | Postgres RLS | Her hesap yalnızca kendi kapsamındaki veriyi görür; uygulama hatası veri sızdıramaz |
| **Giriş kilidi** | `api/login.ts` + veritabanı | 15 dakika içinde 5 başarısız denemede hesap 15 dakika kilitlenir |
| **Hız sınırı** | `api/_guard.ts` | Giriş 20/5dk (IP), SMS 30/saat (IP) ve 5/saat (numara), kod isteme 5/15dk, kod deneme 8/15dk |
| **Denetim kaydı** | Postgres tetikleyicileri | Tüm ekleme/değişiklik/silme işlemleri, değişen alanlarla birlikte; kayıtlar değiştirilemez |
| **İYS kuralı** | `enqueue_sms` fonksiyonu | Ticari ileti onaysız gönderilemez; kuyruğa doğrudan yazma istemciye kapalı |
| **Yedek erişimi** | Postgres RLS | Yedek yalnızca kendi kapsamını içerir; başka hesabın verisi dışa aktarılamaz |
| **Sır yönetimi** | Ortam değişkenleri | Sağlayıcı şifreleri ve `service_role` anahtarı yalnızca sunucuda; `VITE_` öneki taşımaz |
| **Hata izleme** | `src/lib/monitoring.ts` | İsteğe bağlı Sentry; gönderilen olaylarda e-posta ve telefon maskelenir |
| **Güvenlik başlıkları** | `vercel.json` | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` |

Giriş kilidi ve hız sınırı **sunucu tarafında** uygulanır; istemci bunları
atlayamaz. `SUPABASE_SERVICE_ROLE_KEY` tanımlı değilse bu korumalar devre dışı
kalır (uygulama çalışmaya devam eder, ancak kilit uygulanmaz).

> **Uyarı:** `SUPABASE_SERVICE_ROLE_KEY` satır bazlı güvenliği atlar. Yalnızca
> sunucu ortam değişkeni olarak tanımlayın; asla `VITE_` öneki kullanmayın ve
> istemci koduna aktarmayın.

## SMS ve İYS uyumu

### Mesaj sınıflandırması

Türkiye'de ticari elektronik ileti göndermek için İYS onayı zorunludur; işlem
bildirimleri bu kapsamın dışındadır. Sistem her mesajı sınıflandırır ve kuralı
**veritabanı seviyesinde** uygular:

| Sınıf | Örnekler | İYS onayı |
|-------|----------|-----------|
| **İşlem bildirimi** (`islem`) | Rezervasyon onayı, randevu hatırlatma, doğrulama kodu, ödeme bildirimi | **Gerekmez** (muaf) |
| **Ticari ileti** (`ticari`) | Kampanya, indirim, tanıtım | **Şart** |

Onayı olmayan bir numaraya ticari ileti gönderilemez; deneme sessizce
atılmaz, kuyruğa `iptal` durumuyla gerekçesiyle yazılır ve denetlenebilir kalır.
Ret kaydı bulunan numaraya ticari ileti **anında engellenir**, ancak işlem
bildirimleri etkilenmez.

> Bu sınıflandırma mevzuatın genel uygulamasına dayanır. Kendi mesaj
> metinlerinizin sınıfını hukuk danışmanınızla teyit ediniz.

### Gönderim kuyruğu

Mesajlar doğrudan gönderilmez; önce kuyruğa alınır. Böylece sağlayıcı kesintisi
mesaj kaybına yol açmaz.

- Başarısızlıkta üstel geri çekilme ile yeniden denenir: **1dk → 5dk → 15dk → 1sa → 4sa**
- 5 denemeden sonra kalıcı başarısız işaretlenir
- Takılı kalan kayıtlar 15 dakika sonra otomatik kurtarılır
- İşletme başına günlük 500 mesaj tavanı (hatalı döngülerin faturayı şişirmesini önler)
- Kuyruk durumu panelde **SMS Kayıtları → Kuyruk** sekmesinde görülür

Kuyruk `api/sms-queue.ts` tarafından **5 dakikada bir** işlenir (Vercel Cron).

### İYS senkronizasyonu

`api/iys.ts` her gece 03:00'te çalışır:

- **Aktarım:** sistemde alınan yeni onaylar İYS'ye gönderilir
  (mevzuat: yeni onaylar **3 iş günü** içinde aktarılmalıdır)
- **Çekim:** İYS'de verilen ret kayıtları sisteme işlenir
  (mevzuat: ret en geç **3 iş günü** içinde uygulanmalıdır)

İYS bilgileri tanımlı değilse senkronizasyon çalışmaz; ticari ileti gönderimi
yerel onay kayıtlarına göre yine de engellenir. Panelde henüz aktarılmamış kayıt
sayısı uyarı olarak gösterilir.

> Bazı firmalar İYS'ye doğrudan değil, SMS sağlayıcıları (ör. Netgsm) üzerinden
> bağlanır. O durumda `IYS_*` değişkenlerini boş bırakıp onay aktarımını sağlayıcı
> panelinden yapabilirsiniz.

### Sağlayıcı

Tüm gönderimler `api/sms.ts` üzerinden yapılır — sağlayıcı şifresi tarayıcıya
hiçbir zaman inmez. `NETGSM_*` tanımlı değilse mesaj kuyrukta bekler ve arayüzde
**gönderilemediği açıkça belirtilir**; "gönderildi" denmez.

`OTP_SECRET` tanımlıysa girişte ikinci adım olarak cep telefonuna 6 haneli kod
gönderilir. Kod sunucuda üretilir ve yalnızca HMAC imzası istemciye döner.

**Yapılması gerekenler:** Netgsm'den marka başlığı (gönderici adı) onayı alın;
ticari ileti gönderecekseniz İYS üyeliği ve entegrasyon bilgilerinizi temin edin.

## Vercel'e dağıtım

Depo Vercel'e bağlandığında `vercel.json` gerekli her şeyi tanımlar; ek ayar
yapmanıza gerek yoktur.

| Ayar | Değer |
|------|-------|
| Framework | Vite (otomatik algılanır) |
| Install Command | `npm ci` |
| Ortam değişkenleri | `.env.example` dosyasındaki tüm anahtarlar |

Sunucu tarafı fonksiyonlar (`api/`) Vercel tarafından otomatik yayınlanır.
Alt çizgi ile başlayan dosyalar (`api/_guard.ts`, `api/_db.ts`) uç nokta olarak
yayınlanmaz.

Zamanlanmış görevler `vercel.json` içindeki `crons` bölümünde tanımlıdır ve
`CRON_SECRET` ile yetkilendirilir:

| Görev | Sıklık |
|-------|--------|
| `/api/sms-queue` — kuyruk işleme | 5 dakikada bir |
| `/api/iys` — İYS senkronizasyonu | Her gece 03:00 |
| `/api/backup` — günlük yedek | Her gece 02:30 |
| Build Command | `npm run build` |
| Output Directory | `dist` |

`vercel.json` ayrıca şunları yapar:

- **SPA yönlendirmesi:** bilinmeyen yollar `index.html`'e yeniden yazılır, böylece
  `/salon/...` gibi derin bağlantılar doğrudan açıldığında da çalışır. Statik
  dosyalar (`robots.txt`, `sitemap.xml`, `assets/*`) dosya sistemi önce
  denendiği için bu kuraldan etkilenmez.
- **Önbellekleme:** karma (hash) içeren `assets/*` dosyaları bir yıl `immutable`,
  `robots.txt` / `sitemap.xml` / `favicon.svg` bir saat önbelleklenir.
- **Güvenlik başlıkları:** `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`.

Yerel önizleme için:

```bash
npm run build && npm run preview
```

Not: Kalıcılık tarayıcıdaki `localStorage` üzerinde olduğu için dağıtım tamamen
statiktir; sunucu tarafı çalışma zamanı, ortam değişkeni veya veritabanı
gerekmez.

## Yedekleme ve izleme

Üç bağımsız yedek katmanı vardır: Supabase'in kendi otomatik yedeği, her gece
02:30'da Storage'a yazılan JSON anlık görüntüsü ve panelden istediğiniz zaman
indirebileceğiniz elle yedek.

`GET /api/health` uç noktası uptime izleme servisleri içindir; sorun varsa
**HTTP 503** döner. Kontrol edilenler: kuyrukta bekleyen en eski mesaj (30 dk),
kalıcı gönderilemeyen mesaj, son yedek yaşı (48 saat), SMS sağlayıcı
yapılandırması ve veritabanı erişimi. Uç nokta kişisel veri döndürmez.

Aynı kontroller panelde **Sistem Durumu** ekranında Türkçe açıklamalarla ve
"ne yapmalı" ipuçlarıyla gösterilir.

**Ayrıntılı prosedürler:**
- [`docs/YEDEKLEME-VE-GERI-YUKLEME.md`](docs/YEDEKLEME-VE-GERI-YUKLEME.md) — kurulum, geri yükleme adımları, tatbikat takvimi
- [`docs/IZLEME.md`](docs/IZLEME.md) — uptime izleme kurulumu, alarm yanıt rehberi

> Yedeğinizi yılda en az iki kez gerçekten geri yükleyerek test edin.
> Test edilmemiş yedek, yedek değildir.

## Bilinen sınırlar

- Demo modunda kalıcılık tarayıcıdadır ve şifreler düz metin saklanır. Gerçek
  kullanımda Supabase bağlantısı yapılandırılmalıdır.
- Abonelik / ödeme tahsilatı yoktur; sistem tek şirket kullanımı için sadeleştirilmiştir.
- Referans listesindeki işletmeler örnek veridir.
