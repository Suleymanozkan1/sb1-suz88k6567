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
 */
import { ROTALAR } from '../sunucu/rotalar.js';
import veri from './veri.js';

/** Vercel'in yakaladığı asıl yolu taşıyan parametre (`vercel.json`). */
const YOL_PARAMETRESI = '__yol';

function json(govde: unknown, durum: number): Response {
  return new Response(JSON.stringify(govde), {
    status: durum,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export default async function handler(request: Request): Promise<Response> {
  const gelen = new URL(request.url);
  const yol = gelen.searchParams.get(YOL_PARAMETRESI) ?? gelen.pathname;
  gelen.searchParams.delete(YOL_PARAMETRESI);

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

  // Tarayıcının veri yolu: `/veri/<tablo>` ve `/veri/rpc/<fonksiyon>`.
  if (yol === '/veri' || yol.startsWith('/veri/')) return veri(istek);

  const isleyici = ROTALAR[yol];
  if (!isleyici) return json({ error: `Bilinmeyen uç nokta: ${yol}` }, 404);
  return isleyici(istek);
}
