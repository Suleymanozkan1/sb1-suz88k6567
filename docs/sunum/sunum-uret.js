/**
 * Sahra Takip tanıtım sunumunu üretir.
 *
 *   node docs/sunum/ss-yakala.mjs   # ekran görüntülerini docs/ss/ altına yazar
 *   node docs/sunum/sunum-uret.js   # Sahra-Takip-Tanitim.pptx üretir
 *
 * Slaytlar aşağıdaki düzen kitaplığı üzerine kurulur; her slayt yalnızca
 * kendi içeriğini tarif eder. Koordinatlar tek tek elle verilmediği için
 * slayt eklemek ya da sırayı değiştirmek hizayı bozmaz.
 */
import pptxgen from 'pptxgenjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../ss');
const img = (n) => path.join(SS, n);

/* ── Tasarım değişkenleri ────────────────────────────────────────── */

const NAVY = '25365A', BRAND = '37517E', SKY = '47B2E4', ACCENT = 'C9A227';
const SURFACE = 'F3F5FA', INK = '333F55', MUTED = '6B7A99';
const WHITE = 'FFFFFF', PALE = 'C6D2E8', LINE = 'DCE3EF', KART_LINE = 'E3E9F4';
const H = 'Cambria', B = 'Calibri';

/** Slayt 13,333 × 7,5 inç. Kenar boşluğu 0,7 → içerik genişliği 11,93. */
const KENAR = 0.7, GENIS = 11.93;
/** Başlık bloğunun altı: içerik buradan başlar. */
const UST = 1.75;

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';
pres.author = 'Sahra Takip';
pres.title = 'Sahra Takip: Salon Yönetim Sistemi';

/* ── Düzen ───────────────────────────────────────────────────────── */

/** Yeni slayt; zemin rengi verilmezse beyaz. */
function slayt(zemin = WHITE) {
  const s = pres.addSlide();
  s.background = { color: zemin };
  return s;
}

/** Üstlük (küçük mavi etiket) ve slayt başlığı. */
function baslik(s, ustluk, metin, { koyu = false } = {}) {
  s.addText(ustluk, {
    x: KENAR, y: 0.44, w: 9, h: 0.3, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 12, bold: true, color: SKY, charSpacing: 2,
  });
  s.addText(metin, {
    x: KENAR, y: 0.78, w: GENIS, h: 0.8, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 31, bold: true, color: koyu ? WHITE : NAVY,
  });
}

/** PNG başlığından gerçek en/boy okunur (IHDR alanı, 16-24. baytlar). */
function pngBoyut(dosya) {
  const b = fs.readFileSync(dosya).subarray(16, 24);
  return { w: b.readUInt32BE(0), h: b.readUInt32BE(4) };
}

/**
 * Ekran görüntüsünü verilen kutuya oranını bozmadan sığdırır, ortalar,
 * çerçeveler ve varsa alt yazısını görselin altına yazar.
 *
 * Sabit en/boy vermek görüntüleri eziyordu: ekran görüntülerinin boyu
 * içeriğe göre değişiyor, oranları birbirini tutmuyor.
 */
function gorsel(s, dosya, { x, y, w, h, altYazi, koyu = false }) {
  const boyut = pngBoyut(dosya);
  const oran = boyut.w / boyut.h;
  let gw = w, gh = w / oran;
  if (gh > h) { gh = h; gw = h * oran; }
  const gx = x + (w - gw) / 2, gy = y + (h - gh) / 2;

  s.addShape(pres.ShapeType.roundRect, {
    x: gx - 0.08, y: gy - 0.08, w: gw + 0.16, h: gh + 0.16, rectRadius: 0.08,
    fill: { color: WHITE }, line: { color: LINE, width: 1 },
    shadow: { type: 'outer', color: '1B2A4A', opacity: 0.16, blur: 12, offset: 3, angle: 90 },
  });
  s.addImage({ path: dosya, x: gx, y: gy, w: gw, h: gh });
  if (altYazi) {
    s.addText(altYazi, {
      x: gx, y: gy + gh + 0.14, w: gw, h: 0.28, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 10.5, color: koyu ? PALE : MUTED,
    });
  }
}

/** Başlıklı madde listesi: genellikle bir görselin yanında. */
function maddeler(s, { x, y, w, gap, items, koyu = false }) {
  items.forEach(([bas, ack], i) => {
    const yy = y + i * gap;
    s.addText(bas, {
      x, y: yy, w, h: 0.3, isTextBox: true, margin: 0, valign: 'top',
      fontFace: B, fontSize: 14, bold: true, color: koyu ? SKY : NAVY,
    });
    s.addText(ack, {
      x, y: yy + 0.3, w, h: gap - 0.36, isTextBox: true, margin: 0, valign: 'top',
      fontFace: B, fontSize: 12, color: koyu ? PALE : INK, lineSpacing: 16,
    });
  });
}

/** Eşit genişlikte kart ızgarası; sütun sayısına göre satırlara bölünür. */
function kartlar(s, { items, y, h, sutun = 3, koyu = false, satirBosluk = 0.35 }) {
  const bosluk = 0.3;
  const w = (GENIS - bosluk * (sutun - 1)) / sutun;
  items.forEach(([bas, ack], i) => {
    const x = KENAR + (i % sutun) * (w + bosluk);
    const yy = y + Math.floor(i / sutun) * (h + satirBosluk);
    s.addShape(pres.ShapeType.roundRect, {
      x, y: yy, w, h, rectRadius: 0.1,
      fill: { color: koyu ? BRAND : SURFACE },
      line: { color: koyu ? BRAND : KART_LINE, width: 1 },
    });
    s.addText(bas, {
      x: x + 0.32, y: yy + 0.28, w: w - 0.64, h: 0.36, isTextBox: true, margin: 0,
      fontFace: H, fontSize: 17, bold: true, color: koyu ? WHITE : NAVY,
    });
    s.addText(ack, {
      x: x + 0.32, y: yy + 0.72, w: w - 0.64, h: h - 1.0, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 12.5, color: koyu ? PALE : INK, lineSpacing: 17,
    });
  });
}

/** Slaydın altında eşit aralıklı kısa etiket + açıklama şeridi. */
function mikroNotlar(s, { items, y, koyu = false, ortala = false }) {
  const bosluk = 0.3;
  const w = (GENIS - bosluk * (items.length - 1)) / items.length;
  const hiza = ortala ? 'center' : 'left';
  items.forEach(([bas, ack], i) => {
    const x = KENAR + i * (w + bosluk);
    s.addText(bas, {
      x, y, w, h: 0.28, isTextBox: true, margin: 0, align: hiza, valign: 'top',
      fontFace: B, fontSize: 13, bold: true, color: koyu ? SKY : NAVY,
    });
    s.addText(ack, {
      x, y: y + 0.28, w, h: 0.62, isTextBox: true, margin: 0, align: hiza, valign: 'top',
      fontFace: B, fontSize: 11.5, color: koyu ? PALE : INK, lineSpacing: 15,
    });
  });
}

/**
 * Koyu vurgu paneli: bir başlık ve bir paragraf.
 *
 * Zemin verilebilir; lacivert slaytta varsayılan lacivert panel görünmez
 * oluyordu, orada marka mavisi kullanılır.
 */
