# Test Kapsamı

Bu belge, "her fonksiyonu tek tek test et" isteğinin karşılığıdır: hangi
dosyanın hangi testle kapsandığı, neyin kapsanmadığı ve neden kapsanmadığı
tek tek yazılıdır.

Ölçüm tarihi: 10 Eylül 2026.

## 1. Özet

| Katman | Test | Fonksiyon kapsamı | Satır kapsamı |
|---|---|---|---|
| `api/` (sunucu uçları) | 253 birim | **%100** (55/55) | %99,9 |
| `src/lib/` (iş mantığı) | 320 birim | **%100** (251/251) | %99,7 |
| `src/lib/repo/` (veri erişimi) | 213 birim | **%100** (166/166) | %99,5 |
| `worker/` (yönlendirme, cron) | 14 birim | **%100** (3/3) | %100 |
| Ekranlar (React) | 49 tümleşik + 115 uçtan uca | akış bazlı, aşağıda | — |
| `mobil/src/` | 133 birim (2 atlandı) | %98,9 (`veri.ts`) | %97,4 |
| Veritabanı (RLS, tetikleyici, fonksiyon) | 10 SQL paketi | — | — |

**Ölçülen 475 fonksiyonun 475'i çalıştırılıyor; testi olmayan fonksiyon
kalmadı.**

