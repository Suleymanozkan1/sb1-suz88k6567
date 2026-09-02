# Yedekleme ve Geri Yükleme Prosedürü

> **Test edilmemiş yedek, yedek değildir.** Bu prosedürü yılda en az iki kez
> baştan sona uygulayın; yalnızca okumuş olmak yeterli değildir.

## 1. Yedekleme nasıl çalışır?

Üç bağımsız katman vardır. Biri başarısız olsa dahi diğerleri devrededir.

| Katman | Kim yapar | Sıklık | Nerede durur |
|--------|-----------|--------|--------------|
| **Sağlayıcı yedeği** | Supabase (otomatik) | Günlük | Supabase altyapısı |
| **Uygulama yedeği** | `api/backup.ts` (cron) | Her gece 02:30 | Supabase Storage → `yedekler` kovası |
| **Elle yedek** | Siz | İstediğiniz zaman | Kendi bilgisayarınız |

Sağlayıcı yedeği tek başına yeterli değildir: hesaba erişimi kaybederseniz
ya da proje yanlışlıkla silinirse o yedeklere de ulaşamazsınız. Bu yüzden
**ayda bir elle yedek indirip kendi bilgisayarınızda saklayın.**

## 2. Kurulum (bir kez yapılır)

1. Supabase → **Storage** → **New bucket**
   - İsim: `yedekler`
   - **Public bucket: KAPALI** (yedekler herkese açık olmamalı)
2. Vercel → Settings → Environment Variables:
   ```
   CRON_SECRET=<openssl rand -hex 32 çıktısı>
   BACKUP_BUCKET=yedekler
   SUPABASE_SERVICE_ROLE_KEY=<Supabase → Settings → API → service_role>
   ```
3. Dağıtımdan sonra panelde **Sistem Durumu** ekranını açın. Ertesi gün
   "Son başarılı yedek" satırının dolduğunu doğrulayın.

## 3. Elle yedek alma

Panel → **Sistem Durumu** → **Yedeği indir (JSON)**

İnen dosya: `duguntakip-yedek-YYYY-AA-GG.json`

İçindekiler: işletmeler, rezervasyonlar, tahsilatlar, gelir/gider kayıtları,
SMS izinleri, SMS kayıtları, renk ayarları ve kullanıcı profilleri.

> Dosya müşteri adı ve telefon numarası içerir. Şifrelenmemiş bir bulut
> klasöründe ya da paylaşılan bir diskte saklamayın.

## 4. Geri yükleme

### 4.1 Hangi durumda hangi yöntem?

| Durum | Yöntem |
|-------|--------|
| Yanlışlıkla birkaç kayıt silindi | Supabase → Database → **Point in Time Recovery** |
| Tablo bozuldu / toplu hatalı güncelleme | Supabase günlük yedeği geri yükle |
| Supabase projesi tamamen kaybedildi | **Aşağıdaki JSON geri yükleme** |

### 4.2 JSON yedekten geri yükleme

Yeni bir Supabase projesi açtıktan sonra:

**Adım 1 — Şemayı kur**

```bash
psql "$DATABASE_URL" -f supabase/migrations/0001_init.sql
psql "$DATABASE_URL" -f supabase/migrations/0002_security.sql
psql "$DATABASE_URL" -f supabase/migrations/0003_iys_queue.sql
psql "$DATABASE_URL" -f supabase/migrations/0004_backup_health.sql
```

**Adım 2 — Kullanıcı hesaplarını yeniden oluştur**

Kimlik doğrulama kayıtları (`auth.users`) yedeğe dahil değildir; şifreler
yedeğe konmaz. Supabase → Authentication → Users bölümünden hesapları
yeniden açın. **Yeni kullanıcı kimliklerini (UUID) not edin.**

**Adım 3 — Veriyi yükle**

Yedek dosyasını sunucuya kopyalayın ve aşağıdaki betiği çalıştırın.
`<ESKI_ID>` / `<YENI_ID>` ile eski kullanıcı kimliğini yenisiyle eşleyin.

```sql
\set backup `cat duguntakip-yedek-2026-09-01.json`

begin;

create temporary table _yedek (veri jsonb);
insert into _yedek values (:'backup'::jsonb);

-- Kullanıcı kimliği değiştiyse eşleme yapılır
create temporary table _eslesme (eski uuid, yeni uuid);
insert into _eslesme values ('<ESKI_ID>', '<YENI_ID>');

insert into public.businesses
select * from jsonb_populate_recordset(null::public.businesses,
  (select veri -> 'isletmeler' from _yedek));

update public.businesses b set owner_id = m.yeni
from _eslesme m where b.owner_id = m.eski;

insert into public.reservations
select * from jsonb_populate_recordset(null::public.reservations,
  (select veri -> 'rezervasyonlar' from _yedek));

insert into public.payments
select * from jsonb_populate_recordset(null::public.payments,
  (select veri -> 'tahsilatlar' from _yedek));

insert into public.cash_flow
select * from jsonb_populate_recordset(null::public.cash_flow,
  (select veri -> 'kasa' from _yedek));

insert into public.sms_consents
select * from jsonb_populate_recordset(null::public.sms_consents,
  (select veri -> 'sms_izinleri' from _yedek));

insert into public.color_settings
select * from jsonb_populate_recordset(null::public.color_settings,
  (select veri -> 'renk_ayarlari' from _yedek));

commit;
```

**Adım 4 — Doğrula**

```sql
-- Satır sayıları yedektekiyle aynı olmalı
select public.backup_row_counts('<YENI_ID>');

-- Parasal toplam kontrolü
select sum(total_amount) as toplam, sum(deposit) as kaparo
from public.reservations;

-- İlişkisel bütünlük: sahipsiz tahsilat olmamalı
select count(*) as sahipsiz_tahsilat from public.payments p
where not exists (select 1 from public.reservations r where r.id = p.reservation_id);
```

Son sorgu **0** dönmelidir.

**Adım 5 — Profilleri güncelle**

```sql
update public.profiles
set active_business_id = (select id from public.businesses limit 1)
where id = '<YENI_ID>';
```

Ardından panele giriş yapıp rezervasyon listesini ve bakiyeleri gözle kontrol edin.

## 5. Prosedürün doğrulanması

Yedek → geri yükleme döngüsü otomatik testlerle doğrulanmıştır:

```bash
psql -d <test_db> -f supabase/tests/04_backup_restore_test.sql
```

Bu test yedeği **temiz bir şemaya gerçekten geri yükler** ve şunları kanıtlar:

- Satır sayıları kaynakla birebir aynı
- Parasal değerler (`numeric`) bozulmuyor
- Türkçe karakterler ve tarihler korunuyor
- Tahsilat–rezervasyon ilişkisi kopmuyor
- Yedek yalnızca kendi kapsamını içeriyor, başka hesabın verisi sızmıyor

## 6. Tatbikat takvimi

| Ne zaman | Ne yapılır |
|----------|------------|
| Ayda bir | Panelden elle yedek indir, dosyayı aç, rezervasyon sayısını gözle doğrula |
| 6 ayda bir | Ücretsiz bir Supabase projesine tam geri yükleme tatbikatı yap |
| Her büyük değişiklikten önce | Elle yedek al |

## 7. Saklama süresi

- Supabase otomatik yedekleri: planınıza göre 7–30 gün
- Storage'daki günlük JSON yedekleri: sınırsız (elle temizlenmeli)
- Elle indirilen yedekler: en az **son 12 ayı** saklayın

Storage maliyeti büyürse 90 günden eski dosyaları silin; ancak **her ayın
ilk gününe ait yedeği saklayın**.
