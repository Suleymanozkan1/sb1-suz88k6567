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
| `/anket` | Deneyim anketi; bağlantı e-postayla gider, yetki adresteki jetondur |
| `/gizlilik-politikasi`, `/kvkk-aydinlatma-metni` | Yasal metinler |

### Panel (`/panel`, oturum gerekir)

| Yol | Açıklama |
|-----|----------|
| `/panel` | Özet, istatistik kartları, yaklaşan organizasyonlar, program ve ay dağılımı, tahsilat oranı |
| `/panel/takvim` | Rezervasyon takvimi, gündüz/gece seansları, organizasyon türüne göre renklendirme, özel gün işaretleri |
| `/panel/ozel-gunler` | Resmî tatiller (hazır gelir) ve işletmenin kendi özel günleri |
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
| `/panel/raporlar` | Program raporu (salon × gün çizelgesi, Word çıktısı), organizasyon bazlı, ay bazlı, ciro/gider/kâr, alacak bakiyesi, gündüz/gece, salon bazlı, görüşme/dönüşüm ve deneyim anketi raporları |
| `/panel/salonlar` | Salon tanımları, bir işletmede birden çok salon |
| `/panel/menuler` | Menü ve paket tanımları, kişi başı veya sabit fiyat |
| `/panel/urun-hizmet` | Ürün ve hizmet defteri: personel, orkestra, fotoğrafçı, fiziksel ürün ve stok |
| `/panel/odeme-bildirimleri` | Tahsilat olaylarında yöneticiye gidecek mesajlar ve alıcı numaraları |
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
| `11_sozlesme_alanlari_ve_seri_test.sql` | 12 | `0014` göçü: saat/TC alanları, sıralı sözleşme numarası |
| `13_kanal_ve_whatsapp_test.sql` | 14 | Ulaşım kanalı, müşteri adayı ve WhatsApp eşlemesi |
| `14_otomatik_cevap_test.sql` | 7 | Karşılama ve mesai dışı otomatik cevabı |
| `15_kendi_sunucusu_test.sql` | 8 | Kendi kimlik katmanı, oturum fonksiyonları, tablo izinleri |
| `16_aday_durumlari_test.sql` | 14 | Düzenlenebilir aday durumları ve durum geçmişi |
| `17_dugun_ici_giderler_test.sql` | 11 | Düğün içi gider satırları, hesaplanan toplam |
| `18_odeme_bildirimleri_test.sql` | 13 | Tahsilat olay kaydı, yönetici SMS kuyruğu |
| `19_urun_hizmet_stok_test.sql` | 9 | Ürün/hizmet ayrımı, koliden stok hesabı |
| `20_gorusme_takip_test.sql` | 10 | Görüşme alanları, otomatik takip tarihi, dönüşüm raporu |
| `21_sozlesme_no_ve_hizli_yanit_test.sql` | 10 | Düğün yılına bağlı sözleşme numarası, hızlı yanıtlar |
| `22_aylik_rapor_test.sql` | 8 | Aylık özet ve gönderim kaydı |
| `23_finansal_yetki_test.sql` | 10 | Finansal yetkilerin SUNUCUDA uygulanması |
| `24_hata_bildirimi_test.sql` | 9 | Hata bildirimi, kullanıcı/kapsam varsayılanları, ekran kilidi |
| `25_kur_hava_ozel_gun_anket_test.sql` | 15 | Kur/hava yazma kapalı, özel günler, anket jetonu ve yetkisi |

Toplam **262 senaryo**. Beklenen ret senaryoları `BEKLENEN: …` bildirimi basar;
`BASARISIZ:` ile başlayan bir hata görürseniz test gerçekten düşmüştür.

`04_backup_restore_test.sql` yedeği temiz bir şemaya gerçekten geri yükler ve
satır sayıları, parasal değerler, Türkçe karakterler ile ilişkisel bütünlüğün
korunduğunu kanıtlar.

### Yükseltme testi: kurulu bir sistemde göçler güvenli mi?

Yukarıdaki paketler temiz bir şemada çalışır ve yalnızca "yeni kurulum doğru
mu" sorusunu cevaplar. Asıl risk bu değil: **çalışan bir salonun** veritabanına
göç uygulandığında eski rezervasyonların, tahsilatların ve kasa hesabının
bozulması.

