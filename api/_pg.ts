/**
 * Doğrudan PostgreSQL erişimi (Vercel Postgres / Neon).
 *
 * NEDEN VAR. Kendi sunucumuzda araya PostgREST giriyordu: tarayıcı ona
 * konuşuyor, o da satır güvenliğini (RLS) uygulayıp SQL'i çalıştırıyordu.
 * Vercel'de PostgREST çalıştırılamıyor -- derlenmiş bir sunucu süreci ve
 * sürekli açık bir port istiyor, sunucusuz fonksiyonlarda ikisi de yok.
 * Bu modül PostgREST'in YERİNİ ALMIYOR, yalnızca onun yaptığı TEK kritik
 * işi yapıyor: isteği doğru rol ve kimlikle açıp SQL'i çalıştırmak.
 *
 * RLS YENİDEN YAZILMIYOR. Şema (supabase/migrations) kendi rollerini ve
 * `auth.uid()` fonksiyonunu kendisi kuruyor; politikalar herhangi bir
 * PostgreSQL'de aynen çalışıyor. İzolasyonu TypeScript'te yeniden
 * kurmak -- "bu salon şu satırları görebilir" kontrolünü elle yazmak --
 * en tehlikeli yol olurdu: tek bir unutulan `where` bir salonun
 * cirosunu başkasına gösterir. Burada o kontrol veritabanında kalıyor
 * ve mevcut SQL test paketleri onu doğrulamaya devam ediyor.
 *
 * BAĞLANTI `pg` ÜZERİNDEN, Neon'un HTTP sürücüsüyle değil. HTTP sürücüsü
 * tek ifadelik çağrılar için hızlı ama oturum durumu tutmuyor; buradaki
 * çalışma biçimi "rolü ayarla, kimliği ayarla, sorguyu çalıştır"ın aynı
 * işlem içinde olmasını gerektiriyor. `pg` hem Vercel'de hem geliştirme
 * makinesindeki PostgreSQL'de aynı kodla çalışıyor, yani testler gerçek
 * bir veritabanına karşı koşuyor.
 *
 * Ortam değişkeni (SUNUCUDA KALIR, tarayıcıya gitmez):
 *   DATABASE_URL   Vercel Postgres / Neon bağlantı adresi
 */
import { Pool, types, type PoolClient } from 'pg';

/*
  TARİH SÜTUNLARI METİN OLARAK OKUNUYOR.

  `pg`, `date` sütununu kendiliğinden JavaScript `Date` nesnesine
  çeviriyor; JSON'a dönüşünce "2026-05-05" yerine
  "2026-05-05T00:00:00.000Z" çıkıyor. PostgREST ise günü olduğu gibi,
  "2026-05-05" diye veriyor. Bütün uygulama PostgREST'in biçimine göre
  yazılmış: ekranlar günü metin olarak karşılaştırıyor, `<input
  type="date">` alanları bu biçimi bekliyor ve raporlar
  `new Date(`${r.date}T00:00:00`)` kuruyor -- tam damga gelince bu ifade
  "2026-05-05T00:00:00.000ZT00:00:00" oluyor ve Raporlar ekranı
  "Invalid time value" ile çöküyordu.

  İkinci ve daha sinsi sorun ZAMAN DİLİMİ: `Date` nesnesi sunucunun
  saatine göre kuruluyor, dolayısıyla UTC'nin gerisindeki bir sunucuda
  günün BİR GÜN KAYMASI mümkün. Düğün tarihi bir gün kayan bir sistem
  kullanılamaz.

  1082 = `date`. `timestamptz` (1184) dokunulmuyor: orada tam damga
  zaten doğru karşılık.
*/
types.setTypeParser(1082, (deger) => deger);

let havuz: Pool | null = null;

/**
 * Bağlantı havuzu.
 *
 * Sunucusuz ortamda her çağrı yeni havuz açmamalı: Vercel aynı örneği
 * tekrar kullanıyor ve her seferinde yeni havuz açmak veritabanının
 * bağlantı sınırını hızla doldurur. Havuz KÜÇÜK (`max: 1`): her istek
 * tek bağlantı kullanıyor ve fonksiyon örnekleri yatay ölçekleniyor,
 * yani asıl eşzamanlılık örnek sayısından geliyor.
 */
function pool(): Pool {
  if (havuz) return havuz;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL tanımlı değil.');
  havuz = new Pool({
    connectionString: url,
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    /*
      Neon ve Vercel Postgres TLS zorunlu tutuyor ama sertifika zincirini
      doğrulamak için ek kök gerekiyor. Yerel geliştirmede TLS hiç yok.
      Adresin kendisi karar veriyor; elle bayrak yok ki yanlışlıkla
      üretimde kapatılmasın.
    */
    ssl: /\bsslmode=require\b|neon\.tech|vercel-storage\.com/.test(url)
      ? { rejectUnauthorized: true }
      : undefined,
  });
  return havuz;
}