function panel(s, { x, y, w, h, bas, metin, zemin = NAVY }) {
  s.addShape(pres.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.1, fill: { color: zemin }, line: { color: zemin },
  });
  s.addText(bas, {
    x: x + 0.35, y: y + 0.3, w: w - 0.7, h: 0.36, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 19, bold: true, color: WHITE,
  });
  s.addText(metin, {
    x: x + 0.35, y: y + 0.76, w: w - 0.7, h: h - 1.1, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 12, color: PALE, lineSpacing: 17,
  });
}

/** Slaydın altına tek bloklu açıklama. */
function dipnot(s, metin, y, { kucuk = false, koyu = false, w = GENIS } = {}) {
  s.addText(metin, {
    x: KENAR, y, w, h: kucuk ? 0.4 : 0.6, isTextBox: true, margin: 0, valign: 'top',
    fontFace: B, fontSize: kucuk ? 11 : 12.5,
    color: kucuk ? MUTED : (koyu ? PALE : INK), lineSpacing: 17,
  });
}

/** Başlık satırı koyu, gövde satırları dönüşümlü zeminli tablo. */
function tablo(s, { basliklar, satirlar, x, y, w, colW, rowH = 0.46, hizalar = [] }) {
  const rows = [basliklar.map((t, i) => ({
    text: t,
    options: { bold: true, color: WHITE, fill: { color: NAVY }, fontSize: 12, align: hizalar[i] ?? 'left' },
  }))];
  satirlar.forEach((satir, i) => {
    const bg = i % 2 ? SURFACE : WHITE;
    rows.push(satir.map((hucre, j) => {
      const duz = typeof hucre === 'string';
      return {
        text: duz ? hucre : hucre.text,
        options: {
          color: duz ? INK : hucre.color ?? INK,
          bold: !duz && hucre.bold === true,
          fill: { color: bg }, fontSize: 12.5, align: hizalar[j] ?? 'left',
        },
      };
    }));
  });
  s.addTable(rows, {
    x, y, w, colW, rowH,
    border: { type: 'solid', color: LINE, pt: 1 },
    fontFace: B, valign: 'middle', margin: 0.08,
  });
}

/* ══ 1 · Kapak ════════════════════════════════════════════════ */
{
  const s = slayt(NAVY);
  s.addShape(pres.ShapeType.ellipse, {
    x: 9.8, y: -2.0, w: 6.2, h: 6.2, fill: { color: BRAND }, line: { color: BRAND },
  });
  s.addText('SALON YÖNETİM SİSTEMİ', {
    x: 0.9, y: 2.5, w: 8, h: 0.32, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 13, bold: true, color: SKY, charSpacing: 3,
  });
  s.addText('Sahra Takip', {
    x: 0.9, y: 2.9, w: 8.4, h: 1.3, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 58, bold: true, color: WHITE,
  });
  s.addText('Rezervasyon, tahsilat, sözleşme, fatura ve organizasyon planlaması için\nweb tabanlı salon yönetim sistemi.', {
    x: 0.9, y: 4.25, w: 8.75, h: 0.9, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 17, color: PALE, lineSpacing: 27,
  });
  s.addNotes('Açılış. Sistemin ne olduğu tek cümlede belirtilir.');
}

/* ══ 2 · Kapsam ═══════════════════════════════════════════════ */
{
  const s = slayt();
  baslik(s, 'KAPSAM', 'Sistem neleri kapsıyor');
  kartlar(s, {
    y: 1.8, h: 1.5, sutun: 3, satirBosluk: 0.22,
    items: [
      ['Rezervasyon', 'Takvim, salon tanımları, rezervasyon kaydı, sözleşme, kod doğrulama'],
      ['Para', 'Tahsilat, kasa, makbuz, raporlar'],
      ['Organizasyon', 'Menü ve paketler, masa düzeni, iş emri, tedarikçiler'],
      ['Mevzuat', 'e-Arşiv / e-Fatura, İYS izin yönetimi, KVKK, denetim kaydı'],
      ['İletişim', 'Hatırlatma şablonları ve otomatik SMS gönderimi'],
      ['Yönetim', 'Kullanıcılar ve yetkiler, yedekleme, sistem durumu'],
      ['Mobil', 'iOS ve Android uygulaması: panelin bütün ekranları telefonda'],
      ['Müşteri takibi', 'Müşteri adayları, WhatsApp’tan gelen talepler, takip tarihi ve dönüşüm'],
      ['Kasa dağılımı', 'Paranın ne kadarı nakit, kart ve havalede; ödeme tipinden çıkar'],
    ],
  });
  s.addNotes('Dokuz başlığın kısa dökümü. Ayrıntılar sonraki slaytlarda.');
}

/* ══ 3 · Takvim ═══════════════════════════════════════════════ */
{
  const s = slayt();
  baslik(s, 'TAKVİM', 'Rezervasyon takvimi');
  gorsel(s, img('panel-takvim.png'), {
    x: KENAR, y: UST, w: 7.7, h: 4.81,
    altYazi: 'Bir ayın gündüz ve gece seansları, organizasyon türüne göre renklendirilmiş.',
  });
  maddeler(s, {
    x: 8.85, y: 1.9, w: 3.75, gap: 1.6,
    items: [
      ['Gün başına iki seans', 'Gündüz ve gece ayrı tutulur; yarım gün satışları da izlenir.'],
      ['Renk kodu', 'Düğün, nişan, kına, sünnet gibi türler ayrı renkte gösterilir.'],
      ['Çakışma engeli', 'Dolu bir salon-seans birleşimine ikinci kayıt açılamaz. Kural veritabanında tanımlıdır.'],
    ],
  });
  s.addNotes('Renk eşlemesi Renk Ayarları ekranından değiştirilebilir.');
}

/* ══ 4 · Salonlar ═════════════════════════════════════════════ */
{
  const s = slayt(SURFACE);
  baslik(s, 'SALONLAR', 'Salon tanımları');
  gorsel(s, img('panel-salonlar.png'), {
    x: KENAR, y: UST, w: 7.3, h: 4.56,
    altYazi: 'Her salonun kapasitesi ve bağlı rezervasyon sayısı.',
  });
  maddeler(s, {
    x: 8.45, y: 1.9, w: 4.15, gap: 1.2,
    items: [
      ['Birden çok salon', 'Bir işletmede istenen sayıda salon tanımlanır.'],
      ['Salon bazlı çakışma', 'Aynı gün ve seansta farklı salonlara rezervasyon açılabilir, aynı salona açılamaz.'],
      ['Kapasite', 'Salonun kişi kapasitesi rezervasyon ekranında görünür.'],
      ['Pasife alma', 'Kullanım dışı salon, kayıtları silinmeden yeni rezervasyona kapatılır.'],
    ],
  });
  s.addNotes('Yeni bir işletme oluşturulduğunda sistem kendiliğinden bir "Ana Salon" açar.');
}

