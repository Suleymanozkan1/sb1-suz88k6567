# Sıfırdan kurulum

Ubuntu 24.04 LTS bir VPS'e Sahra Takip kurulumu. Sunucu seçimi ve
maliyet için [`SUNUCU-SECIMI.md`](SUNUCU-SECIMI.md).

Kurulacak dört parça, hepsi ücretsiz:

| | Ne yapar |
|---|---|
| PostgreSQL | veritabanı |
| PostgREST | veritabanını HTTP'ye açar (dışarı kapalı) |
| Sahra Takip sunucusu | siteyi sunar, `/api/*` ve zamanlanmış görevler |
| nginx | TLS ve ters vekil |

> Komutlardaki `sahratakip.com` yerine kendi alan adınızı yazın.
> `<...>` ile gösterilen yerlere kendi değerlerinizi koyun.

> Sunucu kurmak istemiyorsanız bu belge size göre değil: Vercel + Neon
> kurulumu [`VERCEL.md`](VERCEL.md) dosyasında. Orada ne çalışıp ne
> çalışmadığı belgenin başındaki tabloda.

## 1. Temel paketler

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y postgresql nginx curl git rsync ufw unattended-upgrades
# Güvenlik güncellemeleri kendiliğinden kurulsun
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

> **PostgreSQL 15 veya üstü gerekir.** Özel gün tablosu, ortak (işletmeye
> bağlı olmayan) günlerin tekilliği için `unique nulls not distinct`
> kullanıyor; bu sözdizimi 15 ile geldi. Daha eski bir sürümde göç
> dosyası hata verir. Sürümü `psql --version` ile doğrulayın; Debian 12
> ve Ubuntu 24.04 depolarındaki sürümler yeterlidir.

Node.js 22:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

