# Düğün Takip — Audit ve QA Raporu

**Tarih:** 30 Ağustos 2026
**Kapsam:** Tanıtım sitesinin tüm sayfaları + üye panelinin tüm ekranları

---

## 1. Özet

| Kontrol | Sonuç |
|---------|-------|
| TypeScript tip kontrolü (`strict`) | ✅ 0 hata |
| ESLint | ✅ 0 hata, 0 uyarı |
| Birim + entegrasyon testleri (Vitest) | ✅ 120/120 |
| Uçtan uca testler (Playwright/Chromium) | ✅ 42/42 |
| Üretim derlemesi | ✅ başarılı |
| Tarayıcı konsol hataları | ✅ hiçbir sayfada yok |

Toplam **162 otomatik test**. Audit sırasında bulunan **4 hata** düzeltilmiş ve her biri
için gerileme testi (regression test) yazılmıştır.

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

## 3. Test kapsamı

### 3.1 Birim testleri — 60 test

| Dosya | Test | Kapsam |
|-------|------|--------|
| `format.test.ts` | 20 | Para/tarih/telefon biçimlendirme, Türkçe metin normalleştirme, slug, gün aritmetiği (ay ve yıl sınırları dâhil) |
| `db.test.ts` | 26 | Tohumlama, rezervasyon CRUD, seans çakışması, kaparo/tahsilat/bakiye hesapları, renk ayarları, SMS günlüğü, kod üreticileri |
| `reports.test.ts` | 14 | Tarih aralığı filtresi, toplamlar, program/ay/bakiye/seans raporları, CSV kaçışlama |

Sınır durumları özellikle kapsandı: negatife düşmeyen bakiye, fazla tahsilat,
iptal edilmiş kayıtların raporlardan dışlanması, yıl geçişli ay sıralaması,
CSV içindeki ayraç ve tırnak karakterleri.

### 3.2 Entegrasyon testleri — 60 test

| Dosya | Test | Kapsam |
|-------|------|--------|
| `integration.test.tsx` | 27 | Anasayfa bölümleri, video lightbox, SSS akordeonu, kod doğrulama (boş/geçersiz/geçerli), iletişim ve demo formları, üyelik formu doğrulamaları, giriş + SMS doğrulama, referans listesi filtreleri, 404 |
| `panel.test.tsx` | 33 | Erişim kontrolü, özet ekranı, takvim gezinme, rezervasyon filtreleri, form doğrulamaları, otomatik SMS, çakışma uyarısı, tahsilat ekleme/limit, geçmiş kayıt kilidi, sözleşme, kasa, raporlar, renk ayarları, müşteriler, tavsiye kodu |

### 3.3 Uçtan uca testler — 42 test (Chromium)

- **21 herkese açık sayfa** ayrı ayrı açılır; HTTP 200, doğru `h1` ve **sıfır konsol hatası** doğrulanır.
- Her sayfada tek bir `h1` bulunduğu doğrulanır.
- 375 px genişlikte **yatay taşma olmadığı** doğrulanır.
- Masaüstü menü, açılır menü, mobil menü ve footer gezinmesi.
- SEO: sayfaya özgü `title`/`description`, panel sayfalarında `noindex`, `lang="tr"`, görsellerde `alt`.
- Erişilebilirlik: "İçeriğe geç" bağlantısının ilk `Tab` ile odaklanması.
- **Tam iş akışı:** giriş → SMS doğrulama → rezervasyon oluşturma → kalan alacak
  hesabı → tahsilat ekleme → bakiye güncellemesi → otomatik SMS kaydı → listede
  arama → sözleşme çıktısı → koddan herkese açık doğrulama.
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
| `sitemap.xml` (23 herkese açık adres) | ✅ |
| Anlamsal HTML (`header`/`nav`/`main`/`article`/`footer`) | ✅ |
| Sayfa yolu (breadcrumb) gezinmesi | ✅ |

---

## 6. Başarım

| Ölçüm | Değer |
|-------|-------|
| Ana paket (giriş yapmamış ziyaretçi) | 292 kB / **93 kB gzip** |
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

## 8. Kalan sınırlar

Bunlar kusur değil, demo dağıtımının bilinçli sınırlarıdır:

1. **Kalıcılık `localStorage` üzerindedir.** Veriler cihazlar arasında paylaşılmaz.
   Tüm erişim `src/lib/db.ts` üzerinden geçtiği için gerçek bir API istemcisiyle
   değiştirilmesi arayüz katmanını etkilemez.
2. **Şifreler düz metin saklanır.** Gerçek dağıtımda sunucu tarafında hash'lenmelidir.
3. **SMS ve ödeme tahsilatı taklit edilmiştir.** SMS doğrulama kodu ekranda gösterilir;
   ödeme adımı süreyi doğrudan uzatır. Sağlayıcı entegrasyonu gerekir.
4. **Referans listesi örnek veridir.** 240 işletme deterministik olarak üretilir;
   gerçek üye verisiyle değiştirilmelidir.
5. **Marka varlıkları.** Logo, sosyal medya hesapları ve mağaza bağlantıları yer
   tutucudur; yayına almadan önce kendi marka varlıklarınızla değiştirilmelidir.
