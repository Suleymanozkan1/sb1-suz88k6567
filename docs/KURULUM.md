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

## 1. Temel paketler

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y postgresql nginx curl git ufw unattended-upgrades
# Güvenlik güncellemeleri kendiliğinden kurulsun
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

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

# WhatsApp (isteğe bağlı)
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
process.env.JWT_SECRET='<JWT_SECRET>';
require('./sunucu-dist/api/_kimlik.js').sifreyiKarmala('<ILK_SIFRE>').then(console.log);
"
```

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

```bash
cd /opt/sahra
git pull
npm ci
# Yeni göç geldiyse sırayla uygulayın
npm run build
sudo systemctl restart sahra
```

## Sorun giderme

| Belirti | Olası sebep |
|---|---|
| Giriş oluyor ama her liste boş | `JWT_SECRET` uygulamada ve PostgREST'te farklı |
| "permission denied for table ..." | `0021` göçü uygulanmamış |
| Site açılıyor ama veriler kaybolmuyor/kaydolmuyor | `VITE_SUNUCU_MODU=1` yok, demo kipindesiniz |
| `/api/*` 404 veriyor | `sahra` servisi çalışmıyor (`systemctl status sahra`) |
| Giriş 500 veriyor | `/etc/sahra.env` okunamıyor ya da `JWT_SECRET` kısa (< 32) |
| Yedek alınmıyor | `YEDEK_DIZINI` yok ya da `www-data` yazamıyor |

Günlükler:

```bash
sudo journalctl -u sahra -f
sudo journalctl -u postgrest -f
```
