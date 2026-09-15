# Devir notu: Vercel dağıtımı

Bu belge yarım kalan tek işi anlatıyor: **site Vercel'de yayına
alınamıyor.** Veritabanı, şema, kullanıcı ve kod hazır; tökezleyen
yalnızca derleme.

Son güncelleme: 15 Eylül 2026.

---

## Durum özeti

| Konu | Durum |
| --- | --- |
| Neon veritabanı | **Hazır.** 46 göç uygulandı: 43 tablo, 100 fonksiyon, üç rol |
| Kiracı izolasyonu (RLS) | **Doğrulandı.** Neon/PG18'de altı kontrol geçti |
| İlk panel kullanıcısı | **Açıldı.** Giriş yolu (`kimlik_bul` + şifre doğrulama) sınandı |
| Kod, testler | **Temiz.** 85 dosya / 1807 test, `tsc -b`, eslint, `vercel-build` |
| Vercel ortam değişkenleri | Kullanıcı panelden girdi (doğrulanmadı) |
| **Vercel dağıtımı** | Üç sebep de kapatıldı; son dağıtım bekleniyor |

---

## Çözülen sorun (15 Eylül)

Dağıtım `9dc06c0`'dan itibaren 21 saat boyunca düştü. Üç ayrı sebep
vardı; üçü de kapatıldı:

1. **`'../types'` uzantısız içe aktarımı** (PR #58). `@vercel/node`
   node16 çözümlemesi kullanıyor, klasör kısayolunu kabul etmiyor.
2. **`.at(-1)` çağrısı** (PR #60). ES2022 eki; Vercel'in fonksiyon
   derleyicisi tanımıyor. Bu ikisini `tsconfig.vercel.json` koruyor
   (`npm run typecheck` çalıştırıyor).
3. **ASIL SEBEP: fonksiyon sayısı.** Ücretsiz plan bir dağıtımda en
   fazla **12 sunucusuz fonksiyon** kabul ediyor; her uç nokta ayrı
   yayımlandığı için 27 tane vardı. Hata derleme günlüğünde GÖRÜNMÜYOR,
   Vercel onu ayrıca bildiriyor: "No more than 12 Serverless Functions
   can be added to a Deployment on the Hobby plan."

Çözüm: `api/index.ts` tek dağıtıcı. `sunucu/rotalar.ts` tablosunu okuyup
isteği doğru işleyiciye götürüyor; asıl yol `vercel.json` kuralının
koyduğu `__yol` parametresinden geliyor ve istek o yolla yeniden
kuruluyor, böylece işleyiciler kendi sunucumuzdakiyle aynı isteği
görüyor. Fonksiyon sayısı 27'den 4'e indi (dağıtıcı + üç tanıtım ucu).

Ayrıca WhatsApp Web (Baileys, 61 MB) paketten çıkarıldı: paket adı
değişkenden okunuyor, paketleyici izleyemiyor. Vercel'de zaten
çalışmayan bir bağımlılık `sms-queue` fonksiyonunu 7,5 MB'a
çıkarıyordu; şimdi 0,18 MB.

## Değiştirilirken dikkat edilecekler

- `sunucu/vercel-yapilandirma.test.ts`, `vercel.json` ile
  `sunucu/rotalar.ts` listesinin ayrışmasını engelliyor. `vercel.json`
  yeniden yazılırsa bu test de güncellenmeli -- ama **kaldırılmamalı**:
  yeni bir uç noktanın kendi sunucumuzda çalışıp Vercel'de 404 dönmesini
  bu test önlüyor.
- `/veri` yolu yeniden yazılırken hedef tablo adresten siliniyor; kural
  onu bir parametreyle taşıyor (`api/veri.ts`, `YOL_PARAMETRESI`). Bu
  olmadan hiçbir ekran veri okuyamaz.
- `VITE_SUNUCU_MODU=1` derleme sırasında pakete gömülüyor. Eksikse site
  açılır ama tanıtım kipinde kalır ve hiçbir kayıt kalıcı olmaz.
- Sırlar tarayıcı paketine sızmamalı; `e2e/security.spec.ts` bunu
  derlenmiş `dist/assets/*.js` üzerinde denetliyor.

---

## Doğrulama komutları

```bash
npm run typecheck          # tsc -b + tsconfig.vercel.json (node16)
npm test                   # web + mobil
VITE_SUNUCU_MODU=1 npm run vercel-build
```

Veritabanına bağlı testler için:

```bash
TEST_DATABASE_URL='postgres://...' npx vitest run
```

---

## Bittiğinde kontrol edilecekler

1. `curl https://<site>/veri/halls` → `{"message":"Oturum gerekli.","code":"PGRST301"}`
   (`index.html` dönerse `vercel.json` dağıtılmamıştır)
2. Panele giriş yapılabiliyor mu
3. Site tanıtım kipinde mi, gerçek veritabanına mı bağlı
4. Ekranlar açılıyor mu, tarayıcı konsolunda hata var mı
