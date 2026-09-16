/**
 * Demo hesabını GERÇEK veritabanına kurar.
 *
 * Giriş ekranı demo hesabının bilgilerini herkese gösteriyor. Tanıtım
 * kipinde o hesabın verisi tarayıcıda üretiliyordu; veritabanı bağlanınca
 * tarayıcı deposu hiç devreye girmiyor ve hesabın karşılığı kalmıyor. Bu
 * araç aynı veriyi veritabanındaki ayrı bir demo kullanıcısına yazıyor.
 *
 * Kullanım:
 *   DATABASE_URL='postgres://...' npm run demo-hesap -- --ws
 *
 * TEKRAR ÇALIŞTIRILABİLİR. Demo herkese açık ve HERKES YAZABİLİYOR;
 * zamanla bozulması kaçınılmaz. Bu yüzden araç önce demo kullanıcısını
 * siliyor (şema `on delete cascade` ile bağlı, tek satır bütün demo
 * verisini götürüyor), sonra sıfırdan yazıyor. Yani aynı komut hem
 * kurulum hem sıfırlama.
 *
 * VERİ İKİNCİ KEZ YAZILMIYOR. Kayıtlar `src/lib/seed.ts` içindeki
 * `demoVeriSeti()` fonksiyonundan geliyor -- tarayıcı demosunun kullandığı
 * veri setinin ta kendisi. İkinci bir set tutulsaydı ikisi zamanla
 * ayrışırdı.
 *
 * SÜTUNLAR ŞEMADAN OKUNUYOR. Yirmi üç tablo için elle INSERT yazmak
 * yerine hedef tablonun sütunları `information_schema` üzerinden
 * okunuyor ve alan adları camelCase -> snake_case çevriliyor. Karşılığı
 * OLMAYAN alanlar sessizce yutulmuyor, ekrana yazılıyor: sessiz yutma
 * "ekranda boş sütun" olarak çok sonra fark edilirdi.
 */
import type { Client as PgClient } from 'pg';
import { adres, istemciAc } from './_baglanti.js';
import { randomUUID } from 'node:crypto';

import { demoVeriSeti, DEMO_CREDENTIALS } from '../src/lib/seed.js';
import { sifreyiKarmala } from '../api/_kimlik.js';

const websocket = process.argv.includes('--ws');

/** Depo anahtarı -> veritabanı tablosu. Sıra yabancı anahtar sırası. */
const TABLOLAR: [string, string][] = [
  ['businesses', 'businesses'],
  ['halls', 'halls'],
  ['menus', 'menus'],
  ['vendors', 'vendors'],
  ['reservations', 'reservations'],
  ['payments', 'payments'],
  ['dugun-ici-giderler', 'reservation_expenses'],
  ['resVendors', 'reservation_vendors'],
  ['tasks', 'event_tasks'],
  ['cashflow', 'cash_flow'],
  ['musteri-adaylari', 'customer_leads'],
  ['aday-mesajlari', 'customer_lead_messages'],
  ['aday-durum-gecmisi', 'customer_lead_status_history'],
  ['invoices', 'invoices'],
  ['ozel-gunler', 'special_days'],
  ['sms', 'sms_log'],
  ['consents', 'sms_consents'],
  ['queue', 'sms_queue'],
  ['odeme-olaylari', 'payment_events'],
  ['odeme-bildirim-alicilari', 'payment_alert_recipients'],
  ['hizli-yanitlar', 'quick_replies'],
  ['hata-bildirimleri', 'error_reports'],
  ['whatsapp-hesaplari', 'whatsapp_accounts'],
];

function yilan(ad: string): string {
  return ad.replace(/[A-Z]/g, (h) => `_${h.toLowerCase()}`);
}

interface Sutun { ad: string; tur: string }

/** Tablonun sütun adları ve türleri. */
async function sutunlar(
  sorgu: PgClient['query'], tablo: string,
): Promise<Map<string, Sutun>> {
  const { rows } = await sorgu(
    `select column_name, data_type from information_schema.columns
      where table_schema = 'public' and table_name = $1`,
    [tablo],
  ) as { rows: { column_name: string; data_type: string }[] };
  return new Map(rows.map((r) => [r.column_name, { ad: r.column_name, tur: r.data_type }]));
}