/* ══ 5 · Rezervasyon ve tahsilat ══════════════════════════════ */
{
  const s = slayt();
  baslik(s, 'REZERVASYON', 'Rezervasyon kaydı ve tahsilat');
  gorsel(s, img('panel-rezervasyon-detay.png'), {
    x: KENAR, y: UST, w: 7.2, h: 4.5,
    altYazi: 'Rezervasyon bilgileri, ödeme durumu ve tahsilat listesi tek sayfada.',
  });
  maddeler(s, {
    x: 8.35, y: 1.9, w: 4.25, gap: 1.2,
    items: [
      ['Kalan alacak', 'Toplam tutardan tahsilatlar düşülerek hesaplanır.'],
      ['Tahsilat kaydı', 'Tarih, tutar, ödeme şekli ve açıklama tutulur.'],
      ['Kapora kontrolü', 'Kapora toplam tutarı aşamaz.'],
      ['Durum', 'Ön rezervasyon, kesin rezervasyon, tamamlandı, iptal.'],
    ],
  });
  s.addNotes('Ekrandaki örnekte 180.000 ₺ toplam, 45.000 ₺ kapora, 80.000 ₺ tahsilat ve 100.000 ₺ kalan alacak görünüyor.');
}

/* ══ 6 · Menüler ══════════════════════════════════════════════ */
{
  const s = slayt();
  baslik(s, 'MENÜLER', 'Menü ve paket tanımları');
  gorsel(s, img('panel-menuler.png'), {
    x: KENAR, y: UST, w: 7.3, h: 4.4,
    altYazi: 'Menü kartları; kişi başı menülerde örnek kişi sayılarına göre tutarlar.',
  });
  maddeler(s, {
    x: 8.45, y: 1.9, w: 4.15, gap: 1.55,
    items: [
      ['İki fiyat türü', 'Kişi başı ya da sabit tutar.'],
      ['Tutar önerisi', 'Rezervasyona menü seçildiğinde toplam tutar hesaplanıp önerilir; kullanıcı değiştirebilir.'],
      ['Örnek tutarlar', '150, 300 ve 500 kişilik karşılıklar menü kartında görünür.'],
    ],
  });
  s.addNotes('Fiyatlar kuruş cinsinden tamsayı olarak saklanır.');
}

/* ══ 7 · Belgeler ═════════════════════════════════════════════ */
{
  const s = slayt(SURFACE);
  baslik(s, 'BELGELER', 'Sözleşme ve tahsilat makbuzu');
  gorsel(s, img('panel-sozlesme.png'), { x: KENAR, y: UST, w: 5.6, h: 4.35, altYazi: 'Salon kiralama sözleşmesi.' });
  gorsel(s, img('panel-makbuz.png'), { x: 6.9, y: UST, w: 5.7, h: 4.35, altYazi: 'Tahsilat makbuzu.' });
  dipnot(s, 'Her iki belge de rezervasyon kaydından üretilir; bilgiler ikinci kez girilmez. A4 çıktı için biçimlendirilmiştir.', 6.35);
  s.addNotes('Makbuz her tahsilat satırı için ayrı ayrı üretilir ve kendi belge numarasını taşır.');
}

/* ══ 8 · İş emri ══════════════════════════════════════════════ */
{
  const s = slayt();
  baslik(s, 'İŞ EMRİ', 'Etkinlik günü iş emri');
  gorsel(s, img('panel-is-emri.png'), {
    x: KENAR, y: UST, w: 7.6, h: 3.5, altYazi: 'Saat, iş, sorumlu ve tamamlanma durumu.',
  });
  maddeler(s, {
    x: 8.7, y: 1.9, w: 3.9, gap: 1.5,
    items: [
      ['Saat bazlı plan', 'Organizasyon günü hangi işin ne zaman yapılacağı sırayla yazılır.'],
      ['Sorumlu', 'Her satıra servis, mutfak, resepsiyon gibi bir sorumlu atanır.'],
      ['Takip', 'Tamamlanan işler işaretlenir; üstte kaç işten kaçının bittiği görünür.'],
    ],
  });
  dipnot(s, 'Yeni bir iş emri, salonların ortak akışını içeren örnek bir listeyle başlatılabilir.', 5.7);
  s.addNotes('Yabancı ürünlerde BEO (banquet event order) olarak geçen belgenin karşılığıdır.');
}

/* ══ 9 · Tedarikçiler ═════════════════════════════════════════ */
{
  const s = slayt(SURFACE);
  baslik(s, 'TEDARİKÇİLER', 'Tedarikçi defteri ve atama');
  gorsel(s, img('panel-tedarikciler.png'), { x: KENAR, y: UST, w: 6.0, h: 3.75, altYazi: 'Tedarikçi defteri.' });
  gorsel(s, img('panel-tedarikci-atama.png'), { x: 7.1, y: UST, w: 5.5, h: 2.2, altYazi: 'Organizasyona atama.' });
  maddeler(s, {
    x: 7.1, y: 4.6, w: 5.5, gap: 1.05,
    items: [
      ['Kategori ve iletişim', 'Orkestra, fotoğraf, çiçek, pasta gibi kategoriler ve telefon bilgisi.'],
      ['Atama', 'Her organizasyona geliş saati ve ücretiyle tedarikçi eklenir; toplam maliyet gösterilir.'],
    ],
  });
  s.addText('Bir organizasyona atanmış tedarikçi silinemez, pasife alınır. Başka bir işletmenin tedarikçisi atanamaz.', {
    x: KENAR, y: 5.9, w: 6.0, h: 0.7, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 12, color: INK, lineSpacing: 16,
  });
  s.addNotes('Tedarikçi ücretleri organizasyonun dış gider yükünü gösterir.');
}

/* ══ 10 · Masa düzeni ═════════════════════════════════════════ */
{
  const s = slayt();
  baslik(s, 'MASA DÜZENİ', 'Masa oturma planı');
  gorsel(s, img('panel-masa-duzeni.png'), {
    x: 4.0, y: 1.7, w: 5.3, h: 3.7,
    altYazi: '80 davetli için önerilen plan; koltuk toplamı ve fazlalık üstte özetlenir.',
  });
  mikroNotlar(s, {
    y: 6.0, ortala: true,
    items: [
      ['Plan önerisi', 'Davetli sayısı ve masa başına koltuktan plan üretilir.'],
      ['Eksik uyarısı', 'Koltuk toplamı davetliyi karşılamıyorsa eksik sayısı gösterilir.'],
      ['Masa notu', 'Her masaya açıklama yazılabilir.'],
    ],
  });
  s.addNotes('Önerilen planın koltuk toplamı her zaman davetli sayısına eşittir.');
}


/* ══ 11 · Mobil · ana ekranlar ════════════════════════════════ */
{
  const s = slayt();
  baslik(s, 'MOBİL', 'Telefon uygulaması: ajanda, takvim, kayıtlar');

  // Dört telefon yan yana. Genişlik boşluklarla birlikte hesaplanıp
  // ortalanıyor; tek tek koordinat vermek slayt düzenini bozuyordu.
  const EKRAN = [
    [img('mobil-02-bugun.png'), 'Bugün'],
    [img('mobil-03-takvim.png'), 'Takvim'],
    [img('mobil-04-kayitlar.png'), 'Kayıtlar'],
    [img('mobil-05-kasa.png'), 'Kasa'],
  ];
  const EN = 1.9, BOSLUK = 0.42;
  const SOL = KENAR + (GENIS - (EKRAN.length * EN + (EKRAN.length - 1) * BOSLUK)) / 2;
  // Yükseklik alt yazının bittiği yere göre seçildi: 3,9 iken görselin
  // alt yazısı ile aşağıdaki not şeridi üst üste biniyordu.
  EKRAN.forEach(([dosya, altYazi], i) => {
    gorsel(s, dosya, { x: SOL + i * (EN + BOSLUK), y: 1.68, w: EN, h: 3.65, altYazi });
  });

  mikroNotlar(s, {
    y: 6.1, ortala: true,
    items: [
      ['Aynı işin tamamı', 'Web panelindeki her ekranın telefonda karşılığı var: rezervasyondan faturaya, izinlerden denetim kaydına kadar.'],
      ['Ajanda önce', 'Ana ekran kronolojik listedir ve üstünde tek bir sayı durur: toplam kalan alacak. Telefona bakma sebebi genelde bu.'],
      ['Arama ve süzgeç', 'Kayıtlar sekmesinde ad, telefon ve rezervasyon koduyla arama; yaklaşan, geçmiş ve alacaklı süzgeçleri.'],
    ],
  });
  s.addNotes('Ekrandaki veriler tanıtım verisidir. Beş sekme kullanıldı; altıncısı etiketleri okunmaz hâle getiriyor, geri kalan ekranlar "Daha" listesinde toplandı.');
}