```bash
supabase/tests/yukseltme/calistir.sh
```

Betik sırayla şunu yapar:

1. Temiz bir veritabanına `0000`–`0023` göçlerini uygular (güncelleme öncesi şema)
2. Gerçek bir salonun verisini yazar: iki yıla ait rezervasyonlar, tahsilatlar,
   gelir/gider satırları, çelik kasa hareketleri, fatura ve müşteri adayı
3. `0024` ve sonrasını uygular
4. Göçleri **ikinci kez** uygular (kurulum belgesi göçleri bir döngüyle
   uyguluyor; operatörün döngüyü yeniden çalıştırması olağan)
5. Verinin bozulmadığını sınar: sözleşme numaraları değişmedi mi, tahsilat
   toplamı aynı mı, kasa hesabı doğru mu, tipi bilinmeyen eski kayıtlara tip
   **uydurulmuş** mu, çelik kasa defteri düşerken rezervasyonu da götürmüş mü,
   yeni tablolar göçten önce açılmış işletmelere de gelmiş mi

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

### GitHub'dan otomatik dağıtım

`.github/workflows/dagit.yml`, `main` dalına her itmede derleyip test
ediyor, sunucuya `rsync` ile gönderiyor ve servisi yeniden başlatıyor.
Ek bir servise ya da aboneliğe gerek yok; GitHub Actions bu kullanım için
ücretsiz. Testler düşerse dağıtım yapılmaz.

**Veritabanı göçleri bu akışta çalışmaz.** Göçler geri alınamaz olabiliyor
(`0024` çelik kasa defterini düşürür) ve doğru sıra önce yedek, sonra
göç. Yeni bir göç geldiğinde iş akışı özetinde uyarıyor ve çalıştırılacak
komutları yazıyor.

Sunucudaki dağıtım kullanıcısı, SSH anahtarı ve depo sırları:
[`docs/KURULUM.md` § 10](docs/KURULUM.md).

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
| `0 6 1 * *` | Aylık rapor (biten ayın özeti) |
| `0 * * * *` | Döviz ve altın kurları |
| `15 6,15 * * *` | Hava durumu tahmini |
| `0 9 * * *` | Deneyim anketi gönderimi |

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

## Kasa durumu ve ödeme tipi

İşletmenin kasasında duran paranın ne kadarının **nerede** olduğu,
paranın zaten taşıdığı ödeme tipinden çıkar. Her gelir/gider satırı ve her
rezervasyon tahsilatı bir tip taşıyor: Nakit, Kredi Kartı, Havale/EFT, Çek,
Senet.

Önceki sürümde bu bilgi **çelik kasa** adlı ayrı bir defterde elle
işaretleniyordu. Uygulamada ikinci bir muhasebe demekti: her satır iki kez
elleniyor, unutulan her işaret kasayı olduğundan farklı gösteriyordu.
Kaldırıldı; yerine geçen dağılım elle bakım istemiyor.

**Kasa Durumu kartı** Özet sayfasının sağ üstünde. Toplam açıkta, dağılım
şifreyle açılıyor: salonun kasasında ne kadar nakit olduğu, ekranın yanından
geçen herkesin göreceği bir bilgi olmamalı. Şifre kullanıcının **kendi hesap
parolasıdır** ve sunucuda doğrulanır — sistemde ikinci bir sır saklanmıyor.

Kart bir güvenlik duvarı değil, bir perde. Gerçek koruma yetki sisteminde:
`kasa.goruntule` yetkisi olmayan kullanıcıya kart hiç gönderilmiyor.

**Çek ve senet kasa toplamına girmez.** İkisi de henüz tahsil edilmemiş bir
vaattir; kasadaki parayla toplanırsa kasa olduğundan büyük görünür ve
gerçekte olmayan bir paraya göre karar alınır. Tutarları varsa ayrıca
"henüz tahsil edilmedi" notuyla gösterilir.

**Tipi bilinmeyen kayıtlar** ayrı bir satırda toplanır. Ödeme tipi alanı
sonradan eklendi ve eski satırların tipi gerçekten bilinmiyor; hepsine
"Nakit" varsaymak uydurma bir veri üretir, dağılımı sessizce yanlış
gösterirdi. Toplamdan düşülmez — para gerçekten kasada.

## Döviz, hava durumu, özel günler ve deneyim anketi