/**
 * Tohumdaki metin kimlikleri ('biz_demo') veritabanı uuid'lerine bağlar.
 *
 * Şemadaki kimlik sütunları `uuid`; tohumun okunur metin kimlikleri
 * doğrudan yazılamıyor. Önce BÜTÜN kayıtların kimlikleri taranıp birer
 * uuid veriliyor, sonra alanlardaki referanslar bu haritadan çevriliyor.
 * Tek geçişte yapılsaydı henüz görülmemiş bir kayda yapılan referans
 * (ödeme, rezervasyondan önce okunursa) boşa düşerdi.
 */
function kimlikHaritasi(
  veri: [string, unknown][], sahipKimligi: string,
): Map<string, string> {
  const harita = new Map<string, string>([['user_demo', sahipKimligi]]);
  for (const [, deger] of veri) {
    if (!Array.isArray(deger)) continue;
    for (const kayit of deger as Record<string, unknown>[]) {
      const kimlik = kayit?.id;
      if (typeof kimlik === 'string' && !harita.has(kimlik)) harita.set(kimlik, randomUUID());
    }
  }
  return harita;
}

function cevir(deger: unknown, harita: Map<string, string>): unknown {
  if (typeof deger === 'string') return harita.get(deger) ?? deger;
  if (Array.isArray(deger)) return deger.map((d) => cevir(d, harita));
  return deger;
}

/** Metin türü olmayan sütunlarda boş metin NULL demek. */
const METIN_OLMAYAN = new Set([
  'date', 'timestamp with time zone', 'timestamp without time zone', 'time without time zone',
  'numeric', 'integer', 'bigint', 'smallint', 'double precision', 'real', 'uuid', 'boolean',
]);

/**
 * Değeri sütunun türüne uyduruyor.
 *
 * Tanıtım verisi "bilinmiyor" için BOŞ METİN kullanıyor (`eventDate: ''`
 * yanında `eventDateText: 'Mayısın ilk haftası'`). Tarayıcı deposunda bu
 * sorun değil; `date` sütununa gidince "invalid input syntax for type
 * date" ile duruyor. Doğru karşılık NULL -- veri kaybı değil, aynı
 * bilginin veritabanındaki hâli.
 */
function degeriUydur(deger: unknown, tur: string): unknown {
  if (tur === 'jsonb' || tur === 'json') return JSON.stringify(deger);
  if (deger === '' && METIN_OLMAYAN.has(tur)) return null;
  return deger;
}

/**
 * Kayıt kimliği -> ait olduğu işletme.
 *
 * Bazı tablolar `business_id`'yi zorunlu tutuyor (`not null`) ama tanıtım
 * verisindeki karşılık alanı taşımıyor: aday durum geçmişi yalnızca
 * `leadId` tutuyor, işletmeyi adaydan devralıyor. Veritabanı bu alanı
 * sorguyu hızlandırmak ve RLS'i tek tabloya bakarak kurmak için
 * kopyalıyor; kopyayı burada doldurmak gerekiyor.
 */
function isletmeHaritasi(veri: [string, unknown][]): Map<string, string> {
  const harita = new Map<string, string>();
  for (const [, deger] of veri) {
    if (!Array.isArray(deger)) continue;
    for (const kayit of deger as Record<string, unknown>[]) {
      const kimlik = kayit?.id;
      const isletme = kayit?.businessId;
      if (typeof kimlik === 'string' && typeof isletme === 'string') harita.set(kimlik, isletme);
    }
  }
  return harita;
}

interface Rapor { tablo: string; yazilan: number; atlanan: string[] }

