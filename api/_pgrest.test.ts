/**
 * PostgREST -> SQL çevirisi.
 *
 * Bu modül veritabanına dokunmuyor, o yüzden burada gerçek bir bağlantı
 * yok: üretilen METİN ve PARAMETRE DİZİSİ sınanıyor. Asıl mesele iki
 * şey:
 *
 *   1. Değerler her zaman `$n` olarak gitmeli. Metne gömülen tek bir
 *      değer SQL enjeksiyonu demek.
 *   2. Tablo ve sütun adları SQL'de parametrelenemiyor; denetimi
 *      geçemeyen bir ad SESSİZCE ATLANMAMALI, istek düşmeli.
 *
 * Gerçek veritabanına karşı çalıştırma ayrı bir testte
 * (`_pgrest.veritabani.test.ts`): burada üretilen SQL'in Postgres
 * tarafından kabul edildiğini metin karşılaştırması gösteremez.
 */
import { describe, expect, it } from 'vitest';
import { CevrimHatasi, cevir, type Istek } from './_pgrest';

function istek(kismi: Partial<Istek> & { tablo: string }): Istek {
  return {
    yontem: 'GET',
    parametreler: new URLSearchParams(),
    temsilDondur: false,
    cakismaCozumu: false,
    ...kismi,
  };
}

describe('okuma', () => {
  it('sütun verilmediğinde bütün satırı seçer', () => {
    const { metin, degerler } = cevir(istek({ tablo: 'halls' }));
    expect(metin).toBe('select "t".* from "halls" "t"');
    expect(degerler).toEqual([]);
  });

  it('seçilen sütunları tek tek yazar', () => {
    const c = cevir(istek({
      tablo: 'halls',
      parametreler: new URLSearchParams('select=id,name'),
    }));
    expect(c.metin).toBe('select "t"."id", "t"."name" from "halls" "t"');
  });

  it('eşitlik süzgecini parametreye bağlar', () => {
    const c = cevir(istek({
      tablo: 'halls',
      parametreler: new URLSearchParams('business_id=eq.biz_1'),
    }));
    expect(c.metin).toBe('select "t".* from "halls" "t" where "t"."business_id" = $1');
    expect(c.degerler).toEqual(['biz_1']);
  });

  it('sıralama ve sınırı ekler', () => {
    const c = cevir(istek({
      tablo: 'reservations',
      parametreler: new URLSearchParams('order=date.desc&limit=50'),
    }));
    expect(c.metin).toBe('select "t".* from "reservations" "t" order by "t"."date" desc limit 50');
  });

  it('birden çok süzgeci "and" ile birleştirir ve sırayı korur', () => {
    const c = cevir(istek({
      tablo: 'reservations',
      parametreler: new URLSearchParams('business_id=eq.b1&status=neq.İptal'),
    }));
    expect(c.metin).toContain('"t"."business_id" = $1');
    expect(c.metin).toContain('"t"."status" <> $2');
    expect(c.degerler).toEqual(['b1', 'İptal']);
  });
});

describe('işleçler', () => {
  it('is null ve olumsuzunu anahtar sözcükle yazar', () => {
    expect(cevir(istek({ tablo: 'x', parametreler: new URLSearchParams('a=is.null') })).metin)
      .toBe('select "t".* from "x" "t" where "t"."a" is null');
    expect(cevir(istek({ tablo: 'x', parametreler: new URLSearchParams('a=not.is.null') })).metin)
      .toBe('select "t".* from "x" "t" where "t"."a" is not null');
  });

  it('in listesini ayrı parametrelere böler', () => {
    const c = cevir(istek({
      tablo: 'payments',
      parametreler: new URLSearchParams('reservation_id=in.("r1","r2")'),
    }));
    expect(c.metin).toBe('select "t".* from "payments" "t" where "t"."reservation_id" in ($1, $2)');
    expect(c.degerler).toEqual(['r1', 'r2']);
  });

  it('liste değerindeki virgülü ayraç sanmaz', () => {
    // "Yılmaz, Ali" tek bir değerdir; tırnak tam bunun için var.
    const c = cevir(istek({
      tablo: 'x',
      parametreler: new URLSearchParams('ad=in.("Yılmaz, Ali","Veli")'),
    }));
    expect(c.degerler).toEqual(['Yılmaz, Ali', 'Veli']);
  });

  it('kaçırılmış tırnağı geri açar', () => {
    const c = cevir(istek({
      tablo: 'x',
      parametreler: new URLSearchParams('ad=in.("A \\"B\\" C")'),
    }));
    expect(c.degerler).toEqual(['A "B" C']);
  });

  it('boş in listesini hiçbir satır olarak çevirir', () => {
    // `in ()` sözdizimi hatası verirdi; sessizce her satırı döndürmek ise
    // çok daha kötü olurdu.
    const c = cevir(istek({ tablo: 'x', parametreler: new URLSearchParams('a=in.()') }));
    expect(c.metin).toContain('where false');
    expect(c.degerler).toEqual([]);
  });

  it('not.in listesini olumsuzlar', () => {
    const c = cevir(istek({
      tablo: 'audit_log',
      parametreler: new URLSearchParams('table_name=not.in.("invoices")'),
    }));
    expect(c.metin).toContain('"t"."table_name" not in ($1)');
  });

  it('karşılaştırma işleçlerinin hepsini tanır', () => {
    for (const [islec, sql] of [['gt', '>'], ['gte', '>='], ['lt', '<'], ['lte', '<=']]) {
      const c = cevir(istek({ tablo: 'x', parametreler: new URLSearchParams(`a=${islec}.5`) }));
      expect(c.metin).toContain(`"t"."a" ${sql} $1`);
    }
  });
});

