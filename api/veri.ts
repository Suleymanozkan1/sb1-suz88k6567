/**
 * Veri uç noktası: tarayıcının PostgREST yerine konuştuğu adres.
 *
 * Kendi sunucumuzda nginx `/veri/*` isteklerini gerçek PostgREST'e
 * geçiriyor. Vercel'de PostgREST çalıştırılamadığı için aynı yolu bu
 * fonksiyon karşılıyor: isteği `_pgrest.ts` ile SQL'e çeviriyor,
 * `_pg.ts` ile oturumdaki kullanıcının rolünde çalıştırıyor.
 *
 * İSTEMCİ FARKI GÖRMÜYOR. `src/lib/postgrest.ts` ne adres biçimini ne
 * de yanıt sözleşmesini değiştiriyor; depo katmanındaki 95 yöntem
 * olduğu gibi çalışıyor.
 *
 * İZOLASYON BURADA KURULMUYOR. Jetondan yalnızca KULLANICI KİMLİĞİ
 * çıkarılıp `_pg.ts`'e veriliyor; o da bağlantıyı `authenticated`
 * rolüyle açıp `request.jwt.claim.sub` değerini ayarlıyor. Hangi satırın
 * görüleceğine veritabanındaki RLS politikaları karar veriyor. Bu
 * dosyada "şu işletmenin satırları" gibi bir kontrol YOK; olsaydı aynı
 * kuralın ikinci bir kopyası olur ve ikisi zamanla ayrışırdı.
 *
 * SERVİS KİMLİĞİ KULLANILMIYOR. `_pg.ts` satır güvenliğini aşan bir kip
 * sunuyor ama o yalnızca kullanıcı adına çalışmayan işler için
 * (zamanlanmış görev, webhook). Buraya gelen her istek bir tarayıcıdan
 * geliyor; servis kimliği verilseydi bütün izolasyon tek satırda
 * kaybolurdu.
 */
import { CevrimHatasi, cevir, type Istek } from './_pgrest.js';
import { sorgu, veritabaniVarMi } from './_pg.js';
import { jetonuCoz } from './_kimlik.js';
import { json } from './_guard.js';

/** PostgREST'in hata gövdesiyle aynı biçim; istemci bunu çözüyor. */
function hata(mesaj: string, durum: number, kod: string): Response {
  return json({ message: mesaj, code: kod }, durum);
}

/**
 * Vercel'in yeniden yazma sırasında hedefi taşıdığı parametre.
 *
 * NEDEN GEREKLİ. nginx `/veri/halls` yolunu OLDUĞU GİBİ geçiriyor, yani
 * kendi sunucumuzda yol okunabiliyor. Vercel ise `vercel.json`
 * kuralıyla isteği `/api/veri.ts` dosyasına yeniden yazıyor ve
 * fonksiyona ulaşan adres artık hedef tabloyu taşımıyor. O yüzden kural
 * yakaladığı parçayı bu parametreye koyuyor (`?${YOL_PARAMETRESI}=$1`).
 *
 * Süzgeç olarak değerlendirilmemesi için çeviriciye gitmeden ÖNCE
 * siliniyor; kalsaydı "böyle bir sütun yok" hatası verirdi.
 */
const YOL_PARAMETRESI = 'veriYolu';

/**
 * `/veri/<tablo>` ya da `/veri/rpc/<fonksiyon>` yolundan hedefi çıkarır.
 *
 * Yol parçası tek: şema adı taşıyan ("public.halls") ya da eğik çizgi
 * içeren bir hedef kabul edilmiyor.
 */
function hedefCoz(yol: string): { rpc: boolean; ad: string } | null {
  const parcalar = yol.replace(/^\/+/, '').split('/').filter(Boolean);
  const kok = parcalar.indexOf('veri');
  const kalan = kok >= 0 ? parcalar.slice(kok + 1) : parcalar;
  if (kalan.length === 1) return { rpc: false, ad: kalan[0]! };
  if (kalan.length === 2 && kalan[0] === 'rpc') return { rpc: true, ad: kalan[1]! };
  return null;
}

