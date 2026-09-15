# Vercel'de kurulum

Bu belge sistemi **Vercel + Neon** üzerinde ayağa kaldırmayı anlatıyor.
Kendi sunucunuza kuracaksanız `docs/KURULUM.md` okunacak belge; ikisi
ayrı dağıtım, ayrı belge.

Adımların sonunda çalışan bir site oluyor: giriş, bütün panel ekranları,
mobil uygulamanın bağlanacağı veri ucu. Zamanlanmış görevler ve WhatsApp
Web için ek adım var (bölüm 7 ve 8).

---

## 0. Önce şunu okuyun: Vercel'de ne çalışmıyor

Bunları saklamanın anlamı yok; kurulumdan sonra fark etmek daha pahalı.

| Konu | Durum |
| --- | --- |
| Panel, giriş, bütün ekranlar | Çalışıyor |
| Veri okuma/yazma (`/veri`) | Çalışıyor — PostgREST yerine `api/veri.ts` |
| SMS, İYS, e-Fatura, Meta WhatsApp webhook'u | Çalışıyor |
| Zamanlanmış görevler | Vercel'in kendi zamanlayıcısı yetmiyor; dışarıdan tetikleniyor (bölüm 7) |
| **Otomatik gece yedeği** | **Çalışmıyor** — dosya sistemi salt okunur. Yerine: Neon'un kendi yedeği + panelden elle indirme |
| **WhatsApp Web (Baileys)** | **Çalışmıyor** — sürekli açık bir süreç ve oturum klasörü istiyor. Yönetici bildirimleri SMS'ten gider |
| **Fatura verisini ayrı sunucuda tutma** | **Çalışmıyor** — bu kip tek veritabanı tanıyor (`PGRST_FATURA_URL` verilirse sistem açıkça hata verir) |

Son satır hukuki bir konu, teknik bir eksik değil: **Vergi Usul Kanunu
e-belgelerin Türkiye'de muhafazasını istiyor.** Neon'un sunucusu yurt
dışında. Ayrıca müşteri adı, telefonu ve TC kimlik numarası KVKK m.9
anlamında **yurt dışına aktarım** sayılıyor. Deneme ve demo için sorun
değil; **gerçek müşteri kaydı girmeden önce** bu kararın verilmiş olması
gerekiyor. Seçenekler `docs/IKI-SUNUCU.md` ve `docs/SUNUCU-SECIMI.md`
belgelerinde.

Bir de plan koşulu var: Vercel'in **ücretsiz (Hobby) planı ticari
kullanıma kapalı.** Salon işletmesi için kullanılacaksa ücretli plana
geçmek gerekiyor. Neon'un ücretsiz planında böyle bir kısıt yok.

---

## 1. Veritabanı (Neon)

1. <https://neon.tech> üzerinde hesap açın, bir proje oluşturun.
   Bölge olarak `aws-eu-central-1` (Frankfurt) seçin: Türkiye'ye en
   yakın olanı, her sorguda gidip gelen gecikmeyi bu belirliyor.
2. Proje panosunda (Dashboard) **Connect** düğmesine basın.
   Açılan pencerede branch (`main`), veritabanı ve rol seçili gelir;
   altta bağlantı adresi ve yanında kopyalama düğmesi var.

### İKİ AYRI ADRES KOPYALAYIN

Pencerede **Connection pooling** anahtarı var ve iki farklı adres
üretiyor. İkisi de lazım, ama ayrı işler için:

| Anahtar | Adreste | Nerede kullanılacak |
| --- | --- | --- |
| Açık (varsayılan) | `...-pooler.eu-central-1.aws.neon.tech` | **Vercel'deki `DATABASE_URL`** (bölüm 4) |
| Kapalı | `-pooler` yok | **Göçler** (bölüm 2) |

Neden ayrı: Vercel her istek için yeni bir fonksiyon örneği açabiliyor
ve her örnek kendi bağlantısını kuruyor; havuzsuz adres veritabanının
bağlantı sınırını yoğun bir günde doldurur. Göçler ise tersini istiyor
-- Neon'un kendi belgesi şema göçlerinde **doğrudan** (havuzsuz) adresi
öneriyor, çünkü havuz işlem kipinde bazı yönetim ifadeleri beklendiği
gibi çalışmıyor.

Uygulamanın havuzla sorunu yok: `api/_pg.ts` rolü ve kimliği `set local`
ile ve her zaman bir işlemin İÇİNDE ayarlıyor (`begin` ... `commit`).
İşlem kipindeki havuz, işlem boyunca aynı sunucu bağlantısını ayırıyor
ve `set local` işlem bitince geri alınıyor -- yani ayar ne kaybolur ne
de sonraki isteğe sızar. Havuza uygun olmayan şey, işlem dışında
yapılan kalıcı `set` çağrılarıydı; bu kodda öyle bir çağrı yok.

