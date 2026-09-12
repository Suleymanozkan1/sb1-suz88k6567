/**
 * PostgREST istemcisi.
 *
 * DİKKAT: Bu dosya `src/lib/postgrest.ts` ile BİREBİR AYNI olmalıdır.
 * Mobil paketi kendi başına paketleniyor ve üst dizinden içe aktarım
 * yapamıyor, bu yüzden kopya tutuluyor. `__tests__/postgrest-kopya.test.ts`
 * ikisinin ayrışmasını engelliyor: birinde düzeltilen bir hata ötekinde
 * açık kalırsa, mobil ile web farklı davranır ve fark ancak biri
 * bozulduğunda anlaşılır.
 *
 * `@supabase/supabase-js` yerine geçiyor. Supabase'in istemcisi zaten
 * PostgREST'in önüne geçen bir sarmalayıcıydı; burada yalnızca gerçekten
 * kullanılan 13 işlem var. Sözleşme (`{ data, error }`) aynı tutuldu:
 * böylece depo katmanındaki 67 yöntem ve mobildeki karşılıkları
 * DEĞİŞMEDEN çalışmaya devam ediyor. Sağlayıcı değişirken iş mantığının
 * da elden geçmesi, taşımayı gereksiz yere riskli kılardı.
 *
 * Hata biçimi de PostgREST'in kendi JSON çıktısı: `code` alanı Postgres
 * SQLSTATE değerini taşıyor, `fail()` zaten buna bakıyordu.
 */

export interface PostgrestHata {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

export interface Sonuc<T> {
  data: T | null;
  error: PostgrestHata | null;
}

type Yon = { ascending?: boolean };

/** Satır tipi belirtilmediğinde varsayılan: adı bilinmeyen sütunlar. */
export type Satir = Record<string, unknown>;

/** `single()` sonrası dizi tek satıra daralır. */
type Tekil<T> = T extends (infer U)[] ? U : T;

/** Erişim jetonunu isteyen geri çağırma; oturum yenilenince değişir. */
export type JetonSaglayici = () => string | null;

/**
 * Zincirlenebilir sorgu.
 *
 * `await` edilebilmesi için `then` uyguluyor: depo kodu
 * `await db().from('x').select('*').eq('id', y)` yazmaya devam ediyor.
 */
class Sorgu<T> implements PromiseLike<Sonuc<T>> {
  private suzgecler: string[] = [];
  private duzen: string[] = [];
  private sinir?: number;
  private secim = '*';
  private yontem: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET';
  private govde?: unknown;
  private tekil: 'yok' | 'zorunlu' | 'istege-bagli' = 'yok';
  private cakismaCozumu = false;
  private cakismaSutunlari = '';

  constructor(
    private taban: string,
    private tablo: string,
    private jeton: JetonSaglayici,
  ) {}

  select(sutunlar = '*'): this {
    this.secim = sutunlar;
    return this;
  }

  insert(satirlar: unknown): this {
    this.yontem = 'POST';
    this.govde = satirlar;
    return this;
  }

  /**
   * Çakışan satırı günceller (upsert).
   *
   * `onConflict` VERİLMEZSE PostgREST çakışmayı BİRİNCİL ANAHTARA göre
   * çözer. Benzersizliği ayrı bir kısıtta olan tablolarda bu yanlış
   * sonuç verir: örneğin `sms_consents` tablosunun anahtarı otomatik
   * üretilen bir uuid, benzersizliği ise (business_id, phone) üzerinde.
   * Sütunlar belirtilmezse her çağrı yeni bir uuid ile eklemeye çalışır
   * ve güncelleme yerine çakışma hatası alınır.
   */
  upsert(satirlar: unknown, secenek: { onConflict?: string } = {}): this {
    this.yontem = 'POST';
    this.govde = satirlar;
    this.cakismaCozumu = true;
    this.cakismaSutunlari = secenek.onConflict ?? '';
    return this;
  }

  update(yama: unknown): this {
    this.yontem = 'PATCH';
    this.govde = yama;
    return this;
  }

  delete(): this {
    this.yontem = 'DELETE';
    return this;
  }

  private suzgec(sutun: string, islec: string, deger: unknown): this {
    this.suzgecler.push(`${encodeURIComponent(sutun)}=${islec}.${kodla(deger)}`);
    return this;
  }

