# Düğün Takip

Düğün salonları için rezervasyon ve ödeme takip sistemi. `duguntakip.com` sitesinin
tüm herkese açık sayfaları ve üye panelinin tüm ekranları React + TypeScript ile
yeniden inşa edilmiştir.

## Hızlı başlangıç

```bash
npm install
npm run dev          # http://localhost:5173
```

### Demo hesabı

| Alan    | Değer                  |
|---------|------------------------|
| E-posta | `demo@duguntakip.com`  |
| Şifre   | `demo1234`             |

Giriş sırasında SMS doğrulaması istenir. Demo ortamında SMS gönderimi yapılamadığı
için kod doğrulama ekranında gösterilir.

Personel (kısıtlı yetki) hesabı: `personel@duguntakip.com` / `personel1234`

## Komutlar

| Komut               | Açıklama                                        |
|---------------------|-------------------------------------------------|
| `npm run dev`       | Geliştirme sunucusu                              |
| `npm run build`     | Tip kontrolü + üretim derlemesi (`dist/`)        |
| `npm run preview`   | Derlenmiş çıktıyı yerel olarak sunar             |
| `npm run lint`      | ESLint                                           |
| `npm test`          | Vitest birim + entegrasyon testleri (120 test)   |
| `npm run e2e`       | Playwright uçtan uca testleri (42 test)          |

## Sayfa haritası

### Herkese açık

| Yol | Açıklama |
|-----|----------|
| `/` | Anasayfa — hero, "Ne İşe Yarar?", sektör dağılımı, hizmetler, demo talebi, üye yorumları |
| `/nedir` | Programın tanıtımı, yetenek listesi, ekran özetleri |
| `/haberler`, `/haberler/:slug` | Haberler listesi ve detay sayfaları |
| `/ekranlar` | Uygulama ekranlarının önizlemeleri |
| `/uyeler` | Referanslarımız — kategori/il filtreleri, arama, sayfalama |
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
| `/panel/tavsiye-et` | Tavsiye Et Kazan (+1 ay) |
| `/panel/abonelik` | Paketler ve süre uzatma |
| `/panel/ayarlar` | Profil, şifre değiştirme, veri sıfırlama |

## Mimari

```
src/
  components/   Paylaşılan arayüz bileşenleri (ikonlar, akordeon, karusel, uyarılar…)
  context/      AuthContext — oturum, kayıt, SMS doğrulama, yetkiler
  data/         Site içeriği, sabitler (iller, kategoriler, renkler), yasal metinler, referans listesi
  hooks/        useBusinessData — aktif işletmenin verileri
  layouts/      PublicLayout (site) ve AppLayout (panel)
  lib/          storage (kalıcılık), db (repository), format, reports
  pages/        Herkese açık sayfalar
  pages/app/    Panel ekranları
```

### Veri katmanı

Tüm okuma/yazma işlemleri `src/lib/db.ts` üzerinden geçer; arayüz katmanı
`localStorage`'ı doğrudan bilmez. Gerçek bir dağıtımda bu modülün yerini bir HTTP
API istemcisi alır ve uygulamanın geri kalanı değişmeden çalışır.

Panel ekranları `React.lazy` ile ayrı paketlere bölünmüştür; giriş yapmamış
ziyaretçiler yalnızca tanıtım sitesinin paketini indirir.

## Dağıtım

`npm run build` çıktısı `dist/` klasöründedir ve statik olarak sunulabilir.
Tek sayfa uygulaması olduğu için sunucunun bilinmeyen yolları `index.html`'e
yönlendirmesi gerekir — hazır yapılandırmalar: `public/_redirects` (Netlify),
`vercel.json` (Vercel), `public/.htaccess` (Apache).

## Bilinen sınırlar

- Kalıcılık tarayıcıdaki `localStorage` üzerindedir; veriler cihazlar arasında paylaşılmaz.
- SMS gönderimi ve ödeme tahsilatı taklit edilmiştir; gerçek sağlayıcı entegrasyonu gerekir.
- Şifreler demo amacıyla düz metin saklanır; sunucu tarafında hash'lenmelidir.
