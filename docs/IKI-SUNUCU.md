# İki sunuculu kurulum: fatura Türkiye'de, geri kalanı yurt dışında

## Neden

Vergi Usul Kanunu, e-belgelerin ve fatura kayıtlarının Türkiye sınırları
içinde muhafaza edilmesini istiyor. Sistemin geri kalanının yurt dışında
durması isteniyorsa tek çözüm veriyi ikiye ayırmak:

| Nerede | Ne çalışır | Ne tutar |
|---|---|---|
| **Yurt dışı** | Node sunucusu, site, PostgreSQL, PostgREST, zamanlanmış görevler | Rezervasyon, müşteri, kasa, SMS, raporlar — her şey |
| **Türkiye** | Yalnızca PostgreSQL + PostgREST | `invoices`, `invoice_lines`, `invoice_series` |

Kullanıcı açısından fark yok: tek adres, tek giriş, tek ekran. Ayrım
sunucunun içinde, tek bir dosyada: `sunucu/veri-yonlendirme.ts`.

**Bölme zorunlu değil.** `PGRST_FATURA_URL` boş bırakılırsa hiçbir ayrım
yapılmaz ve her şey tek veritabanında kalır. Kodda değişiklik
gerekmiyor; sonradan ayırmak ya da birleştirmek yalnızca bu değişkenin
meselesi.

## Nasıl çalışıyor

Tarayıcı PostgREST ile doğrudan konuşmuyor; bütün veri istekleri Node
sunucusunun `/veri/*` yolundan geçiyor. Ayrım oraya konuldu:

```
tarayıcı ──▶ /veri/reservations ──▶ PGRST_URL          (yurt dışı)
tarayıcı ──▶ /veri/invoices     ──▶ PGRST_FATURA_URL   (Türkiye)
```

Aynı karar sunucu içi `service_role` çağrıları için de geçerli
(`api/_db.ts`): fatura uç noktası ve fatura ekranı aynı veritabanına
bakmak zorunda.

Türkiye'ye giden kaynakların listesi `FATURA_KAYNAKLARI` sabitinde. Tam
ad karşılaştırılıyor, ön ek değil: ileride eklenecek bir
`invoices_arsiv` tablosu yanlışlıkla Türkiye'ye düşmesin diye.

## Yetki neden iki tarafta

Fatura tablolarının RLS politikaları `owns_business()` ve
`has_permission()` üzerinden çalışıyor; o iki fonksiyon `profiles` ve
`businesses` tablolarına bakıyor. Türkiye tarafında bu tablolar
olmasaydı RLS'i kapatmak ya da yetkiyi uygulama katmanına indirmek
gerekirdi — ikisi de güvenlik sınırını kaldırırdı.

Bu yüzden Türkiye tarafında iki tablonun **kopyası** duruyor. Kopyalar:

* Mantıksal çoğaltma ile besleniyor (aşağıda), oradan yazılmıyor.
* Yalnızca yetkiye giren sütunları taşıyor. Müşteri adı, telefon, adres
  gibi kişisel veriler kopyalanmıyor.
* Tarayıcıya kapalı (`revoke all ... from anon, authenticated`). RLS
  fonksiyonları `security definer` olduğu için okuma yetkisine gerek yok.

## `JWT_SECRET` iki tarafta AYNI olmalı

Giriş yurt dışı sunucusunda yapılıyor; Türkiye'deki veritabanı yalnızca
orada imzalanmış jetonu **doğruluyor**. Sırlar farklı olursa fatura
ekranı boş gelir ve sebebi görünmez.

Bu, sırrın iki yerde durması demek. `service_role` jetonu mintleyebildiği
için ikisinde de dosya izni `0600` ve yalnızca servis kullanıcısına ait
olmalı.

## Kurulum

### 1. Türkiye sunucusu

PostgreSQL ve PostgREST'i `docs/KURULUM.md` bölüm 3-4'teki gibi kurun.
Ardından ana göçler **yerine** yalnızca fatura şemasını uygulayın:

```bash
psql -d sahra_fatura -f supabase/fatura-sunucusu/0001_fatura_sunucusu.sql
```

Doğrulama (RLS kuralları ve vergi belgesi korumaları):

```bash
psql -d sahra_fatura -f supabase/fatura-sunucusu/test_fatura_sunucusu.sql
```

PostgREST yapılandırması ana sunucudakiyle aynı, tek fark veritabanı adı:

```
db-uri = "postgres://authenticator:<sifre>@127.0.0.1:5432/sahra_fatura"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "<JWT_SECRET — ana sunucudakiyle AYNI>"
```

### 2. Ağ

Türkiye'deki PostgREST **internete açılmamalı**. Yalnızca yurt dışı
sunucusu erişebilmeli:

```bash
# Türkiye sunucusunda
ufw allow from <yurtdisi_sunucu_ip> to any port 3000 proto tcp
ufw deny 3000
```