Adres şuna benziyor (parola dahil):

```
postgresql://<rol>:<parola>@ep-xxxx-yyyy.eu-central-1.aws.neon.tech/neondb?sslmode=require
```

Parolayı kaybederseniz geri getirilemiyor; Neon panosundan rolün
parolasını sıfırlayıp yeni adresi almanız gerekiyor.

Bu adres veritabanının kullanıcı adını ve parolasını taşıyor. Sohbete,
ekran görüntüsüne, Git'e girmesin.

---

## 2. Şemayı kurun

46 göç sırayla uygulanıyor; atlanan bir dosya sonrakini bozar.

```bash
git clone <depo> sahra && cd sahra
npm install

# DOĞRUDAN adres: içinde `-pooler` GEÇMEYEN olan (bölüm 1).
DATABASE_URL='<Neon doğrudan adresi>' npm run goc
```

Komut zaman aşımına düşüyorsa ağınız PostgreSQL'in 5432 portunu
kapatıyordur; kurumsal ağların ve bazı bulut ortamlarının çoğu
kapatıyor. Neon aynı protokolü 443 üzerinden de konuşuyor:

```bash
DATABASE_URL='<Neon doğrudan adresi>' npm run goc -- --ws
```

Aynı SQL, aynı sıra, aynı denetimler; yalnızca taşıma değişiyor.

Betik her dosyayı tek tek yazıyor ve **ilk hatada duruyor** — kalan
göçleri de koşturmak yarım bir şema bırakır, üstelik asıl hata ekranda
yukarıda kaybolurdu. Sonunda rolleri ve tablo sayısını kendisi
denetliyor:

```
[46/46] 0045_kanal_kaynak_dogrulama.sql ... tamam

Tablo     : 43
Fonksiyon : 100
Roller    : anon, authenticated, service_role — hepsi var
```

**Roller satırı en önemlisi.** Göçler `anon`, `authenticated` ve
`service_role` rollerini kendisi açıyor ve RLS politikalarının tamamı
bu rollere yazılı. Barındırılan bir veritabanında rol açma yetkisi
kısıtlı olabiliyor; roller açılmazsa panel açılır ama **hiçbir ekran
veri gösteremez.** Betik bu durumda hata verip duruyor, "tamam" demiyor.

Betik tekrar çalıştırılabilir: göçler `if not exists` /
`create or replace` ile yazıldı, uygulanmış bir veritabanında yeniden
koşturmak zarar vermiyor. Yarıda kalan bir kurulumu düzeltip aynı komutu
tekrar vermeniz yeterli.

`DATABASE_URL` parola taşıyor. Komut geçmişine düşmesini istemiyorsanız
`.env.local` dosyasına koyup kabuktan okutun; betik ekrana bastığı
hiçbir mesajda parolayı göstermiyor.

<details>
<summary>psql tercih ederseniz</summary>

```bash
for f in supabase/migrations/*.sql; do
  echo "--- $f"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f" || break
done

psql "$DATABASE_URL" -c "\du" | grep -E 'anon|authenticated|service_role'
```

`ON_ERROR_STOP=1` şart: olmasaydı hatalı bir göçün ardından kalanlar da
koşardı.
</details>

> Bu adım iki yerde denendi. Boş bir **PostgreSQL 16** veritabanında 46
> göç uygulandı ve ardından veri katmanının veritabanına bağlanan 51
> testi — giriş, jeton, `/veri` okuma ve kiracı izolasyonu dahil — bu
> şemaya karşı koştu. Sonra gerçek bir **Neon** örneğinde (PostgreSQL
> 18.6, Frankfurt) aynı 46 göç uygulandı: 43 tablo, 100 fonksiyon, üç
> rol — yerel kurulumla birebir aynı. Neon'da fazladan görünen tek
> fonksiyon `fips_mode()`, o da pgcrypto'nun kendi fonksiyonu.
> İzolasyon da orada ayrıca sınandı: kullanıcı kendi işletmesini
> görüyor, başkasınınkini ne okuyabiliyor ne güncelleyebiliyor ne de
> ona satır ekleyebiliyor.

---

## 3. Sırları üretin

```bash
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 32   # OTP_SECRET
openssl rand -hex 32   # CRON_SECRET
```

`JWT_SECRET` en kritik değer: bununla `service_role` jetonu
imzalanabiliyor ve o rol satır güvenliğini (RLS) aşıyor. En az 32
karakter, yalnızca sunucuda.

---

## 4. Vercel ortam değişkenleri