async function tabloyuYaz(
  sorgu: PgClient['query'], tablo: string,
  kayitlar: Record<string, unknown>[], harita: Map<string, string>,
  isletmeler: Map<string, string>, anaIsletme: string, sahip: string,
): Promise<Rapor> {
  const sema = await sutunlar(sorgu, tablo);
  if (sema.size === 0) throw new Error(`Tablo bulunamadı: public.${tablo}`);
  const atlanan = new Set<string>();
  let yazilan = 0;

  for (const ham0 of kayitlar) {
    /*
      Eksik `business_id` referans verilen kayıttan devralınıyor. Alan
      zorunlu olduğu için boş bırakmak kaydı tamamen düşürürdü.
    */
    const kayit = { ...ham0 };
    if (sema.has('business_id') && kayit.businessId === undefined) {
      const referans = Object.entries(kayit).find(
        ([alan, deger]) => alan.endsWith('Id') && typeof deger === 'string'
          && isletmeler.has(deger),
      );
      /*
        Referans yoksa ana işletmeye düşüyor. SMS kuyruğu gibi kayıtlar
        yalnızca telefon tutuyor, bağlı olduğu kaydı göstermiyor; alan
        zorunlu olduğu için boş bırakmak kaydı tümden düşürürdü.
      */
      kayit.businessId = referans
        ? isletmeler.get(referans[1] as string)
        : anaIsletme;
    }
    /*
      Bazı tablolar kaydı doğrudan HESABA bağlıyor (`owner_id`), işletmeye
      değil: hata bildirimi hangi işletmede açıldığından bağımsız olarak
      hesabın sahibine ait. Tanıtım verisi bu alanı taşımıyor.
    */
    if (sema.has('owner_id') && kayit.ownerId === undefined) kayit.ownerId = sahip;

    const adlar: string[] = [];
    const degerler: unknown[] = [];
    for (const [alan, ham] of Object.entries(kayit)) {
      if (ham === undefined) continue;
      const sutun = sema.get(yilan(alan));
      if (!sutun) { atlanan.add(alan); continue; }
      /*
        Kimlik sütunu her tabloda uuid DEĞİL. `payment_events.id` otomatik
        artan bir `bigint`; oraya uuid yazmaya çalışmak kaydı düşürüyor.
        Bu tablolarda kimliği veritabanı üretiyor -- referans veren
        kayıtları da zaten haritadan değil, veritabanından okunan
        değerlerden almıyoruz (bu tablolara kimse referans vermiyor).
      */
      if (alan === 'id' && sutun.tur !== 'uuid') continue;
      /*
        Kimlik benzeri alanlar haritadan geçiyor. Yalnızca `id` ve `*Id`
        değil, dizi içindeki kimlikler de (`services` değil ama
        `vendorIds` gibi) çevriliyor; `cevir` haritada olmayan değere
        dokunmuyor, dolayısıyla düz metinler bozulmuyor.
      */
      const deger = cevir(ham, harita);
      adlar.push(sutun.ad);
      degerler.push(degeriUydur(deger, sutun.tur));
    }
    if (adlar.length === 0) continue;
    const yer = adlar.map((_, i) => `$${i + 1}`).join(', ');
    /*
      Sütun adları TIRNAK içinde. `sms_log.to` gibi adlar SQL'de ayrılmış
      sözcük; tırnaksız yazıldığında "syntax error at or near \"to\"" ile
      duruyor ve hata sütunu değil satırı işaret ettiği için sebebi
      görünmüyor.
    */
    const sutunAdlari = adlar.map((a) => `"${a}"`).join(', ');
    try {
      await sorgu(
        `insert into public.${tablo} (${sutunAdlari}) values (${yer})
           on conflict do nothing`,
        degerler,
      );
    } catch (e) {
      /*
        Hata HANGİ TABLO ve HANGİ KAYIT diye söylemeli. Çıplak mesaj
        ("Tedarikçi bu işletmeye ait değil") yirmi üç tablo içinde
        aranacak bir ipucu bırakmıyordu.
      */
      const mesaj = e instanceof Error ? e.message : String(e);
      throw new Error(
        `public.${tablo} yazılamadı: ${mesaj}\n`
        + `  Kayıt: ${JSON.stringify(kayit).slice(0, 300)}`,
      );
    }
    yazilan += 1;
  }
  return { tablo, yazilan, atlanan: [...atlanan] };
}

