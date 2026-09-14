/**
 * PostgREST isteğini SQL'e çeviren katman.
 *
 * NEDEN VAR. Tarayıcı PostgREST diliyle konuşuyor (`src/lib/postgrest.ts`)
 * ve kendi sunucumuzda karşısında gerçek PostgREST duruyor. Vercel'de o
 * çalıştırılamıyor: derlenmiş bir sunucu süreci ve sürekli açık bir port
 * istiyor. Bu modül aradaki çeviriyi yapıyor, böylece İSTEMCİ HİÇ
 * DEĞİŞMİYOR -- depo katmanındaki 95 yöntem olduğu gibi çalışmaya devam
 * ediyor.
 *
 * 95 yöntemi sunucusuz uç noktalara yeniden yazmak da mümkündü ama çok
 * daha riskli: her yöntem kendi izolasyon kontrolünü taşımak zorunda
 * kalırdı ve unutulan tek bir `where` bir salonun cirosunu başkasına
 * gösterirdi. Burada izolasyon veritabanında kalıyor (`api/_pg.ts` rolü
 * ve kimliği ayarlıyor, RLS politikaları iş görüyor) ve mevcut 29 SQL
 * test paketi onu doğrulamaya devam ediyor.
 *
 * SAF MODÜL: veritabanına dokunmuyor, yalnızca metin üretiyor. SQL
 * enjeksiyon riski tam olarak burada yaşadığı için veritabanı olmadan,
 * doğrudan ve eksiksiz test edilebilir olması gerekiyordu.
 *
 * DEĞERLER PARAMETRE, ADLAR DENETİMDEN GEÇER. Değerler `$1, $2...` ile
 * gidiyor. Tablo ve sütun adları SQL'de parametrelenemiyor; o yüzden
 * katı bir biçim denetiminden geçip tırnaklanıyorlar. Denetime uymayan
 * ad sessizce atlanmıyor, istek düşüyor.
 */

/** Yalnızca küçük harf, rakam ve alt çizgi. Şemadaki bütün adlar böyle. */
const AD_BICIMI = /^[a-z_][a-z0-9_]*$/;

/** Desteklenen süzgeç işleçleri ve SQL karşılıkları. */
const ISLECLER: Record<string, string> = {
  eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=',
};

/**
 * Gömülü ilişkiler, TEK TEK yazılı.
 *
 * Genel bir join çözümleyicisi yazmak mümkündü ama PostgREST'in ilişki
 * çıkarımı yabancı anahtarlara, çoğulluğa ve takma adlara bakan geniş
 * bir davranış; eksik taklidi SESSİZCE YANLIŞ VERİ üretirdi -- bu
 * sistemde en pahalı hata türü. Depo katmanı yalnızca iki gömülü sorgu
 * kullanıyor; ikisi de burada tanımlı, tanımsız bir gömme isteği ise
 * hata veriyor.
 */
interface Iliski {
  /** Gömülen tablo. */
  tablo: string;
  /** Ana tablodaki sütun. */
  yerel: string;
  /** Gömülen tablodaki sütun. */
  uzak: string;
  /** `!inner`: satırı süzer, veri döndürmez. Aksi hâlde json dizisi olarak eklenir. */
  ic: boolean;
}

const ILISKILER: Record<string, Iliski> = {
  // Fatura kartı kalemleriyle birlikte okunuyor (supabase.ts, getInvoice).
  'invoices.invoice_lines': { tablo: 'invoice_lines', yerel: 'id', uzak: 'invoice_id', ic: false },
  // Tahsilatlar bağlı olduğu rezervasyonun işletmesine göre süzülüyor
  // (supabase.ts, listPayments). Rezervasyon verisi KULLANILMIYOR.
  'payments.reservations': { tablo: 'reservations', yerel: 'reservation_id', uzak: 'id', ic: true },
};

export interface Istek {
  yontem: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  tablo: string;
  parametreler: URLSearchParams;
  govde?: unknown;
  /** `prefer: return=representation` */
  temsilDondur: boolean;
  /** `prefer: resolution=merge-duplicates` */
  cakismaCozumu: boolean;
}

export interface Cevrim {
  metin: string;
  degerler: unknown[];
}

/** İstemciye aynen PostgREST gibi dönecek hata. */
export class CevrimHatasi extends Error {
  constructor(mesaj: string, readonly kod = 'PGRST100') {
    super(mesaj);
    this.name = 'CevrimHatasi';
  }
}

function ad(deger: string): string {
  if (!AD_BICIMI.test(deger)) throw new CevrimHatasi(`Geçersiz ad: ${deger}`);
  return `"${deger}"`;
}