Güvenlik duvarı — **yalnızca 22, 80 ve 443 açık olmalı.** Veritabanı ve
PostgREST dışarıya hiç açılmıyor:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
```

## 2. Veritabanı

```bash
sudo -u postgres createdb sahra
sudo -u postgres psql -c "create role sahra with login password '<DB_SIFRESI>';"
sudo -u postgres psql -d sahra -c "grant all on schema public to sahra;"
```

Göçleri **sırayla** uygulayın (`0000` en başta, sonra numara sırası):

```bash
git clone <depo-adresi> /opt/sahra
cd /opt/sahra
for f in supabase/migrations/*.sql; do
  echo "--- $f"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -d sahra -f "$f" || break
done
```

Sıra önemlidir ve atlanamaz:

- `0000` kimlik katmanını kurar; `0001` ona dayanıyor.
- `0006` ve `0008` bugün kullanılmayan iki tablo açar, `0013` ikisini de
  düşürür. Aradaki göçler o tablolara dokunduğu için atlanamazlar.
- `0021` çekirdek tablo yetkilerini verir, bu yüzden 0001-0020'den sonra.
- `0023` durum tablosunu kurar ve `customer_leads.status` kolonunu enum'dan
  koda çevirir; kendi yetkilerini kendi veriyor.
- `0024` gelir/gider satırlarına ödeme tipi ekler ve **çelik kasa tablosunu
  düşürür**.

> **`0024` geri alınamaz.** `safe_movements` tablosu düşürüldüğü için çelik
> kasa hareket geçmişi silinir. Göçü uygulamadan önce yedek alın:
>
> ```bash
> sudo -u postgres pg_dump sahra > sahra-0024-oncesi.sql
> ```
>
> Gelir/gider kayıtları, rezervasyonlar ve tahsilatlar etkilenmez.

- `0036` panel yetkilerini yediden yirmi beşe çıkarır ve panelin daha önce
  hiçbir yetkiye bağlı olmayan ekranlarını (müşteriler, ürün-hizmet,
  müşteri adayları, hatırlatmalar, SMS kayıtları, İYS izinleri) kendi
  yetkilerine bağlar.

> **`0036` kimsenin erişimini daraltmaz.** Göç, her personele bugün fiilen
> yapabildiği işin karşılığını yazar: yetkiye bağlı olmayan ekranlar
> herkese açıktı, o yüzden herkese verilir; `ayarlar.duzenle` panelin
> yönetim tarafının tamamıydı, parçalarına açılır. Taşınan kayıt
> `profiles.permissions_version = 1` ile damgalanır; göç yeniden
> çalıştırılırsa listeyi ikinci kez genişletmez.
>
> Göçten SONRA açılan personel hesabının varsayılanı yalnızca
> görüntülemedir (rezervasyon, müşteri, tanımlar). Eskiden varsayılan tam
> yetkiydi: elle daraltılmadıkça yeni açılan her hesap kasayı da silmeyi
> de yapabiliyordu. Yeni hesapların yetkisini Kullanıcılar ekranından
> verin; "Tüm yetkileri ver" kutusu hepsini tek hamlede işaretler.

- `0038` hava durumunu MGM'ye taşır: `weather_hourly` tablosu ve üç
  istasyon numarası kolonu. `ACCUWEATHER_API_KEY` artık okunmuyor.
- `0039` MEB okul takvimini yazan `okul_gunlerini_yaz` fonksiyonunu kurar.
  Okul tarihleri artık elle girilmiyor; ayda bir MEB duyurusundan çekilir.

- `0037` rezervasyona `city` ve `district` kolonları ekler (il bazlı rapor).
  Alanlar isteğe bağlı; eski kayıtlarda boş kalır ve rapor onları
  "Belirtilmemiş" satırında toplar. Boş ili işletmenin iliyle doldurmak,
  gerçekte başka ilden gelen müşterileri yanlış ile yazmak olurdu.

PostgREST'in bağlanacağı role şifre verin:

```bash
sudo -u postgres psql -d sahra -c "alter role authenticator with login password '<PGRST_SIFRESI>';"
```

## 3. Sırlar

İki uzun rastgele dize üretin ve saklayın:

```bash
openssl rand -base64 48   # JWT_SECRET  -> PostgREST ile ORTAK
openssl rand -base64 48   # OTP_SECRET
openssl rand -base64 48   # CRON_SECRET
```

> `JWT_SECRET` hem uygulamada hem PostgREST'te **aynı** olmalıdır.
> Farklı olurlarsa giriş başarılı görünür ama her veri sorgusu boş
> döner — sessiz ve bulması zor bir arıza.

## 4. PostgREST

```bash
cd /tmp
curl -fsSL -o pgrst.tar.xz \
  https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz
tar xf pgrst.tar.xz && sudo mv postgrest /usr/local/bin/
```

`/etc/postgrest.conf` (yalnızca root okuyabilsin: `sudo chmod 600`):

```
db-uri = "postgres://authenticator:<PGRST_SIFRESI>@localhost:5432/sahra"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "<JWT_SECRET>"
server-host = "127.0.0.1"
server-port = 3000
```

`server-host` **127.0.0.1 olmalı.** Dışarı açılırsa veritabanı arayüzü
internete ikinci bir kapı açar; tek koruma RLS'e kalır.

`/etc/systemd/system/postgrest.service`:

```ini
[Unit]
Description=PostgREST
After=postgresql.service

[Service]
ExecStart=/usr/local/bin/postgrest /etc/postgrest.conf
User=www-data
Restart=always

[Install]
WantedBy=multi-user.target
```

## 5. Uygulama

```bash
cd /opt/sahra
npm ci
npm run build          # site + sunucu derlenir
sudo mkdir -p /var/lib/sahra/yedekler
sudo chown www-data:www-data /var/lib/sahra/yedekler
sudo chmod 700 /var/lib/sahra/yedekler
```

`/etc/sahra.env` (`sudo chmod 600`):

```bash
PORT=8787
DIST_DIZINI=/opt/sahra/dist
PGRST_URL=http://127.0.0.1:3000
# Fatura verisi Türkiye'deki ayrı bir sunucuda tutulacaksa (VUK) o
# sunucudaki PostgREST'in adresi. Boş bırakılırsa her şey tek
# veritabanında kalır. Ayrıntı: docs/IKI-SUNUCU.md
PGRST_FATURA_URL=
JWT_SECRET=<JWT_SECRET>
OTP_SECRET=<OTP_SECRET>
CRON_SECRET=<CRON_SECRET>
YEDEK_DIZINI=/var/lib/sahra/yedekler

# SMS (Netgsm)
NETGSM_USER=<...>
NETGSM_PASS=<...>
NETGSM_HEADER=<...>

# İYS
IYS_USERNAME=<...>
IYS_PASSWORD=<...>
IYS_CODE=<...>
IYS_BRAND_CODE=<...>

# e-Fatura (Paraşüt)
PARASUT_CLIENT_ID=<...>
PARASUT_CLIENT_SECRET=<...>
PARASUT_USERNAME=<...>
PARASUT_PASSWORD=<...>
PARASUT_COMPANY_ID=<...>

# Yönetici bildirimleri WhatsApp'tan gidecekse (bölüm 12)
WHATSAPP_WEB_ETKIN=0
WHATSAPP_WEB_OTURUM=/var/lib/sahra/whatsapp-oturum

# Gelen mesajlar müşteri adayına düşsün (bölüm 11)
WHATSAPP_VERIFY_TOKEN=<...>
WHATSAPP_APP_SECRET=<...>
WHATSAPP_ACCESS_TOKEN=<...>
WHATSAPP_PHONE_NUMBER_ID=<...>
WHATSAPP_BUSINESS_ACCOUNT_ID=<...>
WHATSAPP_MOCK_MODE=false
```

Derleme sırasında sitenin gerçek sunucu kipinde çalışması için
`.env.production` dosyasına:

```bash
VITE_SUNUCU_MODU=1
```

> Bu değişken tanımlı değilse site **demo kipinde** açılır: veriler
> yalnızca tarayıcıda durur. Kurulumdan sonra giriş yapıp gerçek bir
> kayıt açarak doğrulayın.

`/etc/systemd/system/sahra.service`:

```ini
[Unit]
Description=Sahra Takip
After=network.target postgrest.service

[Service]
WorkingDirectory=/opt/sahra
EnvironmentFile=/etc/sahra.env
ExecStart=/usr/bin/node sunucu-dist/sunucu/baslat.js
User=www-data
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now postgrest sahra
sudo systemctl status postgrest sahra --no-pager
```

## 6. nginx ve TLS

`/etc/nginx/sites-available/sahra`:

```nginx
server {
    listen 80;
    server_name sahratakip.com;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host $host;
        # Bu başlığı VEKİL yazmalı. İstemcinin gönderdiği değer
        # kullanılırsa saldırgan her istekte farklı bir IP uydurup
        # hız sınırını ve giriş kilidini atlatabilir.
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/sahra /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d sahratakip.com
```

Certbot yenilemeyi kendisi kurar.

## 7. İlk kullanıcı

Şifre veritabanına düz metin olarak **hiç girilmez**; karması
uygulamanın kendi koduyla üretilir. Önce karmayı alın:

```bash
cd /opt/sahra
node -e "
require('./sunucu-dist/api/_kimlik.js').sifreyiKarmala('<ILK_SIFRE>').then(console.log);
"
```

Karma kendi tuzunu üretiyor; bu adımda `JWT_SECRET` gerekmiyor (o
yalnızca oturum jetonlarını imzalıyor).

Çıkan karmayla kullanıcıyı açın:

```sql
select public.kullanici_ac('siz@ornek.com', '<URETILEN_KARMA>');
```

`profiles` satırı tetikleyiciyle kendiliğinden açılır. Panele girip
**Firmalarım** ekranından işletmenizi ekleyin.

## 8. Yedek

Günlük yedek her gece 02:30 UTC'de otomatik alınır ve
`/var/lib/sahra/yedekler` altına yazılır.

> **Sunucu bozulursa yedek de gider.** Yedekleri düzenli olarak başka
> bir yere indirin. Kendi bilgisayarınızdan:
>
> ```bash
> rsync -avz --delete sunucu:/var/lib/sahra/yedekler/ ~/sahra-yedek/
> ```
>
> Yedek dosyaları müşteri adı, telefonu ve TC kimlik numarası içerir.
> Şifrelenmemiş paylaşılan bir klasöre (ortak ağ sürücüsü, senkronize
> bulut klasörü) konmamalıdır.

Veritabanının tamamının yedeği için:

```bash
sudo -u postgres pg_dump -Fc sahra > sahra-$(date +%F).dump
```

## 9. Güncelleme

Elle:

```bash
cd /opt/sahra
git pull
npm ci
# Yeni göç geldiyse sırayla uygulayın
npm run build
sudo systemctl restart sahra
```

Otomatik dağıtım kuruluysa (bir sonraki bölüm) bu adımlar `main` dalına
her itmede kendiliğinden çalışır; **göçler hariç.**

## 10. GitHub'dan otomatik dağıtım (isteğe bağlı)

`.github/workflows/dagit.yml`, `main` dalına her itmede projeyi derleyip
testleri çalıştırıyor ve sunucuya gönderip servisi yeniden başlatıyor.
GitHub Actions bu kullanım için ücretsiz: herkese açık depolarda
sınırsız, özel depolarda aylık ücretsiz dakika kotasının içinde. **Ek bir
servise ya da abonelige gerek yok.**

> **Göçler bu akışta çalışmaz.** Bilinçli bir karar: göçler geri
> alınamaz olabiliyor (`0024` çelik kasa defterini düşürür) ve doğru sıra
> önce yedek, sonra göç. Yeni bir göç dosyası geldiğinde iş akışı bunu
> özetinde bildiriyor ve uygulanacak komutları yazıyor; komutları siz
> çalıştırıyorsunuz.

### 10.1 Sunucuda dağıtım kullanıcısı

`root` KULLANILMIYOR. Anahtarı ele geçiren biri sunucunun tamamına değil,
yalnızca uygulama dizinine ve tek bir servis komutuna ulaşsın.

```bash
sudo adduser --disabled-password --gecos "" dagitim
sudo mkdir -p /home/dagitim/.ssh && sudo chmod 700 /home/dagitim/.ssh

# Uygulama dizinini bu kullanıcı yazabilsin
sudo chown -R dagitim:www-data /opt/sahra
sudo chmod -R g+rX /opt/sahra
```

> `rsync` sunucuda kurulu olmalı (1. bölümdeki apt satırında var). Kurulu
> değilse dağıtım "rsync: command not found" ile düşer.

`/etc/sahra.env` dosyasına **dokunulmuyor**: sırlar sunucuda kalıyor ve
dağıtım kullanıcısının onu okumasına da gerek yok.

Servisi yeniden başlatma yetkisi **yalnızca o komut için** veriliyor:

```bash
echo 'dagitim ALL=(root) NOPASSWD: /usr/bin/systemctl restart sahra'   | sudo tee /etc/sudoers.d/dagitim
sudo chmod 440 /etc/sudoers.d/dagitim
```

### 10.2 Anahtar çifti

Anahtar **kendi bilgisayarınızda** üretilir; özel anahtar sunucuya hiç
gitmez.

```bash
ssh-keygen -t ed25519 -C "sahra-dagitim" -f ~/.ssh/sahra_dagitim -N ""
```

Açık anahtarı sunucuya:

```bash
ssh-copy-id -i ~/.ssh/sahra_dagitim.pub dagitim@sahratakip.com
```

Özel anahtarın **tamamını** (`-----BEGIN` satırından `-----END` satırına
kadar) GitHub'a sır olarak ekleyin:

**Settings → Secrets and variables → Actions → New repository secret**

| Sır | Değer |
|---|---|
| `SUNUCU_SSH_ANAHTARI` | `cat ~/.ssh/sahra_dagitim` çıktısının tamamı |
| `SUNUCU_HOST` | `sahratakip.com` ya da IP |
| `SUNUCU_KULLANICI` | `dagitim` |
| `SUNUCU_PORT` | SSH portu; 22 ise boş bırakın |
| `SUNUCU_DIZIN` | `/opt/sahra` ise boş bırakın |

> Özel anahtarı e-postayla, mesajla ya da bir dosya paylaşım servisiyle
> göndermeyin. GitHub sır alanına yapıştırıldıktan sonra kimse (siz
> dahil) bir daha okuyamaz; kaybederseniz yenisini üretip açık anahtarı
> değiştirirsiniz.

### 10.3 İlk çalıştırma

Sırları girdikten sonra **Actions → Dağıt → Run workflow** ile elle bir
kez çalıştırın. Akış şunları yapar:

1. `npm ci`, tip denetimi, lint ve birim testleri
2. `VITE_SUNUCU_MODU=1` ile derleme (demo kipinde açılmasın diye)
3. `dist/` ve `sunucu-dist/` dizinlerini `rsync` ile gönderme
4. Sunucuda `npm ci --omit=dev` ve `systemctl restart sahra`
5. `/api/health` üzerinden sağlık denetimi — servis 30 saniyede cevap
   vermezse akış kırmızı olur ve `systemctl status` çıktısını basar
6. Yeni göç varsa uyarı ve uygulanacak komutlar

Testler düşerse dağıtım **yapılmaz**; bozuk sürüm sunucuya çıkmaz.

### 10.4 Geri alma

Dağıtım bozuk bir sürüm çıkardıysa önceki işleme dönüp yeniden itmek
yeterli:

```bash
git revert <bozuk-commit>
git push
```

Veritabanı göçleri otomatik uygulanmadığı için geri alma yalnızca kodu
etkiler; veri olduğu gibi kalır.

## 11. Gelen WhatsApp mesajları müşteri adayına düşsün (isteğe bağlı)

Instagram'dan gelip WhatsApp'a yazan kişi `Panel → Müşteri Adayları`
listesine kendiliğinden düşer. Mesajın aslı kayıtta durur, telefon
numarası on haneye indirgenir ve aynı kişinin ikinci mesajı yeni kayıt
açmaz, mevcut kaydın altına yazılır.

**ÜCRET YOK.** Mesaj *almak* için Meta'ya ödeme yapılmaz ve erişim jetonu
bile gerekmez: `WHATSAPP_ACCESS_TOKEN` ile `WHATSAPP_PHONE_NUMBER_ID`
yalnızca sunucudan mesaj *göndermek* için lazım. Personel cevabı
`Panel → Müşteri Adayları → WhatsApp'ta Aç` düğmesinden, kendi
telefonundan yazarsa gönderme ücreti de doğmaz.

**NUMARA SEÇİMİ — geri dönüşü zahmetli.** Cloud API'ye bağlanan numara
telefondaki WhatsApp ve WhatsApp Business uygulamalarından **düşer**; o
numaranın mesajlarına artık yalnızca panelden bakılır. Personelin günlük
kullandığı hat bağlanırsa telefondan yazışma imkânı kalmaz. Bağlantı
için ayrı bir hat açmak daha güvenlidir.

### 11.1 Önce mock modla deneyin (Meta'sız)

Meta tarafına dokunmadan boru hattının tamamı denenebilir: numara
bağlamadan, jeton almadan.

```bash
# /etc/sahra.env
WHATSAPP_MOCK_MODE=true
```

```bash
sudo systemctl restart sahra
```

Panelde oturum açın ve `/api/whatsapp-test` ucuna bir örnek mesaj
gönderin; aynı çözümleyiciden geçip `Müşteri Adayları` listesinde
görünmelidir. Uç nokta **oturum ister** ve yalnızca mock mod açıkken
çalışır.

Gerçek webhook'un imza doğrulaması bundan etkilenmez: mock mod açık diye
imzasız bildirim kabul edilseydi, unutulan bir ayar üretimde herkesin
sahte talep yazabildiği bir kapı bırakırdı. Yine de deneme bitince
kapatın:

```bash
WHATSAPP_MOCK_MODE=false
```

### 11.2 Meta tarafı

1. [Meta for Developers](https://developers.facebook.com/) üzerinde
   uygulama açın, **WhatsApp** ürününü ekleyin.
2. Numarayı WhatsApp Business hesabına bağlayıp doğrulayın.
3. Webhook adresi: `https://<alan-adiniz>/api/whatsapp`
   (`/api/webhooks/whatsapp` de aynı işleyiciye gider).
   **Verify token** alanına uzun ve rastgele bir dize yazın.
   `messages` alanına abone olun.
4. Aynı dizeyi sunucuda `WHATSAPP_VERIFY_TOKEN`, uygulamanın
   **App Secret** değerini `WHATSAPP_APP_SECRET` olarak tanımlayın.

```bash
# /etc/sahra.env -- sudo chmod 600
WHATSAPP_VERIFY_TOKEN=<Meta panelinde yazdığınız dize>
WHATSAPP_APP_SECRET=<Meta uygulamasının App Secret değeri>
```

İkisi de **sunucuda kalır**; tarayıcıya gönderilmez, Git'e girmez.
`WHATSAPP_APP_SECRET` gelen her bildirimin imzasını doğrular — o olmadan
adresi bilen herkes sahte müşteri adayı yazabilirdi.

### 11.3 Numarayı işletmeye bağlayın

Son adım panelde: **WhatsApp Ayarları** ekranında Meta'nın verdiği
**Phone number ID** değerini girin. Bu eşleme olmadan gelen mesaj
kaydedilmez — hangi işletmeye ait olduğu bilinmeyen satır, kimsenin
göremeyeceği bir kayıt olurdu.

Aynı ekrandan otomatik karşılama ve mesai dışı mesajı da açılır.

### 11.4 Çalıştığını doğrulayın

Bağlı numaraya başka bir telefondan mesaj atın. Birkaç saniye içinde
`Panel → Müşteri Adayları` listesinde görünmeli.

| Belirti | Olası sebep |
|---|---|
| Meta "doğrulama başarısız" diyor | `WHATSAPP_VERIFY_TOKEN` panelde yazdığınızla birebir aynı değil |
| Mesaj geliyor ama liste boş | Phone number ID eşlemesi yapılmamış (11.3) |
| Günlükte imza hatası | `WHATSAPP_APP_SECRET` yanlış ya da tanımsız |
| `404` dönüyor | Adres yanlış; `/api/whatsapp` olmalı |

## 12. Yönetici bildirimleri WhatsApp'tan (isteğe bağlı)

Ödeme uyarıları SMS yerine WhatsApp'tan gidebilir; mesajlar yöneticinin
telefonunda o sohbette kalıcı olarak birikir ve Meta'ya ücret ödenmez.

**AYRI BİR NUMARA GEREKİR.** Meta'nın kuralı: bir numara Cloud API ile
WhatsApp uygulamasında aynı anda kullanılamaz. Müşteri adaylarını
yakalayan numara Cloud API'ye kayıtlıysa bu yol için ikinci bir hat
alınmalıdır.

**RİSK.** Otomatik gönderim WhatsApp'ın kullanım şartlarına aykırıdır ve
numara banlanabilir. Sistem riski şöyle sınırlıyor: yalnızca yönetici
bildirimleri bu yoldan gider (müşteriye giden hiçbir mesaj geçmez),
gönderimler arasına bekleme konur, günlük tavan kanaldan bağımsız
uygulanır. Ban gelirse yalnızca bu ikinci numara etkilenir; müşteri
iletişim numarası etkilenmez ve bildirimler SMS'ten gitmeye devam eder.

```bash
# /etc/sahra.env
WHATSAPP_WEB_ETKIN=1
WHATSAPP_WEB_OTURUM=/var/lib/sahra/whatsapp-oturum
```

```bash
sudo mkdir -p /var/lib/sahra/whatsapp-oturum
sudo chown www-data:www-data /var/lib/sahra/whatsapp-oturum
sudo chmod 700 /var/lib/sahra/whatsapp-oturum
```

Eşleştirme bir kerelik ve SSH'den yapılır:

```bash
cd /opt/sahra
sudo -u www-data --preserve-env=WHATSAPP_WEB_ETKIN,WHATSAPP_WEB_OTURUM \
  node sunucu-dist/sunucu/whatsapp-esle.js
```

Terminalde bir QR çıkar. İkinci telefondan **WhatsApp > Ayarlar > Bağlı
cihazlar > Cihaz bağla** ile okutun. "BAĞLANDI" yazdığında oturum diske
yazılmıştır; sunucu bundan sonra kendisi bağlanır.

> **QR panelde neden yok?** O kare, WhatsApp hesabına cihaz bağlama
> yetkisi verir: gören herkes hesabı kendi cihazına bağlayabilir.
> Tarayıcıya açılan bir uç nokta olsaydı yetkilendirmede yapılacak tek
> bir hata hesabın devredilmesi demekti.

Son adım panelde: **Ödeme Bildirimleri** ekranında ilgili yöneticinin
kanalını `WhatsApp` yapın. Kanalı `SMS` kalanlar eskisi gibi SMS alır.

Oturum dizini **hesabın kendisidir**: eline geçen kişi o WhatsApp
hesabından mesaj atabilir. Dizin 0700 olmalı, yedeğe ve Git'e girmemeli.

Oturum düşerse (telefondan "bağlı cihaz" kaldırılırsa ya da uzun süre
çevrimdışı kalırsa) bildirimler otomatik olarak SMS'e döner; eşleştirme
komutunu yeniden çalıştırmak yeterlidir.

## Sorun giderme

| Belirti | Olası sebep |
|---|---|
| Giriş oluyor ama her liste boş | `JWT_SECRET` uygulamada ve PostgREST'te farklı |
| "permission denied for table ..." | `0021` göçü uygulanmamış |
| Site açılıyor ama veriler kaybolmuyor/kaydolmuyor | `VITE_SUNUCU_MODU=1` yok, demo kipindesiniz |
| `/api/*` 404 veriyor | `sahra` servisi çalışmıyor (`systemctl status sahra`) |
| Giriş 500 veriyor | `/etc/sahra.env` okunamıyor ya da `JWT_SECRET` kısa (< 32) |
| Yedek alınmıyor | `YEDEK_DIZINI` yok ya da `www-data` yazamıyor |
| Takvimde bayram/kandil görünmüyor | `/api/ozel-gunler` görevi henüz çalışmadı (ayın 2'si) ya da sunucudan dışarı çıkış kapalı |
| Dağıtım "Permission denied (publickey)" | Açık anahtar `dagitim` kullanıcısına eklenmemiş ya da `SUNUCU_KULLANICI` yanlış |
| Dağıtım `systemctl restart` adımında düşüyor | `/etc/sudoers.d/dagitim` yok ya da komut yolu farklı (`which systemctl`) |
| Dağıtım geçti ama site eski | Tarayıcı önbelleği; sert yenileyin. Sürmüyorsa `systemctl status sahra` |
| Dağıtım sonrası "permission denied for table ..." | Yeni göç uygulanmamış; iş akışı özetindeki komutları çalıştırın |

Günlükler:

```bash
sudo journalctl -u sahra -f
sudo journalctl -u postgrest -f
```