async function main(): Promise<void> {
  const istemci = await istemciAc(adres('demo-hesap'), websocket);
  const sorgu = istemci.query.bind(istemci) as PgClient['query'];
  try {
    /*
      ÖNCE SİLİNİYOR. `auth.users` satırı gidince profil, işletme ve
      altındaki her şey `on delete cascade` ile birlikte gidiyor. Demo
      herkese açık olduğu için bozulmuş veriyi düzeltmeye çalışmak
      yerine baştan yazmak hem kısa hem kesin.
    */
    /*
      FATURALAR AYRI SİLİNİYOR. Şema faturayı işletmeye `cascade` ile
      bağlamıyor: VUK saklama yükümlülüğü yüzünden bir işletme silinince
      faturaların kendiliğinden gitmesi İSTENMİYOR. Demo hesabı o kuralın
      istisnası -- gerçek bir mükellefin defteri değil -- ama kısıt haklı
      olarak yolu kapatıyor, bu yüzden açıkça temizleniyor.
    */
    await sorgu(
      `delete from public.invoices where business_id in (
         select b.id from public.businesses b
           join public.profiles p on p.id = b.owner_id
          where lower(p.email) = lower($1))`,
      [DEMO_CREDENTIALS.email],
    );
    const { rowCount } = await sorgu(
      'delete from auth.users where lower(email) = lower($1)',
      [DEMO_CREDENTIALS.email],
    );
    if (rowCount) console.log(`Eski demo hesabı silindi (${rowCount} kayıt).`);

    const veri = demoVeriSeti();
    const sozluk = new Map(veri);
    const kullanicilar = (sozluk.get('users') ?? []) as Record<string, unknown>[];
    const sahipKaydi = kullanicilar.find((k) => k.role === 'owner');
    if (!sahipKaydi) throw new Error('Tohumda sahip kullanıcı yok.');

    /*
      Profil alanları `p_meta` ile veriliyor: `auth.users` satırı açılınca
      0001'deki tetikleyici `profiles` satırını bu alanlardan kuruyor.
      Ayrı bir UPDATE yazılsaydı aynı işi yapan ikinci bir yol olurdu ve
      tetikleyici değiştiğinde ikisi ayrışırdı.
    */
    const meta = {
      company_name: sahipKaydi.companyName, full_name: sahipKaydi.fullName,
      mobile: sahipKaydi.mobile, city: sahipKaydi.city, district: sahipKaydi.district,
      category: sahipKaydi.category, capacity: sahipKaydi.capacity,
      currency: sahipKaydi.currency,
    };
    const karma = await sifreyiKarmala(DEMO_CREDENTIALS.password);
    const { rows } = await sorgu(
      'select public.kullanici_ac($1, $2, $3::jsonb) as kimlik',
      [DEMO_CREDENTIALS.email, karma, JSON.stringify(meta)],
    ) as { rows: { kimlik: string }[] };
    const sahip = rows[0]!.kimlik;
    console.log(`Demo kullanıcısı açıldı: ${DEMO_CREDENTIALS.email}`);

    const harita = kimlikHaritasi(veri, sahip);
    const isletmeler = isletmeHaritasi(veri);
    const anaIsletme = String(sahipKaydi.activeBusinessId ?? '');

    const raporlar: Rapor[] = [];
    for (const [anahtar, tablo] of TABLOLAR) {
      const kayitlar = (sozluk.get(anahtar) ?? []) as Record<string, unknown>[];
      if (!Array.isArray(kayitlar) || kayitlar.length === 0) continue;
      raporlar.push(await tabloyuYaz(sorgu, tablo, kayitlar, harita, isletmeler, anaIsletme, sahip));
    }

    /*
      Aktif işletme ve yetkiler tetikleyicinin kapsamı dışında; işletme
      satırı yazıldıktan SONRA veriliyor, çünkü sütun `businesses`e
      yabancı anahtarla bağlı.
    */
    const aktif = harita.get(String(sahipKaydi.activeBusinessId ?? ''));
    await sorgu(
      'update public.profiles set active_business_id = $2, permissions = $3 where id = $1',
      [sahip, aktif ?? null, sahipKaydi.permissions ?? null],
    );

    console.log('\nYazılan kayıtlar:');
    for (const r of raporlar) {
      console.log(`  ${r.tablo.padEnd(30)} ${String(r.yazilan).padStart(4)}`
        + (r.atlanan.length ? `   ATLANAN ALANLAR: ${r.atlanan.join(', ')}` : ''));
    }
  } finally {
    await istemci.end();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
