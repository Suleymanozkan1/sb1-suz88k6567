/**
 * Sunucu tarafı veritabanı erişiminin PostgREST'SİZ yolu.
 *
 * NEDEN VAR. `api/_db.ts` service_role işlerini (giriş kilidi, hız
 * sınırı, zamanlanmış görevler, webhook) PostgREST'e HTTP ile
 * yaptırıyor. Vercel'de PostgREST yok: derlenmiş bir sunucu süreci ve
 * sürekli açık bir port istiyor. O yüzden `_db.ts` orada bu modüle
 * düşüyor ve aynı işleri doğrudan PostgreSQL'e yaptırıyor.
 *
 * ÇEVİRİ YENİDEN YAZILMIYOR. Yollar (`surveys?sent_at=is.null&order=...`)
 * `_pgrest.ts` ile SQL'e çevriliyor -- tarayıcının `/veri` uç noktasıyla
 * AYNI çevirici. İkinci bir çevirici yazılsaydı ikisi zamanla ayrışır ve
 * aynı süzgeç iki farklı sonuç verirdi.
 *
 * KİMLİK `servis`. Bu çağrılar bir kullanıcı adına değil, sistem adına
 * çalışıyor (gece yedeği, anket gönderimi, giriş kilidi). `_pg.ts` bu
 * kipte rolü değiştirmiyor: bağlantı tablo sahibi olarak açılıyor ve
 * sahip, `force row level security` konmadıkça politikalara tabi değil.
 * Tarayıcıdan gelen istekler bu modülü KULLANMIYOR; onlar `veri.ts`
 * üzerinden `authenticated` rolüyle gidiyor.
 *
 * TEK VERİTABANI. Kendi sunucumuzdaki fatura bölmesi (VUK gereği
 * faturaların Türkiye'de durması, docs/IKI-SUNUCU.md) burada YOK; bu kip
 * tek bir `DATABASE_URL` tanıyor. Bölme istenen bir kurulumda `_db.ts`
 * açıkça hata veriyor, sessizce yanlış veritabanına yazmıyor.
 */
import { cevir, type Istek } from './_pgrest.js';
import { sorgu } from './_pg.js';

/** Sistem adına çalışan sorgu kimliği. */
const SERVIS = { servis: true } as const;

/** `surveys?sent_at=is.null&order=created_at` -> tablo + parametreler. */
function yolCoz(yol: string): { tablo: string; parametreler: URLSearchParams } {
  const [tablo, sorguDizesi = ''] = yol.split('?');
  return { tablo: (tablo ?? '').replace(/^\/+/, ''), parametreler: new URLSearchParams(sorguDizesi) };
}

function istekYap(kismi: Partial<Istek> & { tablo: string }): Istek {
  return {
    yontem: 'GET',
    parametreler: new URLSearchParams(),
    temsilDondur: false,
    cakismaCozumu: false,
    ...kismi,
  };
}

/** Yoldan okur. */
export async function sec<T>(yol: string): Promise<T[]> {
  const { tablo, parametreler } = yolCoz(yol);
  const { metin, degerler } = cevir(istekYap({ tablo, parametreler }));
  return await sorgu<T>(metin, degerler, SERVIS) as T[];
}

/** Yoldaki satırları günceller. */
export async function yama(yol: string, govde: unknown): Promise<void> {
  const { tablo, parametreler } = yolCoz(yol);
  const { metin, degerler } = cevir(istekYap({
    yontem: 'PATCH', tablo, parametreler, govde,
  }));
  await sorgu(metin, degerler, SERVIS);
}

/** Kayıt ekler ve eklenen satırı döndürür. */
export async function ekle<T>(tablo: string, govde: unknown): Promise<T> {
  const { metin, degerler } = cevir(istekYap({
    yontem: 'POST', tablo, govde, temsilDondur: true,
  }));
  const satirlar = await sorgu<T>(metin, degerler, SERVIS);
  return satirlar[0]!;
}

/** Toplu ekleme/güncelleme. */
export async function birlestir(
  tablo: string, satirlar: unknown[], cakismaSutunlari: string,
): Promise<void> {
  if (satirlar.length === 0) return;
  const { metin, degerler } = cevir(istekYap({
    yontem: 'POST',
    tablo,
    govde: satirlar,
    cakismaCozumu: true,
    parametreler: new URLSearchParams({ on_conflict: cakismaSutunlari }),
  }));
  await sorgu(metin, degerler, SERVIS);
}

/** Yalnızca küçük harf, rakam ve alt çizgi; `_pgrest.ts` ile aynı kural. */
const AD_BICIMI = /^[a-z_][a-z0-9_]*$/;

interface Bicim {
  /** Küme döndürüyor mu? Döndürüyorsa sonuç satır dizisi. */
  coklu: boolean;
  /** Girdi parametresi adı -> SQL tipi. */
  tipler: Record<string, string>;
}