Dördünün ortak kuralı: **dış servisten gelen hiçbir veri uydurulmaz.**
Sağlayıcı tanımlı değilse ya da cevap vermiyorsa ekranda veri yok
görünür; tahmini bir kur ya da hava durumu gösterilmez. Salon sahibi o
rakama bakarak fiyat belirliyor.

**Döviz / altın.** Kur SUNUCUDA çekilip `exchange_rates` tablosuna
yazılır, panel oradan okur. Tarayıcıdan çekilseydi sağlayıcının API
anahtarı istemciye inerdi ve her açılan sekme sağlayıcıya ayrı istek
atardı. İki sağlayıcı destekleniyor:

| `KUR_SAGLAYICI` | Kaynak | Anahtar | Kapsam |
|---|---|---|---|
| `tcmb` *(varsayılan)* | Merkez Bankası günlük kur dosyası | gerekmez | USD, EUR |
| `collectapi` | Ticari servis | `KUR_API_KEY` | USD, EUR, gram ve çeyrek altın |

Varsayılan `tcmb`: kurulum hiçbir hesap açmadan çalışır. TCMB altın
vermediği için o satırlar oluşmaz ve şeritte görünmez; uydurma bir altın
fiyatı yazılmaz. Sağlayıcı hiç cevap vermezse **eski kur durur** ve
tablo temizlenmez: bir dakikalık kesinti ekrandaki kuru silmemeli,
satırın kendi tarihi zaten ne kadar eski olduğunu söyler.

**Hava durumu.** Sağlayıcı AccuWeather (`ACCUWEATHER_API_KEY`). Her
işletmenin konum anahtarı panelden girilir (Firmalarım → işletme →
"Hava durumu konum anahtarı"); boş bırakılan işletme için tahmin
çekilmez. Ücretsiz katman yalnızca birkaç günlük tahmin verdiği için
**uzak tarihlerde satır hiç yazılmaz** ve ekran "Tahmin henüz mevcut
değil" der. Boş satır yazılsaydı düğün gününde "0°" görünür, olmayan bir
tahmin doğruymuş gibi sunulurdu. Bugünün satırında ayrıca o anki
sıcaklık tutulur; gözlem alınamazsa yalnızca o alan boş kalır, tahmin
yine gösterilir.

**Özel günler.** Takvimde bayram, arife, kandil, resmî tatil ve okul
tarihleri renkli nokta ve etiketle işaretlenir. İki kaynak var:

- **Ortak günler** — sabit tarihli resmî tatiller (1 Ocak, 23 Nisan,
  1 Mayıs, 19 Mayıs, 15 Temmuz, 30 Ağustos, 28-29 Ekim). Göç sırasında
  içinde bulunulan yıl ve sonraki üç yıl için tohumlanır, panelde
  "Sistem" kaynaklı görünür ve değiştirilemez.
- **İşletmenin günleri** — panelden eklenir ve silinir.

**Dini günler ve okul tarihleri tohumlanmaz.** İlki Diyanet'in yıllık
takvimine, ikincisi Millî Eğitim Bakanlığı'nın kararına bağlıdır;
hesaplanmış bir hicri tarih gerçeğinden bir gün sapabilir ve o günü
tatil sanıp salonu kapatmak ya da açmak salona zarar verir. Ekranda bu
sebep yazılı duruyor ki kullanıcı eksik sanıp beklemesin.

**Deneyim anketi.** Organizasyondan bir hafta sonra, müşterinin e-posta
adresi kayıtlıysa çifte anket bağlantısı gider. Bağlantı **rezervasyon
kimliğiyle değil**, anket kaydına ait rastgele bir jetonla açılır:
kimliği tahmin eden herkes başka çiftin anketini açabilirdi. Sayfa beş
başlığı 1-5 arasında puanlatır; puan doğrulaması arayüz ve sunucuda
**aynı modülden** (`src/lib/anket.ts`) geçer, böylece tarayıcıyı atlayan
bir istek aralık dışı puan yazamaz.

Anket satırına yazma yetkisi yalnızca `service_role`'dadır ve o jeton
tarayıcıya hiç inmez; cevap `/api/anket-yanit` üzerinden, sunucudan
yazılır. Bir anket **ikinci kez cevaplanamaz** (bağlantı e-postada durur
ve tekrar tıklanabilir). Sonuçlar Raporlar → Deneyim anketi sekmesinde
özetlenir; cevaplanmamış anketler ortalamaya girmez ama cevap oranında
sayılır. Yöneticiye bildirim gitmesi için Firmalarım'da "Anket sonucu
e-postası" doldurulur.

