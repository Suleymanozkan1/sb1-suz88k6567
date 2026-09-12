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
| **Demo** | `VITE_SUNUCU_MODU` tanımsız | Veriler yalnızca tarayıcıda saklanır, arayüzde uyarı gösterilir |
| **Gerçek** | `VITE_SUNUCU_MODU=1` | Veriler kendi sunucunuzdaki Postgres'te, şifreler scrypt ile karmalı |

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
| `/panel/musteri-adaylari` | Müşteri adayı takibi: durum, sorumlu personel, takip tarihi, süzgeçler |
| `/panel/musteri-adaylari/yeni` | Elle aday açma (telefonla arayan, kapıdan gelen) |
| `/panel/musteri-adaylari/:id` | Aday kartı: durum geçmişi, iletişim geçmişi, rezervasyona dönüştürme |
| `/panel/whatsapp-ayarlari` | Bağlı numara, çalışma saatleri, karşılama ve mesai dışı mesajları |
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
sunucu/         Node.js sunucusu (statik site + /api/* + zamanlanmış görevler)
  index.ts      HTTP sunucusu, PostgREST vekili
  rotalar.ts    Uç nokta ve cron listesi
  zamanlayici.ts  Cron çözümleyici
  basliklar.ts  Güvenlik ve önbellek başlıkları
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
    repo/       Veri erişim sözleşmesi + sunucu ve yerel uygulamaları
    postgrest.ts  PostgREST istemcisi
    oturum.ts   Tarayıcı oturumu (jeton saklama ve yenileme)
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
sunucu (gerçek Postgres) ve yerel (demo/test). Hangisinin kullanılacağına ortam
değişkenleri karar verir; ekran kodu değişmez.

Kiracı izolasyonu **veritabanı seviyesinde** satır bazlı güvenlik (RLS) ile
sağlanır. Uygulama katmanında hata yapılsa dahi bir hesap başkasının verisine
erişemez; bu `supabase/tests/01_rls_test.sql` ile doğrulanmıştır.

Panel ekranları `React.lazy` ile ayrı paketlere bölünmüştür; giriş yapmamış
ziyaretçiler yalnızca tanıtım sitesinin paketini indirir.

## Veritabanı kurulumu

Sistem **kendi sunucunuzda** çalışır; Cloudflare ve Supabase kullanılmaz.
Sıfırdan kurulum adım adım [`docs/KURULUM.md`](docs/KURULUM.md) dosyasında,
sunucu seçimi ve maliyet [`docs/SUNUCU-SECIMI.md`](docs/SUNUCU-SECIMI.md)
dosyasında anlatılıyor.

Özet:

1. Ubuntu bir VPS'e PostgreSQL, PostgREST, Node.js ve nginx kurulur.
2. `supabase/migrations/*.sql` dosyaları **sırayla** uygulanır.
3. `JWT_SECRET` hem uygulamada hem PostgREST'te **aynı** tanımlanır.
4. `VITE_SUNUCU_MODU=1` ile derlenir, `systemd` ile çalıştırılır.

> Göç klasörünün adı tarihsel sebeple `supabase/`; içeriği sade
> PostgreSQL'dir ve Supabase'e bağımlı değildir.

Sıra önemlidir: `0000` kimlik katmanını kurar ve `0001` ona dayanır;
`0006` ile `0008` bugün kullanılmayan iki tablo açar, `0013` ikisini de
düşürür; `0021` tablo yetkilerini verdiği için en sonda çalışmalıdır.

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
`identity_no`, `second_phone`) ve sözleşme numarasını rastgele bir koddan
yıl + sıra biçimine geçirir; `0018` bu numaraya tire koyar: **`2026-1`,
`2026-2`, …**. Tire, yıl ile sırayı gözle ayırıyor — tiresiz yazıldığında
`20261` ile `202610` bir bakışta ayırt edilmiyordu.

Numarayı veritabanı atar: `code` boş gönderilirse tetikleyici sıradaki
numarayı yazar, böylece panel ile mobil uygulama aynı numarayı iki kayda
veremez. Sayaç tiresiz yazılmış eski numaraları da diziye katar; aksi hâlde
aynı yılın hem `20261` hem `2026-1` diye iki ayrı birinci sözleşmesi olurdu.
**Mevcut kayıtların numarası değişmez**; basılmış sözleşmelerin üstündeki
numara ile kayıt arasındaki bağ korunur.

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
for t in supabase/tests/[0-9]*_*test.sql; do
  db="qa_$(basename "$t" .sql)"
  psql -c "drop database if exists $db" postgres
  psql -c "create database $db" postgres

  # Şema: göçlerin tamamı, sırayla. Ayrı bir auth taklidi YOK --
  # kimlik katmanı artık 0000 ile ürünün kendisinde; testler üretimde
  # çalışacak şeyi sınıyor.
  for m in supabase/migrations/*.sql; do
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
| **Sır yönetimi** | Ortam değişkenleri | Sağlayıcı şifreleri ve `JWT_SECRET` yalnızca sunucuda; `VITE_` öneki taşımaz |
| **Şifre saklama** | `api/_kimlik.ts` | scrypt; tuzlu, sabit zamanlı karşılaştırma |
| **Oturum** | `api/oturum.ts` | Kısa ömürlü imzalı erişim jetonu, iptal edilebilir ve dönüşümlü yenileme jetonu |
| **Hata izleme** | `src/lib/monitoring.ts` | İsteğe bağlı Sentry; gönderilen olaylarda e-posta ve telefon maskelenir |
| **Güvenlik başlıkları** | `sunucu/basliklar.ts` | CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` |

Giriş kilidi ve hız sınırı **sunucu tarafında** uygulanır; istemci bunları
atlayamaz. Giriş için doğrudan veritabanına giden bir yedek yol yoktur:
sunucu yanıt vermiyorsa giriş reddedilir. Eskiden böyle bir yol vardı ve o
yolda kilit hiç uygulanmıyordu; sessizce korumasız çalışan bir giriş, hiç
çalışmayandan kötüdür.

> **Uyarı:** `JWT_SECRET` ile `service_role` talebi taşıyan bir jeton
> üretilebilir ve o rol satır bazlı güvenliği **atlar**. Yalnızca sunucu
> ortam değişkeni olarak tanımlayın, en az 32 karakter olsun, asla `VITE_`
> öneki kullanmayın ve istemci koduna aktarmayın. Aynı değer PostgREST'in
> `jwt-secret` ayarıyla aynı olmalıdır.

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

Kuyruk `api/sms-queue.ts` tarafından **5 dakikada bir** işlenir (sunucunun kendi zamanlayıcısı).

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

## Dağıtım

Sistem kendi sunucunuzda çalışır. Adım adım kurulum:
[`docs/KURULUM.md`](docs/KURULUM.md). Sunucu seçimi ve maliyet:
[`docs/SUNUCU-SECIMI.md`](docs/SUNUCU-SECIMI.md).

Tek bir Node süreci hem derlenmiş siteyi sunar, hem `/api/*` uç
noktalarını karşılar, hem `/veri` altında PostgREST'i vekiller, hem de
zamanlanmış görevleri çalıştırır.

```bash
npm run build     # site + sunucu derlenir
npm run baslat    # sunucuyu çalıştırır (üretimde systemd yapar)
```

Ortam değişkenleri iki yere girilir:

| Tür | Nasıl |
|-----|-------|
| Gizli olmayanlar (`VITE_*`) | Derleme sırasında okunur; `.env.production` dosyasına yazın |
| Sunucu sırları | `/etc/sahra.env` dosyasında, `chmod 600` ile |

Sunucu sırları `process.env` üzerinden okunur ve **derlenmiş tarayıcı
paketine hiç girmez**; bir test bunu her derlemede doğruluyor.

### Vercel'e demo dağıtımı

Depoya bağlı bir Vercel projesi **yalnızca demo içindir**. Vercel
derlenmiş statik siteyi sunar; sunucu tarafı orada çalışmaz.

| | Vercel (demo) | Kendi sunucunuz (gerçek) |
|---|---|---|
| Veriler nerede | Yalnızca **tarayıcıda** (localStorage) | PostgreSQL |
| Kim görür | Yalnızca o tarayıcı | İşletmenin tüm kullanıcıları |
| Tarayıcı verisi silinirse | **Kayıtlar gider** | Etkilenmez |
| SMS, İYS, e-fatura, WhatsApp | Çalışmaz | Çalışır |
| Giriş | Örnek hesapla, kilit ve hız sınırı yok | Sunucu tarafında korumalı |

> Demo, sistemi göstermek ve denetlemek içindir. **Gerçek müşteri
> kaydı girilmemelidir**: veriler tarayıcıdan silindiğinde geri
> getirilemez ve yedeklenmez.

`vercel.json` içindeki `builds` alanı Vercel'in sıfır yapılandırma
algılamasını kapatır. Kapatılmasaydı Vercel kökteki `api/` klasörünü
kendi sunucusuz işlev kuralına göre yorumlar ve iki sorun çıkardı:
derleme, projenin kendi TypeScript ayarı yerine Vercel'inkiyle yapılıp
düşerdi; ve `api/*.test.ts` dosyaları herkese açık uç noktalar olarak
yayına çıkabilirdi. `.vercelignore` test dosyalarını ayrıca eliyor.

`vercel-build` betiği yalnızca statik siteyi derler; sunucu derlemesi
Vercel'e girmez.

### PostgREST neden dışarı açılmıyor

Veritabanı arayüzü yalnızca `127.0.0.1` üzerinde dinliyor ve isteklere
kendi sunucumuz üzerinden ulaşılıyor. Üç sebebi var:

1. Aynı kökenden geçtiği için tarayıcıda CORS'a gerek kalmıyor.
2. İçerik güvenlik politikası `connect-src 'self'` kadar dar tutulabiliyor.
3. Veritabanı arayüzü internete ayrı bir kapı açmıyor; açılsaydı tek
   koruma RLS'e kalırdı.

### Zamanlanmış görevler

Cron ifadeleri `sunucu/rotalar.ts` içinde, saatler **UTC**:

| İfade | Görev |
|---|---|
| `*/5 * * * *` | SMS kuyruğu |
| `*/15 * * * *` | Fatura gönderimi |
| `30 2 * * *` | Günlük yedek |
| `0 3 * * *` | İYS eşitleme |
| `0 7 * * *` | Hatırlatma taraması |

Zamanlayıcı sürecin içinde çalışıyor; ayrıca bir cron kurulumu
gerekmiyor. Aynı dakikada iki kez tetiklenmemesi için son çalıştığı
dakika tutuluyor: erken uyanılsaydı SMS kuyruğu aynı mesajı iki defa
gönderirdi.

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

## Ulaşım kanalı ve kanal raporu

Rezervasyon formunda **"Bize nereden ulaştı?"** alanı var: Instagram,
Düğün.com, Google, Referans, Diğer. Referansta tavsiye edenin adı, "Diğer"de
açıklama yazılır; açıklama **Diğer için zorunludur** — raporda "Diğer 23
kayıt" satırını görüp içine bakamamak, alanı hiç tutmamakla aynı kapıya
çıkar.

Kanal serbest metin değil sabit bir listedir: serbest metin "Instagram",
"instagram", "İnstagram" diye üç ayrı kanal üretip yıl sonu raporunu
anlamsız kılardı.

`Raporlar → Ulaşım kanalı` sekmesi kanal başına adet, pay, davetli, ciro ve
tahsilatı veriyor; CSV olarak da iniyor. Kanalı boş bırakılmış kayıtlar
gizlenmiyor, **"Belirtilmemiş"** olarak sayılıyor: gizlenselerdi yüzdeler
yalnızca doldurulmuş kayıtlar üzerinden hesaplanır ve Instagram gerçekte
olduğundan güçlü görünürdü. O satırın büyüklüğü ayrıca alanın ne kadar
doldurulduğunu söylüyor.

Alan hem panelde hem mobil uygulamada var.

## WhatsApp Business bağlantısı

İşletmenin WhatsApp numarasına yazılan mesajlar `Panel → Müşteri Adayları`
ekranına düşer. Mesaj çözümlenir (ad, telefon, e-posta, tarih, kişi sayısı,
organizasyon türü) ve bir **müşteri adayı** açılır — durumu `Aranmadı`.

**Aynı numaradan gelen ikinci mesaj yeni bir aday AÇMAZ**, mevcut adayın
iletişim geçmişine eklenir. Yoksa "bu müşteri daha önce arandı mı" sorusu
cevapsız kalırdı. Eşleştirme telefona, yoksa e-postaya bakar; mesajı
gönderen numara metinde yazandan güvenilir sayılır.

Mevcut adayın dolu alanları **ezilmez**: personelin elle düzelttiği bir adı,
gelen mesajdaki çözümleme yanlışıyla bozmak kaydı kötüleştirirdi. Yalnızca
boş alanlar doldurulur.

### Elle aday açma

Modül WhatsApp bağlantısını beklemez. `Panel → Müşteri Adayları → Yeni aday`
telefonla arayan, kapıdan giren ya da Instagram'dan yazan müşteriyi aynı
deftere yazar; kaynak alanı hangi kanaldan geldiğini tutar. Ekran yalnızca
webhook'la beslenseydi, Meta kurulumu bitene kadar hiç kullanılamazdı ve o
arada gelen müşteriler yine bir yere not edilirdi.

Telefon zorunlu değil, ama yazıldıysa geçerli olmak zorunda: yanlış numara
aynı kişinin ikinci bir kayıt olarak açılmasına yol açıyor. Kesin olmayan
tarih ("Mayıs ilk hafta") ayrı bir alana yazılır, uydurma bir güne
çevrilmez.

### Takip

Her adayın bir **durumu** (Aranmadı → Arandı → … → Rezervasyona Döndü),
bir **sorumlu personeli** ve bir **sonraki takip tarihi** var. Durum
değişiklikleri veritabanı tetikleyicisiyle geçmişe yazılır — kim, ne zaman,
neyden neye. İstemci bu kaydı atlayamaz.

İletişim geçmişi silinmez ve düzeltilemez: düzeltilebilen bir geçmiş, geçmiş
değildir. Yetkiler de buna göre: kullanıcı mesaj ekler, düzeltemez ve
silemez; durum geçmişini yalnızca okur.

Dashboard'daki **Müşteri takip** kutuları (yeni, bugün aranacak, geciken
takip, ulaşılamayan, tekrar aranacak, teklif gönderilen, rezervasyona dönen,
olumsuz) listeye süzgeçle gider. Geciken takip ile bugün aranacak ayrı
duruyor: ikisi tek sayıda toplanınca gecikmiş iş, günlük işin içinde
kaybolur.

### Rezervasyona dönüşüm

`Rezervasyona Dönüştür` düğmesi adayın bilgilerini rezervasyon formuna
taşır; bilgiler yeniden yazılmaz. Kayıt açılınca aday `Rezervasyona Döndü`
olur ve rezervasyona bağlanır, böylece dönüşüm takip edilebilir. Araya bir
taslak rezervasyon konmuyor: vazgeçilen her adayda yarım bir kayıt kalırdı.

Çözülemeyen tarih ifadesi ("Mayıs ilk hafta") nota geçiyor; bilgi
kaybolmuyor.

Çözümleme satır **sırasına değil içeriğine** bakar. Sıraya güvenmek iki
yerde kırılıyordu: araya bir fiyat sorusu girdiğinde "dördüncü satır tarih"
kuralı bozuluyor, telefonu unutup e-postayı önce yazan müşteri bütün
alanları bir kaydırıyordu.

Çözümleyici emin olamadığını **uydurmuyor**, boş bırakıp ham metni not
olarak taşıyor. "Mayısın ilk haftası" gibi gün taşımayan bir ifade tarihe
çevrilmiyor: uydurulan bir gün, salonun o gün dolu sanılmasına yol açardı.
Mesajın aslı her talepte açılabilir durumda duruyor.

### Kurulum (Meta tarafı — sizde)

1. [Meta for Developers](https://developers.facebook.com/) üzerinde bir
   uygulama açın ve **WhatsApp** ürününü ekleyin.
2. Sahra'nın sabit numarasını WhatsApp Business hesabına bağlayıp
   doğrulayın. Numara başka bir WhatsApp hesabında kayıtlıysa önce oradan
   düşürülmesi gerekir.

   > **Dikkat — numara seçimi.** Cloud API'ye bağlanan numara, telefondaki
   > WhatsApp ve WhatsApp Business uygulamalarından **düşer**; o numaranın
   > mesajlarına artık yalnızca API üzerinden, yani bu panelden bakılır.
   > Salonun personelin elinde günlük kullandığı numarası bağlanırsa
   > telefondan yazışma imkânı kalmaz. Bağlantı için ayrı bir hat
   > açılması, günlük hattın elde kalması bakımından daha güvenlidir.
3. Webhook adresi olarak `https://<alanadınız>/api/whatsapp` verin,
   **Verify token** alanına kendi belirlediğiniz uzun bir dizeyi yazın ve
   `messages` alanına abone olun.
4. Aynı dizeyi sunucuda `WHATSAPP_VERIFY_TOKEN`, uygulamanın **App Secret**
   değerini `WHATSAPP_APP_SECRET` olarak tanımlayın.
5. Panelde numarayı işletmeye bağlayın: Meta'nın verdiği
   **Phone number ID** değeri `whatsapp_accounts` tablosuna işletmeyle
   birlikte yazılır. Bu eşleme olmadan gelen mesaj kaydedilmez — hangi
   işletmeye ait olduğu bilinmeyen satır kimsenin göremeyeceği bir kayıt
   olurdu.

### WhatsApp Web ile Cloud API aynı şey değildir

İkisi mimaride ayrı duruyor ve karıştırılmamalı:

| | WhatsApp Web (`wa.me`) | Cloud API (`/api/whatsapp-gonder`) |
|---|---|---|
| Ne yapar | Tarayıcıda konuşmayı açar | Sunucudan mesaj gönderir |
| Mesajı kim yazar | Personel | Program |
| Ücret | Yok | Konuşma başına ücretli |
| Zaman kısıtı | Yok | **24 saatlik hizmet penceresi** |
| Kurulum | Gerekmez | Meta onayı + kalıcı jeton |

Aday kartındaki **"WhatsApp'ta Aç"** düğmesi `wa.me` bağlantısıdır — API
değildir.

**24 saat kuralı:** müşterinin son mesajından sonraki 24 saat içinde serbest
metin gönderilebilir. Pencere kapandıysa yalnızca Meta'nın onayladığı bir
şablon gönderilebilir; serbest metin denemesi reddedilir. Uç nokta pencereyi
kontrol edip kapalıysa `409` ile açıkça bildiriyor — sessizce düşen bir
mesaj, gönderildi sanılır ve müşteri cevapsız bekler.

`WHATSAPP_TOKEN` ve `WHATSAPP_PHONE_ID` yalnızca mesaj **göndermek** için
gerekir; mesaj almak ikisi olmadan da çalışır.

### Otomatik cevap

`Panel → Müşteri Adayları → WhatsApp ayarları` ekranında iki otomatik mesaj
açılabilir. **İkisi de varsayılan olarak kapalıdır**: göç uygulanır
uygulanmaz müşterilere program adına mesaj gitmesi, salonun haberi olmadan
onun ağzından konuşmak olurdu.

| | Ne zaman gider | Tekrar |
|---|---|---|
| **Karşılama** | İlk kez yazan bir müşteri için aday açıldığında | Aynı kişiye bir kez |
| **Mesai dışı** | Çalışma saatleri dışında gelen mesaja | Aynı kişiye 12 saatte bir |

İkisi birden uygun olduğunda **mesai dışı olan gönderilir**: arka arkaya iki
mesaj almak yerine müşteri, ne zaman dönüleceğini söyleyen tek mesajı alır.

Tekrar sınırları keyfi değil. Karşılamanın ikinci kez gitmesi, müşteriye
konuşmanın hatırlanmadığını söyler; bir akşam beş mesaj yazan müşteriye beş
bilgilendirme gitmesi ise sistemin onu dinlemediğini gösterir.

Saatler **işletmenin yerel saatidir** (Türkiye, UTC+3). Sunucu UTC çalıştığı
için çevrim kodda yapılıyor; yapılmasaydı "mesai dışı" kararı üç saat kayar
ve akşam 21:00'de gelen mesaj mesai içi sayılırdı. Açılış saati dahil,
kapanış saati hariçtir.

Otomatik gönderilen mesaj iletişim geçmişinde **"otomatik" etiketiyle**
görünür: müşteriye ne söylendiğini bilmeden arayan personel aynı şeyi
ikinci kez söylerdi.

Gönderim `WHATSAPP_TOKEN` ve `WHATSAPP_PHONE_ID` ister. Tanımlı değilse
özellik sessizce kapalı kalır; mesaj alınmaya devam eder. Gönderim
başarısız olursa mesaj geçmişe **yazılmaz** — gitmemiş bir cevabı gitmiş
göstermek, personeli yanlış bilgiyle arattırırdı.

### Fiyat ve müsaitlik sorusuna otomatik cevap verilmez

Otomatik cevap yalnızca "mesajınız alındı" ve "şu saatte döneceğiz" der.
Fiyat, tarih ve doluluk sorusuna kendiliğinden cevap **verilmez**: müsaitlik
söyleyen bir otomatik yanıtlayıcı, müşteri tarafında salon adına verilmiş
bir taahhüt gibi okunur ve dolu bir günü sattırır. Bu soruların cevabını
personel verir — aday kartındaki "WhatsApp'ta Aç" ile ya da Cloud API
kurulduysa panelden.

### Güvenlik

Webhook adresi herkese açıktır; Meta'nın ulaşabilmesi için başka türlüsü
mümkün değil. Bu yüzden gelen her isteğin `x-hub-signature-256` imzası
`WHATSAPP_APP_SECRET` ile doğrulanır ve karşılaştırma sabit zamanlı yapılır.
İmza doğrulanmasaydı isteyen istediği kadar sahte talep yazar, kanal raporu
da rezervasyon listesi de çöple dolardı. `WHATSAPP_APP_SECRET` tanımlı
değilse uç nokta hiç çalışmaz.

**KVKK:** aday kaydında ve mesajlarda ad, telefon ve e-posta bulunur —
kişisel veridir. Mesajın aslı da saklanır, çünkü çözümleme yanlış yaptığında
doğrusu ancak aslına bakılarak bulunur. Aydınlatma metnine işlendi; aday
işletme tarafından silinebilir, silinince geçmişi de düşer.

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
