# Düğün Takip — Audit ve QA Raporu

**Tarih:** 30 Ağustos 2026
**Kapsam:** Tanıtım sitesinin tüm sayfaları + üye panelinin tüm ekranları

---

## 1. Özet

| Kontrol | Sonuç |
|---------|-------|
| TypeScript tip kontrolü (`strict`) | ✅ 0 hata |
| ESLint | ✅ 0 hata, 0 uyarı |
| Birim + entegrasyon testleri (Vitest) | ✅ 129/129 |
| Uçtan uca testler (Playwright/Chromium) | ✅ 44/44 |
| Üretim derlemesi | ✅ başarılı |
| Tarayıcı konsol hataları | ✅ hiçbir sayfada yok |

Toplam **173 otomatik test**. Audit sırasında bulunan **6 hata** düzeltilmiş ve her biri
için gerileme testi (regression test) yazılmıştır. Otomatik testlere ek olarak
uygulama derlenip tarayıcıda çalıştırılmış, tüm ekranlar ve tam iş akışı elle
doğrulanmıştır (bkz. bölüm 2.5–2.6 ve 9).

---

## 2. Audit sırasında bulunan ve düzeltilen hatalar

### 2.1 Türkçe locale ile küçültme, e-posta eşleşmesini bozuyordu — *kritik*

`findUserByEmail`, karşılaştırma için `toLocaleLowerCase('tr-TR')` kullanıyordu.
Türkçe kuralında ASCII `I` harfi noktasız `ı`ya dönüştüğü için
`DEMO@DUGUNTAKIP.COM` girdisi `demo@duguntakıp.com` hâline geliyor ve kayıtlı
kullanıcı **bulunamıyordu**.

**Etkisi:** E-postasını büyük harfle veya otomatik düzelten bir klavyeyle yazan
üye giriş yapamaz; aynı e-posta ile mükerrer üyelik açılabilirdi.

**Düzeltme:** Tanımlayıcı (e-posta, rezervasyon kodu, tavsiye kodu)
karşılaştırmaları locale-bağımsız `toLowerCase()` / `toUpperCase()` ile yapılır.
`normalizeEmail()` yardımcısı eklendi.

**Test:** `db.test.ts` → "e-posta aramasını büyük/küçük harften bağımsız yapar"

---

### 2.2 Tohum (seed) verisi mevcut kullanıcı kayıtlarının üzerine yazıyordu — *kritik*

`seedIfEmpty()` yalnızca `seeded` bayrağına bakıyordu. Bayrak silinir de veriler
kalırsa (kısmi depolama temizliği, sürüm geçişi, kota hatası) tüm üyelikler,
rezervasyonlar ve kasa kayıtları örnek verilerle **eziliyordu**.

**Düzeltme:** Tohumlama artık bayrağın yanı sıra gerçek veri varlığını da
denetler; herhangi bir kullanıcı/işletme/rezervasyon kaydı varsa hiçbir şey yazmaz.

**Test:** `integration.test.tsx` → "geçerli kodda rezervasyon bilgilerini gösterir"
(tohumlama sonrası eklenen kaydın korunduğunu doğrular)

---

### 2.3 Salon ve yasal sayfalar her zaman 404 veriyordu — *kritik*

`VenueCategory` ve `LegalPage` bileşenleri `useParams().slug` okuyordu, ancak bu
rotalar `/dugun-salonlari` gibi **sabit yollarla** tanımlıydı; `:slug` parametresi
hiç yoktu. `slug` daima `undefined` döndüğü için 8 sayfa 404 gösteriyordu:
`/dugun-salonlari`, `/kina-salonlari`, `/dugun-otelleri`, `/kir-dugunu-mekanlari`,
`/gizlilik-politikasi`, `/iade-proseduru`, `/mesafeli-hizmet-sozlesmesi`,
`/uyelik-sozlesmesi`.

**Düzeltme:** Slug, adres yolundan (`useLocation().pathname`) türetilir.

**Test:** `site.spec.ts` → sekiz yolun tamamı rota listesinde ve "footer
bağlantıları çalışır" senaryosunda doğrulanır.

---

### 2.4 Aynı milisaniyede yazılan SMS kayıtları yanlış sıralanıyordu — *düşük*

SMS listesi yalnızca zaman damgasına göre sıralanıyordu. Rezervasyon kaydı gibi
arka arkaya iki mesaj üreten işlemlerde damgalar eşit olduğunda sıralama
öngörülemez hâle geliyor, en yeni mesaj listenin başında görünmüyordu.

**Düzeltme:** Damga eşitliğinde ekleme sırası (orijinal indeks) belirleyici olacak
şekilde kararlı sıralama uygulandı.

**Test:** `db.test.ts` → "gönderilen mesajı kaydeder ve en yeniyi başa alır"

---

### 2.5 Özet ekranında tutarlar okunamıyordu — *orta*

İstatistik kartlarındaki değerler `truncate` ile kısaltılıyordu. Altı haneli
tutarlar kart genişliğine sığmadığı için `962.500,...` şeklinde kesiliyor ve
kullanıcı kalan alacak ile kasa bakiyesini **okuyamıyordu**.