Gönderilemeyen anket silinmez: satır durur, `sent_at` boş kalır ve bir
sonraki koşuda yeniden denenir.

## Ciro, gider ve kâr

Raporlar ekranındaki **Ciro, gider ve kâr** sekmesi yıllık ve aylık
kırılım veriyor. Kâr ayrı bir alan **değil**, hesaplanıyor:

```
kâr = ciro + diğer gelir − gider
```

- **Ciro**, sözleşme tutarlarının toplamı ve **düğünün yapıldığı döneme**
  yazılıyor, sözleşmenin açıldığı güne değil: bir salonun eylül cirosu,
  eylülde yapılan düğünlerdir.
- **Tahsil edilen** ayrı bir sütun. Sözleşme tutarı henüz gelmiş para
  değil; tek sütunda gösterilseydi kâr, gelmemiş parayla hesaplanmış
  olurdu.
- **Gider**, Gelir/Gider ekranındaki gider satırları ile **düğün içi
  giderlerin** toplamı. Düğün içi giderler kâra girmeseydi salon kendini
  olduğundan kârlı görürdü.
- İptal edilen organizasyonlar hiçbir toplama girmiyor.
- Salon süzgeci açıkken salona bağlı olmayan serbest gelir/gider
  satırları sayılmıyor: o satırların salonu yok ve hepsini her salona
  saymak kârı olduğundan farklı gösterirdi.

Kasa bakiyesi, Özet ve Gelir/Gider ekranları da aynı üç kaynaktan
besleniyor (`src/lib/kasa.ts`): gelir/gider satırları, rezervasyon
tahsilatları (kapora dahil) ve düğün içi giderler. Mobil uygulama da
aynı tanımı kullanıyor; farklı hesaplasaydı telefondaki kasa ile
paneldeki kasa aynı salon için farklı rakam gösterirdi.

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

`WHATSAPP_ACCESS_TOKEN` ve `WHATSAPP_PHONE_NUMBER_ID` yalnızca mesaj
**göndermek** için gerekir; mesaj almak ikisi olmadan da çalışır.

**Webhook adresi.** İki yol da aynı işleyiciye gider, Meta paneline
hangisini yazarsanız yazın:

```
https://<alan-adiniz>/api/webhooks/whatsapp
https://<alan-adiniz>/api/whatsapp
```

`WHATSAPP_BUSINESS_ACCOUNT_ID` zorunlu değildir; verilirse gelen bildirimin
beklenen WhatsApp Business hesabından geldiği de doğrulanır (bir Meta
uygulamasına birden çok hesap bağlanabiliyor).

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

Gönderim `WHATSAPP_ACCESS_TOKEN` ve `WHATSAPP_PHONE_NUMBER_ID` ister. Tanımlı değilse
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

İmza asıl kapı, ama tek kapı değil: adrese **hız sınırı** da uygulanıyor
(dakikada 600 istek). İmzasız istek de bedava değildir — her biri bir HMAC
hesabı demek; sınır olmadan saniyede binlerce çöp istekle sunucu meşgul
edilebilirdi. Sınır yüksek tutuldu, çünkü Meta bir kerede yığın bildirim
gönderebiliyor ve sınıra takılan GERÇEK bir bildirim 200 alamadığı için
tekrar tekrar denenir.

**KVKK:** aday kaydında ve mesajlarda ad, telefon ve e-posta bulunur —
kişisel veridir. Mesajın aslı da saklanır, çünkü çözümleme yanlış yaptığında
doğrusu ancak aslına bakılarak bulunur. Aydınlatma metnine işlendi; aday
işletme tarafından silinebilir, silinince geçmişi de düşer.

### Meta bilgileri girilmeden denemek

`WHATSAPP_MOCK_MODE=true` iken `Panel → Müşteri Adayları → WhatsApp
ayarları` ekranının altında bir **Test mesajı** kutusu açılır. Yapıştırılan
metin gerçek webhook'un **aynı** boru hattından geçer: aynı çözümleyici,
aynı "aynı numara ikinci kayıt açmaz" kuralı, aynı geçmiş kaydı. Ayrı bir
taklit akış yazılsaydı orada çalışan şeyin üretimde de çalışacağının
garantisi olmazdı.

