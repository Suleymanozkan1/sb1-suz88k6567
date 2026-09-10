# Sahra Takip

Düğün salonları için rezervasyon ve ödeme takip sistemi. `sahratakip.com` sitesinin
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
| E-posta | `demo@sahratakip.com`  |
| Şifre   | `demo1234`             |

Personel (kısıtlı yetki) hesabı: `personel@sahratakip.com` / `personel1234`

Demo hesapları yalnızca demo modunda vardır.

## Komutlar

| Komut               | Açıklama                                        |
|---------------------|-------------------------------------------------|
| `npm run dev`       | Geliştirme sunucusu                              |
| `npm run build`     | Tip kontrolü + üretim derlemesi (`dist/`)        |
| `npm run preview`   | Derlenmiş çıktıyı yerel olarak sunar             |
| `npm run lint`      | ESLint                                           |
| `npm test`          | Vitest birim + entegrasyon testleri (768 test)  |
| `npm run e2e`       | Playwright uçtan uca testleri (101 test)        |
| `npx vitest run --coverage` | Fonksiyon ve satır kapsamı raporu       |

Kapsamın hangi dosyada neyi doğruladığı ve neyin kapsanmadığı
[`TEST-KAPSAMI.md`](TEST-KAPSAMI.md) dosyasında dosya dosya yazılıdır.

## Sayfa haritası

### Herkese açık

Sistem bir tanıtım sitesi değil, işletmenin kendi panelidir. Herkese açık
yüzey giriş ekranı, müşterinin rezervasyon sorgusu ve yasal metinlerden
ibarettir; tanıtım sayfaları ve siteden üye olma akışı kaldırılmıştır.

| Yol | Açıklama |
|-----|----------|
| `/` | Giriş + zorunlu SMS doğrulama |
| `/kod-dogrulama` | Rezervasyon kodu sorgulama (müşteriye SMS ile giden kod) |
| `/gizlilik-politikasi`, `/kvkk-aydinlatma-metni` | Yasal metinler |

### Panel (`/panel`, oturum gerekir)

| Yol | Açıklama |
|-----|----------|
| `/panel` | Özet, istatistik kartları, yaklaşan organizasyonlar, program ve ay dağılımı, tahsilat oranı |
| `/panel/takvim` | Rezervasyon takvimi, gündüz/gece seansları, organizasyon türüne göre renklendirme |
| `/panel/rezervasyonlar` | Liste, isim/telefon/kod araması, tür, durum, tarih aralığı, sıralama, CSV dışa aktarım |
| `/panel/rezervasyonlar/yeni`, `/:id`, `/:id/duzenle` | Detaylı rezervasyon kaydı, tahsilat yönetimi |
| `/panel/rezervasyonlar/:id/sozlesme` | Yazdırılabilir salon kiralama sözleşmesi: bilgi sütunu, menü içeriği ve 16 maddelik şartlar |
| `/panel/musteriler` | Rezervasyonlardan türetilen müşteri listesi |
| `/panel/kasa` | Gelir gider kayıtları, kasa bakiyesi, çelik kasa; rezervasyon tahsilatları sözleşme numarası ve taraflarla birlikte |
| `/panel/faturalar` | e-Arşiv / e-Fatura düzenleme, gönderim ve iptal |
| `/panel/raporlar` | Program raporu (salon × gün çizelgesi, Word çıktısı), organizasyon bazlı, ay bazlı, alacak bakiyesi ve gündüz/gece raporları |
| `/panel/salonlar` | Salon tanımları, bir işletmede birden çok salon |
| `/panel/menuler` | Menü ve paket tanımları, kişi başı veya sabit fiyat |
| `/panel/tedarikciler` | Tedarikçi defteri, orkestra, fotoğrafçı, çiçekçi |
| `/panel/rezervasyonlar/:id/makbuz` | Yazdırılabilir tahsilat makbuzu |
| `/panel/renk-ayarlari` | Organizasyon türü başına takvim rengi |
| `/panel/isletmeler` | Firmalarım / Adminler, çok işletmeli kullanım |
| `/panel/kullanicilar` | Alt kullanıcılar ve yetkileri *(yalnızca yönetici)* |
| `/panel/sms` | Gönderilen SMS kayıtları |
| `/panel/izinler` | İYS izin yönetimi, ticari ileti onay/ret kayıtları |
| `/panel/denetim` | Denetim kaydı, kim, neyi, ne zaman değiştirdi |
| `/panel/sistem` | Sistem durumu, yedek, kuyruk ve İYS sağlığı; elle yedek indirme |
| `/panel/ayarlar` | Profil, şifre değiştirme, veri sıfırlama |

## Mimari