describe('gömülü ilişkiler', () => {
  it('fatura kalemlerini json dizisi olarak ekler', () => {
    const c = cevir(istek({
      tablo: 'invoices',
      parametreler: new URLSearchParams('select=*, invoice_lines(*)&id=eq.f1'),
    }));
    expect(c.metin).toContain('json_agg');
    expect(c.metin).toContain('as "invoice_lines"');
    // Boş dizi garantisi: null dönseydi çağıran taraf çökerdi.
    expect(c.metin).toContain("'[]'::json");
  });

  it('!inner ilişkisini join ile süzer', () => {
    const c = cevir(istek({
      tablo: 'payments',
      parametreler: new URLSearchParams(
        'select=*, reservations!inner(business_id)&reservations.business_id=eq.b1',
      ),
    }));
    expect(c.metin).toContain('join "reservations" "reservations"');
    expect(c.metin).toContain('"reservations"."id" = "t"."reservation_id"');
    expect(c.metin).toContain('"reservations"."business_id" = $1');
    expect(c.degerler).toEqual(['b1']);
  });

  it('tanımsız ilişkiyi sessizce yok saymaz', () => {
    // Bilinmeyen bir gömme sessizce atlanırsa ekran eksik veriyle
    // çizilir ve bu hiç fark edilmeyebilir.
    expect(() => cevir(istek({
      tablo: 'halls',
      parametreler: new URLSearchParams('select=*, menus(*)'),
    }))).toThrow(CevrimHatasi);
  });
});