Toplam: **885 web birim testi**, **133 mobil testi** (2'si atlandı),
**115 uçtan uca test**, **10 SQL test paketi**.

## 2. Çalıştırma

```bash
npm run typecheck            # tsc, hata yok
npm run lint                 # eslint, 0 hata
npm test                     # 885 birim + tümleşik test
npm run build                # üretim derlemesi
npm run e2e                  # 115 Playwright testi (Chromium)

cd mobil && npx tsc --noEmit && npx jest    # 133 mobil testi

# SQL paketleri her biri temiz bir veritabanında çalıştırılır:
createdb sahra_test
psql -d sahra_test -f supabase/tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -d sahra_test -f "$f"; done
psql -v ON_ERROR_STOP=1 -d sahra_test -f supabase/tests/01_rls_test.sql
```

## 3. Sunucu uçları (`api/`)

Kapsam %14'ten %100'e çıkarıldı. Bu katmanda bir hata sessizdir: kuyruk
tüketilir ama mesaj gitmez, yedek başarısız olur ama kimse görmez.

| Dosya | Test dosyası | Kapsanan davranışlar |
|---|---|---|
| `_db.ts` | `_db.test.ts` (24) | Yapılandırma denetimi, RPC / REST / Storage çağrılarının başlıkları, cron yetkisi (şemasız sır reddedilir) |
| `_guard.ts` | `_guard.test.ts` (24) | IP başlığı önceliği, hız sınırının servis kesintisinde kullanıcıyı dışarıda bırakmaması, giriş kilidi sorgusu |
| `_parasut.ts` | `_parasut.test.ts` (21) + `_parasut.oturum.test.ts` (24) | Kuruş dönüşümü, belge gövdeleri, hata çözümleme; jeton önbelleği ve yenilemesi, e-Fatura / e-Arşiv seçimi, iş yoklaması ve zaman aşımı |
| `login.ts` | `login.test.ts` (18) | Kilitli hesapta şifrenin hiç denenmemesi, kalan deneme hakkı, belirteç sızdırmama |
| `otp.ts` | `otp.test.ts` (27) | Kodun yanıt gövdesine hiç konmaması, imzanın telefon + kod + süreyi birlikte bağlaması, deneme sınırı |
| `sms.ts` | `sms.test.ts` (30) | Netgsm kod tablosunun tamamı, sağlayıcı tanımsızken "gönderildi" denmemesi, şifrenin sızmaması |
| `sms-queue.ts` | `sms-queue.test.ts` (14) | Sağlayıcı yokken kuyruğun tüketilmemesi, sonucu yazılamayan satırın kaybolmaması |
| `reminders.ts` | `reminders.test.ts` (9) | Engellenen hatırlatmanın gerekçesiyle raporlanması, görev çıktısında kişisel veri bulunmaması |
| `backup.ts` | `backup.test.ts` (12) | Başarısız yedeğin hem `backup_runs` satırına hem HTTP durumuna yansıması |
| `health.ts` | `health.test.ts` (15) | Eşikler, çok hesaplı toplama, yetkisiz çağrıya sorun listesi verilmemesi |
| `iys.ts` | `iys.test.ts` (21) | Onay aktarımı, İYS tarafındaki reddin yerele işlenmesi, geçersiz alıcının atlanması |
| `invoice.ts` | `invoice.test.ts` (14) | Mükerrer gönderimi engelleyen koşullu durum güncellemesi, satırsız faturanın gönderilmemesi |

Her uç nokta ayrıca **sır sızıntısına** karşı denetleniyor: `service_role`
anahtarı, Netgsm şifresi, Paraşüt şifresi ve İYS şifresi hiçbir yanıt
gövdesinde ya da hata metninde geçmiyor.

## 4. İş mantığı (`src/lib/`)

| Dosya | Test | Not |
|---|---|---|
| `money.ts` | `local.test.ts` içinden | Kapora + tahsilat toplamı, kalan bakiyenin negatife düşmemesi |
| `invoice.ts` | `invoice.test.ts` | KDV, yuvarlama, TCKN / VKN doğrulaması, fatura numarası |
| `sablon.ts` | `sablon.test.ts` | Yer tutucu doldurma, GSM-7 indirgeme, SMS parça ölçümü |
| `reports.ts` | `reports.test.ts`, `kasaGeliri.test.ts` | Rapor toplamları, CSV kaçışları, Excel için BOM; rezervasyondan türetilen kasa satırları (kapora + tahsilat, iptal edilenin dışarıda kalması, sahipsiz tahsilatın yok sayılması) |
| `program.ts` | `program.test.ts` | Çizelge kurulumu: boş günlerin satır olarak durması, gündüz töreninin geceden önce gelmesi, aynı gün iki törenin ayrılması, iptal edilenin çizelgeye girmemesi |
| `docx.ts` | `docx.test.ts` | ZIP yapısı (CRC32 referans değerleri, merkez dizin), XML kaçışları, boş hücrenin paragrafsız kalmaması, Word MIME türü |
| `programDocx.ts` | `programDocx.test.ts` | Word çıktısı: renk dönüşümü, saat bandı, ek notlar bölümü, dosya adındaki tarih aralığı, boş günlerin kâğıda basılmaması ve bir salonu dolu olan günün atılmaması |
| `seating.ts`, `plan.ts`, `health.ts`, `ids.ts` | kendi test dosyaları | — |
| `format.ts` | `format.test.ts` | Para, tarih, telefon, kontrast; `formatDateTime` dahil |
| `sms.ts` | `sms.test.ts` | Gönderim, OTP, uç noktanın varlığının anlaşılması |
| `monitoring.ts` | `monitoring.test.ts` | Hata raporundan e-posta / telefonun maskelenmesi, kullanıcı kimliğinin hiç gönderilmemesi, DSN yokken Sentry'nin yüklenmemesi |
| `storage.ts` | `storage.test.ts` | Kota dolduğunda, gizli sekmede ve bozuk kayıtta çökmeme |
| `authHelpers.ts` | `authHelpers.test.ts` | Ham veritabanı metninin kullanıcıya gösterilmemesi |
| `queries.ts` | `queries.test.tsx` | 50'den fazla veri kancası tek tek; doğru işletmenin sorulması, kimliksiz sorgunun çalışmaması, yazma sonrası önbellek tazelemesi, İYS kuralı |
| `seed.ts` | `local.test.ts` | Mevcut verinin üzerine yazmama |
| `data/sozlesme.ts` | `sozlesme.test.ts` | Sözleşme şartlarının on altı maddesinin eksilmemesi, yetkili mahkemenin işletmenin şehrinden gelmesi |

## 5. Veri erişimi (`src/lib/repo/`)

Uygulamanın en riskli yeri: veritabanı sütunları (snake_case) ile arayüz
alanları (camelCase) arasındaki eşleme burada yapılıyor. Bildirilen kapora
hatası tam olarak bu katmandan çıkmıştı.

- `local.test.ts` + `local.hesap.test.ts` (105 test): rezervasyon, para,
  profil, personel, işletme silmede bağlı kayıtların temizlenmesi, sistem
  durumu eşikleri, dışa aktarımın başka hesabın verisini taşımaması,
  şablon ve hatırlatma kuralı doğrulamaları.
- `supabase.test.ts` (108 test): çağrıları kaydeden taklit istemciyle her
  uç. Doğru tabloya doğru sütun adlarıyla gidildiği ve dönen satırın
  eksiksiz çevrildiği ayrı ayrı doğrulanıyor. Ayrıca veritabanı hata
  kodları (23505 çakışma, 23514 kısıt, 42501 yetki, 23503 bağlı kayıt)
  Türkçe metne çevriliyor ve ham Postgres metni kullanıcıya
  gösterilmiyor.

## 6. Ekranlar

React bileşenleri iki yoldan doğrulanıyor: jsdom tümleşik testleri ve
tarayıcıda çalışan Playwright akışları. Aşağıdaki tablo her panel ekranının
hangi akışla kapsandığını gösterir.

| Ekran | İşlevsel akış |
|---|---|
| Özet (`/panel`) | İstatistik kartları, yaklaşan organizasyonlar |
| Takvim | Ay gezinmesi, rezervasyonun takvimde işaretlenmesi |
| Rezervasyonlar | Arama, filtre, yeni kayıt, düzenleme, silme kilidi |
| Rezervasyon detayı | Tahsilat ekleme, kalan bakiye, tahsilatın kalanı aşamaması, hatırlatma taslağı |
| Sözleşme / Makbuz | Çıktı görünümü, tutarların taşınması, on altı maddelik şartlar, menü içeriğinin sağ sütuna basılması, boş alanın hiç yazılmaması |
| Kasa | Gelir / gider ekleme, listeye ve bakiyeye yansıma; rezervasyon tahsilatlarının sözleşme numarası ve taraflarla görünmesi, türetilmiş satırın silinememesi |
| Faturalar | Fatura oluşturma, tutar hesabı, durum |
| Raporlar | Sekme geçişi, toplamların kasa ve rezervasyon verisiyle tutarlılığı |
| Program raporu | Salon sütunları, tarih aralığının çizelgeye yansıması, boş günlerin satır kalması, aynı gün iki törenin saat bandıyla ayrılması, ek notların saklanması, Word indirme ve boş aralıkta düğmenin kapanması |
| Salonlar | Ekleme, mükerrer ad reddi, çakışma kuralı |
| Menüler | Kişi başı tutar önerisi, rezervasyona uygulanması |
| Masa düzeni | Plan önerisi, kaydetme, eksik koltuk uyarısı |
| Hatırlatmalar | Şablon metni kaydı, Türkçe harf uyarısı, SMS parça sayısı, ticari / işlem etiketi, otomatik kural |
| Tedarikçiler | Ekleme, organizasyona atama, maliyet toplamı |
| SMS kayıtları | Tür filtresi, kuyruk görünümü |
| İYS izinleri | Onay / ret kaydı, onaysız ticari iletinin engellenmesi |
| Müşteriler | Rezervasyondan oluşma, bakiye, isim ve telefonla arama |
| İşletmeler | İşletme değiştirmenin listeyi değiştirmesi; kenar çubuğundaki "Yeni işletme ekle" bağlantısının formu açması ve eklenen işletmenin hem listeye hem aktif işletme seçicisine düşmesi |
| Kullanıcılar | Personel ekleme, düzenleme, silme, mükerrer e-posta reddi |
| Renk ayarları | Renk kaydı, varsayılana dönüş |
| Denetim kaydı | Süzgeçler |
| Sistem durumu | Yedek indirme, kuyruk ve İYS özeti |
| Ayarlar | Profil kaydı, e-postanın salt okunur kalması, şifre doğrulaması |
| Giriş | Şifre, SMS doğrulama, hatalı giriş |
| Kod doğrulama | Telefon maskesi, ödeme bilgisinin sızmaması |

Ayrıca her herkese açık ve panel sayfası için: HTTP 200, tek `h1`, sıfır
konsol hatası, 375 px'te yatay taşma olmaması ve **WCAG 2.2 AA** ihlali
bulunmaması (axe-core).

## 7. Mobil uygulama

`mobil/src/veri.ts` hiç test edilmemişti; 29 fonksiyon %0 kapsamdaydı.

- `veri.tanitim.test.ts` (45): tanıtım verisinin kendi içinde tutarlılığı.
  Ayrıntı ekranındaki tahsilat ile geçmiş listesinin toplamı, masa
  planındaki koltuk sayısı ile davetli sayısı, kasa özetindeki alacak ile
  rezervasyonların kalanı.
- `veri.sunucu.test.ts` (39): taklit Supabase istemcisiyle sütun eşlemesi.
  Kaporanın tahsilata dahil edilmesi (mobil ile web panelinin aynı kayıt
  için aynı rakamı göstermesi), salon adının kimliğe çevrilmesi, İYS
  kuyruk gerekçesinin taşınması, şablon kaydında sınıfın istemciden
  değiştirilememesi.
- `bicim.test.ts` (18): para, tarih, telefon biçimleri; web tarafıyla aynı
  çıktıyı ürettiğinin korunması.
- `sablon.test.ts` (20): yer tutucu doldurma, GSM-7 indirgeme, SMS ölçümü.
- `guvenlik.test.ts` (10, 2'si atlandı): pakette sunucu sırrı bulunmaması,
  belirtecin AsyncStorage yerine SecureStore'da saklanması. Atlanan iki
  test yalnızca derlenmiş paket varken anlamlı.

## 8. Veritabanı

Her paket **temiz bir veritabanında** çalıştırılır; ortak bir şemada
koşulduklarında birbirlerinin tohum verisiyle çakışırlar.

| Paket | Kapsam |
|---|---|
| `01_rls_test.sql` | Satır bazlı erişim: başka hesabın kaydı okunamaz, yazılamaz |
| `02_security_test.sql` | Hız sınırı, giriş kilidi, denetim kaydı tetikleyicileri |
| `03_iys_test.sql` | İşlem bildirimi muafiyeti, ticari iletide onay şartı, ret kaydının engellemesi |
| `04_backup_restore_test.sql` | Yedeğin temiz şemaya gerçekten geri yüklenmesi, satır ve tutar eşitliği |
| `05_invoice_test.sql` | Fatura numarası sırası, tutar kısıtları |
| `07_salon_menu_masa_test.sql` | Salon çakışması, menü fiyatı, masa planı |
| `08_is_emri_tedarikci_test.sql` | İş emri satırları, tedarikçi ataması, bağlı tedarikçinin silinememesi |
| `09_hatirlatma_test.sql` | Vadesi gelen hatırlatmanın kuyruğa alınması, aynı hatırlatmanın ikinci kez gitmemesi, tutarın kapora dahil hesaplanması |
| `10_dusurulen_tablolar_test.sql` | `0013` göçünün doğrulaması: düşmesi gerekenlerin düştüğü **ve** kullanılan hiçbir tabloya dokunulmadığı |
| `11_sozlesme_alanlari_ve_seri_test.sql` | `0014` göçü: dört alanın isteğe bağlı eklenmesi, hatalı TC'nin reddi, numaranın veritabanınca atanması, dokuzdan ona sayısal geçiş, güncellemede numaranın korunması, kimlik numarasının herkese açık sorguya sızmaması, sayacın yazmaya kapalı olması |

## 9. Kapsanmayanlar ve gerekçeleri

Dürüst olmak gerekirse şunlar test edilmiyor:

1. **`mobil/src/supabase.ts` ve `mobil/src/tema.ts` (%0).**
   İlki Expo yerel modülleri (SecureStore, Constants) içe aktarıyor ve
   düğüm ortamında yüklenemiyor; birim testlerinde taklit ediliyor.
   Parçalı belirteç saklama mantığı bu yüzden yalnızca cihazda doğrulandı.
   İkincisi renk ve boşluk sabitlerinden ibaret, çalıştırılacak dal yok.

2. **Gerçek sağlayıcılarla uçtan uca gönderim.**
   Netgsm, İYS ve Paraşüt istekleri taklit ediliyor. Gövde üretimi ve hata
   çözümlemesi doğrulandı; **gerçek bir hesapla hiç denenmedi**. İlk
   gönderimde alan adı uyuşmazlığı çıkabilir; hata metni ilgili ekranda
   görünür.

3. **Düşürülen tabloların geri alınması.**
   `0013_kullanilmayan_tablolari_dusur.sql`, kullanımdan kalkan
   `contact_messages` ve `payment_installments` tablolarını düşürür. Göç
   **geri alınamaz**; geri dönüş yolu yalnızca yedekten geri yüklemedir.
   Göçün kendisi `10_dusurulen_tablolar_test.sql` ile sınanıyor (test,
   göç uygulanmadığında bilerek başarısız oluyor), ancak **gerçek veri
   taşıyan bir üretim veritabanında çalıştırılmadı**.

4. **React bileşenlerinin satır kapsamı.**
   Ekranlar tarayıcıda uçtan uca çalıştırılıyor; bu koşumlar `vitest`
   kapsam ölçümüne girmiyor. Bu yüzden `src/pages` için düşük bir satır
   yüzdesi görünür, ancak yukarıdaki tabloda listelenen akışların tamamı
   gerçek tarayıcıda koşuyor.

5. **Yük ve dayanıklılık.** Eşzamanlı kullanıcı, büyük veri hacmi ve
   sağlayıcı kesintisi altında davranış ölçülmedi.

## 10. Testin kendisinde bulunan bir hata

Uçtan uca paketi ilk kez tam olarak koşturduğumda bir test onda bir
sıklıkta düşüyordu. Sebebi ürün değil, testin kendisiydi:

```
/\/panel\/rezervasyonlar\/[^/]+$/
```

Bu kalıp `/panel/rezervasyonlar/**yeni**` adresine de uyuyor. Kayıt
yavaş tamamlandığında yardımcı fonksiyon form adresini ayrıntı adresi
sanıp döndürüyor, sonraki adım da kimliği "yeni" olan bir rezervasyon
arıyordu. Kalıba `(?!yeni$)` eklendi ve kayıt beklemesi yük altında
zaman aşımına uğramasın diye 15 saniyeye çıkarıldı. Düzeltmeden sonra
paket dokuz kez üst üste eksiksiz geçti.

Not düşülmesinin sebebi: "ara sıra düşüyor" bir gerekçe değildir.
Testi yeniden çalıştırıp geçmesini beklemek, buradaki gerçek kusuru
gizleyecekti.

Bu turda üç kusur daha aynı yoldan çıktı:

**Testte:** iki sözleşme testi, müşteri satırına tıkladıktan sonra ayrıntı
sayfasının yerleştiğini doğrulamadan "Sözleşme" bağlantısını arıyordu; yavaş
bir yüklemede tıklama hâlâ liste ekranındayken gerçekleşiyor ve test tek
başına geçtiği hâlde tam koşuda düşüyordu. Ortak bir yardımcıya alındı ve
adres beklemesi eklendi; dört tam koşu üst üste temiz geçti.

**SQL testinde:** `10_dusurulen_tablolar_test.sql` "Ana Salon" adında bir
salon açmaya çalışıyordu. `0007` göçü her yeni işletme için aynı adda bir
salon açtığı için benzersizlik kısıtına çarpıyordu; test gerçek bir
veritabanında hiç yeşil koşmamıştı. Salon adı değiştirildi.

**Üründe:** program çizelgesi saat girilmemiş kayıtları seans adına göre
metin olarak sıralıyordu. Türkçe alfabede "Gece", "Gündüz"den önce geldiği
için gece töreni gündüz töreninin üstüne yazılıyordu. Seans için açık bir
sıra tanımlandı (`program.ts` içinde `seansSirasi`), iki test eklendi.

## 11. Bildirilen hatanın karşılığı

Ekranda 129.500 ₺ yazarken SMS'te 185.000 TL gönderilmesi, kaporanın
tahsilat sayılmamasından kaynaklanıyordu. Bu hata artık dört ayrı yerde
sınanıyor:

- `src/lib/repo/local.test.ts`: `totalPaid` ve `remainingBalance` kaporayı
  içerir.
- `src/lib/queries.test.tsx`: `useReservationsWithBalances` kapora ve
  tahsilatı birleştirir.
- `e2e/panel-ekranlari.spec.ts`: rezervasyon detayındaki kalan alacak ile
  aynı sayfadaki hatırlatma taslağının tutarı birebir aynıdır.
- `mobil/__tests__/veri.sunucu.test.ts`: mobil eşleme kaporayı tahsilata
  ekler.
- `supabase/tests/09_hatirlatma_test.sql`: veritabanı tarafındaki
  hatırlatma sorgusu da kaporayı sayar.