**Düzeltme:** Para değerleri artık kesilmiyor; sarmalanıyor ve dar ekranlarda bir
punto küçülüyor.

**Tespit:** Tarayıcıda elle doğrulama (otomatik testler DOM metnini okuduğu için
yalnızca görsel olan bu kusuru yakalayamamıştı).

---

### 2.6 "Son 6 ay" grafiği gelecekteki ayları gösteriyordu — *orta*

Grafik, kaydı bulunan ayları kronolojik sıralayıp son altısını alıyordu. Gelecek
tarihli rezervasyonlar da listeye girdiği için 1 Eylül 2026'da grafik
**Nisan 2027 – Ekim 2027** aralığını "Son 6 ay" başlığıyla gösteriyordu. Ayrıca
kaydı olmayan aylar tamamen atlandığından zaman ekseni kesintili oluyordu
(Temmuz 2027 hiç görünmüyordu).

**Düzeltme:** Yeni `lastMonthsReport()` yardımcısı, bugünden geriye doğru
kesintisiz takvim ayları üretir; kaydı olmayan aylar 0 olarak gösterilir ve
gelecek tarihli kayıtlar seriye girmez.

**Test:** `reports.test.ts` → "lastMonthsReport" başlığı altında 5 test
(kesintisiz seri, gelecek kayıtların dışlanması, boş ayların sıfırlanması, yıl
sınırı, ay içi toplama)

---

## 3. Test kapsamı

### 3.1 Birim testleri — 65 test

| Dosya | Test | Kapsam |
|-------|------|--------|
| `format.test.ts` | 20 | Para/tarih/telefon biçimlendirme, Türkçe metin normalleştirme, slug, gün aritmetiği (ay ve yıl sınırları dâhil) |
| `db.test.ts` | 26 | Tohumlama, rezervasyon CRUD, seans çakışması, kaparo/tahsilat/bakiye hesapları, renk ayarları, SMS günlüğü, kod üreticileri |
| `reports.test.ts` | 19 | Tarih aralığı filtresi, toplamlar, program/ay/bakiye/seans raporları, CSV kaçışlama |

Sınır durumları özellikle kapsandı: negatife düşmeyen bakiye, fazla tahsilat,
iptal edilmiş kayıtların raporlardan dışlanması, yıl geçişli ay sıralaması,
CSV içindeki ayraç ve tırnak karakterleri.

### 3.2 Entegrasyon testleri — 64 test

| Dosya | Test | Kapsam |
|-------|------|--------|
| `integration.test.tsx` | 31 | Anasayfa bölümleri, video lightbox, SSS akordeonu, kod doğrulama (boş/geçersiz/geçerli), iletişim ve demo formları, üyelik formu doğrulamaları, giriş + SMS doğrulama, referans listesi filtreleri, salon detay sayfası ve teklif formu, 404 |
| `panel.test.tsx` | 33 | Erişim kontrolü, özet ekranı, takvim gezinme, rezervasyon filtreleri, form doğrulamaları, otomatik SMS, çakışma uyarısı, tahsilat ekleme/limit, geçmiş kayıt kilidi, sözleşme, kasa, raporlar, renk ayarları, müşteriler, tavsiye kodu |

### 3.3 Uçtan uca testler — 44 test (Chromium)

- **21 herkese açık sayfa** ayrı ayrı açılır; HTTP 200, doğru `h1` ve **sıfır konsol hatası** doğrulanır.
- Her sayfada tek bir `h1` bulunduğu doğrulanır.
- 375 px genişlikte **yatay taşma olmadığı** doğrulanır.
- Masaüstü menü, açılır menü, mobil menü ve footer gezinmesi.
- SEO: sayfaya özgü `title`/`description`, panel sayfalarında `noindex`, `lang="tr"`, görsellerde `alt`.
- Erişilebilirlik: "İçeriğe geç" bağlantısının ilk `Tab` ile odaklanması.
- **Tam iş akışı:** giriş → SMS doğrulama → rezervasyon oluşturma → kalan alacak
  hesabı → tahsilat ekleme → bakiye güncellemesi → otomatik SMS kaydı → listede
  arama → sözleşme çıktısı → koddan herkese açık doğrulama.
- Referans listesinden salon detay sayfasına geçiş; bilinmeyen salon adresinde 404.
- Yeni üyelik oluşturma, işletme değiştirme, çıkış yapma.

---

## 4. Erişilebilirlik denetimi

| Kontrol | Durum |
|---------|-------|
| Sayfa dili (`lang="tr"`) | ✅ |
| Her sayfada tek `h1`, mantıklı başlık hiyerarşisi | ✅ |
| Tüm form alanlarında `<label for>` bağı | ✅ |
| Hata mesajlarında `role="alert"` ve `aria-invalid` | ✅ |
| Açılır menü / akordeon / sekmelerde `aria-expanded`, `aria-controls`, `aria-selected` | ✅ |
| Modal ve onay pencerelerinde `role="dialog"`/`alertdialog`, `aria-modal`, Esc ile kapanma, odak yönetimi | ✅ |
| İlerleme çubuklarında `role="progressbar"` + değer nitelikleri | ✅ |
| Yalnızca ikon içeren düğmelerde `aria-label` | ✅ |
| Görünür odak halkası (`:focus-visible`) | ✅ |
| "İçeriğe geç" atlama bağlantısı | ✅ |
| Renk kontrastı (`#37517e` / `#444444` beyaz üzerinde) | ✅ AA üzeri |