describe('yazma', () => {
  it('ekleme alanları parametreye bağlar', () => {
    const c = cevir(istek({
      yontem: 'POST', tablo: 'halls', temsilDondur: true,
      govde: { id: 'h1', name: 'Kristal' },
    }));
    expect(c.metin).toBe('insert into "halls" ("id", "name") values ($1, $2) returning *');
    expect(c.degerler).toEqual(['h1', 'Kristal']);
  });

  it('çok satırlı eklemede her satıra ayrı parametre verir', () => {
    const c = cevir(istek({
      yontem: 'POST', tablo: 'halls',
      govde: [{ id: 'h1' }, { id: 'h2' }],
    }));
    expect(c.metin).toContain('values ($1), ($2)');
    expect(c.degerler).toEqual(['h1', 'h2']);
  });

  it('upsert çakışmayı birincil anahtara göre çözer', () => {
    const c = cevir(istek({
      yontem: 'POST', tablo: 'halls', cakismaCozumu: true, temsilDondur: true,
      govde: { id: 'h1', name: 'Yeni' },
    }));
    expect(c.metin).toContain('on conflict ("id") do update set "name" = excluded."name"');
  });

  it('on_conflict verildiğinde onu kullanır', () => {
    const c = cevir(istek({
      yontem: 'POST', tablo: 'payment_alerts', cakismaCozumu: true,
      parametreler: new URLSearchParams('on_conflict=business_id,event'),
      govde: { business_id: 'b1', event: 'tutar_degisti', enabled: true },
    }));
    expect(c.metin).toContain('on conflict ("business_id", "event") do update set "enabled"');
  });

  it('id olmadan ve on_conflict verilmeden upsert yapmaz', () => {
    // Sessizce ikinci bir satır açardı: aynı kayıt listede iki kez.
    expect(() => cevir(istek({
      yontem: 'POST', tablo: 'halls', cakismaCozumu: true,
      govde: { name: 'Kristal' },
    }))).toThrow(/id.*on_conflict/);
  });

  it('güncellemede süzgeç ve atama parametrelerini karıştırmaz', () => {
    const c = cevir(istek({
      yontem: 'PATCH', tablo: 'halls', temsilDondur: true,
      parametreler: new URLSearchParams('id=eq.h1'),
      govde: { name: 'Yeni ad' },
    }));
    // Süzgeç $1'i aldı, atama $2'yi; dizi de aynı sırada olmalı.
    expect(c.metin).toBe('update "halls" "t" set "name" = $2 where "t"."id" = $1 returning "t".*');
    expect(c.degerler).toEqual(['h1', 'Yeni ad']);
  });

  it('silmede süzgeci uygular', () => {
    const c = cevir(istek({
      yontem: 'DELETE', tablo: 'payments',
      parametreler: new URLSearchParams('id=eq.p1'),
    }));
    expect(c.metin).toBe('delete from "payments" "t" where "t"."id" = $1');
    expect(c.degerler).toEqual(['p1']);
  });

  it('boş gövdeyle güncelleme yapmaz', () => {
    expect(() => cevir(istek({
      yontem: 'PATCH', tablo: 'halls', govde: {},
      parametreler: new URLSearchParams('id=eq.h1'),
    }))).toThrow(CevrimHatasi);
  });
});

/*
  Adlar SQL'de parametrelenemiyor, metne yazılmak zorundalar. Tek savunma
  biçim denetimi: uymayan ad isteği düşürüyor. Bu blok o savunmanın
  gerçekten çalıştığını gösteriyor -- kaçırmanın bedeli veritabanının
  tamamı.
*/
describe('ad denetimi', () => {
  const kotu = [
    'halls; drop table users',
    'halls"',
    "halls'",
    'halls--',
    'HALLS',
    'hall s',
    '1halls',
    'public.halls',
  ];

  it.each(kotu)('tablo adı olarak %s kabul edilmez', (tablo) => {
    expect(() => cevir(istek({ tablo }))).toThrow(CevrimHatasi);
  });

  it.each(kotu)('sütun adı olarak %s kabul edilmez', (sutun) => {
    const p = new URLSearchParams();
    p.set(sutun, 'eq.1');
    expect(() => cevir(istek({ tablo: 'halls', parametreler: p }))).toThrow(CevrimHatasi);
  });

  it('select içindeki kötü adı kabul etmez', () => {
    expect(() => cevir(istek({
      tablo: 'halls',
      parametreler: new URLSearchParams('select=id,name; drop table users'),
    }))).toThrow(CevrimHatasi);
  });

  it('order içindeki kötü adı kabul etmez', () => {
    expect(() => cevir(istek({
      tablo: 'halls',
      parametreler: new URLSearchParams('order=name; drop table users.asc'),
    }))).toThrow(CevrimHatasi);
  });

  it('yazma alanındaki kötü adı kabul etmez', () => {
    expect(() => cevir(istek({
      yontem: 'POST', tablo: 'halls',
      govde: { 'name"; drop table users; --': 'x' },
    }))).toThrow(CevrimHatasi);
  });

  it('limit sayı değilse kabul etmez', () => {
    expect(() => cevir(istek({
      tablo: 'halls', parametreler: new URLSearchParams('limit=5; drop table users'),
    }))).toThrow(CevrimHatasi);
  });

  it('bilinmeyen işleci kabul etmez', () => {
    expect(() => cevir(istek({
      tablo: 'halls', parametreler: new URLSearchParams('id=like.%25'),
    }))).toThrow(/işleç/);
  });

  it('değerdeki tırnak metne sızmaz, parametrede kalır', () => {
    const c = cevir(istek({
      tablo: 'halls',
      parametreler: new URLSearchParams("name=eq.O'Brien'; drop table users; --"),
    }));
    expect(c.metin).toBe('select "t".* from "halls" "t" where "t"."name" = $1');
    expect(c.degerler).toEqual(["O'Brien'; drop table users; --"]);
  });
});