export default async function handler(request: Request): Promise<Response> {
  if (!veritabaniVarMi()) {
    return hata('Veritabanı yapılandırılmadı.', 503, 'PGRST000');
  }

  const url = new URL(request.url);
  const yol = url.searchParams.get(YOL_PARAMETRESI);
  url.searchParams.delete(YOL_PARAMETRESI);
  const hedef = hedefCoz(yol ?? url.pathname);
  if (!hedef) return hata('Geçersiz yol.', 404, 'PGRST404');

  /*
    Kimlik JETONDAN okunuyor, istekten değil. Gövdeden ya da başlıktan
    gelen bir "kullanıcı kimliği" alanı, isteyenin başkası adına sorgu
    çalıştırması demekti.
  */
  const yetki = request.headers.get('authorization') ?? '';
  const jeton = yetki.startsWith('Bearer ') ? yetki.slice(7) : '';
  const talepler = jeton ? jetonuCoz(jeton) : null;
  if (!talepler?.sub) {
    return hata('Oturum gerekli.', 401, 'PGRST301');
  }
  const kimlik = { kullaniciId: talepler.sub };

  const yontem = request.method.toUpperCase();
  let govde: unknown;
  if (yontem === 'POST' || yontem === 'PATCH') {
    try {
      const metin = await request.text();
      govde = metin ? JSON.parse(metin) : undefined;
    } catch {
      return hata('Gövde çözümlenemedi.', 400, 'PGRST102');
    }
  }

  const tercih = request.headers.get('prefer') ?? '';
  const tekil = (request.headers.get('accept') ?? '')
    .includes('application/vnd.pgrst.object+json');

  try {
    if (hedef.rpc) {
      /*
        RPC: fonksiyon adı da parametrelenemiyor, çeviricideki aynı
        biçim denetiminden geçiyor. Argümanlar adlandırılmış parametre
        olarak gidiyor.
      */
      const argumanlar = (govde ?? {}) as Record<string, unknown>;
      const adlar = Object.keys(argumanlar);
      if (!/^[a-z_][a-z0-9_]*$/.test(hedef.ad)) {
        return hata(`Geçersiz fonksiyon: ${hedef.ad}`, 400, 'PGRST100');
      }
      for (const a of adlar) {
        if (!/^[a-z_][a-z0-9_]*$/.test(a)) {
          return hata(`Geçersiz argüman: ${a}`, 400, 'PGRST100');
        }
      }
      const yerler = adlar.map((a, i) => `${a} => $${i + 1}`).join(', ');
      const metin = `select * from "${hedef.ad}"(${yerler})`;
      const satirlar = await sorgu(metin, adlar.map((a) => argumanlar[a]), kimlik);
      return json(tekil ? (satirlar[0] ?? null) : satirlar);
    }

    const istek: Istek = {
      yontem: yontem as Istek['yontem'],
      tablo: hedef.ad,
      parametreler: url.searchParams,
      govde,
      temsilDondur: tercih.includes('return=representation'),
      cakismaCozumu: tercih.includes('resolution=merge-duplicates'),
    };

    const { metin, degerler } = cevir(istek);
    const satirlar = await sorgu(metin, degerler, kimlik);

    /*
      `single()` istendiğinde satır sayısı birden farklıysa PostgREST
      hata döndürüyor; istemci buna güveniyor. Sessizce ilkini almak
      "iki satır döndü ama birini aldık" gibi bir yanlışa kapı aralardı.
    */
    if (tekil) {
      if (satirlar.length !== 1) {
        return hata(
          `Tek satır beklendi, ${satirlar.length} satır döndü.`, 406, 'PGRST116',
        );
      }
      return json(satirlar[0]);
    }

    // Temsil istenmeyen yazmada PostgREST gövdesiz 204 döndürüyor.
    if (yontem !== 'GET' && !istek.temsilDondur) {
      return new Response(null, { status: 204 });
    }
    return json(satirlar);
  } catch (e) {
    if (e instanceof CevrimHatasi) return hata(e.message, 400, e.kod);
    /*
      Veritabanı hatası istemciye OLDUĞU GİBİ geçiyor: kısıt adı ve
      SQLSTATE, depo katmanındaki `fail()` için anlam taşıyor (örneğin
      benzersizlik ihlali kullanıcıya "bu kayıt zaten var" olarak
      dönüyor). Genel bir "sunucu hatası" o ayrımı yok ederdi.
    */
    const pg = e as { message?: string; code?: string };
    return hata(pg.message ?? 'Sorgu çalıştırılamadı.', 400, pg.code ?? 'PGRST000');
  }
}