/**
 * `in.("a","b")` listesini çözer.
 *
 * Tırnak zorunlu (istemci `listeDegeri` ile yazıyor): "Yılmaz, Ali"
 * tırnaksız iki ayrı değer sanılırdı. Kaçırılmış tırnak ve ters bölü
 * geri açılıyor.
 */
function listeCoz(ham: string): string[] {
  const ic = ham.trim().replace(/^\(/, '').replace(/\)$/, '');
  if (ic === '') return [];
  const cikti: string[] = [];
  let simdi = '';
  let tirnakta = false;
  let kacis = false;
  for (const harf of ic) {
    if (kacis) { simdi += harf; kacis = false; continue; }
    if (harf === '\\') { kacis = true; continue; }
    if (harf === '"') { tirnakta = !tirnakta; continue; }
    if (harf === ',' && !tirnakta) { cikti.push(simdi); simdi = ''; continue; }
    simdi += harf;
  }
  cikti.push(simdi);
  return cikti;
}

/** `null`, `true`, `false` anahtar sözcükleri; gerisi metin. */
function isDegeri(ham: string): null | boolean {
  if (ham === 'null') return null;
  if (ham === 'true') return true;
  if (ham === 'false') return false;
  throw new CevrimHatasi(`is yalnızca null/true/false alır: ${ham}`);
}

interface Kosul { metin: string; degerler: unknown[] }

/**
 * Tek bir süzgeci SQL koşuluna çevirir.
 *
 * `sutun` gömülü tablodan da gelebiliyor ("reservations.business_id");
 * o durumda koşul join'lenen takma ada yazılıyor.
 */
function suzgecCoz(
  sutun: string, ifade: string, takmaAd: string, sayac: () => number, gomulu: Set<string>,
): Kosul {
  let hedef: string;
  if (sutun.includes('.')) {
    /*
      Noktalı süzgeç yalnızca BU sorguda gömülmüş bir ilişkiye yazılabilir
      ("reservations.business_id"). Serbest bırakılsaydı join'lenmemiş bir
      ada koşul yazılabilir ve veritabanı "missing FROM-clause entry"
      derdi: enjeksiyon değil ama okunmaz bir hata. Burada düşmesi,
      sorunun nerede olduğunu söylüyor.
    */
    const [iliskiAdi, gercekSutun] = sutun.split('.');
    if (!gomulu.has(iliskiAdi!)) {
      throw new CevrimHatasi(`Süzgeçteki ${iliskiAdi} bu sorguda gömülü değil.`);
    }
    hedef = `${ad(iliskiAdi!)}.${ad(gercekSutun!)}`;
  } else {
    hedef = `${takmaAd}.${ad(sutun)}`;
  }

  const olumsuz = ifade.startsWith('not.');
  const govde = olumsuz ? ifade.slice(4) : ifade;
  const ayrac = govde.indexOf('.');
  if (ayrac < 0) throw new CevrimHatasi(`Geçersiz süzgeç: ${ifade}`);
  const islec = govde.slice(0, ayrac);
  const ham = govde.slice(ayrac + 1);

  if (islec === 'is') {
    const deger = isDegeri(ham);
    const sql = deger === null
      ? `${hedef} is ${olumsuz ? 'not ' : ''}null`
      : `${hedef} is ${olumsuz ? 'not ' : ''}${deger ? 'true' : 'false'}`;
    return { metin: sql, degerler: [] };
  }

  if (islec === 'in') {
    const liste = listeCoz(ham);
    if (liste.length === 0) {
      // Boş liste: "hiçbiri". `in ()` sözdizimi hatası verirdi.
      return { metin: olumsuz ? 'true' : 'false', degerler: [] };
    }
    const yer = liste.map(() => `$${sayac()}`).join(', ');
    return { metin: `${hedef} ${olumsuz ? 'not ' : ''}in (${yer})`, degerler: liste };
  }

  const sqlIslec = ISLECLER[islec];
  if (!sqlIslec) throw new CevrimHatasi(`Desteklenmeyen işleç: ${islec}`);
  if (ham === 'null') {
    // `eq.null` PostgREST'te de satır döndürmez; `= null` her zaman
    // bilinmeyen. Açıkça yazmak, sessiz boş listeden iyi.
    return { metin: olumsuz ? 'true' : 'false', degerler: [] };
  }
  return { metin: `${hedef} ${sqlIslec} $${sayac()}`, degerler: [ham] };
}

