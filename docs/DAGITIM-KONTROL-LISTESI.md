# Dağıtım Kontrol Listesi

Seçilen kurulum: **Supabase + Cloudflare Workers + Netgsm + Paraşüt**.
İYS yalnızca ticari ileti (kampanya, tanıtım) gönderecekseniz gerekir;
işlem bildirimi SMS'i için 5. bölümü atlayabilirsiniz.

Anahtarları **hiçbir zaman** depoya, sohbete veya `VITE_` önekli bir
değişkene koymayın. Sunucu sırları Cloudflare'de `wrangler secret put` ile
ya da Workers → Settings → Variables and Secrets ekranından girilir.

---

## 1. Supabase

- [ ] [supabase.com](https://supabase.com) → New project, **bölge: Frankfurt (EU Central)**
- [ ] SQL Editor'da göçleri **sırayla** çalıştırın:
      `0001_init` → `0002_security` → `0003_iys_queue` → `0004_backup_health`
      → `0005_invoices` → `0006_talepler` → `0007_salon_menu_masa`
      → `0008_odeme_plani_is_emri_tedarikci` → `0009_nikah_yazimi`
- [ ] README'deki doğrulama sorgusunu çalıştırın (ilk altı sütun `t` olmalı)
- [ ] Storage → New bucket → adı `yedekler`, **Public bucket KAPALI**
- [ ] Authentication → Users → kendi hesabınızı oluşturun
- [ ] Table Editor → `profiles` → kendi satırınızda `role` değeri `owner` olmalı
- [ ] Project Settings → API → `URL`, `anon key`, `service_role key` değerlerini not alın

> `service_role` anahtarı RLS'yi tamamen atlar. Yalnızca sunucu tarafı
> değişken olarak kullanılır; `VITE_` öneki **asla** verilmez.

## 2. Cloudflare

- [ ] [dash.cloudflare.com](https://dash.cloudflare.com) hesabı açın
- [ ] Workers & Pages → **Workers Paid** ($5/ay) planına geçin
      (ücretsiz plan da çalışır: 100.000 istek/gün ve hesap başına 5 cron;
      bu proje 4 cron kullanıyor. Ücretli plan CPU sınırını kaldırır.)
- [ ] `npm i` sonrası `npx wrangler login`
- [ ] Sunucu sırlarını girin: her biri için `npx wrangler secret put ADI`
- [ ] `VITE_*` değişkenlerini derleme ortamına verin (bunlar tarayıcıya gider,
      sır değildir)
- [ ] `npm run cf:deploy`
- [ ] Workers → Settings → Domains & Routes → kendi alan adınızı bağlayın

### Ortam değişkenleri

| Değişken | Nereden | Zorunlu |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase → API → URL | ✅ |
| `VITE_SUPABASE_ANON_KEY` | Supabase → API → anon key | ✅ |
| `VITE_ALLOW_SIGNUP` | `false` yazın (tek şirket kullanımı) | ✅ |
| `SUPABASE_URL` | Yukarıdakiyle aynı değer | ✅ |
| `SUPABASE_ANON_KEY` | Yukarıdakiyle aynı değer | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API → service_role | ✅ |
| `CRON_SECRET` | `openssl rand -hex 32` | ✅ |
| `BACKUP_BUCKET` | `yedekler` | ✅ |
| `NETGSM_USER` | Netgsm abone numarası | SMS için |
| `NETGSM_PASS` | Netgsm API şifresi | SMS için |
| `NETGSM_HEADER` | Onaylı başlığınız | SMS için |
| `OTP_SECRET` | `openssl rand -hex 32` | Girişte SMS doğrulaması için |
| `PARASUT_CLIENT_ID` | Paraşüt → Ayarlar → API | e-Fatura için |
| `PARASUT_CLIENT_SECRET` | Paraşüt → Ayarlar → API | e-Fatura için |
| `PARASUT_USERNAME` | Paraşüt giriş e-postanız | e-Fatura için |
| `PARASUT_PASSWORD` | Paraşüt şifreniz | e-Fatura için |
| `PARASUT_COMPANY_ID` | Panel adresindeki firma numarası | e-Fatura için |
| `VITE_SENTRY_DSN` | Sentry → Project → DSN | İsteğe bağlı |

`IYS_*` değişkenleri **boş bırakılır.** Rezervasyon onayı, hatırlatma ve
doğrulama kodu işlem bildirimidir; İYS onayı gerektirmez. Ticari ileti
göndermeye kalkışılırsa veritabanı bunu zaten `iptal` durumuyla engeller.
Kampanya ya da tanıtım göndermeye karar verirseniz **5. bölüme** bakın.

## 3. Netgsm

- [ ] Kurumsal abonelik açın
- [ ] Vergi levhanızla **başlık (marka) başvurusu** yapın, birkaç iş günü sürer
- [ ] Başlık onaylandıktan sonra SMS paketi satın alın
- [ ] API kullanıcı adı ve şifresini panelden alıp Cloudflare'e sır olarak girin

> Başlık onaylanmadan gönderim yapılamaz. Onay beklerken sistem çalışır;
> mesajlar kuyruğa girer ve arayüzde "gönderilemedi" olarak görünür.

## 4. Paraşüt

- [ ] Mali müşavirinizle mükellefiyet durumunuzu teyit edin
- [ ] Paraşüt hesabı açın, e-Arşiv/e-Fatura kontörü tanımlayın
- [ ] Ayarlar → API bölümünden `client_id` ve `client_secret` alın
- [ ] Firma numarasını panel adresinden okuyun
- [ ] **İlk faturayı düşük tutarlı bir test olarak kesin** ve Faturalar
      ekranındaki `provider_error` alanını kontrol edin

## 5. İYS, yalnızca ticari ileti gönderecekseniz

Rezervasyon onayı, hatırlatma, doğrulama kodu ve tahsilat bildirimi **işlem
bildirimidir**; bu bölümü atlayabilirsiniz. Kampanya, indirim ve tanıtım
mesajı **ticari iletidir** ve alıcının İYS onayı olmadan gönderilemez.

- [ ] iys.org.tr üzerinden hizmet sağlayıcı (marka) kaydınızı açın
- [ ] Onayları nasıl yöneteceğinize karar verin:
      **elle** (İYS panelinden, Temel Hizmetler paketiyle ücretsiz) ya da
      **otomatik** (bu sistemden aktarım; adres sayınıza uygun paket gerekir)
- [ ] Otomatik aktarım seçtiyseniz `IYS_BRAND_CODE`, `IYS_USERNAME` ve
      `IYS_PASSWORD` değerlerini Cloudflare'e sır olarak girin
- [ ] Panelde İzin Yönetimi ekranından mevcut onaylarınızı girin
- [ ] Ertesi sabah "İYS: aktarıldı" durumunu kontrol edin

| Paket | Adres/izin | Tutar (KDV dahil) |
|-------|-----------|-------------------|
| Temel Hizmetler | Elle yönetim | Ücretsiz |
| İLETİ-5 | 5.000 | 4.601 ₺ |
| İLETİ-25 | 25.000 | 8.313 ₺ |
| İLETİ-75 | 75.000 | 14.921 ₺ |
| İLETİ-150 | 150.000 | 23.055 ₺ |
| İLETİ-250 | 250.000 | 29.483 ₺ |

> İzin adedinin süre sınırı yoktur; yüklendikçe paketten düşer. Fiyatlar
> Eylül 2026 itibarıyladır. Bazı firmalar İYS'ye doğrudan değil, SMS
> sağlayıcısı (ör. Netgsm) üzerinden bağlanır; o durumda `IYS_*` boş kalır
> ve onay aktarımı sağlayıcı panelinden yapılır.
>
> Mevzuat, yeni onayın **3 iş günü** içinde İYS'ye aktarılmasını ve ret
> talebinin **3 iş günü** içinde uygulanmasını ister. Sistem her iki yönü
> de her gece 03:00'te senkronize eder.

## 6. Dağıtım sonrası doğrulama

- [ ] `/uye-girisi` → giriş yapılıyor, "Demo modu" uyarısı **görünmüyor**
- [ ] Yeni rezervasyon oluştur → kaydediliyor, kod üretiliyor
- [ ] Tahsilat ekle → kalan alacak doğru hesaplanıyor
- [ ] `/kod-dogrulama` → rezervasyon kodu doğrulanıyor, telefon maskeli
- [ ] Siteden iletişim formu gönder → **Talepler** ekranında görünüyor
- [ ] Panel → **Sistem Durumu** → uyarı yoksa altyapı ayakta
- [ ] Ertesi gün Sistem Durumu'nda "son yedek" değeri dolu olmalı

## 7. Bir şey çalışmazsa

Cloudflare → Workers → ilgili Worker → **Logs**. Hata metnini
kopyalarken anahtarları maskeleyin. Fatura hataları ayrıca Faturalar
ekranındaki `provider_error` alanında Türkçe olarak görünür.

Sık karşılaşılanlar:

| Belirti | Olası neden |
|---|---|
| "Demo modu" uyarısı çıkıyor | `VITE_SUPABASE_*` tanımsız ya da dağıtım yeniden alınmamış |
| SMS gitmiyor, kayıt "gönderilemedi" | Netgsm başlığı henüz onaylanmamış |
| Kuyrukta mesaj birikiyor | `CRON_SECRET` tanımsız ya da cron çalışmıyor |
| Giriş kilidi devrede değil | `SUPABASE_SERVICE_ROLE_KEY` tanımsız |
| Fatura taslakta kalıyor | `PARASUT_*` eksik ya da alan adı uyuşmazlığı, `provider_error`'a bakın |
| Yedek alınmamış uyarısı | `yedekler` kovası yok ya da özel değil |