/* ══ 12 · Mobil · rezervasyon ve tahsilat ═════════════════════ */
{
  const s = slayt(SURFACE);
  baslik(s, 'MOBİL', 'Rezervasyon, tahsilat ve yeni kayıt');
  const EKRAN = [
    [img('mobil-06-rezervasyon.png'), 'Rezervasyon ayrıntısı'],
    [img('mobil-07-hizli-tahsilat.png'), 'Hızlı tahsilat'],
    [img('mobil-10-yeni-rezervasyon.png'), 'Yeni kayıt'],
  ];
  EKRAN.forEach(([dosya, altYazi], i) => {
    gorsel(s, dosya, { x: KENAR + i * 2.4, y: UST, w: 2.15, h: 4.2, altYazi });
  });

  maddeler(s, {
    x: 8.1, y: 1.9, w: 4.5, gap: 1.42,
    items: [
      ['Para durumu en üstte', 'Toplam, tahsilat ve kalan yan yana; altındaki çubuk tahsilatın hangi oranda tamamlandığını gösterir.'],
      ['Hızlı tahsilat', 'Para alındığı an kaydedilir. Tutar kalan alacağı aşamaz; aşarsa kayıt veritabanı düzeyinde reddedilir.'],
      ['Telefondan kayıt açma', 'Menü seçilince tutar önerilir. Dolu bir salon-gün-seans birleşimine ikinci kayıt açılamaz.'],
      ['Belgeler ve masa düzeni', 'Sözleşme ve tahsilat makbuzu telefonda okunur ve paylaşılır; masa planı koltuk sayısıyla görünür.'],
    ],
  });
  s.addNotes('Uzun form alanları (ikinci kişi adı, adres, hizmet listesi) bilinçli olarak web panelinde bırakıldı; telefonda uzun form yarıda bırakılıp eksik kayıt üretiyor.');
}

/* ══ 13 · Mobil · yönetim ekranları ═══════════════════════════ */
{
  const s = slayt();
  baslik(s, 'MOBİL', 'Yönetim ekranları da telefonda');
  const EKRAN = [
    [img('mobil-11-daha.png'), 'Bütün ekranlar'],
    [img('mobil-13-raporlar.png'), 'Raporlar'],
    [img('mobil-15-sms.png'), 'SMS kayıtları'],
    [img('mobil-21-sistem.png'), 'Sistem durumu'],
  ];
  const EN = 1.9, BOSLUK = 0.42;
  const SOL = KENAR + (GENIS - (EKRAN.length * EN + (EKRAN.length - 1) * BOSLUK)) / 2;
  EKRAN.forEach(([dosya, altYazi], i) => {
    gorsel(s, dosya, { x: SOL + i * (EN + BOSLUK), y: 1.68, w: EN, h: 3.65, altYazi });
  });

  mikroNotlar(s, {
    y: 6.1, ortala: true,
    items: [
      ['On dört ekran daha', 'Müşteriler, salonlar, menüler, tedarikçiler, faturalar, raporlar, hatırlatmalar, SMS, İYS izinleri, kullanıcılar, denetim kaydı, sistem durumu, ayarlar ve hesap.'],
      ['Aynı veri, aynı kural', 'Uygulama web ile aynı veritabanını kullanır. Hangi kaydı göreceğine sunucudaki satır bazlı güvenlik karar verir.'],
      ['Yazma işlemi sınırlı', 'Tahsilat, gelir-gider, yeni rezervasyon ve mesaj metni telefondan yazılır. Yetki değişikliği ve fatura kesme web panelinde kalır.'],
    ],
  });
  s.addNotes('Yetki değişikliği ve fatura kesme geri alınması zor işlemler; yanlış dokunuşla bir personelin kasaya erişmesi ya da düzeltilemeyen bir fatura gönderilmesi mümkün. Bilinçli olarak masaüstünde bırakıldı.');
}

/* ══ 14 · Hatırlatmalar ═══════════════════════════════════════ */
{
  const s = slayt(SURFACE);
  baslik(s, 'HATIRLATMALAR', 'Taslak mesajlar ve otomatik gönderim');
  gorsel(s, img('panel-hatirlatmalar.png'), {
    x: KENAR, y: UST, w: 7.0, h: 3.7,
    altYazi: 'Yedi taslak metin; her biri düzenlenebilir, işaretlenenler kendiliğinden gönderilir.',
  });
  gorsel(s, img('mobil-08-hatirlatma-gonder.png'), {
    x: 8.0, y: UST, w: 1.75, h: 3.7, altYazi: 'Tek tuşla gönderim',
  });

  maddeler(s, {
    // Aralık metnin en uzun maddesine göre; 1,15'te ilk maddenin gövdesi
    // ikinci maddenin başlığının üzerine biniyordu.
    x: 10.1, y: 1.9, w: 2.5, gap: 1.45,
    items: [
      ['Taslak metin', 'Yedi hazır metin. İçindeki {musteri}, {tarih}, {kalan} adları gönderim anında doldurulur.'],
      ['Tek tuşla gönder', 'Rezervasyon ekranından seçilir, doldurulmuş hâli gösterilir, gönderilir.'],
      ['Otomatik', 'Kaç gün önce ve hangi saatte gideceği tanımlanır; her kayda bir kez gider.'],
    ],
  });

  dipnot(s, 'Metinler tek SMS’e sığacak şekilde yazıldı. Sebebi görünmüyor ama pahalı: ş, ğ, ı, İ, ç harfleri operatörün temel alfabesinde yok; biri bile geçse mesaj 160 yerine 70 karakter sayılıyor. Bu harfler çoğunlukla müşterinin adından geldiği için gönderim anında sadeleştiriliyor.', 6.2);
  dipnot(s, 'Gönderilecek metin ekranda aynen gösteriliyor, gizli bir dönüşüm değil. Ticari ileti sınıfındaki taslaklar (teşekkür, kampanya) İYS onayı olmayan numaraya gönderilmez.', 6.95, { kucuk: true });
  s.addNotes('Otomatik gönderim gece çalışan bir görevle yapılıyor. Varsayılan olarak iki kural açık: tarih hatırlatması 7 gün önce, ödeme hatırlatması 3 gün önce.');
}