```
api/            Sunucu tarafı uç noktalar
worker/         Cloudflare Worker giriş noktası (yönlendirici + zamanlanmış görevler)
  sms.ts        SMS gönderimi, sağlayıcı anahtarı yalnızca burada
  otp.ts        Giriş SMS doğrulaması (HMAC imzalı, 5 dk geçerli)
  login.ts      Korumalı giriş, hesap kilidi ve hız sınırı
  sms-queue.ts  Kuyruk işleyici (cron, üstel geri çekilme)
  iys.ts        İYS onay aktarımı ve ret çekimi (cron)
  backup.ts     Günlük yedek, Storage'a JSON anlık görüntü (cron)
  health.ts     Sağlık kontrolü, uptime izleme için
  invoice.ts    e-Arşiv / e-Fatura entegratör gönderimi (cron)
supabase/
  migrations/   Veritabanı şeması ve RLS politikaları
  tests/        RLS izolasyon testleri (yerel Postgres ile çalıştırılır)
src/
  components/   Paylaşılan arayüz bileşenleri
  context/      AuthContext, oturum ve yetkiler
  data/         Site içeriği, sabitler, yasal metinler, referans listesi
  layouts/      PublicLayout (site) ve AppLayout (panel)
  lib/
    repo/       Veri erişim sözleşmesi + Supabase ve yerel uygulamaları
    queries.ts  TanStack Query kancaları
    money.ts    Tahsilat / bakiye hesapları (saf)
    invoice.ts  Fatura tutar hesapları, kuruş tabanlı tamsayı aritmetiği (saf)
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

1. [supabase.com](https://supabase.com) üzerinde proje açın (**bölge: Frankfurt**, KVKK açısından AB tercih edilir).
2. SQL Editor'da migration dosyalarını **sırayla** çalıştırın:
   `0001_init.sql` → `0002_security.sql` → `0003_iys_queue.sql` →
   `0004_backup_health.sql` → `0005_invoices.sql` → `0006_talepler.sql` →
   `0007_salon_menu_masa.sql` → `0008_odeme_plani_is_emri_tedarikci.sql` →
   `0009_nikah_yazimi.sql` → `0010_hatirlatma_sablonlari.sql` →
   `0011_kisa_hatirlatma_metinleri.sql` → `0012_hatirlatmada_kapora.sql` →
   `0013_kullanilmayan_tablolari_dusur.sql` →
   `0014_sozlesme_alanlari_ve_seri.sql` → `0015_celik_kasa.sql`

   Sıra önemlidir: `0006` ve `0008` bugün kullanılmayan iki tabloyu
   oluşturur, `0013` ikisini de düşürür. Aradaki göçler o tablolara
   dokunduğu için atlanamazlar.
3. Project Settings → API bölümünden `URL` ve `anon key` değerlerini alın.
4. Bu değerleri `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` olarak tanımlayın.
5. Authentication → Users bölümünden kendi hesabınızı oluşturun.
6. İlk girişten sonra Firmalarım ekranından işletmenizi ekleyin.

Personel hesapları da Supabase → Authentication → Users bölümünden açılır;
yetkileri panelin **Kullanıcılar** ekranından düzenlenir.

### Kurulu bir projeye yeni göç uygulama

Göçler yeniden çalıştırılabilir (`if not exists`, `drop … if exists`,
`create or replace`); yanlışlıkla iki kez çalıştırmak veri kaybettirmez.

Supabase Dashboard → **SQL Editor** → **New query** → ilgili dosyanın içeriğini
yapıştırıp **Run**. Yerel `psql` ile de yapılabilir:

```bash
psql "$DATABASE_URL" -f supabase/migrations/0013_kullanilmayan_tablolari_dusur.sql
```

`0013` **geri alınamaz**: kullanımdan kalkan `contact_messages` (müşteri
talepleri) ve `payment_installments` (vade tarihli taksit planı) tablolarını,
yalnızca onlara ait fonksiyon ve tipleri düşürür. Uygulamadan önce panelden
yedek indirin. Göç kendi doğrulamasını içinde yapar; yarım uygulanırsa hata
verir. Uygulandıktan sonra aşağıdaki sorgu üç sütunda da `t` döndürmelidir:

```sql
select
  to_regclass('public.contact_messages')      is null as talep_tablosu_dustu,
  to_regclass('public.payment_installments')  is null as taksit_tablosu_dustu,
  to_regtype('public.message_status')         is null as tip_dustu;