---

## 5. SEO denetimi

| Kontrol | Durum |
|---------|-------|
| Sayfaya özgü `title` ve `meta description` | ✅ |
| `canonical` bağlantısı | ✅ |
| Open Graph ve Twitter Card etiketleri | ✅ |
| Panel ve giriş sayfalarında `noindex, nofollow` | ✅ |
| `robots.txt` (panel yolları hariç tutuldu) | ✅ |
| `sitemap.xml` (263 herkese açık adres, 240 salon detay sayfası dâhil) | ✅ |
| Anlamsal HTML (`header`/`nav`/`main`/`article`/`footer`) | ✅ |
| Sayfa yolu (breadcrumb) gezinmesi | ✅ |

---

## 6. Başarım

| Ölçüm | Değer |
|-------|-------|
| Ana paket (giriş yapmamış ziyaretçi) | 300 kB / **94 kB gzip** |
| CSS | 33 kB / **6,4 kB gzip** |
| Panel ekranları | 16 ayrı parça, her biri 0,3–10 kB |
| Derleme süresi | ~2 sn |

Panel `React.lazy` ile bölündü; tanıtım sitesini gezen ziyaretçi panel kodunu
hiç indirmez (ana paket 390 kB → 292 kB, %25 azalma).

Yazı tipleri Google Fonts üzerinden yüklenir ancak `system-ui` yedeği tanımlıdır;
ağ erişimi olmasa dahi site tam işlevsel çalışır (E2E testlerinde harici istekler
engellenerek doğrulandı).

---

## 7. Duyarlılık (responsive)

375 px, 768 px ve 1280 px genişliklerde doğrulandı:

- Mobilde hamburger menü, masaüstünde yatay menü.
- Panel kenar çubuğu mobilde kayan panel olarak açılır, arka plan kapatıcı ile kapanır.
- Geniş tablolar kendi kapsayıcılarında yatay kayar; sayfa gövdesi yatay taşmaz.
- Izgara düzenleri 1 → 2 → 3/4 sütuna genişler.

---

## 8. Elle doğrulama

Otomatik testlere ek olarak uygulama derlenip tarayıcıda çalıştırıldı ve şu akış
baştan sona elle yürütüldü:

1. Anasayfa, referans listesi ve salon detay sayfası görüntülendi.
2. Demo hesabıyla giriş yapıldı; SMS doğrulama kodu girildi.
3. Yeni rezervasyon oluşturuldu: 250.000 ₺ toplam, 60.000 ₺ kaparo, 420 davetli,
   iki hizmet seçili.
4. 40.000 ₺ tahsilat eklendi.
5. **Beklenen:** toplam tahsilat 100.000 ₺, kalan alacak 150.000 ₺ —
   **gözlenen:** birebir aynı.
6. Salon kiralama sözleşmesi çıktısı, raporlar, kasa ve SMS kayıtları görüntülendi.
7. Oluşan rezervasyon kodu (`DT-2026-7875`) herkese açık kod doğrulama sayfasında
   sorgulandı ve doğrulandı.
8. Mobil genişlikte (390 px) menü açıldı.

Bu tur boyunca hiçbir sayfada konsol hatası oluşmadı. Sektör dağılımı çubuklarının
görünür olduğunda %0'dan hedef değere animasyonla dolduğu ayrıca doğrulandı.

## 9. Kalan sınırlar

Bunlar kusur değil, demo dağıtımının bilinçli sınırlarıdır:

1. **Kalıcılık `localStorage` üzerindedir.** Veriler cihazlar arasında paylaşılmaz.
   Tüm erişim `src/lib/db.ts` üzerinden geçtiği için gerçek bir API istemcisiyle
   değiştirilmesi arayüz katmanını etkilemez.
2. **Şifreler düz metin saklanır.** Gerçek dağıtımda sunucu tarafında hash'lenmelidir.
3. **SMS ve ödeme tahsilatı taklit edilmiştir.** SMS doğrulama kodu ekranda gösterilir;
   ödeme adımı süreyi doğrudan uzatır. Sağlayıcı entegrasyonu gerekir.
4. **Referans listesi örnek veridir.** 240 işletme deterministik olarak üretilir;
   gerçek üye verisiyle değiştirilmelidir.
5. **Dağıtım.** Vercel için `vercel.json` hazırdır: SPA yönlendirmesi, varlık
   önbellekleme ve güvenlik başlıkları tanımlıdır. Uygulama tamamen statiktir;
   sunucu tarafı çalışma zamanı gerekmez.
6. **Marka varlıkları.** Logo, sosyal medya hesapları ve mağaza bağlantıları yer
   tutucudur; yayına almadan önce kendi marka varlıklarınızla değiştirilmelidir.
