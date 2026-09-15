/**
 * Vercel'in TEK uç noktası: bütün istekleri karşılayıp dağıtır.
 *
 * NEDEN TEK. Vercel'in ücretsiz planı bir dağıtımda en fazla 12
 * sunucusuz fonksiyon kabul ediyor; bu sistemde 24 uç nokta var. Her
 * dosyayı ayrı fonksiyon olarak yayımlamak dağıtımı tamamen düşürüyordu
 * ("No more than 12 Serverless Functions..."). Hepsi tek fonksiyonda
 * toplanınca sayı 1'e iniyor ve sınır sorun olmaktan çıkıyor. Yan
 * faydası: derleme 27 kez değil bir kez çalışıyor.
 *
 * YOL TABLOSU YENİDEN YAZILMIYOR. `sunucu/rotalar.ts` zaten hangi yolun
 * hangi işleyiciye gittiğini biliyor -- kendi sunucumuz da onu okuyor.
 * Burada ikinci bir liste tutulsaydı yeni bir uç nokta eklendiğinde biri
 * güncellenir öteki unutulurdu.
 *
 * ASIL YOL PARAMETREDEN GELİYOR. Vercel isteği `/api/login` yolundan bu
 * dosyaya yeniden yazıyor ve fonksiyona ulaşan adres artık hedefi
 * taşımıyor. `vercel.json` yakaladığı yolu `__yol` parametresine koyuyor;
 * burada istek o yolla YENİDEN KURULUYOR, böylece işleyiciler kendi
 * sunucumuzdakiyle birebir aynı isteği görüyor ve hiçbiri Vercel'e özel
 * bir şey bilmek zorunda kalmıyor.
 *
 * DIŞA AÇILAN İMZA NODE'UN İMZASI. İçeride her şey Web standardı
 * `Request`/`Response` ile yürüyor, ama Vercel'e verilen `export default`
 * `(req, res)` alıyor. Sebebi tahmin değil ölçüm: bu dağıtımda çalıştığı
 * GÖRÜLEN tek fonksiyon (`vercel-api/demo-kur.ts`) bu imzayı kullanıyor,
 * `Request` alan bütün uç noktalar ise 500 dönüyordu. Çalışma zamanının
 * hangi imzayı kendiliğinden tanıdığına güvenmek yerine, çalıştığı
 * bilinen imza kullanılıp çeviri burada açıkça yapılıyor. İşleyicilerin
 * hiçbiri değişmiyor: onlar `Request` görmeye devam ediyor.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

type Isleyici = (istek: Request) => Promise<Response>;

/** Vercel'in yakaladığı asıl yolu taşıyan parametre (`vercel.json`). */
const YOL_PARAMETRESI = '__yol';

/** Fonksiyonun ayağa kalktığını kanıtlayan, hiçbir modüle dokunmayan yol. */
const TANI_YOLU = '/api/tani';

