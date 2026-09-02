# Dağıtım Kontrol Listesi

Seçilen kurulum: **Supabase + Vercel Pro + Netgsm + Paraşüt**, İYS'siz
(yalnızca işlem bildirimi SMS'i).

Anahtarları **hiçbir zaman** depoya, sohbete veya `VITE_` önekli bir
değişkene koymayın. Hepsi Vercel'in Environment Variables ekranına girilir.

---

## 1. Supabase

- [ ] [supabase.com](https://supabase.com) → New project, **bölge: Frankfurt (EU Central)**
- [ ] SQL Editor'da göçleri **sırayla** çalıştırın:
      `0001_init` → `0002_security` → `0003_iys_queue` → `0004_backup_health`
      → `0005_invoices` → `0006_talepler`
- [ ] README'deki doğrulama sorgusunu çalıştırın (ilk altı sütun `t` olmalı)
- [ ] Storage → New bucket → adı `yedekler`, **Public bucket KAPALI**
- [ ] Authentication → Users → kendi hesabınızı oluşturun
- [ ] Table Editor → `profiles` → kendi satırınızda `role` değeri `owner` olmalı
- [ ] Project Settings → API → `URL`, `anon key`, `service_role key` değerlerini not alın

> `service_role` anahtarı RLS'yi tamamen atlar. Yalnızca sunucu tarafı
> değişken olarak kullanılır; `VITE_` öneki **asla** verilmez.

## 2. Vercel

- [ ] GitHub deposunu içe aktarın
- [ ] Settings → Billing → **Pro** planına geçin
      (Hobby ticari kullanıma kapalıdır ve cron'u günde bir ile sınırlar)
- [ ] Settings → Environment Variables → aşağıdaki tabloyu doldurun
- [ ] Deploy

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

## 3. Netgsm

- [ ] Kurumsal abonelik açın
- [ ] Vergi levhanızla **başlık (marka) başvurusu** yapın — birkaç iş günü sürer
- [ ] Başlık onaylandıktan sonra SMS paketi satın alın
- [ ] API kullanıcı adı ve şifresini panelden alıp Vercel'e girin

> Başlık onaylanmadan gönderim yapılamaz. Onay beklerken sistem çalışır;
> mesajlar kuyruğa girer ve arayüzde "gönderilemedi" olarak görünür.

## 4. Paraşüt

- [ ] Mali müşavirinizle mükellefiyet durumunuzu teyit edin
- [ ] Paraşüt hesabı açın, e-Arşiv/e-Fatura kontörü tanımlayın
- [ ] Ayarlar → API bölümünden `client_id` ve `client_secret` alın
- [ ] Firma numarasını panel adresinden okuyun
- [ ] **İlk faturayı düşük tutarlı bir test olarak kesin** ve Faturalar
      ekranındaki `provider_error` alanını kontrol edin

## 5. Dağıtım sonrası doğrulama

- [ ] `/uye-girisi` → giriş yapılıyor, "Demo modu" uyarısı **görünmüyor**
- [ ] Yeni rezervasyon oluştur → kaydediliyor, kod üretiliyor
- [ ] Tahsilat ekle → kalan alacak doğru hesaplanıyor
- [ ] `/kod-dogrulama` → rezervasyon kodu doğrulanıyor, telefon maskeli
- [ ] Siteden iletişim formu gönder → **Talepler** ekranında görünüyor
- [ ] Panel → **Sistem Durumu** → uyarı yoksa altyapı ayakta
- [ ] Ertesi gün Sistem Durumu'nda "son yedek" değeri dolu olmalı

## 6. Bir şey çalışmazsa

Vercel → Deployments → ilgili dağıtım → **Runtime Logs**. Hata metnini
kopyalarken anahtarları maskeleyin. Fatura hataları ayrıca Faturalar
ekranındaki `provider_error` alanında Türkçe olarak görünür.

Sık karşılaşılanlar:

| Belirti | Olası neden |
|---|---|
| "Demo modu" uyarısı çıkıyor | `VITE_SUPABASE_*` tanımsız ya da dağıtım yeniden alınmamış |
| SMS gitmiyor, kayıt "gönderilemedi" | Netgsm başlığı henüz onaylanmamış |
| Kuyrukta mesaj birikiyor | `CRON_SECRET` tanımsız ya da cron çalışmıyor |
| Giriş kilidi devrede değil | `SUPABASE_SERVICE_ROLE_KEY` tanımsız |
| Fatura taslakta kalıyor | `PARASUT_*` eksik ya da alan adı uyuşmazlığı — `provider_error`'a bakın |
| Yedek alınmamış uyarısı | `yedekler` kovası yok ya da özel değil |