İki sunucu arasındaki trafik şifreli olmalı. En basit yol WireGuard:
PostgREST yalnızca tünel arayüzünü dinler, `PGRST_FATURA_URL` tünel
adresini gösterir. Alternatif, Türkiye tarafına TLS sonlandıran bir ters
vekil koymak.

### 3. Yetki kopyalarının çoğaltılması

Önce ana sunucuda mantıksal çoğaltmayı açın. Varsayılan `wal_level`
(`replica`) yetmiyor; yayın oluşturulur ama hiçbir değişiklik akmaz ve
bu yalnızca bir uyarı olarak görünür:

```bash
# /etc/postgresql/16/main/postgresql.conf
wal_level = logical
```

```bash
sudo systemctl restart postgresql
psql -c "show wal_level"        # logical yazmalı
```

Ardından yayın:

```sql
-- YALNIZCA yetkiye giren sütunlar yayınlanıyor: müşteri adı, telefon ve
-- adres Türkiye'ye kopyalanmasın.
create publication fatura_yetki
  for table public.profiles
        (id, email, full_name, role, owner_id, permissions,
         permissions_version, created_at, updated_at),
      public.businesses
        (id, owner_id, name, created_at, updated_at);
```

Türkiye sunucusunda abonelik:

```sql
create subscription fatura_yetki_abonelik
  connection 'host=<yurtdisi_ip> port=5432 dbname=sahra user=cogaltma password=<...>'
  publication fatura_yetki;
```

`cogaltma` rolü ana sunucuda `replication` yetkisiyle açılmalı ve
`pg_hba.conf` yalnızca Türkiye sunucusunun adresine izin vermeli.

Aboneliğin çalıştığını doğrulayın:

```sql
-- Türkiye sunucusunda; ana sunucudaki kullanıcı sayısıyla eşleşmeli.
select count(*) from public.profiles;
select count(*) from public.businesses;
```

Kopyalar boş kalırsa fatura ekranı herkese boş görünür: `owns_business()`
hiçbir satır bulamaz. Belirti buysa önce `wal_level` ve abonelik
durumuna (`select * from pg_stat_subscription`) bakın.

**Çoğaltma tek yönlü.** Türkiye tarafında `profiles`/`businesses`
elle değiştirilmemeli; sonraki çoğaltma bunu ezer.

### 4. Yurt dışı sunucusu

`/etc/sahra.env` içine tek satır:

```bash
PGRST_FATURA_URL=http://10.0.0.2:3000
```

Ardından servisi yeniden başlatın. Ana veritabanına `0040` göçü de
uygulanmalı (`docs/KURULUM.md` bölüm 4'teki döngü bunu zaten yapar).

## Yedekleme

Gece görevi iki veritabanından da okuyor ve sonucu **tek dosyada**
birleştiriyor (`api/backup.ts`): `export_owner_data` yurt dışından,
`export_invoice_data` Türkiye'den. İki ayrı yedek dosyası olsaydı biri
eksik kaldığında ancak geri yükleme gününde fark edilirdi.

Ayrıca iki sunucuda da `pg_dump` almanız gerekir; JSON yedeği veritabanı
yedeğinin yerine geçmez (`docs/YEDEKLEME-VE-GERI-YUKLEME.md`).

## İzleme

`/api/health` fatura veritabanının ulaşılabilirliğini ayrıca sınıyor.
Ana veritabanı ayakta olup fatura tarafı düştüğünde sistem "uyarı"
durumuna geçiyor ve ayrıntılı çağrıda `fatura_ayri: true` ile birlikte
sebebi yazıyor. Bu kontrol olmasaydı arıza ancak fatura kesilmeye
çalışıldığında ortaya çıkardı.

Denetim ekranı da iki kaynağı birleştiriyor. Fatura tarafına
ulaşılamazsa ekran boş kalmıyor; geri kalan kayıtlar gösteriliyor ve
arıza sağlık kontrolünde raporlanıyor.

## Bu ayrımın kaldırdığı şey

Türkiye tarafında `public.reservations` yok, bu yüzden
`invoices.reservation_id` üzerinde yabancı anahtar **kurulamıyor**. Alan
sade `uuid` olarak duruyor; hangi rezervasyona ait olduğu bilgisi
korunuyor ama veritabanı bunu doğrulamıyor.

Rezervasyon silinirse tek veritabanlı kurulumda `on delete set null`
çalışırdı; burada çalışmayacak ve fatura artık var olmayan bir
rezervasyona işaret edecek. Bu **kasıtlı**: vergi belgesi, kaynağı
silindi diye değiştirilmemeli.

## KVKK

Verinin yurt dışında tutulması KVKK madde 9 kapsamında yurt dışına
aktarımdır. Türkiye'nin hiçbir ülke için yeterlilik kararı yok — sunucu
AB'de olsa bile. Gereken:

* Standart sözleşme (Kurul'un yayımladığı metin),
* İmzadan itibaren **5 iş günü** içinde Kurul'a bildirim,
* Aydınlatma metninde aktarımın ve ülkenin belirtilmesi.

Bu belgeler yazılımın değil, işletmenin sorumluluğunda.