  /** Kaçırılmadan geçen süzgeç: `is.null` gibi anahtar sözcükler için. */
  private hamSuzgec(sutun: string, ifade: string): this {
    this.suzgecler.push(`${encodeURIComponent(sutun)}=${ifade}`);
    return this;
  }

  eq(sutun: string, deger: unknown) { return this.suzgec(sutun, 'eq', deger); }
  neq(sutun: string, deger: unknown) { return this.suzgec(sutun, 'neq', deger); }
  gt(sutun: string, deger: unknown) { return this.suzgec(sutun, 'gt', deger); }
  gte(sutun: string, deger: unknown) { return this.suzgec(sutun, 'gte', deger); }
  lt(sutun: string, deger: unknown) { return this.suzgec(sutun, 'lt', deger); }
  lte(sutun: string, deger: unknown) { return this.suzgec(sutun, 'lte', deger); }

  /*
    `is` yalnızca null/true/false alır ve bunlar anahtar sözcüktür:
    tırnağa alınırlarsa PostgREST onları metin sanar ve süzgeç hiçbir
    satır döndürmez -- hata da vermez, sessizce boş liste gelir.
  */
  is(sutun: string, deger: null | boolean) {
    return this.hamSuzgec(sutun, `is.${deger === null ? 'null' : String(deger)}`);
  }

  in(sutun: string, degerler: unknown[]) {
    // Parantez ve virgül sözdizimine ait; yalnızca değerler kaçırılıyor.
    const liste = degerler.map((d) => listeDegeri(d)).join(',');
    return this.hamSuzgec(sutun, `in.(${liste})`);
  }

  order(sutun: string, secenek: Yon = {}): this {
    const yon = secenek.ascending === false ? 'desc' : 'asc';
    this.duzen.push(`${sutun}.${yon}`);
    return this;
  }

  limit(adet: number): this {
    this.sinir = adet;
    return this;
  }

  /**
   * Tam olarak bir satır bekler; yoksa ya da birden çoksa hata.
   *
   * Dönen `data` null DEĞİL olarak tipleniyor: satır gelmediğinde
   * PostgREST hata döndürüyor ve çağıran zaten `error` dalında
   * `fail()` ile çıkıyor. Zincirin sonu olduğu için sorgu nesnesi
   * değil, doğrudan beklenebilir bir sonuç veriliyor.
   */
  single(): PromiseLike<{ data: Tekil<T>; error: PostgrestHata | null }> {
    this.tekil = 'zorunlu';
    return this as unknown as PromiseLike<{ data: Tekil<T>; error: PostgrestHata | null }>;
  }

  /** En çok bir satır; yoksa `data` null olur, hata değil. */
  maybeSingle(): Sorgu<Tekil<T>> {
    this.tekil = 'istege-bagli';
    return this as unknown as Sorgu<Tekil<T>>;
  }

  private adres(): string {
    const parcalar = [...this.suzgecler];
    // DELETE ve PATCH'te `select` sorgusu yalnızca dönen gösterimi belirler.
    if (this.yontem !== 'DELETE') parcalar.unshift(`select=${encodeURIComponent(this.secim)}`);
    if (this.cakismaSutunlari) {
      parcalar.push(`on_conflict=${encodeURIComponent(this.cakismaSutunlari)}`);
    }
    if (this.duzen.length) parcalar.push(`order=${this.duzen.join(',')}`);
    if (this.sinir !== undefined) parcalar.push(`limit=${this.sinir}`);
    return `${this.taban}/${this.tablo}?${parcalar.join('&')}`;
  }

  private basliklar(): Record<string, string> {
    const cikti: Record<string, string> = {};
    const jeton = this.jeton();
    if (jeton) cikti.authorization = `Bearer ${jeton}`;
    if (this.govde !== undefined) cikti['content-type'] = 'application/json';

    const tercih: string[] = [];
    if (this.yontem !== 'GET') tercih.push('return=representation');
    if (this.cakismaCozumu) tercih.push('resolution=merge-duplicates');
    if (tercih.length) cikti.prefer = tercih.join(',');

    /*
      `single()` için PostgREST'in tekil biçimini istiyoruz: satır sayısı
      birden farklıysa sunucu hata döndürüyor. Kontrolü istemcide yapmak,
      "iki satır döndü ama ilkini aldık" gibi sessiz bir yanlışa kapı
      aralardı.
    */
    if (this.tekil === 'zorunlu') cikti.accept = 'application/vnd.pgrst.object+json';
    return cikti;
  }