interface Secim {
  /** Ana tablodan istenen sütunlar; boşsa `*`. */
  sutunlar: string[];
  /** Gömülü ilişki adları. */
  gomulu: string[];
}

function secimCoz(ham: string | null): Secim {
  if (!ham || ham.trim() === '' || ham.trim() === '*') return { sutunlar: [], gomulu: [] };

  const sutunlar: string[] = [];
  const gomulu: string[] = [];
  // Parantez içindeki virgüller ayraç değil.
  let derinlik = 0;
  let simdi = '';
  const parcalar: string[] = [];
  for (const harf of ham) {
    if (harf === '(') derinlik += 1;
    if (harf === ')') derinlik -= 1;
    if (harf === ',' && derinlik === 0) { parcalar.push(simdi); simdi = ''; continue; }
    simdi += harf;
  }
  parcalar.push(simdi);

  for (const parca of parcalar) {
    const kirp = parca.trim();
    if (kirp === '' ) continue;
    if (kirp === '*') continue;
    if (kirp.includes('(')) {
      // "invoice_lines(*)" ya da "reservations!inner(business_id)"
      const isim = kirp.slice(0, kirp.indexOf('(')).split('!')[0]!.trim();
      gomulu.push(isim);
      continue;
    }
    sutunlar.push(kirp);
  }
  return { sutunlar, gomulu };
}

/** `order=tarih.desc,ad.asc` */
function duzenCoz(ham: string | null, takmaAd: string): string {
  if (!ham) return '';
  const parcalar = ham.split(',').map((p) => p.trim()).filter(Boolean).map((p) => {
    const [sutun, yon] = p.split('.');
    const yonu = yon === 'desc' ? 'desc' : 'asc';
    return `${takmaAd}.${ad(sutun!)} ${yonu}`;
  });
  return parcalar.length ? ` order by ${parcalar.join(', ')}` : '';
}

/** Gövdeyi satır dizisine indirger. */
function satirlar(govde: unknown): Record<string, unknown>[] {
  if (Array.isArray(govde)) return govde as Record<string, unknown>[];
  if (govde && typeof govde === 'object') return [govde as Record<string, unknown>];
  throw new CevrimHatasi('Gövde bir nesne ya da dizi olmalı.');
}

/**
 * PostgREST isteğini SQL'e çevirir.
 *
 * Dönen metin `api/_pg.ts` üzerinden, oturumdaki kullanıcının rolüyle
 * çalıştırılıyor; satır güvenliği orada devreye giriyor.
 */