Vercel → proje → **Settings → Environment Variables**. Her birini
Production (ve isterseniz Preview) için ekleyin.

**Zorunlu:**

| Ad | Değer | Nerede okunuyor |
| --- | --- | --- |
| `DATABASE_URL` | Neon **havuzlu** adresi (`-pooler` geçen) | Sunucu |
| `JWT_SECRET` | 32+ karakter rastgele | Sunucu |
| `VITE_SUNUCU_MODU` | `1` | **Derleme sırasında** |

`VITE_SUNUCU_MODU` verilmezse site **tanıtım (demo) kipinde** açılır:
veriler yalnızca tarayıcıda durur, veritabanına hiç gidilmez. Site
çalışıyor görünür ama kaydettiğiniz hiçbir şey kalıcı olmaz. `VITE_`
önekli değişkenler derleme sırasında gömüldüğü için, değeri ekledikten
sonra **yeniden dağıtım (redeploy) gerekiyor**; var olan dağıtım kendi
kendine değişmiyor.

**İsteğe bağlı, özelliğe göre:**

| Ad | Ne için |
| --- | --- |
| `OTP_SECRET` | Girişte SMS doğrulaması |
| `CRON_SECRET` | Zamanlanmış görevleri dışarıdan tetiklemek (bölüm 7) |
| `NETGSM_USER`, `NETGSM_PASS`, `NETGSM_HEADER` | SMS |
| `IYS_*` | İYS izin senkronizasyonu |
| `PARASUT_*` ya da `GIB_*` | e-Fatura |
| `WHATSAPP_*` | Meta WhatsApp webhook'u |
| `MAIL_API_KEY` | Anket ve rapor e-postaları |

Hiçbiri `VITE_` ya da `EXPO_PUBLIC_` öneki almıyor; alsalardı tarayıcıya
inen pakete gömülürlerdi. `e2e/security.spec.ts` derlenmiş paketi tarayıp
bunu denetliyor.

`PGRST_URL` **tanımlanmayacak.** Sistem kipi buna bakarak seçiyor:
`DATABASE_URL` var ve `PGRST_URL` yoksa doğrudan PostgreSQL'e gidiyor
(`api/_db.ts`).

---

## 5. Dağıtın

Vercel → **Add New → Project** → depoyu seçin. Yapılandırma
`vercel.json` dosyasından okunuyor; Framework Preset'e dokunmanız
gerekmiyor.

Dağıtım bitince şunu doğrulayın:

```bash
curl -s https://<siteniz>/veri/halls | head -c 200
```

`{"message":"Oturum gerekli.","code":"PGRST301"}` dönmeli. Bu **doğru**
cevap: veri ucu ayakta ve kimliksiz isteği geri çeviriyor. `index.html`
dönüyorsa `vercel.json` dağıtılmamış demektir.

---

## 6. İlk kullanıcı

Şifre veritabanına düz metin olarak **hiç girilmiyor**; karması
uygulamanın kendi koduyla üretiliyor.

```bash
JWT_SECRET='<JWT_SECRET>' npx tsx -e "
import('./api/_kimlik.ts').then(m => m.sifreyiKarmala('<ILK_SIFRE>')).then(console.log)
"
```

Çıkan karmayla kullanıcıyı açın:

```bash
psql "$DATABASE_URL" -c "select public.kullanici_ac('siz@ornek.com', '<URETILEN_KARMA>')"
```

`profiles` satırı tetikleyiciyle kendiliğinden açılıyor. Panele girip
**Firmalarım** ekranından işletmenizi ekleyin.

---

## 7. Zamanlanmış görevler

