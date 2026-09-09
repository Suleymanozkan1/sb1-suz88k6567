# Sahra Takip — mobil uygulama

React Native (Expo) ile yazılmış iOS ve Android uygulaması. Web paneliyle
aynı Supabase veritabanını kullanır; hangi kaydın görüneceğine sunucudaki
satır bazlı güvenlik (RLS) karar verir.

## Kapsam

Uygulama **görüntüleme ve hızlı tahsilat** içindir:

| Ekran | İşlev |
|-------|-------|
| Bugün | Kronolojik ajanda, üstte toplam kalan alacak |
| Takvim | Kompakt ay ızgarası + seçili günün listesi |
| Rezervasyon | Tutar durumu, müşteriyi arama, hızlı tahsilat, iş emri |
| Kasa | Gelir, gider, bakiye ve kalan alacak özeti |
| Hesap | Bağlantı durumu, yasal metinler, çıkış |

Rezervasyon oluşturma, fatura kesme ve yetki yönetimi bilinçli olarak web
panelinde bırakıldı: bu işlemler daha fazla alan ve dikkat istiyor.

## Çalıştırma

```bash
npm install
npm start          # Expo geliştirme sunucusu (QR ile cihazda açılır)
npm run ios        # iOS simülatörü (macOS + Xcode gerekir)
npm run android    # Android emülatörü (Android SDK gerekir)
npm run web        # tarayıcıda (ekran görüntüsü ve hızlı bakış için)
```

## Yapılandırma

Değerler ortam değişkeninden ya da `app.json` içindeki `extra` alanından
okunur. Tanımlı değilse uygulama **tanıtım verisiyle** açılır ve çökmez.

| Değişken | Açıklama |
|----------|----------|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase proje adresi (yalnızca `https://`) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Anonim anahtar; RLS açık olduğu için istemcide durabilir |
| `EXPO_PUBLIC_API_KOK` | Sunucu uçlarının kökü, varsayılan `https://sahratakip.com` |

`SUPABASE_SERVICE_ROLE_KEY` ve sağlayıcı şifreleri **asla** buraya girmez;
bunlar yalnızca Cloudflare Worker tarafında durur.

## Güvenlik kararları

- **Oturum belirteci SecureStore'da.** AsyncStorage düz metin bir dosyadır;
  köklenmiş bir cihazda ya da yedek dökümünde okunabilir. SecureStore iOS'ta
  Keychain, Android'de EncryptedSharedPreferences kullanır. Belirteç 2 KB
  sınırını aştığı için parçalara bölünerek saklanır.
- **Giriş `/api/login` üzerinden.** Hesap kilidi ve hız sınırı orada
  uygulanıyor. İstemci doğrudan `signInWithPassword` çağırsaydı mobil
  uygulama bu korumaları atlayan bir yan kapı olurdu; bir test bunu
  doğruluyor.
- **Yalnızca https.** `usesCleartextTraffic` ve `NSAllowsArbitraryLoads`
  kapalı; Supabase adresi `https://` ile başlamıyorsa bağlanılmaz.
- **`detectSessionInUrl: false`.** Mobilde adres çubuğu yok; açık bırakılırsa
  uygulamaya gelen bir derin bağlantı içindeki belirteç oturum sayılabilirdi.

## Testler

```bash
npm run typecheck
npm test           # biçim + güvenlik testleri
npm run paket      # iOS ve Android paketlerini üretir
npm test           # paket üretildiyse derlenmiş paketi de tarar
```

Güvenlik testleri kaynak ağacını ve (üretilmişse) derlenmiş paketleri
sunucu sırları, gömülü JWT ve düz metin `http://` adresleri için tarar.

## Ekran görüntüleri

`docs/ss-mobil/` altındaki görüntüler `_mobil-ss.mjs` benzeri bir Playwright
betiğiyle Expo web sürümünden 393×852 (iPhone 14 Pro mantıksal ölçüsü) ve
3× ölçekle alınır; sunumun mobil slaydı bunları kullanır.