Üç kapı birden geçilmeden hiçbir şey yazılmaz: ortam değişkeni açık olmalı,
çağıran oturum açmış olmalı ve o işletmeye erişimi bulunmalı. Üçüncüsü şart
— yalnızca ortam değişkenine bakan bir uç nokta, yanlışlıkla açık
bırakıldığında herkesin herhangi bir işletmeye kayıt açabildiği bir kapı
olurdu.

Test modunda otomatik cevap **gönderilmez**: deneme amacıyla yazılan bir
mesaj yüzünden gerçek bir numaraya WhatsApp mesajı gitmemeli. Oluşan kayıt
geçmişinde "test modunda elle girildi" satırı durur.

**Üretimde `false` bırakın.** Gerçek webhook'un imza doğrulaması bu ayardan
etkilenmez; mock mod açık diye imzasız bildirim kabul edilmez.

## Müşteri adayı durumları

Takip akışı koda gömülü değil, **işletmenin düzenlediği satırlar**
(`Panel → Müşteri Adayları → Durumlar`). Kurulumda on iki durum gelir:

> Yeni · Aranacak · Arandı · Ulaşılamadı · Tekrar Aranacak · Tekrar Arandı ·
> İletişim Kuruldu · Teklif Verildi · Rezervasyon Bekliyor · Rezervasyona
> Döndü · Olumsuz · İptal

Her salonun akışı aynı değil: biri "Yer Gösterildi" ister, biri "Kapora
Bekliyor". Ekleyebilir, adlandırabilir, sıralayabilir, rengini
değiştirebilirsiniz.

### Ad ile kod ayrıdır

Kayıtlar durumun **adını değil, değişmeyen bir kodunu** taşır. "Arandı"yı
"Görüşüldü" yapmak binlerce aday satırını yeniden yazmaz — yalnızca görünen
değişir, geçmiş de bozulmaz.

İş kuralları da ada bakmaz, **bayrağa** bakar:

| Bayrak | Anlamı |
|---|---|
| Başlangıç | Yeni aday bu durumla açılır. İşletmede tek tanedir. |
| Kapanış | İş beklemiyor; takip ve gecikme listelerinden düşer. |
| Rezervasyon | Rezervasyona dönüş sayılır. İşletmede tek tanedir. |

"Rezervasyona Döndü" yazan bir karşılaştırma, sahibi durumu yeniden
adlandırdığı anda sessizce yanlış sayardı; sayı ekranda durmaya devam eder,
kimse fark etmezdi.

### Silme ve pasife alma

- **Başlangıç durumu silinemez.** Silinirse yeni aday hiç açılamaz.
- **Kullanımdaki durum silinemez.** O adayların durumunu yok etmek demek;
  doğru işlem **pasife almaktır**. Pasif durum yeni seçimlerde görünmez ama
  onu taşıyan kayıtlarda okunabilir kalır.
- Hiç kullanılmamış bir durum silinebilir.

Durum geçmişinde **yabancı anahtar yoktur**, bilerek: silinen bir durumun
geçmişteki izi de silinseydi "bu müşteri neden kaybedildi" sorusu cevapsız
kalırdı.

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
- Döviz ve hava durumu sağlayıcılarına **gerçek bir hesapla bağlanılarak
  denenmemiştir**: yanıt çözümleyicileri birim testleriyle, belgelenen
  yanıt biçimleri üzerinden doğrulandı. İlk çalıştırmada alan adı
  uyuşmazlığı çıkarsa görev günlüğünde sağlayıcının döndürdüğü durum
  kodu görünür ve tablo eski değeriyle kalır.
- Dini bayram, arife, kandil ve okul tarihleri **hazır gelmez**; her yıl
  Diyanet ve Millî Eğitim Bakanlığı'nın açıkladığı takvime göre panelden
  girilir. Hesaplanmış bir hicri tarih gerçeğinden bir gün sapabileceği
  için tohumlanmadı.
- Anket ve aylık rapor e-postaları `MAIL_API_URL/KEY/FROM` tanımlı
  değilse **gönderilmez**; kayıtlar oluşur ve panelden okunur. Anket
  bağlantısı için ayrıca `SITE_URL` gerekir.