```

Denetim kaydı (`audit_log`) bilerek korunur: düşen tablolara ait geçmiş
satırlar "kim neyi ne zaman değiştirdi" sorusunun cevabıdır.

`0014` rezervasyona dört isteğe bağlı alan ekler (`start_time`, `end_time`,
`identity_no`, `second_phone`) ve sözleşme numarasını rastgele (`SA-2026-4821`)
yerine yıl + sıra biçimine (`20261`, `20262`, …) geçirir. Numarayı artık
veritabanı atar: `code` boş gönderilirse tetikleyici sıradaki numarayı yazar,
böylece panel ile mobil uygulama aynı numarayı iki kayda veremez. **Mevcut
kayıtların numarası değişmez**; basılmış sözleşmelerin üstündeki numara ile
kayıt arasındaki bağ korunur.

`identity_no` TC kimlik numarasıdır ve KVKK kapsamında kişisel veridir:
yalnızca sözleşme çıktısında görünür, herkese açık kod doğrulama ekranına
(`verify_reservation_code`) hiçbir koşulda çıkmaz. Aydınlatma metnine
işlenmiştir.

### RLS testlerini çalıştırma

Her test dosyası kendi kimliklerini (`auth.users`) ve örnek verisini sıfırdan
kurar, bu yüzden **her paket temiz bir veritabanında** çalıştırılmalıdır; aynı
veritabanında art arda çalıştırılırsa ikinci paket birincil anahtar çakışmasıyla
durur.

```bash
for t in supabase/tests/0[1-9]_*.sql supabase/tests/1[01]_*.sql; do
  db="qa_$(basename "$t" .sql)"
  psql -c "drop database if exists $db" postgres
  psql -c "create database $db" postgres

  # Şema: yerel auth taklidi + tüm göçler
  psql -v ON_ERROR_STOP=1 -d "$db" -f supabase/tests/00_supabase_stub.sql
  for m in supabase/migrations/000*.sql; do
    psql -v ON_ERROR_STOP=1 -d "$db" -f "$m"
  done

  echo "===== $t"
  psql -v ON_ERROR_STOP=1 -d "$db" -f "$t"
done
```

| Paket | Senaryo | Kapsam |
| --- | --- | --- |
| `01_rls_test.sql` | 8 | Kiracı izolasyonu |
| `02_security_test.sql` | 15 | Hız sınırı, giriş kilidi, denetim kaydı |
| `03_iys_test.sql` | 16 | İYS onayı ve SMS kuyruğu |
| `04_backup_restore_test.sql` | 13 | Yedek alma ve geri yükleme |
| `05_invoice_test.sql` | 15 | Fatura değişmezliği ve seri numarası |
| `07_salon_menu_masa_test.sql` | 13 | Salon, menü ve masa düzeni kuralları |
| `08_is_emri_tedarikci_test.sql` | 9 | İş emri ve tedarikçi kuralları |
| `09_hatirlatma_test.sql` | 14 | Otomatik hatırlatma, mükerrer gönderim engeli, kapora dahil tutar |
| `10_dusurulen_tablolar_test.sql` | 9 | `0013` göçü: düşenler düştü, kullanılanlara dokunulmadı |
| `11_sozlesme_alanlari_ve_seri_test.sql` | 9 | `0014` göçü: saat/TC alanları, sıralı sözleşme numarası, sayaç yazmaya kapalı |
| `12_celik_kasa_test.sql` | 9 | `0015` göçü: çift kayıt engeli, ters yönün yazılabilmesi, geçersiz tutarın reddi, güncellemeye kapalı olması, iki bakiyenin ayrı kalması |

Toplam **130 senaryo**. Beklenen ret senaryoları `BEKLENEN: …` bildirimi basar;
`BASARISIZ:` ile başlayan bir hata görürseniz test gerçekten düşmüştür.

`04_backup_restore_test.sql` yedeği temiz bir şemaya gerçekten geri yükler ve
satır sayıları, parasal değerler, Türkçe karakterler ile ilişkisel bütünlüğün
korunduğunu kanıtlar.

> Göçler, `public` şemadaki tablo izinleri için Supabase'in varsayılan
> yetkilendirmesine dayanır (`anon` / `authenticated` rollerine otomatik verilen
> izinler). Düz bir Postgres'te bu izinler bulunmadığı için test paketleri
> gereken `grant` ifadelerini kendileri verir; şemayı Supabase dışında bir
> sunucuya kuracaksanız bu izinleri açıkça tanımlamanız gerekir.

## Güvenlik

| Koruma | Nerede | Davranış |
|--------|--------|----------|
| **Veri izolasyonu** | Postgres RLS | Her hesap yalnızca kendi kapsamındaki veriyi görür; uygulama hatası veri sızdıramaz |
| **Giriş kilidi** | `api/login.ts` + veritabanı | 15 dakika içinde 5 başarısız denemede hesap 15 dakika kilitlenir |
| **Hız sınırı** | `api/_guard.ts` | Giriş 20/5dk (IP), SMS 30/saat (IP) ve 5/saat (numara), kod isteme 5/15dk, kod deneme 8/15dk |
| **Denetim kaydı** | Postgres tetikleyicileri | Tüm ekleme/değişiklik/silme işlemleri, değişen alanlarla birlikte; kayıtlar değiştirilemez |
| **İYS kuralı** | `enqueue_sms` fonksiyonu | Ticari ileti onaysız gönderilemez; kuyruğa doğrudan yazma istemciye kapalı |
| **Belge bütünlüğü** | Postgres tetikleyicileri | Gönderilmiş fatura değiştirilemez, silinemez; seri sayacı geri alınamaz |
| **Salon çakışması** | Postgres benzersiz dizin | Aynı salona aynı gün ve seansta ikinci rezervasyon açılamaz; farklı salonlara açılabilir |
| **Kapsam bütünlüğü** | `check_reservation_scope()` | Başka işletmenin salonu veya menüsü bir rezervasyona bağlanamaz |
| **Tedarikçi kapsamı** | `check_vendor_scope()` | Başka işletmenin tedarikçisi bir organizasyona atanamaz |
| **Yedek erişimi** | Postgres RLS | Yedek yalnızca kendi kapsamını içerir; başka hesabın verisi dışa aktarılamaz |
| **Sır yönetimi** | Ortam değişkenleri | Sağlayıcı şifreleri ve `service_role` anahtarı yalnızca sunucuda; `VITE_` öneki taşımaz |
| **Hata izleme** | `src/lib/monitoring.ts` | İsteğe bağlı Sentry; gönderilen olaylarda e-posta ve telefon maskelenir |
| **Güvenlik başlıkları** | `public/_headers` | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` |

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