  async calistir(): Promise<Sonuc<T>> {
    let yanit: Response;
    try {
      yanit = await fetch(this.adres(), {
        method: this.yontem,
        headers: this.basliklar(),
        body: this.govde === undefined ? undefined : JSON.stringify(this.govde),
      });
    } catch {
      // Ağ hatası: sunucu kapalı ya da bağlantı koptu.
      return { data: null, error: { message: 'Sunucuya ulaşılamadı.', code: 'AG' } };
    }

    const metin = await yanit.text();
    if (!yanit.ok) {
      let hata: PostgrestHata = { message: metin || `İstek başarısız (${yanit.status}).` };
      try {
        const coz = JSON.parse(metin) as PostgrestHata;
        if (coz && typeof coz.message === 'string') hata = coz;
      } catch { /* gövde JSON değilse ham metin kalır */ }
      return { data: null, error: hata };
    }

    if (!metin) return { data: null as T | null, error: null };

    const veri = JSON.parse(metin) as unknown;
    if (this.tekil === 'istege-bagli') {
      const dizi = Array.isArray(veri) ? veri : [veri];
      return { data: (dizi[0] ?? null) as T | null, error: null };
    }
    return { data: veri as T, error: null };
  }

  then<A = Sonuc<T>, B = never>(
    basarili?: ((deger: Sonuc<T>) => A | PromiseLike<A>) | null,
    basarisiz?: ((sebep: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.calistir().then(basarili, basarisiz);
  }
}

/**
 * Tekil süzgeç değeri (eq, gte, lt ...).
 *
 * Yalnızca URL kaçırması yapılır. Çift tırnak EKLENMEZ: PostgREST tekil
 * süzgeçte tırnağı değerin parçası sayıyor, `eq."A Salonu"` hiçbir
 * satır döndürmüyor -- üstelik hata da vermiyor, sessizce boş liste
 * geliyor. Tırnaklamanın doğru yeri yalnızca liste bağlamı.
 *
 * Boşluk ve Türkçe harfler adrese ham konulamaz; konulduğunda yine
 * sessizce sıfır satır dönüyordu.
 */
function kodla(deger: unknown): string {
  if (deger === null) return 'null';
  return encodeURIComponent(String(deger));
}

/**
 * Liste içi değer (`in.(...)`).
 *
 * Burada virgül sözdizimine ait olduğu için tırnak ZORUNLU: "Yılmaz,
 * Ali" tırnaksız yazılırsa iki ayrı değer sanılır.
 */
function listeDegeri(deger: unknown): string {
  if (deger === null) return 'null';
  const metin = String(deger).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return encodeURIComponent(`"${metin}"`);
}

export interface PostgrestIstemci {
  from<T = Satir[]>(tablo: string): Sorgu<T>;
  rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<Sonuc<T>>;
}

export function postgrestIstemci(taban: string, jeton: JetonSaglayici): PostgrestIstemci {
  const kok = taban.replace(/\/$/, '');
  return {
    from<T = Satir[]>(tablo: string) {
      return new Sorgu<T>(kok, tablo, jeton);
    },

    async rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<Sonuc<T>> {
      const basliklar: Record<string, string> = { 'content-type': 'application/json' };
      const j = jeton();
      if (j) basliklar.authorization = `Bearer ${j}`;

      let yanit: Response;
      try {
        yanit = await fetch(`${kok}/rpc/${fn}`, {
          method: 'POST', headers: basliklar, body: JSON.stringify(args),
        });
      } catch {
        return { data: null, error: { message: 'Sunucuya ulaşılamadı.', code: 'AG' } };
      }

      const metin = await yanit.text();
      if (!yanit.ok) {
        let hata: PostgrestHata = { message: metin || `İstek başarısız (${yanit.status}).` };
        try {
          const coz = JSON.parse(metin) as PostgrestHata;
          if (coz && typeof coz.message === 'string') hata = coz;
        } catch { /* ham metin */ }
        return { data: null, error: hata };
      }
      return { data: (metin ? JSON.parse(metin) : null) as T, error: null };
    },
  };
}