function json(govde: unknown, durum: number): Response {
  return new Response(JSON.stringify(govde), {
    status: durum,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * Yol tablosu ve veri ucu ÇALIŞMA ANINDA yükleniyor, modül başında değil.
 *
 * NEDEN. Tablo 23 uç noktayı birden çekiyor. Dosyanın başında içe
 * aktarılınca bunlardan HERHANGİ BİRİ yüklenirken hata verirse bütün
 * fonksiyon açılmadan ölüyor: Vercel boş bir "FUNCTION_INVOCATION_FAILED"
 * dönüyor, hangi modülün patladığı hiçbir yerde yazmıyor ve var olmayan
 * bir yola yapılan istek bile 500 alıyor. Burada hata YAKALANIP metniyle
 * birlikte döndürülüyor; bir modülün arızası teşhis edilebilir oluyor.
 *
 * İçe aktarım adresleri düz metin: hem esbuild hem Vercel'in dosya
 * izleyicisi böyle yazıldığında modülleri dağıtıma koyabiliyor.
 *
 * Yükleme bir kez yapılıp saklanıyor: aynı örnek arka arkaya gelen
 * istekleri karşılıyor, her seferinde yeniden çözümlemenin anlamı yok.
 */
let yuklenen: { rotalar: Record<string, Isleyici>; veri: Isleyici } | null = null;

async function yukle(): Promise<{ rotalar: Record<string, Isleyici>; veri: Isleyici }> {
  if (yuklenen) return yuklenen;
  const [tablo, veriModulu] = await Promise.all([
    import('../sunucu/rotalar.js'),
    import('./veri.js'),
  ]);
  yuklenen = {
    rotalar: tablo.ROTALAR as Record<string, Isleyici>,
    veri: veriModulu.default as Isleyici,
  };
  return yuklenen;
}

/** Hatanın hangi dosyada koptuğunu söyleyen ilk yığın satırı. */
function ilkCerceve(e: unknown): string | undefined {
  if (!(e instanceof Error) || typeof e.stack !== 'string') return undefined;
  return e.stack.split('\n').slice(1, 4).map((s) => s.trim()).join(' | ') || undefined;
}

/**
 * Kurulumun DURUMU: hangi değişken tanımlı, hangi sürüm yayında.
 *
 * DEĞER DÖNDÜRMÜYOR, yalnızca "var/yok" diyor. Sırların kendisi buradan
 * hiçbir şekilde çıkmıyor; `JWT_SECRET` için uzunluk bile verilmiyor,
 * yalnızca 32 karakter eşiğini geçip geçmediği söyleniyor.
 *
 * NEDEN GEREKLİ. Ortam değişkeni Vercel panosunda "eklendi" görünüp
 * fonksiyona ulaşmayabiliyor: yanlış ortam (Preview/Production), yanlış
 * proje, ya da dağıtımın yenilenmemiş olması. Dışarıdan bakınca üçü de
 * aynı görünüyor -- site "demo kipinde" diyor, sebebini söylemiyor.
 * `surum` alanı hangi işlemenin yayında olduğunu yazıyor: yeniden
 * dağıtımın gerçekten gerçekleşip gerçekleşmediği buradan anlaşılıyor.
 */
function tani(): Record<string, unknown> {
  const jwt = process.env.JWT_SECRET ?? '';
  return {
    tamam: true,
    dugum: process.version,
    calisma: 'node',
    surum: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'bilinmiyor',
    ortam: process.env.VERCEL_ENV ?? 'bilinmiyor',
    ayar: {
      DATABASE_URL: process.env.DATABASE_URL ? 'var' : 'yok',
      JWT_SECRET: jwt === '' ? 'yok' : (jwt.length >= 32 ? 'var' : 'kisa'),
      VITE_SUNUCU_MODU: process.env.VITE_SUNUCU_MODU ?? 'yok',
      PGRST_URL: process.env.PGRST_URL ? 'var (KALDIRIN)' : 'yok',
      CRON_SECRET: process.env.CRON_SECRET ? 'var' : 'yok',
      OTP_SECRET: process.env.OTP_SECRET ? 'var' : 'yok',
    },
  };
}

/** Asıl dağıtıcı. Web standardı girer, Web standardı çıkar. */
export async function dagit(request: Request): Promise<Response> {
  const gelen = new URL(request.url);
  const yol = gelen.searchParams.get(YOL_PARAMETRESI) ?? gelen.pathname;
  gelen.searchParams.delete(YOL_PARAMETRESI);

  /*
    Tanı yolu HER ŞEYDEN ÖNCE yanıtlanıyor: hiçbir modül yüklemiyor,
    veritabanına dokunmuyor, sır okumuyor. Buradan 200 gelip ötekilerden
    500 geliyorsa sorun fonksiyonun açılmasında değil, uç nokta
    modüllerinde demektir -- teşhisi tek istekle ikiye bölüyor.
  */
  if (yol === TANI_YOLU) return json(tani(), 200);

  /*
    İstek asıl yoluyla yeniden kuruluyor. Gövde bir kez okunabildiği için
    yalnızca yazma yöntemlerinde taşınıyor; GET/DELETE'e gövde eklemek
    bazı çalışma zamanlarında hata veriyor.
  */
  const hedef = new URL(gelen.origin + yol);
  hedef.search = gelen.search;
  const yontem = request.method.toUpperCase();
  const istek = new Request(hedef, {
    method: request.method,
    headers: request.headers,
    body: yontem === 'GET' || yontem === 'HEAD' ? undefined : await request.arrayBuffer(),
  });

  let modul: Awaited<ReturnType<typeof yukle>>;
  try {
    modul = await yukle();
  } catch (e) {
    /*
      Buraya düşmek bir uç nokta modülünün yüklenemediği anlamına geliyor
      (eksik bağımlılık, çözülemeyen yol, modül başında atılan hata).
      Mesaj olduğu gibi veriliyor: boş bir 500 ile saatler kaybedilmişti.
    */
    return json({
      error: 'Uç nokta modülleri yüklenemedi.',
      detay: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      nerede: ilkCerceve(e),
    }, 500);
  }

  // Tarayıcının veri yolu: `/veri/<tablo>` ve `/veri/rpc/<fonksiyon>`.
  if (yol === '/veri' || yol.startsWith('/veri/')) return modul.veri(istek);

  const isleyici = modul.rotalar[yol];
  if (!isleyici) return json({ error: `Bilinmeyen uç nokta: ${yol}` }, 404);
  return isleyici(istek);
}

/** Node'un `IncomingMessage` nesnesini Web `Request`'ine çeviriyor. */
async function istegeCevir(req: IncomingMessage): Promise<Request> {
  /*
    Vercel yola göreli bir adres veriyor (`/api/login?x=1`); mutlak adres
    `Host` başlığından kuruluyor. Şema vekil sunucunun bildirdiği değer,
    yoksa https: fonksiyon her hâlükârda TLS'in arkasında duruyor.
  */
  const sema = (basligiTek(req, 'x-forwarded-proto') ?? 'https').split(',')[0]!.trim();
  const konak = basligiTek(req, 'x-forwarded-host') ?? basligiTek(req, 'host') ?? 'localhost';
  const adres = new URL(req.url ?? '/', `${sema}://${konak}`);

  const basliklar = new Headers();
  for (const [ad, deger] of Object.entries(req.headers)) {
    if (deger === undefined) continue;
    if (Array.isArray(deger)) for (const tek of deger) basliklar.append(ad, tek);
    else basliklar.append(ad, deger);
  }

  const yontem = (req.method ?? 'GET').toUpperCase();
  if (yontem === 'GET' || yontem === 'HEAD') {
    return new Request(adres, { method: yontem, headers: basliklar });
  }

  const parcalar: Buffer[] = [];
  for await (const parca of req) parcalar.push(Buffer.from(parca as Buffer));
  const govde = Buffer.concat(parcalar);
  return new Request(adres, {
    method: yontem,
    headers: basliklar,
    body: govde.byteLength === 0 ? undefined : govde,
  });
}

function basligiTek(req: IncomingMessage, ad: string): string | undefined {
  const deger = req.headers[ad];
  return Array.isArray(deger) ? deger[0] : deger;
}

/** Web `Response`'unu Node'un `ServerResponse`'una yazıyor. */
async function yanitiYaz(yanit: Response, res: ServerResponse): Promise<void> {
  /*
    `Set-Cookie` TEK TEK yazılıyor. `Headers` birleştirirken virgülle
    yapıştırıyor, tarayıcı da birleşmiş satırı tek çerez sanıyor: oturum
    ile yenileme jetonu aynı dağıtımda birbirini yiyordu. `getSetCookie`
    ayrı ayrı veriyor.
  */
  const cerezliBaslik = yanit.headers as Headers & { getSetCookie?: () => string[] };
  const cerezler = cerezliBaslik.getSetCookie?.() ?? [];
  yanit.headers.forEach((deger, ad) => {
    if (ad.toLowerCase() === 'set-cookie') return;
    res.setHeader(ad, deger);
  });
  if (cerezler.length > 0) res.setHeader('set-cookie', cerezler);

  res.statusCode = yanit.status;
  if (!yanit.body) {
    res.end();
    return;
  }
  const govde = Buffer.from(await yanit.arrayBuffer());
  res.end(govde);
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const yanit = await dagit(await istegeCevir(req));
    await yanitiYaz(yanit, res);
  } catch (e) {
    /*
      Dağıtıcının kendisi patlarsa çalışma zamanı boş bir
      "FUNCTION_INVOCATION_FAILED" gösteriyor. Hata burada yakalanıp
      metniyle dönülüyor; sır içermiyor, yalnızca hata adı ve mesajı.
    */
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      error: 'İstek karşılanamadı.',
      detay: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      nerede: ilkCerceve(e),
    }));
  }
}