/* ══ 15 · SMS ═════════════════════════════════════════════════ */
{
  const s = slayt(SURFACE);
  baslik(s, 'SMS', 'Müşteriye SMS gönderimi');
  gorsel(s, img('panel-sms-kayitlari.png'), {
    x: KENAR, y: UST, w: 7.3, h: 3.8,
    altYazi: 'Gönderim kayıtları: her mesajın türü, durumu ve zamanı.',
  });
  maddeler(s, {
    x: 8.45, y: 1.9, w: 4.15, gap: 1.1,
    items: [
      ['Rezervasyon onayı', 'Kayıt açıldığında tarih, seans ve doğrulama kodu gönderilir.'],
      ['Tarih hatırlatması', 'Organizasyon öncesi hatırlatma gönderilir.'],
      ['Tahsilat bildirimi', 'Ödeme alındığında müşteriye bilgi geçilir.'],
      ['Gönderim kuyruğu', 'Operatörden cevap alınamazsa mesaj yeniden denenir; günlük gönderim adedi sınırlıdır.'],
    ],
  });
  dipnot(s, 'Sağlayıcı tanımlı değilse mesaj gönderilmez, kayıt yine tutulur. Gönderim için Netgsm aboneliği ve onaylı marka başlığı gerekir.', 6.4);
  s.addNotes('Marka başlığı onayı birkaç iş günü sürer; kurulumda en erken başlatılması gereken adımdır.');
}

/* ══ 16 · İYS ═════════════════════════════════════════════════ */
{
  const s = slayt();
  baslik(s, 'İYS', 'Ticari ileti izin yönetimi');
  gorsel(s, img('panel-izin-yonetimi.png'), {
    x: KENAR, y: UST, w: 7.3, h: 3.8,
    altYazi: 'Numara bazında onay ve ret kayıtları; kaynağı, tarihi ve İYS aktarım durumu.',
  });
  maddeler(s, {
    x: 8.45, y: 1.9, w: 4.15, gap: 1.45,
    items: [
      ['İki mesaj sınıfı', 'Rezervasyon onayı, hatırlatma ve doğrulama kodu işlem bildirimidir, onay gerektirmez. Kampanya ve tanıtım ticari iletidir, onay şarttır.'],
      ['Onay ve ret kaydı', 'Her numaranın durumu, kaynağı ve tarihi tutulur. Ret alan numaraya ticari ileti anında engellenir.'],
      ['Gece aktarımı', 'Yeni onaylar İYS’ye gönderilir, İYS’deki retler çekilir. Mevzuat her ikisi için üç iş günü sınırı koyar.'],
    ],
  });
  dipnot(s, 'Kural veritabanı düzeyinde uygulanır: onayı olmayan numaraya ticari ileti gönderilemez. Engellenen gönderim sessizce atılmaz, gerekçesiyle kuyruğa yazılır ve denetlenebilir kalır.', 6.4);
  s.addNotes('İYS bilgileri tanımlı değilse aktarım yapılmaz; ticari ileti gönderimi yerel onay kayıtlarına göre yine de engellenir. Bazı firmalar İYS’ye doğrudan değil, SMS sağlayıcısı üzerinden bağlanır.');
}

/* ══ 17 · Kod doğrulama ═══════════════════════════════════════ */
{
  const s = slayt(SURFACE);
  baslik(s, 'KOD DOĞRULAMA', 'Müşterinin rezervasyon sorgusu');
  s.addText('Her rezervasyona bir kod verilir. Müşteri bu kodu sitenizden sorgulayarak tarihini, seansını ve tutarını görebilir.', {
    x: 3.15, y: 1.72, w: 7, h: 0.55, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 14, color: INK, lineSpacing: 19,
  });
  gorsel(s, img('site-kod-dogrulama.png'), {
    x: 3.6, y: 2.4, w: 6.1, h: 2.95,
    altYazi: 'Telefon maskeli gösterilir; ödeme bilgisi görünmez.',
  });
  mikroNotlar(s, {
    y: 5.95, ortala: true,
    items: [
      ['Maskeleme', 'Telefon 532*****00 biçiminde gösterilir.'],
      ['Ödeme bilgisi', 'Tahsilat ve kalan alacak dışarı açılmaz.'],
      ['Erişim', 'Sorgu için giriş yapmak gerekmez.'],
    ],
  });
  s.addNotes('Kod, rezervasyon onayı SMS’inde müşteriye gönderilir.');
}

/* ══ 18 · Kasa ve raporlar ════════════════════════════════════ */
{
  const s = slayt();
  baslik(s, 'KASA VE RAPORLAR', 'Gelir gider ve raporlama');
  gorsel(s, img('panel-raporlar.png'), { x: KENAR, y: UST, w: 6.05, h: 3.78 });
  gorsel(s, img('panel-kasa.png'), { x: 7.15, y: UST, w: 5.45, h: 3.4 });
  dipnot(s, 'Solda aylık ciro ve organizasyon dağılımı, sağda gelir-gider kasası ve anlık bakiye.', 5.65, { kucuk: true });
  mikroNotlar(s, {
    y: 6.15,
    items: [
      ['Kasa bakiyesi', 'Gelir ve gider tek yerde'],
      ['Aylık ciro', 'Ay bazında dağılım'],
      ['Alacak bakiyesi', 'Toplam kalan alacak'],
      ['CSV aktarım', 'Listeler dışa aktarılır'],
    ],
  });
  s.addNotes('Raporlar tarih aralığına göre filtrelenebilir.');
}

/* ══ 18c · Müşteri adayları ═══════════════════════════════════ */
{
  const s = slayt();
  baslik(s, 'MÜŞTERİ TAKİBİ', 'Soran müşteri kaybolmasın');
  s.addText('Fiyat soran her müşteri rezervasyona dönmez; dönmeyenlerin de bir yerde yazılı olması gerekir. Aday kaydı, ilk temastan sözleşmeye kadar olan aralığı tutar.', {
    x: KENAR, y: 1.66, w: GENIS, h: 0.4, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 13.5, color: MUTED,
  });
  gorsel(s, img('panel-musteri-adaylari.png'), {
    x: KENAR, y: 2.25, w: 6.15, h: 3.75, altYazi: 'Durum, sorumlu ve takip tarihi bir arada.',
  });
  gorsel(s, img('panel-aday-karti.png'), {
    x: 6.95, y: 2.25, w: 5.65, h: 3.75, altYazi: 'Aday kartı: durum geçmişi ve iletişim geçmişi.',
  });
  mikroNotlar(s, {
    y: 6.35,
    items: [
      ['12 durum', 'Panelden düzenlenebilir'],
      ['Takip tarihi', 'Geciken ayrı gösterilir'],
      ['Geçmiş silinmez', 'Kim, ne zaman, neyden neye'],
      ['Dönüşüm', 'Bilgiler forma taşınır'],
    ],
  });
  s.addNotes('Geciken takip ile bugün aranacak bilerek ayrı duruyor: ikisi tek sayıda toplanınca gecikmiş iş günlük işin içinde kaybolur. Durum değişiklikleri veritabanı tetikleyicisiyle yazılır, istemci atlayamaz.');
}