/** Bir sorgunun hangi kimlikle çalışacağı. */
export interface Kimlik {
  /**
   * Oturumdaki kullanıcının kimliği. Verilirse sorgu `authenticated`
   * rolüyle ve bu kimlikle çalışıyor; RLS politikaları devreye giriyor.
   */
  kullaniciId?: string;
  /**
   * Satır güvenliğini AŞAR. Yalnızca kullanıcı adına çalışmayan işler
   * için: zamanlanmış görevler, webhook alımı, yedekleme. Bir istek
   * kullanıcıdan geliyorsa bu KULLANILMAZ -- aksi hâlde bütün
   * izolasyon tek satırda kaybolur.
   */
  servis?: boolean;
}

/**
 * Rolü ve kimliği ayarlayıp sorguyu çalıştırır.
 *
 * `SET LOCAL` kullanılıyor: ayar yalnızca bu işlem boyunca geçerli.
 * `SET` (LOCAL'siz) kullanılsaydı ayar bağlantıda kalırdı ve havuzdan
 * aynı bağlantıyı alan BİR SONRAKİ istek önceki kullanıcının kimliğiyle
 * çalışırdı -- sessiz ve çok ağır bir sızıntı.
 */
async function calistir<T>(
  istemci: PoolClient, kimlik: Kimlik, is: () => Promise<T>,
): Promise<T> {
  await istemci.query('begin');
  try {
    if (kimlik.servis) {
      /*
        ROL DEĞİŞTİRİLMİYOR: bağlantı zaten TABLO SAHİBİ olarak açılıyor
        ve sahip, `force row level security` konmadıkça politikalara tabi
        değil (bu şemada hiçbir tabloda o bayrak yok).

        Önce `set role service_role` yazılıydı. Kendi sunucumuzda o rol
        BYPASSRLS taşıdığı için çalışıyordu; barındırılan PostgreSQL'de
        (Neon / Vercel Postgres) BYPASSRLS'i yalnızca superuser verebilir,
        veritabanı sahibi superuser değil ve rol o nitelik olmadan
        açılıyor. Rol değiştirilseydi arka plan işleri -- yedekleme,
        anket gönderimi, fatura durumu -- SIFIR satır görür, hata da
        vermez: gecelik yedek her gece "başarıyla" boş alınırdı.
      */
    } else {
      if (!kimlik.kullaniciId) throw new Error('Kimlik yok: kullaniciId ya da servis gerekli.');
      await istemci.query("set local role 'authenticated'");
      /*
        Parametreli gönderiliyor, metne gömülmüyor: kimlik dışarıdan
        gelen bir değer ve SQL'e doğrudan yazılsaydı enjeksiyon yüzeyi
        olurdu. `set_config` bunun parametre kabul eden biçimi.
      */
      await istemci.query(
        "select set_config('request.jwt.claim.sub', $1, true)",
        [kimlik.kullaniciId],
      );
    }
    const sonuc = await is();
    await istemci.query('commit');
    return sonuc;
  } catch (e) {
    await istemci.query('rollback');
    throw e;
  }
}

/** Tek sorgu çalıştırır ve satırları döndürür. */
export async function sorgu<T = Record<string, unknown>>(
  metin: string, parametreler: unknown[], kimlik: Kimlik,
): Promise<T[]> {
  const istemci = await pool().connect();
  try {
    return await calistir(istemci, kimlik, async () => {
      const { rows } = await istemci.query(metin, parametreler);
      return rows as T[];
    });
  } finally {
    istemci.release();
  }
}

/**
 * Birden çok sorguyu TEK işlemde çalıştırır.
 *
 * Rezervasyon kaydetmek gibi işler birkaç tabloya birden yazıyor; ayrı
 * işlemlerde yapılsaydı ikincisi düştüğünde birincisi kalır ve veri
 * yarım kalırdı.
 */
export async function islem<T>(
  kimlik: Kimlik,
  is: (calistirSorgu: (metin: string, parametreler?: unknown[]) => Promise<Record<string, unknown>[]>) => Promise<T>,
): Promise<T> {
  const istemci = await pool().connect();
  try {
    return await calistir(istemci, kimlik, () => is(async (metin, parametreler = []) => {
      const { rows } = await istemci.query(metin, parametreler);
      return rows as Record<string, unknown>[];
    }));
  } finally {
    istemci.release();
  }
}

/** Veritabanı yapılandırılmış mı? Ekranlar buna göre kip seçiyor. */
export function veritabaniVarMi(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Testler için: havuzu kapatır. */
export async function havuzuKapat(): Promise<void> {
  if (!havuz) return;
  await havuz.end();
  havuz = null;
}