Sistemde 12 zamanlanmış görev var (`sunucu/rotalar.ts`). En sık çalışanı
SMS kuyruğu: **beş dakikada bir**. Vercel'in kendi zamanlayıcısı
ücretsiz planda hem sayıca hem sıklıkça sınırlı (bu belge yazıldığında 2
görev, günde bir kez — güncel sınır Vercel'in fiyatlandırma sayfasında).
Yani bu görevler Vercel'in zamanlayıcısına sığmıyor.

Çözüm: uç noktalar zaten `CRON_SECRET` ile korunuyor ve **dışarıdan
çağrılabiliyor.** Ücretsiz bir zamanlayıcı (örneğin cron-job.org)
kullanın:

```
URL    : https://<siteniz>/api/sms-queue
Method : POST
Header : Authorization: Bearer <CRON_SECRET>
```

Kurulacak görevler ve sıklıkları:

| Yol | Sıklık | Ne yapıyor |
| --- | --- | --- |
| `/api/sms-queue` | 5 dakikada bir | SMS kuyruğunu gönderir |
| `/api/invoice` | 15 dakikada bir | Bekleyen faturaları gönderir |
| `/api/reminders` | Günde bir, 07:00 | Hatırlatmaları kuyruğa alır |
| `/api/kurlar` | Saat başı | Döviz kuru |
| `/api/hava-saatlik` | Saat başı (dk 20) | Saatlik hava tahmini |
| `/api/hava` | Günde bir, 05:15 | Günlük hava tahmini |
| `/api/anket` | Günde bir, 09:00 | Organizasyon sonrası anket |
| `/api/iys` | Günde bir, 03:00 | İYS izin senkronizasyonu |
| `/api/monthly-report` | Ayın 1'i, 06:00 | Aylık rapor e-postası |
| `/api/ozel-gunler` | Ayın 2'si, 04:00 | Bayram, arife, kandil |
| `/api/meb-takvim` | Ayın 3'ü, 04:00 | Okul tatilleri |
| `/api/backup` | — | **Vercel'de çalışmıyor**, bölüm 0 |

Saatler UTC. Türkiye saati UTC+3 olduğu için "07:00" kuralı Türkiye'de
10:00'a denk gelir; zamanlayıcıda yerel saat seçebiliyorsanız ona göre
girin.

Hepsini kurmak zorunda değilsiniz. En az bunlar olmalı:
`/api/sms-queue` ve `/api/reminders` — hatırlatma sistemi bu ikisi
olmadan hiç çalışmaz.

---

## 8. WhatsApp

İki ayrı şey var, karıştırılmasın:

- **Gelen mesajlar müşteri adayına düşsün** (Meta Cloud API webhook'u).
  Vercel'de **çalışıyor**. Meta panelinde webhook adresi olarak
  `https://<siteniz>/api/webhooks/whatsapp` yazılıyor. Ayrıntılı
  anlatım: `docs/KURULUM.md` bölüm 11 — ortam değişkenleri aynı,
  yalnızca dosyaya değil Vercel paneline giriliyor.
- **Yönetici bildirimleri WhatsApp'tan gitsin** (WhatsApp Web / Baileys).
  Vercel'de **çalışmıyor**: QR ile açılan oturumun sürekli açık bir
  süreçte ve kalıcı bir klasörde durması gerekiyor, sunucusuz
  fonksiyonlarda ikisi de yok. Bildirimler SMS'ten gider; bu zaten
  yedek yol olarak duruyordu.

---

## 9. Yedek

Gece yedeği Vercel'de alınamıyor (bölüm 0). Yerine iki yol:

1. **Neon'un kendi yedeği.** Neon her projede noktasal geri dönüş
   (point-in-time restore) tutuyor; ücretsiz planda saklama süresi
   kısa, ücretli planda uzun. Panelden süreyi kontrol edin.
2. **Panelden elle indirme.** Sistem Durumu ekranındaki yedek düğmesi
   JSON dosyası indiriyor.

İndirilen dosya müşteri adı, telefonu ve TC kimlik numarası taşıyor:
şifrelenmemiş bir bulut klasörüne konmamalı.

Geri yükleme adımları `docs/YEDEKLEME-VE-GERI-YUKLEME.md` belgesinde.

---

## 10. Güncelleme

Depoya push edildiğinde Vercel kendiliğinden dağıtıyor. Yeni göç
geldiyse veritabanına ayrıca uygulamak gerekiyor:

```bash
git pull
DATABASE_URL='<Neon adresi>' npm run goc
```

Göçler tekrar çalıştırılmaya dayanıklı yazıldı; uygulanmış olanlar zarar
vermeden tekrar geçiyor. Yine de büyük bir güncellemeden önce Neon
panelinden bir yedek (branch) alın.

---

## Sorun giderme

**Her ekran "veri okunamadı" diyor.**
`curl https://<siteniz>/veri/halls` çıktısına bakın. `index.html`
dönüyorsa `vercel.json` dağıtılmamış. `PGRST000 Veritabanı
yapılandırılmadı` dönüyorsa `DATABASE_URL` tanımlı değil.

**Giriş "Sunucu yapılandırması eksik" diyor.**
`JWT_SECRET` yok ya da 32 karakterden kısa.

**Giriş başarılı ama panel boş.**
Kullanıcının işletmesi yok. Firmalarım ekranından ekleyin.

**Site açılıyor, veriler kaydedilmiyor, yenileyince kayboluyor.**
Tanıtım kipindesiniz: `VITE_SUNUCU_MODU=1` eksik ya da eklendikten
sonra yeniden dağıtım yapılmamış.

**Fonksiyon "PGRST_FATURA_URL doğrudan kipte kullanılamaz" hatası
veriyor.**
Fatura bölmesi bu kipte yok (bölüm 0). Değişkeni kaldırın.