Kuyruk `api/sms-queue.ts` tarafından **5 dakikada bir** işlenir (Cloudflare Cron Trigger).

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

İYS ücretlendirmesi İleti Yönetim Sistemi tarafındadır. Onayları İYS panelinden
elle yönetirseniz **Temel Hizmetler** paketi ücretsizdir; buradaki otomatik
aktarım için adres sayınıza uygun bir paket gerekir (5.000 izin 4.601 ₺, KDV
dahil). Paket listesi:
[docs/DAGITIM-KONTROL-LISTESI.md](docs/DAGITIM-KONTROL-LISTESI.md#5-i̇ys--yalnızca-ticari-ileti-gönderecekseniz)

### Sağlayıcı

Tüm gönderimler `api/sms.ts` üzerinden yapılır, sağlayıcı şifresi tarayıcıya
hiçbir zaman inmez. `NETGSM_*` tanımlı değilse mesaj kuyrukta bekler ve arayüzde
**gönderilemediği açıkça belirtilir**; "gönderildi" denmez.

`OTP_SECRET` tanımlıysa girişte ikinci adım olarak cep telefonuna 6 haneli kod
gönderilir. Kod sunucuda üretilir ve yalnızca HMAC imzası istemciye döner.

**Yapılması gerekenler:** Netgsm'den marka başlığı (gönderici adı) onayı alın;
ticari ileti gönderecekseniz İYS üyeliği ve entegrasyon bilgilerinizi temin edin.

## Cloudflare'e dağıtım

Adım adım kurulum için: [docs/DAGITIM-KONTROL-LISTESI.md](docs/DAGITIM-KONTROL-LISTESI.md)

Tek bir Worker hem derlenmiş siteyi sunar, hem `/api/*` uç noktalarını
karşılar, hem de zamanlanmış görevleri çalıştırır. Yapılandırma
`wrangler.jsonc` içindedir.

```bash
npm run cf:dev      # yerelde çalıştır (zamanlanmış görevler denenebilir)
npm run cf:deploy   # derle ve yayınla
```

Ortam değişkenleri iki yere girilir:

| Tür | Nasıl |
|-----|-------|
| Gizli olmayanlar (`VITE_*`) | Derleme sırasında okunur; CI/CD ortam değişkeni olarak verin |
| Sunucu sırları | `wrangler secret put ADI` ya da Cloudflare panelinden Variables & Secrets |

Sunucu sırları `process.env` üzerinden okunur; `wrangler.jsonc` içindeki
`nodejs_compat` bayrağı ve 2025-04-01 sonrası uyumluluk tarihi bunu sağlar.

### Vercel bağlıysa

Depoya ayrıca bir Vercel projesi bağlıysa, Vercel **yalnızca derlenmiş
statik siteyi** sunar; `vercel.json` bunu böyle sabitler.

Sebebi: Vercel'in sıfır yapılandırma algılaması kökteki `api/` klasörünü
kendi sunucusuz işlev kuralına göre yorumluyor ve iki sorun çıkarıyordu.

1. Her `api/*.ts` dosyasını projenin `tsconfig.node.json` ayarı yerine
   kendi `node16` ayarıyla derliyordu; uzantısız içe aktarımlar (TS2835) ve
   `Array.prototype.at` (TS2550) hata verip derlemeyi düşürüyordu.
2. `api/*.test.ts` dosyalarını da işlev sanıyordu. Derleme geçseydi test
   dosyaları `/api/backup.test` gibi herkese açık uç noktalar olarak yayına
   çıkacaktı.

`vercel.json` içindeki `builds` alanı sıfır yapılandırmayı kapatır;
`.vercelignore` ise test dosyalarının ve derlemeye girmeyen klasörlerin
dağıtıma hiç yüklenmemesini sağlar.

`api/` altındaki işleyiciler Vercel işlevi değildir: `worker/index.ts`
tarafından içe aktarılan Worker işleyicileridir. Bu yüzden Vercel
dağıtımında `/api/*` uç noktaları **çalışmaz** ve şunlar devre dışı kalır:

- Giriş kilidi ve hız sınırı (giriş doğrudan Supabase'e düşer)
- SMS ile iki adımlı doğrulama
- Fatura gönderimi
- Zamanlanmış görevlerin tamamı (hatırlatma, kuyruk, yedek, İYS)

İstemci bu durumu algılayacak biçimde yazılmıştır: `/api/*` JSON yerine
HTML döndürdüğünde uç nokta yok sayılır ve uygulama çökmez
(`supabase.test.ts` → "uç nokta yoksa doğrudan Supabase ile giriş yapar").
Sistemin tamamı için dağıtım Cloudflare üzerinden yapılmalıdır.

### Zamanlanmış görevler

`wrangler.jsonc` içindeki `triggers.crons` listesinde tanımlıdır; her biri
`worker/index.ts` içindeki `CRON_GOREVLERI` eşlemesi üzerinden ilgili uç
noktaya bağlanır ve `CRON_SECRET` ile yetkilendirilir.

| Görev | Sıklık |
|-------|--------|
| `/api/sms-queue`, kuyruk işleme | 5 dakikada bir |
| `/api/invoice`, bekleyen faturaları gönder | 15 dakikada bir |
| `/api/backup`, günlük yedek | Her gece 02:30 |
| `/api/iys`, İYS senkronizasyonu | Her gece 03:00 |

Listeye cron eklenip eşlemeye eklenmezse görev sessizce hiç çalışmaz;
`worker/index.test.ts` bu tutarsızlığı yakalar.

### Yönlendirme ve başlıklar

- **SPA yönlendirmesi:** `wrangler.jsonc` içindeki
  `not_found_handling: "single-page-application"` sayesinde bilinmeyen
  yollar `index.html` döndürür ve `/salon/...` gibi derin bağlantılar
  doğrudan açıldığında çalışır. Tanımsız bir `/api/*` yolu ise siteye
  düşmez, JSON 404 döner.
- **Önbellekleme ve güvenlik başlıkları:** `public/_headers` dosyasında
  tanımlıdır. `assets/*` bir yıl `immutable`; `robots.txt`, `sitemap.xml`
  ve `favicon.svg` bir saat önbelleklenir. Tüm yanıtlarda
  `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` ve
  `Permissions-Policy` gönderilir.

Yerel önizleme için:

```bash
npm run build && npm run preview
```

Not: `npm run preview` yalnızca derlenmiş arayüzü sunar; `/api/*` uç noktaları
ve zamanlanmış görevler için `npm run cf:dev` gerekir. Supabase değişkenleri
tanımlı değilse uygulama demo modunda açılır ve veriler yalnızca tarayıcıdaki
`localStorage` üzerinde tutulur.

## Salonlar, menüler ve masa düzeni

**Salonlar.** Bir işletmede birden çok salon tanımlanır (Kristal Salon, Bahçe…).
Çakışma kuralı **salon bazındadır**: aynı gün ve seansta farklı salonlara
rezervasyon açılabilir, aynı salona açılamaz. Kural veritabanındaki benzersiz
dizinle zorlanır.

Yeni bir işletme oluşturulduğunda veritabanı ona kendiliğinden bir "Ana Salon"
açar; salonsuz bir işletmede rezervasyon oluşturulamayacağı için bu şarttır.
Rezervasyonda salon belirtilmezse ve işletmenin tek salonu varsa o seçilir;
birden çok salon varsa hangisine yazılacağı belirsiz olduğu için kayıt
reddedilir, tahmin edilmez.

**Menüler ve paketler.** Menü kişi başı ya da sabit tutarlı tanımlanır. Fiyat
kuruş cinsinden tamsayı olarak saklanır. Rezervasyona menü seçildiğinde toplam
tutar önerilir (kişi başı menüde `fiyat × davetli`), kullanıcı elle
değiştirebilir, öneri dayatma değildir.

**Masa oturma düzeni.** Rezervasyon başına masa planı tutulur. "Davetliye göre
plan öner" düğmesi, masa başına koltuk sayısından planı üretir ve toplam koltuk
her zaman davetli sayısına yeter. Plan davetliyi karşılamıyorsa eksik koltuk
sayısı uyarı olarak gösterilir.

## Program raporu

Salonun duvarına asılan haftalık program listesinin karşılığıdır. Sütunlar
salonlar, satırlar organizasyon olan günler. **Kayıt bulunmayan günler
çizelgeye girmez**: aralık aylara yayıldığında boş satırlar dolu günleri
gözden kaybettiriyordu. Bir salonu boş olsa da diğerinde tören varsa gün
kalır; o gün salonda iş vardır.

Seçilen aralıkta hiç kayıt yoksa çizelge yerine kaç günün boş olduğu yazar.
Bu, "tarih aralığı seçilmedi" iletisinden ayrıdır: ikisini aynı cümleyle
karşılamak kullanıcıyı gereksiz yere tarih kutularına geri gönderirdi.

Her hücrenin üstünde renkli bir tarih bandı bulunur. Renk **Renk Ayarları**
ekranındaki organizasyon türü renginden gelir; kına ve düğün için kendi
renklerinizi tanımlayabilirsiniz. Renk tek başına bilgi taşımaz: tür bandın
içine yazıyla da yazılır, böylece siyah beyaz çıktı ve renk körü kullanıcı
çizelgeyi aynı şekilde okur.

Aynı gün aynı salonda iki organizasyon varsa her biri kendi saat bandını alır
(`13:00-17:00 DÜĞÜN`, `19:00-23:00 DÜĞÜN`). Saat girilmemişse bandda seans adı
(`GÜNDÜZ` / `GECE`) yazar; uydurma bir saat basılmaz.

Hücrede sırasıyla taraflar, davetli sayısı, menü ve hizmetler (`MENÜ-2+SU
BÖREĞİ+SALATA`) ve varsa rezervasyon notu görünür.

**Ek notlar.** Çizelgenin altındaki alana yazılan serbest notlar hem ekranda
hem Word çıktısında görünür ve bu tarayıcıda saklanır.

**Word çıktısı.** "Word indir" düğmesi aynı çizelgeyi `.docx` olarak üretir.
Çizelge ekranda ne gösteriyorsa kâğıda o iner; boş gün elemesi çizelgenin
kendisinde yapıldığı için ekran ile çıktı ayrışamaz.

Dosya tarayıcıda kurulur; sunucuya hiçbir şey gönderilmez ve pakete harici
bir kitaplık eklenmemiştir (`src/lib/docx.ts`, yaklaşık 200 satır).

Rapor, **Rezervasyonlar** ekranındaki "Program raporu" düğmesinden de açılır;
listede seçili tarih aralığı rapora taşınır.

## Salon kiralama sözleşmesi

Düzen işletmenin basılı sözleşmesini izler: üstte adres bloğu, ortada salon
adı, solda bilgi sütunu (Tarih, Saat, Sözleşme No, Ad Soyad, TC, Gelin ve
Damat, Adres, Davetli, Toplam, Ödeme, Bakiye), sağda menü içeriği, altta 16
maddelik sözleşme şartları ve imza yerleri.

**Boş kalan satır hiç basılmaz.** "TC : -" yazan bir sözleşme, doldurulmayı
bekleyen bir form gibi görünür.

Sağ sütundaki menü içeriği **Menüler** ekranındaki açıklama alanından gelir.
Büyük harfle yazdığınız satırlar (`ANA YEMEK`, `TATLI`, `İÇECEKLER`) başlık
sayılır ve kalın çıkar.

Sözleşme şartları `src/data/sozlesme.ts` içindedir. Yetkili mahkeme maddesi
işletmenin şehrinden üretilir; metne sabit bir il yazılmamıştır.

> Sözleşme metni hukuki inceleme yerine geçmez. Yürürlüğe almadan önce
> avukatınıza okutunuz.

**Sözleşme numarası.** Yıl + sıra biçimindedir: 2026'nın ilk sözleşmesi
`20261`, ikincisi `20262`. Numarayı veritabanı atar (`0014` göçündeki
tetikleyici), istemci değil; panel ile mobil uygulama aynı numarayı iki kayda
veremez. Yıl değişince sıra 1'den başlar, numaranın kendisi yılı taşıdığı için
çakışma olmaz. Bir kayıt bir kez numara alır, sonradan değişmez.

## Çelik kasa

İşletmenin bir de fiziksel kasası var ve içindeki para, gelir/gider
kayıtlarından çıkan muhasebe bakiyesiyle aynı değil: havaleyle gelen
tahsilat kasaya girmez, kasadan alınıp bankaya yatırılan para kasadan çıkar
ama gelir kaydı yerinde durur.

Bu yüzden çelik kasa **ayrı bir hareket defteridir**. Kasa bakiyesi
(gelir − gider) hesabına hiçbir yerde karışmaz; iki bakiye Gelir/Gider
ekranında yan yana durur ve çelik kasa kartı kendi simgesi ve kesikli
çerçevesiyle ayrılır.

**Düğmeler.** Gelir/gider tablosundaki her satırda "Ekle" ve "Çıkar"
düğmeleri var; rezervasyondan türeyen tahsilat satırlarında da. Düğme,
satırın kendi tutarını kasaya yazar. Kısmi tutar alınmaz: satırın anlamını
bulanıklaştırır ve kasadaki parayı gelir/gider kaydından koparırdı.

**Çift sayım engeli.** Bir satır kasaya en çok bir kez girer ve en çok bir
kez çıkar; aynı yönde ikinci kayıt hem arayüzde hem veritabanında
reddedilir. İki kez tıklamaktan doğan çift sayım, akşam sayımda tutmayan
bir fark bırakırdı.

Bir satır hem girip hem çıkabilir: nakit alınan para kasaya girer, ertesi
gün bankaya yatırılınca kasadan çıkar. O satırın kasaya net etkisi sıfır
olur ve tabloda `0,00 ₺` görünür.

**Düzeltme.** Yanlış işlenen hareket, tablonun altındaki **Çelik Kasa
Hareketleri** defterinden silinir; gelir/gider kaydına dokunulmaz.
Hareketler güncellenemez (veritabanında `update` yetkisi verilmemiştir):
düzeltmenin kendisi de defterde iz bırakmalıdır.

Bir gelir/gider kaydı silinirse ona bağlı kasa hareketi de düşer; kalsaydı
kasada kaynağı görünmeyen bir tutar dururdu.

## İş emri ve tedarikçiler

**Etkinlik iş emri.** Organizasyon gününün saat saat planıdır: hangi iş, ne
zaman, kimin sorumluluğunda ve tamamlandı mı. Yeni bir iş emri örnek bir akışla
başlatılabilir.

**Tedarikçiler.** Orkestra, fotoğrafçı, çiçekçi gibi dış firmalar bir defterde
tutulur ve organizasyonlara geliş saati ve ücretiyle atanır. Bir organizasyona
atanmış tedarikçi silinemez; pasife alınır. Başka bir işletmenin tedarikçisi
atanamaz.

## e-Arşiv / e-Fatura

Vergi mükellefi olmayan müşterilere **e-Arşiv Fatura**, e-Fatura mükellefi
kurumlara **e-Fatura** düzenlenir. Alıcı türü seçildiğinde belge türü otomatik
belirlenir.

### Tutar hesabı

Tüm aritmetik **kuruş cinsinden tamsayı** ile yapılır. Ondalıklı sayılarla
çalışmak (`0.1 + 0.2 !== 0.3`) fatura toplamlarında kuruş sapmasına yol açar;
vergi belgesinde bu kabul edilemez.

Yuvarlama kuralı: her satır kendi içinde yuvarlanır, sonra toplanır. Toplam
üzerinden yuvarlama yapılmaz, aksi hâlde satır toplamları ile fatura toplamı
tutmaz. KDV dökümü oran bazında gruplanır ve dökümün toplamı fatura KDV'sine
birebir eşittir.

### Belge güvenliği

Fatura bir vergi belgesidir; veritabanı bunu zorlar:

- **Gönderilmiş fatura değiştirilemez**, tutar, alıcı ve tarih kilitlidir; yalnızca iptal edilebilir
- **Gönderilmiş faturanın satırları değiştirilemez**
- **Fatura silinemez**, iptal kaydı olarak saklanır
- Fatura numarası boşluksuz ve sıralıdır; seri sayacı elle değiştirilemez
- Numara biçimi: 3 karakter ön ek + 4 haneli yıl + 9 haneli sıra (`DGT2026000000001`)
- Toplam tutarlar kendi içinde tutarlı olmak zorundadır (`matrah + KDV = toplam`)
- Kurumsal alıcıda vergi kimlik numarası zorunludur

T.C. kimlik ve vergi kimlik numaraları algoritmik olarak doğrulanır.

### Entegratör: Paraşüt

GİB'e doğrudan bağlanmak UBL-TR XML üretimi ve mali mühür gerektirir; pratikte
özel entegratör kullanılır. Bu kurulum **Paraşüt** için yazılmıştır.

Entegratöre özgü her şey `api/_parasut.ts` içindedir; `api/invoice.ts` yalnızca
akışı yönetir (bekleyen taslakları al, iki kez gönderme, sonucu yaz). Başka bir
entegratöre geçilirse aynı `sendInvoice(invoice, lines) => providerRef`
sözleşmesini karşılayan yeni bir modül yazmak yeterlidir.

**Paraşüt'te gönderim tek adım değildir**, üç adımlıdır:

1. Alıcı, vergi numarası veya e-postasıyla `contacts` içinde aranır; yoksa oluşturulur
2. `sales_invoices` ile satış faturası yazılır
3. Alıcının GİB posta kutusu varsa `e_invoices`, yoksa `e_archives` ile gönderilir

Üçüncü adım eşzamansızdır: Paraşüt bir `trackable_jobs` kaydı döndürür, sonuç
alınana kadar iki saniye aralıkla yoklanır (azami 30 saniye).

Kimlik doğrulama OAuth2 *password* akışıdır. Jeton iki saat geçerlidir, modül
düzeyinde önbelleğe alınır ve süresi dolmadan `refresh_token` ile tazelenir,
her fatura için yeniden oturum açılmaz.

**Fatura numarasını biz veririz.** Veritabanındaki 16 haneli numara
(`DGT2026000000042`) seri ve sıraya bölünüp (`invoice_series: "DGT"`,
`invoice_id: 42`) Paraşüt'e geçilir; aksi hâlde Paraşüt kendi sayacını kullanır
ve iki sistemdeki numaralar ayrışır. Paraşüt Türk lirasını `TRL` koduyla
adlandırır (ISO `TRY` değil).

`PARASUT_*` değişkenlerinin beşi birden tanımlı değilse fatura yalnızca
sistemde oluşturulur, **taslak kalır ve "gönderildi" denmez.** Gönderim
başarısız olursa fatura taslağa geri döner ve hata metni `provider_error`
alanına yazılır; numara veritabanında ayrılmış kalır ve değişmez.

> **Gerçek hesapla test edilmedi.** Uç nokta yolları ve JSON:API zarfı topluluk
> SDK'larından doğrulanmıştır; `e_archives` niteliklerinin bir bölümü
> (`internet_sale`, `exclusion_reason`) hesabınızın ayarlarına göre değişebilir.
> İlk gerçek gönderimde alan adı uyuşmazlığı çıkarsa hata metni
> `provider_error` alanında görünür ve Faturalar ekranında okunabilir.

> **Uyarı:** Zorunluluk hadleri, KDV oranları ve belge türü kuralları
> değişebilir. Kendi mükellefiyet durumunuzu ve hangi KDV oranını
> uygulayacağınızı **mali müşavirinizle teyit ediniz.** Fatura düzenleme süresi
> (VUK) hizmet tarihinden itibaren 7 gündür; arayüz kalan süreyi gösterir.

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
- [`docs/YEDEKLEME-VE-GERI-YUKLEME.md`](docs/YEDEKLEME-VE-GERI-YUKLEME.md), kurulum, geri yükleme adımları, tatbikat takvimi
- [`docs/IZLEME.md`](docs/IZLEME.md), uptime izleme kurulumu, alarm yanıt rehberi

> Yedeğinizi yılda en az iki kez gerçekten geri yükleyerek test edin.
> Test edilmemiş yedek, yedek değildir.

## Bilinen sınırlar

- Demo modunda kalıcılık tarayıcıdadır ve şifreler düz metin saklanır. Gerçek
  kullanımda Supabase bağlantısı yapılandırılmalıdır.
- Üyelik, abonelik, plan ve ücretlendirme **yoktur**. Siteden kendi kendine kayıt açılmaz; panel hesapları Supabase → Authentication → Users bölümünden ya da panelin Kullanıcılar ekranından tanımlanır.
- e-Fatura bağlantısı Paraşüt için yazılmıştır (`api/_parasut.ts`); gövde üretimi ve hata çözümlemesi birim testleriyle doğrulanmış, ancak **gerçek bir Paraşüt hesabıyla test edilmemiştir**. İlk gönderimde alan adı uyuşmazlığı çıkabilir; hata metni Faturalar ekranında görünür.
- Referans listesindeki işletmeler örnek veridir.
