# İzleme

## 1. Sağlık kontrolü uç noktası

```
GET https://<alan-adiniz>/api/health
```

| Yanıt | HTTP | Anlamı |
|-------|------|--------|
| `{"status":"saglikli"}` | 200 | Her şey yolunda |
| `{"status":"uyari","sorunlar":[...]}` | 503 | Müdahale gerekiyor |
| `{"status":"arizali"}` | 503 | Veritabanına ulaşılamıyor |
| `{"status":"demo"}` | 200 | Veritabanı yapılandırılmamış |

Uç nokta **kişisel veri döndürmez**; yalnızca sayısal özet verir. Ayrıntılı
döküm yalnızca `Authorization: Bearer <CRON_SECRET>` başlığıyla eklenir.

### Kontrol edilenler

| Kontrol | Eşik |
|---------|------|
| Kuyrukta bekleyen en eski mesaj | 30 dakika |
| Kalıcı gönderilemeyen mesaj | 0'dan büyükse uyarı |
| Son başarılı yedek yaşı | 48 saat |
| SMS sağlayıcısı yapılandırması | Tanımlı olmalı |
| Veritabanı erişimi | Ulaşılabilir olmalı |

## 2. Uptime izleme kurulumu

Ücretsiz bir servis yeterlidir ([UptimeRobot](https://uptimerobot.com),
[Better Stack](https://betterstack.com)).

1. **Monitor type:** HTTP(s)
2. **URL:** `https://<alan-adiniz>/api/health`
3. **Interval:** 5 dakika
4. **Alert when:** HTTP durum kodu 200 değilse
5. **Bildirim:** e-posta + cep telefonu

Ayrıca ana sayfa için ikinci bir izleyici ekleyin:
`https://<alan-adiniz>/` — sitenin kendisi ayakta mı?

## 3. Panelden izleme

Panel → **Sistem Durumu**

Aynı kontrolleri Türkçe açıklamalarla gösterir; her sorunun yanında ne
yapılması gerektiği yazar. Ekran dakikada bir kendini yeniler.

## 4. Hata izleme (Sentry)

`VITE_SENTRY_DSN` tanımlıysa tarayıcıdaki beklenmeyen hatalar Sentry'ye
gönderilir. Giden olaylarda **e-posta ve telefon numaraları maskelenir**.

Tanımlı değilse hiçbir dış servise istek gitmez.

## 5. Alarm verildiğinde ne yapmalı?

| Alarm | İlk kontrol |
|-------|-------------|
| "Kuyrukta bekleyen mesaj var" | Vercel → Deployments → Cron Jobs çalışıyor mu? `CRON_SECRET` tanımlı mı? |
| "Mesaj gönderilemedi" | Panel → SMS Kayıtları → Kuyruk sekmesindeki hata gerekçesi. Netgsm bakiyesi var mı? |
| "Yedek alınamamış" | Storage'da `yedekler` kovası var mı? `SUPABASE_SERVICE_ROLE_KEY` doğru mu? |
| "Veritabanına ulaşılamıyor" | Supabase durum sayfası; proje duraklatılmış olabilir |
| "Hatalı giriş denemesi" | Panel → Denetim Kaydı; şifre değiştirmeyi değerlendirin |

## 6. Düzenli kontrol listesi

**Haftalık (2 dakika)**
- Panel → Sistem Durumu: "Sistem sağlıklı" yazıyor mu?

**Aylık (10 dakika)**
- Elle yedek indir, dosyayı aç, rezervasyon sayısını doğrula
- Denetim kaydına göz at: beklenmeyen değişiklik var mı?
- İYS izinleri: aktarılmamış kayıt kalmış mı?

**6 aylık (1 saat)**
- Tam geri yükleme tatbikatı (bkz. `YEDEKLEME-VE-GERI-YUKLEME.md`)
- Şifreleri ve `service_role` anahtarını yenile