/* ══ 18d · WhatsApp ═══════════════════════════════════════════ */
{
  const s = slayt(SURFACE);
  baslik(s, 'WHATSAPP', 'Gelen mesaj kendiliğinden aday olur');
  s.addText('İşletmenin WhatsApp numarasına yazılan mesaj çözümlenir ve bir müşteri adayına dönüşür. Aynı numaradan gelen ikinci mesaj yeni bir kayıt açmaz, mevcut adayın geçmişine eklenir.', {
    x: KENAR, y: 1.66, w: GENIS, h: 0.44, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 13.5, color: MUTED,
  });
  gorsel(s, img('panel-whatsapp-ayarlari.png'), { x: KENAR, y: 2.3, w: 7.1, h: 3.6 });
  maddeler(s, {
    x: 8.2, y: 2.35, w: 4.4, gap: 1.15,
    items: [
      ['Karşılama', 'İlk kez yazana bir kez “mesajınız alındı” gider.'],
      ['Mesai dışı', 'Çalışma saatleri dışında “ne zaman döneceğiz” bilgisi gider.'],
      ['Fiyat sorusuna cevap yok', 'Müsaitlik söyleyen otomatik yanıt, salon adına taahhüt gibi okunur.'],
    ],
  });
  dipnot(s, 'İkisi de varsayılan olarak kapalıdır; açmak işletmenin kararıdır.', 6.1, { kucuk: true });
  s.addNotes('Çözümleyici satır sırasına değil içeriğine bakar ve emin olamadığını uydurmaz: “Mayısın ilk haftası” tarihe çevrilmez, olduğu gibi saklanır. Uydurulan bir gün, salonun o gün dolu sanılmasına yol açardı.');
}

/* ══ 19 · e-Arşiv / e-Fatura ══════════════════════════════════ */
{
  const s = slayt(SURFACE);
  baslik(s, 'e-ARŞİV / e-FATURA', 'Fatura düzenleme');
  [['Rezervasyon', 'Müşteri, tarih, tutar'],
   ['Tahsilat', 'Ödemeler işlenir'],
   ['Fatura', 'KDV hesaplanır'],
   ['e-Arşiv', 'GİB’e gönderilir'],
  ].forEach(([bas, ack], i) => {
    const x = KENAR + i * 3.13;
    const son = i === 3;
    s.addShape(pres.ShapeType.roundRect, {
      x, y: 1.8, w: 2.72, h: 1.3, rectRadius: 0.1,
      fill: { color: son ? NAVY : WHITE }, line: { color: son ? NAVY : KART_LINE, width: 1 },
    });
    s.addText(bas, {
      x: x + 0.28, y: 2.04, w: 2.2, h: 0.32, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 14.5, bold: true, color: son ? WHITE : NAVY,
    });
    s.addText(ack, {
      x: x + 0.28, y: 2.4, w: 2.2, h: 0.5, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 11.5, color: son ? PALE : INK, lineSpacing: 15,
    });
    if (!son) {
      s.addShape(pres.ShapeType.rightArrow, {
        x: x + 2.82, y: 2.3, w: 0.28, h: 0.3, fill: { color: ACCENT }, line: { color: ACCENT },
      });
    }
  });
  gorsel(s, img('panel-faturalar.png'), { x: KENAR, y: 3.45, w: 6.6, h: 2.3, altYazi: 'Fatura listesi ve durumları.' });
  maddeler(s, {
    x: 7.75, y: 3.45, w: 4.85, gap: 1.0,
    items: [
      ['Süre takibi', 'Fatura düzenleme süresi (VUK, 7 gün) ekranda gösterilir.'],
      ['Değiştirilemezlik', 'Gönderilmiş fatura değiştirilemez ve silinemez; yalnızca iptal edilebilir.'],
      ['Tutar tutarlılığı', 'Matrah + KDV = toplam kuralı zorunludur.'],
    ],
  });
  s.addNotes('Gönderim Paraşüt üzerinden yapılır. Mükellefiyet durumu mali müşavire sorulmalıdır.');
}

/* ══ 20 · Yetkiler ════════════════════════════════════════════ */
{
  const s = slayt(SURFACE);
  baslik(s, 'YETKİLER', 'Kullanıcı yetkileri');
  s.addText('Her personele ayrı hesap açılır ve hangi ekrana erişebileceği tek tek belirlenir. Örnek bir dağılım:', {
    x: KENAR, y: 1.68, w: GENIS, h: 0.34, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 14, color: MUTED,
  });
  const isaret = (v) => ({ text: v, color: v === '✓' ? '1E7B3C' : MUTED, bold: true });
  tablo(s, {
    x: KENAR, y: 2.2, w: 7.3, colW: [4.1, 1.6, 1.6], rowH: 0.42,
    basliklar: ['YETKİ', 'YÖNETİCİ', 'PERSONEL'],
    hizalar: ['left', 'center', 'center'],
    satirlar: [
      ['Rezervasyon görüntüleme', isaret('✓'), isaret('✓')],
      ['Rezervasyon ekleme / düzenleme', isaret('✓'), isaret('✓')],
      ['Rezervasyon silme', isaret('✓'), isaret('-')],
      ['Gelir-gider (kasa)', isaret('✓'), isaret('-')],
      ['Raporlar ve ciro', isaret('✓'), isaret('-')],
      ['Kullanıcı ve yetki yönetimi', isaret('✓'), isaret('-')],
    ],
  });
  panel(s, {
    x: 8.45, y: 2.2, w: 4.15, h: 2.5, bas: 'Denetim kaydı',
    metin: 'Ekleme, değişiklik ve silme işlemleri kullanıcı ve zaman bilgisiyle kaydedilir. Değişen alanın eski ve yeni değeri birlikte tutulur. Kayıtlar silinemez ve değiştirilemez.',
  });
  s.addText('Personel hesapları ayrı şifreyle açılır; şifreler yöneticiye görünmez.', {
    x: 8.45, y: 4.95, w: 4.15, h: 0.7, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 12, color: INK, lineSpacing: 16,
  });
  s.addNotes('Yedi ayrı yetki tanımlıdır; tablo bunlardan bir dağılım örneğidir.');
}