/*
  Fonksiyon imzaları süreç boyunca önbellekte. Şema çalışırken
  değişmiyor; her çağrıda yeniden sorulsaydı giriş gibi sık kullanılan
  yollar iki katı gidiş dönüş yapardı.
*/
const bicimler = new Map<string, Bicim>();

/**
 * Fonksiyonun ne döndürdüğünü ve parametre tiplerini kataloğdan okur.
 *
 * PostgREST de tam olarak bunu yapıyor: küme döndüren fonksiyon için
 * dizi, tek değer döndüren için değerin kendisi veriyor. Burada
 * varsayım yapılsaydı (örneğin "hepsi dizi") `check_rate_limit`
 * `[{check_rate_limit: true}]` dönerdi ve hız sınırı -- boolean yerine
 * dolu bir dizi gördüğü için -- her zaman "izin var" sayılırdı.
 */
async function bicim(fonksiyon: string): Promise<Bicim> {
  const onbellek = bicimler.get(fonksiyon);
  if (onbellek) return onbellek;

  const satirlar = await sorgu<{
    proretset: boolean; adlar: string[] | null; tipler: string[] | null;
  }>(
    'select p.proretset,'
    + ' p.proargnames as adlar,'
    + ' array(select format_type(u.oid, null) from unnest(p.proargtypes) as u(oid)) as tipler'
    + ' from pg_proc p join pg_namespace n on n.oid = p.pronamespace'
    + ' where n.nspname = \'public\' and p.proname = $1',
    [fonksiyon],
    SERVIS,
  );
  if (satirlar.length === 0) throw new Error(`Fonksiyon bulunamadı: ${fonksiyon}`);

  const satir = satirlar[0]!;
  const adlar = satir.adlar ?? [];
  const tipAdlari = satir.tipler ?? [];
  const tipler: Record<string, string> = {};
  /*
    `proargnames` çıkış parametrelerini de taşıyor (tablo döndüren
    fonksiyonlarda sütun adları); `proargtypes` yalnızca GİRDİleri.
    Girdiler listenin başında, o yüzden tip sayısı kadarı eşleşiyor.
  */
  tipAdlari.forEach((tip, i) => {
    const isim = adlar[i];
    if (isim) tipler[isim] = tip.toLowerCase();
  });

  const sonuc: Bicim = { coklu: satir.proretset, tipler };
  bicimler.set(fonksiyon, sonuc);
  return sonuc;
}

/**
 * Postgres fonksiyonunu sistem adına çağırır.
 *
 * Argümanlar ADLANDIRILMIŞ gidiyor (`p_email => $1`): sıraya
 * güvenilseydi varsayılan değerli parametreler atlanamaz ve imza
 * değiştiğinde çağrı sessizce yanlış sütuna yazardı.
 */
export async function fonksiyon<T>(ad: string, argumanlar: Record<string, unknown>): Promise<T> {
  if (!AD_BICIMI.test(ad)) throw new Error(`Geçersiz fonksiyon adı: ${ad}`);

  const { coklu, tipler } = await bicim(ad);
  const adlar = Object.keys(argumanlar);
  const parcalar: string[] = [];
  const degerler: unknown[] = [];

  adlar.forEach((isim) => {
    if (!AD_BICIMI.test(isim)) throw new Error(`Geçersiz argüman adı: ${isim}`);
    const tip = tipler[isim];
    const deger = argumanlar[isim];

    /*
      json/jsonb parametrelere METİN gönderiliyor. `pg` sürücüsü bir JS
      dizisini varsayılan olarak Postgres dizi değişmezine
      (`{"a","b"}`) çeviriyor; jsonb bekleyen bir parametreye bu ya hata
      verir ya da yanlış veri yazar. Özel günler ve okul takvimi tam
      olarak böyle bir dizi gönderiyor.
    */
    if (tip === 'json' || tip === 'jsonb') {
      parcalar.push(`${isim} => $${degerler.length + 1}::${tip}`);
      degerler.push(deger === undefined ? null : JSON.stringify(deger));
      return;
    }
    /*
      Dizi değeri, dizi olmayan bir parametreye gidiyorsa DURUYORUZ.
      Sessizce geçirilseydi `pg` onu Postgres dizisine çevirir ve hata
      ancak veritabanında -- ya da hiç -- görünürdü.
    */
    if (Array.isArray(deger) && !(tip ?? '').endsWith('[]')) {
      throw new Error(`${ad}.${isim} dizi değil, ${tip ?? 'bilinmeyen'} bekliyor.`);
    }
    parcalar.push(`${isim} => $${degerler.length + 1}`);
    degerler.push(deger === undefined ? null : deger);
  });

  const cagri = `"${ad}"(${parcalar.join(', ')})`;
  if (coklu) {
    return await sorgu(`select * from ${cagri}`, degerler, SERVIS) as T;
  }
  const satirlar = await sorgu<{ v: unknown }>(`select ${cagri} as v`, degerler, SERVIS);
  return (satirlar[0]?.v ?? null) as T;
}
