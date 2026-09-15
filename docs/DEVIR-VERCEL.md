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
| **Vercel dağıtımı** | **BOZUK.** 21 saattir her dağıtım Error |

---

## Asıl sorun

`vercel.json`, PR #55 ile `api/` klasöründeki **27 uç noktayı**
`@vercel/node` ile yayımlamaya başladı. O commit'ten (`9dc06c0`) itibaren
**hiçbir dağıtım geçmedi.** Canlı site hâlâ ondan önceki derleme.

Derlemeler 7-10 dakika sürüp Error veriyor. Bu süre tip hatasına
benzemiyor (o bir dakikada düşer); 27 fonksiyonun ayrı ayrı
paketlenmesinden geliyor.

### Bilinen ve kapatılan bir sebep

`src/lib/anket.ts` ve `src/lib/whatsappTalep.ts` içindeki `'../types'`
uzantısız içe aktarımı. `@vercel/node` node16 çözümlemesi kullanıyor ve
klasör kısayolunu kabul etmiyor. PR #58 ile düzeltildi ve
`tsconfig.vercel.json` + `npm run typecheck` ile korumaya alındı.

**Ama bu tek sebep değildi:** düzeltmeyi taşıyan `95127f3` de Error
verdi. Geriye en az bir sebep daha kaldı ve NE OLDUĞU BİLİNMİYOR.

### İlk bakılacak yer

Başarısız bir dağıtımın **Build Logs** çıktısının sonu. Bu görülmeden
atılacak her adım tahmindir.

```bash
vercel inspect --logs <dağıtım-url>
# ya da
vercel logs <dağıtım-url>
```

### Güçlü şüpheliler (doğrulanmadı)

1. **Fonksiyon boyutu.** `api/sms-queue.ts` → `api/_whatsapp_web.ts` →
   `@whiskeysockets/baileys` (14 MB + bağımlılıkları) çekiyor. Vercel'in
   fonksiyon boyut sınırı aşılıyor olabilir. Not: WhatsApp Web zaten
   Vercel'de ÇALIŞMIYOR (sürekli açık süreç ve oturum klasörü istiyor,
   bkz. `docs/VERCEL.md` bölüm 0) -- yani o bağımlılığı Vercel
   paketinden çıkarmak işlevsel bir kayıp değil.
2. **27 ayrı `builds` girdisi.** Bu eski (legacy) biçim. Vercel'in
   güncel yolu dosya sistemi yönlendirmesi ya da tek bir `functions`
   ayarı. Yeniden yazmak derlemeyi hem hızlandırır hem sadeleştirir.
3. **Derleme süresi/bellek sınırı.**

---

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