/* ══ 21 · Altyapı ═════════════════════════════════════════════ */
{
  const s = slayt(SURFACE);
  baslik(s, 'ALTYAPI', 'Sistem neyin üzerinde çalışıyor');
  s.addText('Sistem üç parçadan oluşur: kullanıcının gördüğü arayüz, arayüzü sunan kendi sunucumuz ve verinin durduğu veritabanı. Üçü de tek bir makinede çalışır. Yanlarındaki servisler yalnızca ilgili özellik açıksa devreye girer.', {
    x: KENAR, y: 1.66, w: GENIS, h: 0.36, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 13.5, color: MUTED,
  });

  // Akış kutuları: e-Fatura slaydındaki düzenin aynısı, üç adımlı.
  [['Tarayıcı / mobil', 'Kullanıcının ekranı'],
   ['Sahra sunucusu', 'Siteyi sunar, gece görevlerini çalıştırır'],
   ['PostgreSQL', 'Veriyi tutar, kim neyi görecek ona karar verir'],
  ].forEach(([bas, ack], i) => {
    const w = 3.8, x = KENAR + i * (w + 0.26);
    const son = i === 2;
    s.addShape(pres.ShapeType.roundRect, {
      x, y: 2.2, w, h: 1.15, rectRadius: 0.1,
      fill: { color: son ? NAVY : WHITE }, line: { color: son ? NAVY : KART_LINE, width: 1 },
    });
    s.addText(bas, {
      x: x + 0.28, y: 2.42, w: w - 0.56, h: 0.32, isTextBox: true, margin: 0,
      fontFace: H, fontSize: 15, bold: true, color: son ? WHITE : NAVY,
    });
    s.addText(ack, {
      x: x + 0.28, y: 2.76, w: w - 0.56, h: 0.42, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 11.5, color: son ? PALE : INK, lineSpacing: 15,
    });
    if (!son) {
      s.addShape(pres.ShapeType.rightArrow, {
        x: x + w + 0.02, y: 2.62, w: 0.2, h: 0.3, fill: { color: ACCENT }, line: { color: ACCENT },
      });
    }
  });

  tablo(s, {
    // 7 satır (başlık + 6 gövde) × 0,42 = 2,94; tablo 6,54'te biter,
    // dipnot 6,7'den başlar. 0,46'da başlık satırı hesaba katılmadığı için
    // son satır dipnotun üzerine biniyordu.
    x: KENAR, y: 3.6, w: GENIS, colW: [2.6, 5.2, 4.13], rowH: 0.42,
    basliklar: ['BİLEŞEN', 'NE İŞE YARIYOR', 'TANIMLI DEĞİLSE'],
    satirlar: [
      ['PostgreSQL', 'Veritabanı; kim neyi görecek kuralları da burada', { text: 'Sistem çalışmaz', color: '9B2C1C', bold: true }],
      ['Sahra sunucusu', 'Siteyi sunar, girişi korur, gece görevlerini çalıştırır', { text: 'Sistem çalışmaz', color: '9B2C1C', bold: true }],
      ['Netgsm', 'Müşteriye SMS gönderir', 'Mesaj gönderilmez, kaydı tutulur'],
      ['İYS', 'Ticari ileti onaylarını devletin sistemiyle eşler', 'Onaylar aktarılmaz, yerel kayıt işler'],
      ['Paraşüt', 'e-Arşiv / e-Fatura’yı GİB’e gönderir', 'Fatura taslak olarak kalır'],
      ['Sentry', 'Hataları toplar', 'Dış servise istek gitmez'],
    ],
  });
  dipnot(s, 'İlk iki satır zorunludur; geri kalanı isteğe bağlıdır ve biri kapatıldığında yalnızca o özellik kapanır.', 6.7, { kucuk: true });
  s.addNotes('Üç parça da kiralanan tek bir sunucuda çalışır: PostgreSQL, veritabanını HTTP\u2019ye açan PostgREST ve siteyi sunup zamanlanmış görevleri çalıştıran Node süreci. Hepsi ücretsiz ve açık kaynak. Dışarıya yalnızca 80 ve 443 portları açıktır; veritabanı internete hiç açılmaz.');
}

/* ══ 22 · Neden kendi sunucumuz ══════════════════════════════ */
{
  const s = slayt(NAVY);
  baslik(s, 'NEDEN', 'Neden kendi sunucumuz', { koyu: true });
  s.addText('Sistem kiralanan tek bir sunucuda çalışır. Hazır bir servise bağlansak yazılım aynı çalışırdı; fark, kimin elinde durduğunda.', {
    x: KENAR, y: 1.66, w: GENIS, h: 0.34, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 13.5, color: PALE,
  });
  kartlar(s, {
    y: 2.15, h: 2.15, sutun: 3, koyu: true,
    items: [
      ['Bağımlılık yok', 'Hazır bir servisin ücretsiz planı değişebilir, fiyatı artabilir, hesap askıya alınabilir. Kendi sunucumuzda bu risklerin hiçbiri yok; karşılığında bakımı biz üstleniyoruz.'],
      ['Veri nerede duruyor', 'Sunucu Türkiye’de ya da AB’de kiralanır. Veride müşteri adı, telefonu ve TC kimlik numarası var; yurt dışına aktarımın ayrı kuralları gündeme hiç gelmiyor.'],
      ['Ne çalışıyor', 'PostgreSQL veritabanı, veritabanını web’e açan PostgREST ve siteyi sunup gece görevlerini çalıştıran Sahra sunucusu. Üçü de ücretsiz ve açık kaynak.'],
    ],
  });
  panel(s, {
    x: KENAR, y: 4.4, w: 5.85, h: 2.05, zemin: BRAND, bas: 'Kilitlenme var mı',
    metin: 'Yok. Veritabanı standart PostgreSQL’dir ve tabloların tanımı depoda SQL dosyası olarak durur. Sunucu değiştirmek istenirse veriler olduğu gibi taşınır; yazılımın yeniden yazılması gerekmez.',
  });
  panel(s, {
    x: 6.78, y: 4.4, w: 5.85, h: 2.05, zemin: BRAND, bas: 'Yedek kimin sorumluluğunda',
    metin: 'Sistem her gece kendi yedeğini üretip sunucuda dışarıya kapalı bir dizine yazar. Sunucunun kendisi bozulursa yedek de gideceği için, dosyaların düzenli olarak başka bir yere indirilmesi gerekir; kurulum belgesi bunu adım adım anlatır.',
  });
  s.addText('Sunucu ayda yaklaşık 200-400 ₺’dir. Bu tutar veritabanı, barındırma, gecelik yedek ve zamanlanmış görevlerin tamamını kapsar; ayrıca bir servise ödeme yapılmaz.', {
    x: KENAR, y: 6.75, w: GENIS, h: 0.4, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 12, color: PALE,
  });
  s.addNotes('Bu slayt “altyapı için kime ne ödüyoruz” sorusunun cevabıdır. Tek kalem sunucu kirası. Karşılığında güvenlik güncellemeleri, sertifika yenileme ve yedeğin gerçekten geri yüklenebildiğinin denenmesi bizim üzerimizde; certbot sertifikayı kendisi yeniler, güncellemeler otomatiğe alınmıştır, ama yedeğin dışarı indirilmesi elle yapılan iştir.');
}

/* ══ 23 · Veri ════════════════════════════════════════════════ */
{
  const s = slayt(NAVY);
  baslik(s, 'VERİ', 'Veri saklama ve yedekleme', { koyu: true });
  kartlar(s, {
    y: 1.85, h: 1.95, sutun: 3, koyu: true,
    items: [
      ['Sunucu konumu', 'Veriler AB bölgesinde (Frankfurt) tutulur.'],
      ['Gecelik yedek', 'Her gece otomatik yedek alınır; geri yükleme prosedürü belgelidir.'],
      ['Veri ayrımı', 'Her hesap yalnızca kendi verisini görür. Ayrım sunucu düzeyindedir.'],
    ],
  });
  mikroNotlar(s, {
    y: 4.3, koyu: true,
    items: [
      ['Giriş koruması', 'Art arda hatalı girişte hesap geçici olarak kilitlenir.'],
      ['Silinemeyen kayıtlar', 'Fatura ve denetim kaydı silinemez.'],
      ['Sistem durumu ekranı', 'Yedek, SMS kuyruğu ve İYS durumu panelden izlenir.'],
    ],
  });
  s.addText('Kuralların çoğu arayüzde değil veritabanı düzeyinde tanımlıdır: çifte rezervasyon, kapora aşımı, onaysız ticari SMS ve gönderilmiş faturanın değiştirilmesi kayıt aşamasında reddedilir.', {
    x: KENAR, y: 5.7, w: GENIS, h: 0.9, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 12.5, color: PALE, lineSpacing: 18,
  });
  s.addNotes('Veriler kendi sunucumuzdaki PostgreSQL üzerinde tutulur.');
}