export function cevir(istek: Istek): Cevrim {
  const tablo = ad(istek.tablo);
  const takmaAd = '"t"';
  const degerler: unknown[] = [];
  let sira = 0;
  const sayac = () => { sira += 1; return sira; };

  const secim = secimCoz(istek.parametreler.get('select'));

  // Süzgeçler: `select`, `order`, `limit`, `on_conflict` dışındaki her
  // parametre bir süzgeçtir.
  const AYRILMIS = new Set(['select', 'order', 'limit', 'offset', 'on_conflict']);
  const kosullar: string[] = [];
  for (const [anahtar, deger] of istek.parametreler.entries()) {
    if (AYRILMIS.has(anahtar)) continue;
    const kosul = suzgecCoz(anahtar, deger, takmaAd, sayac, new Set(secim.gomulu));
    kosullar.push(kosul.metin);
    degerler.push(...kosul.degerler);
  }
  const nerede = kosullar.length ? ` where ${kosullar.join(' and ')}` : '';

  if (istek.yontem === 'GET') {
    const secilen: string[] = [];
    if (secim.sutunlar.length === 0) secilen.push(`${takmaAd}.*`);
    else secilen.push(...secim.sutunlar.map((s) => `${takmaAd}.${ad(s)}`));

    const joinlar: string[] = [];
    for (const isim of secim.gomulu) {
      const iliski = ILISKILER[`${istek.tablo}.${isim}`];
      if (!iliski) throw new CevrimHatasi(`Tanımsız ilişki: ${istek.tablo}.${isim}`);
      if (iliski.ic) {
        joinlar.push(
          ` join ${ad(iliski.tablo)} ${ad(isim)}`
          + ` on ${ad(isim)}.${ad(iliski.uzak)} = ${takmaAd}.${ad(iliski.yerel)}`,
        );
      } else {
        /*
          Gömülü liste JSON dizisi olarak dönüyor; istemci onu satırın
          alanı gibi okuyor. `coalesce` boş diziyi garantiliyor: null
          gelseydi çağıran taraf `?? []` yazmayı unuttuğunda çökerdi.
        */
        secilen.push(
          `coalesce((select json_agg(g.*) from ${ad(iliski.tablo)} g`
          + ` where g.${ad(iliski.uzak)} = ${takmaAd}.${ad(iliski.yerel)}), '[]'::json)`
          + ` as ${ad(isim)}`,
        );
      }
    }

    const sinir = istek.parametreler.get('limit');
    let sinirMetni = '';
    if (sinir !== null) {
      const sayi = Number(sinir);
      if (!Number.isInteger(sayi) || sayi < 0) throw new CevrimHatasi(`Geçersiz limit: ${sinir}`);
      sinirMetni = ` limit ${sayi}`;
    }

    const metin = `select ${secilen.join(', ')} from ${tablo} ${takmaAd}`
      + joinlar.join('')
      + nerede
      + duzenCoz(istek.parametreler.get('order'), takmaAd)
      + sinirMetni;
    return { metin, degerler };
  }

  if (istek.yontem === 'DELETE') {
    const metin = `delete from ${tablo} ${takmaAd}${nerede}`
      + (istek.temsilDondur ? ` returning ${takmaAd}.*` : '');
    return { metin, degerler };
  }

  if (istek.yontem === 'PATCH') {
    const [yama] = satirlar(istek.govde);
    const anahtarlar = Object.keys(yama ?? {});
    if (anahtarlar.length === 0) throw new CevrimHatasi('Güncellenecek alan yok.');
    const atamalar = anahtarlar.map((k) => `${ad(k)} = $${sayac()}`);
    // Değerler süzgeçlerden SONRA gelmeli: parametre sırası SQL'deki
    // $n sırasıyla birebir aynı olmak zorunda.
    const setDegerleri = anahtarlar.map((k) => yama![k]);
    const metin = `update ${tablo} ${takmaAd} set ${atamalar.join(', ')}${nerede}`
      + (istek.temsilDondur ? ` returning ${takmaAd}.*` : '');
    return { metin, degerler: [...degerler, ...setDegerleri] };
  }

  /*
    POST: ekleme ya da upsert. Sayaç SIFIRLANIYOR -- eklemede süzgeç
    kullanılmıyor ve süzgeçten artakalan bir numara, değer dizisiyle
    SQL'deki $n sırasını kaydırırdı.
  */
  sira = 0;
  const satir = satirlar(istek.govde);
  if (satir.length === 0) throw new CevrimHatasi('Eklenecek satır yok.');
  const anahtarlar = Object.keys(satir[0]!);
  if (anahtarlar.length === 0) throw new CevrimHatasi('Eklenecek alan yok.');

  const gruplar: string[] = [];
  const ekDegerler: unknown[] = [];
  for (const s of satir) {
    const yerler = anahtarlar.map((k) => {
      ekDegerler.push(s[k] ?? null);
      return `$${sayac()}`;
    });
    gruplar.push(`(${yerler.join(', ')})`);
  }

  let cakisma = '';
  if (istek.cakismaCozumu) {
    const belirtilen = istek.parametreler.get('on_conflict');
    const hedefSutunlar = belirtilen
      ? belirtilen.split(',').map((s) => s.trim()).filter(Boolean)
      : ['id'];
    /*
      Çakışma sütunu verilmediğinde BİRİNCİL ANAHTAR kullanılıyor;
      bu şemada her tabloda `id`. Gövdede `id` yoksa upsert sessizce
      ikinci bir satır açardı, o yüzden açıkça düşürülüyor.
    */
    if (!belirtilen && !anahtarlar.includes('id')) {
      throw new CevrimHatasi('Upsert için `id` ya da on_conflict gerekli.');
    }
    const guncellenecek = anahtarlar.filter((k) => !hedefSutunlar.includes(k));
    const atama = guncellenecek.length
      ? guncellenecek.map((k) => `${ad(k)} = excluded.${ad(k)}`).join(', ')
      : null;
    cakisma = atama
      ? ` on conflict (${hedefSutunlar.map(ad).join(', ')}) do update set ${atama}`
      // Güncellenecek alan yoksa çakışmada hiçbir şey yapma; `do update
      // set` boş bırakılamıyor.
      : ` on conflict (${hedefSutunlar.map(ad).join(', ')}) do nothing`;
  }

  const metin = `insert into ${tablo} (${anahtarlar.map(ad).join(', ')})`
    + ` values ${gruplar.join(', ')}${cakisma}`
    + (istek.temsilDondur ? ' returning *' : '');
  return { metin, degerler: ekDegerler };
}