/* ══ 24 · Kurulum ═════════════════════════════════════════════ */
{
  const s = slayt();
  baslik(s, 'KURULUM', 'Kurulum ve gereksinimler');
  const zorunlu = (v) => ({ text: v, color: v === 'Evet' ? NAVY : MUTED, bold: true });
  tablo(s, {
    x: KENAR, y: 1.9, w: GENIS, colW: [3.6, 1.8, 6.53], rowH: 0.5,
    basliklar: ['BİLEŞEN', 'GEREKLİ Mİ', 'AÇIKLAMA'],
    hizalar: ['left', 'center', 'left'],
    satirlar: [
      ['Veritabanı ve barındırma', zorunlu('Evet'), 'Sistem bunlar olmadan çalışmaz.'],
      ['SMS sağlayıcısı', zorunlu('Hayır'), 'Tanımlı değilse mesaj gönderilmez, kayıt tutulur.'],
      ['İYS entegrasyonu', zorunlu('Hayır'), 'Yalnızca ticari ileti gönderilecekse gerekir.'],
      ['e-Fatura entegratörü', zorunlu('Hayır'), 'Tanımlı değilse fatura taslak olarak kalır.'],
      ['Hata izleme', zorunlu('Hayır'), 'Tanımlı değilse dış servise istek gitmez.'],
    ],
  });
  dipnot(s, 'Kurulum gerektirmez; tarayıcıdan kullanılır. Bilgisayar, tablet ve telefonda aynı ekranlar çalışır.', 5.6);
  dipnot(s, 'Bir sağlayıcı tanımlı değilse ilgili özellik kapanır; sistemin geri kalanı çalışmaya devam eder ve arayüz durumu açıkça belirtir.', 6.1, { kucuk: true });
  s.addNotes('Netgsm marka başlığı onayı birkaç iş günü sürer; en erken başvurulması gereken adımdır.');
}

/* ══ 25 · Maliyet ═════════════════════════════════════════════ */
{
  const s = slayt();
  baslik(s, 'MALİYET', 'Aylık ve tek seferlik giderler');

  const SUT_W = 2.86, SUT_BOSLUK = 0.156, SUT_Y = 1.75, SUT_H = 4.3;
  /** Bir sütun: başlık, kalem/tutar satırları ve altına açıklama. */
  function sutun(i, bas, kalemler, aciklama) {
    const x = KENAR + i * (SUT_W + SUT_BOSLUK);
    s.addShape(pres.ShapeType.roundRect, {
      x, y: SUT_Y, w: SUT_W, h: SUT_H, rectRadius: 0.1,
      fill: { color: SURFACE }, line: { color: KART_LINE, width: 1 },
    });
    s.addText(bas, {
      x: x + 0.24, y: SUT_Y + 0.22, w: SUT_W - 0.48, h: 0.62, isTextBox: true, margin: 0,
      valign: 'top', fontFace: H, fontSize: 14.5, bold: true, color: NAVY,
    });
    kalemler.forEach(([ad, tutar], j) => {
      const y = SUT_Y + 0.95 + j * 0.44;
      s.addText(ad, {
        x: x + 0.24, y, w: SUT_W - 1.45, h: 0.32, isTextBox: true, margin: 0,
        fontFace: B, fontSize: 11.5, color: INK,
      });
      s.addText(tutar, {
        x: x + SUT_W - 1.2, y, w: 0.96, h: 0.32, isTextBox: true, margin: 0,
        align: 'right', fontFace: B, fontSize: 11.5, bold: true, color: NAVY,
      });
    });
    s.addText(aciklama, {
      x: x + 0.24, y: SUT_Y + 2.85, w: SUT_W - 0.48, h: 1.3, isTextBox: true, margin: 0,
      valign: 'top', fontFace: B, fontSize: 10, color: MUTED, lineSpacing: 13,
    });
  }

  sutun(0, 'Altyapı ve mağaza', [
    ['Sunucu (VPS)', '200-400 ₺'],
    ['Alan adı', '~25 ₺'],
    ['Apple Developer', '$99/yıl'],
    ['Google Play (tek sefer)', '$25'],
  ], 'İlk ikisi veritabanı, barındırma, gecelik yedek ve zamanlanmış görevlerin tamamını kapsar; sunucu üzerindeki yazılımların hepsi ücretsiz ve açık kaynaktır. Alan adı yıllık ücretin aylığa bölümüdür. Son ikisi yalnızca mobil uygulama mağazalarda yayınlanacaksa gerekir.');

  sutun(1, 'SMS (kullandıkça)', [
    ['1.000 SMS', '370 ₺'],
    ['5.000 SMS', '1.089 ₺'],
    ['10.000 SMS', '1.699 ₺'],
    ['25.000 SMS', '4.179 ₺'],
  ], 'Netgsm paket fiyatları, KDV ve ÖİV dahil. Paketsiz tarife adet başına 0,42 ₺. Marka başlığı onayı gönderimden önce alınır.');

  sutun(2, 'İYS (ticari ileti için)', [
    ['Temel Hizmetler', 'Ücretsiz'],
    ['5.000 izin', '4.601 ₺'],
    ['25.000 izin', '8.313 ₺'],
    ['75.000 izin', '14.921 ₺'],
  ], 'Yalnızca kampanya ve tanıtım gönderecekseniz gerekir. Onayları İYS panelinden elle yönetirseniz Temel Hizmetler ücretsizdir; otomatik aktarım için paket alınır. İzin adedinin süre sınırı yoktur, yüklendikçe düşer. KDV dahil.');

  sutun(3, 'e-Fatura (isteğe bağlı)', [
    ['Paraşüt e-Portal', '150 ₺/ay'],
    ['Mali mühür (3 yıl)', '1.620 ₺'],
    ['100 e-kontör', '400 ₺'],
  ], 'Paraşüt tutarları KDV hariç. Bir fatura bir kontördür; kontör paketi 12 ay geçerlidir. Mali mühür tüzel kişi tutarıdır.');

  s.addText('Bir sağlayıcı tanımlanmazsa yalnızca o özellik kapanır: SMS sağlayıcısı yoksa mesajlar kuyrukta bekler, İYS tanımlı değilse onaylar aktarılmaz, e-Fatura entegratörü yoksa faturalar taslak olarak kaydedilir. Mobil uygulama yayınlanmazsa sistem yalnızca tarayıcıdan kullanılır. Sistemin geri kalanı çalışmaya devam eder.', {
    x: KENAR, y: 6.2, w: GENIS, h: 0.6, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 12.5, color: INK, lineSpacing: 17,
  });
  s.addText('Fiyatlar Eylül 2026’da sağlayıcıların yayımlanmış listelerinden alınmıştır. Sunucu ve alan adı Türk sağlayıcılarda ₺, yurt dışında € ya da $ üzerinden faturalandırılır.', {
    x: KENAR, y: 6.85, w: GENIS, h: 0.4, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 11, color: MUTED,
  });
  s.addNotes('Ayda 30 organizasyon kaydeden bir salon, kayıt onayı ve hatırlatma ile yaklaşık 100-150 SMS gönderir; 1.000’lik paket birkaç ay yeter. Sabit gider sunucu kirası ve alan adından ibarettir; yazılım tarafında lisans ücreti yoktur. İYS paketi yalnızca ticari ileti gönderilecekse gündeme gelir.');
}

pres.writeFile({ fileName: 'Sahra-Takip-Tanitim.pptx' }).then((f) => console.log('Yazıldı:', f));
