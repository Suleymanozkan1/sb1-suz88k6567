import pptxgen from 'pptxgenjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../ss');
const img = (n) => path.join(SS, n);

const NAVY='25365A', BRAND='37517E', SKY='47B2E4', ACCENT='C9A227';
const SURFACE='F3F5FA', INK='333F55', MUTED='6B7A99', WHITE='FFFFFF', PALE='C6D2E8', LINE='DCE3EF';
const H='Cambria', B='Calibri';

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';
pres.author = 'Salon Ajandası';
pres.title = 'Salon Ajandası — Salon Yönetim Sistemi';

/** PNG başlığından gerçek en/boy okunur; görsel esnetilmeden yerleştirilir. */
function pngBoyut(file) {
  const b = fs.readFileSync(file).subarray(16, 24);
  return { w: b.readUInt32BE(0), h: b.readUInt32BE(4) };
}

/**
 * Görseli verilen kutuya oranını bozmadan sığdırır ve ortalar. Ekran
 * görüntülerinin boyu içeriğe göre değiştiği için sabit en/boy vermek
 * görselleri eziyordu.
 */
function shot(s, file, x, y, w, h, caption) {
  const boyut = pngBoyut(file);
  const oran = boyut.w / boyut.h;
  let gw = w, gh = w / oran;
  if (gh > h) { gh = h; gw = h * oran; }
  const gx = x + (w - gw) / 2, gy = y + (h - gh) / 2;

  s.addShape(pres.ShapeType.roundRect, {
    x: gx-0.08, y: gy-0.08, w: gw+0.16, h: gh+0.16, rectRadius: 0.08,
    fill: { color: WHITE }, line: { color: LINE, width: 1 },
    shadow: { type:'outer', color:'1B2A4A', opacity:0.16, blur:12, offset:3, angle:90 },
  });
  s.addImage({ path: file, x: gx, y: gy, w: gw, h: gh });
  if (caption) {
    s.addText(caption, { x: gx, y: gy+gh+0.14, w: gw, h: 0.28, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 10.5, color: MUTED });
  }
}

function head(s, kicker, title, onDark) {
  s.addText(kicker, { x: 0.7, y: 0.44, w: 9, h: 0.3, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 12, bold: true, color: SKY, charSpacing: 2 });
  s.addText(title, { x: 0.7, y: 0.78, w: 11.9, h: 0.8, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 31, bold: true, color: onDark ? WHITE : NAVY });
}

/** Görselin yanında maddeler — en sık kullanılan düzen. */
function notes(s, x, y, items, gap, width) {
  items.forEach(([bas, ack], i) => {
    const yy = y + i * gap;
    s.addText(bas, { x, y: yy, w: width, h: 0.3, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 14, bold: true, color: NAVY });
    s.addText(ack, { x, y: yy + 0.33, w: width, h: gap - 0.4, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 12, color: INK, lineSpacing: 16 });
  });
}

/* ── 1 Kapak ─────────────────────────────────────────────────────── */
{
  const s = pres.addSlide();
  s.background = { color: NAVY };
  s.addShape(pres.ShapeType.ellipse, { x: 9.8, y: -2.0, w: 6.2, h: 6.2, fill:{color:BRAND}, line:{color:BRAND} });
  s.addText('SALON YÖNETİM SİSTEMİ', { x: 0.9, y: 2.5, w: 8, h: 0.32, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 13, bold: true, color: SKY, charSpacing: 3 });
  s.addText('Salon Ajandası', { x: 0.9, y: 2.9, w: 8.4, h: 1.3, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 58, bold: true, color: WHITE });
  s.addText('Rezervasyon, tahsilat, sözleşme, fatura ve organizasyon planlaması için\nweb tabanlı salon yönetim sistemi.', {
    x: 0.9, y: 4.25, w: 8.75, h: 0.9, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 17, color: PALE, lineSpacing: 27 });
  s.addNotes('Tanıtımın açılışı. Sistemin ne olduğu tek cümlede belirtilir.');
}

/* ── 2 Kapsam ────────────────────────────────────────────────────── */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  head(s, 'KAPSAM', 'Sistem neleri kapsıyor');
  const gruplar = [
    ['Rezervasyon', 'Takvim, salon tanımları, rezervasyon kaydı, sözleşme, kod doğrulama'],
    ['Para', 'Tahsilat, ödeme planı, kasa, makbuz, raporlar'],
    ['Organizasyon', 'Menü ve paketler, masa düzeni, iş emri, tedarikçiler'],
    ['Mevzuat', 'e-Arşiv / e-Fatura, İYS kuralları, KVKK, denetim kaydı'],
    ['İletişim', 'Müşteriye SMS, siteden gelen talepler'],
    ['Yönetim', 'Kullanıcılar ve yetkiler, yedekleme, sistem durumu'],
  ];
  gruplar.forEach(([bas, ack], i) => {
    const x = 0.7 + (i % 3) * 4.07, y = 1.85 + Math.floor(i / 3) * 2.35;
    s.addShape(pres.ShapeType.roundRect, { x, y, w: 3.77, h: 2.0, rectRadius: 0.1,
      fill:{color:SURFACE}, line:{color:'E3E9F4', width:1} });
    s.addText(bas, { x: x+0.32, y: y+0.3, w: 3.15, h: 0.36, isTextBox: true, margin: 0,
      fontFace: H, fontSize: 18, bold: true, color: NAVY });
    s.addText(ack, { x: x+0.32, y: y+0.75, w: 3.15, h: 1.0, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 12.5, color: INK, lineSpacing: 17 });
  });
  s.addNotes('Altı modülün kısa dökümü. Ayrıntılar sonraki slaytlarda.');
}

/* ── 3 Takvim ────────────────────────────────────────────────────── */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  head(s, 'TAKVİM', 'Rezervasyon takvimi');
  shot(s, img('panel-takvim.png'), 0.7, 1.75, 7.7, 4.81,
       'Bir ayın gündüz ve gece seansları, organizasyon türüne göre renklendirilmiş.');
  notes(s, 8.85, 1.9, [
    ['Gün başına iki seans', 'Gündüz ve gece ayrı tutulur; yarım gün satışları da izlenir.'],
    ['Renk kodu', 'Düğün, nişan, kına, sünnet gibi türler ayrı renkte gösterilir.'],
    ['Çakışma engeli', 'Dolu bir salon-seans birleşimine ikinci kayıt açılamaz. Kural veritabanında tanımlıdır.'],
  ], 1.6, 3.75);
  s.addNotes('Renk eşlemesi Renk Ayarları ekranından değiştirilebilir.');
}

/* ── 4 Salonlar ──────────────────────────────────────────────────── */
{
  const s = pres.addSlide();
  s.background = { color: SURFACE };
  head(s, 'SALONLAR', 'Salon tanımları');
  shot(s, img('panel-salonlar.png'), 0.7, 1.75, 7.3, 4.56,
       'Her salonun kapasitesi ve bağlı rezervasyon sayısı.');
  notes(s, 8.45, 1.9, [
    ['Birden çok salon', 'Bir işletmede istenen sayıda salon tanımlanır.'],
    ['Salon bazlı çakışma', 'Aynı gün ve seansta farklı salonlara rezervasyon açılabilir, aynı salona açılamaz.'],
    ['Kapasite', 'Salonun kişi kapasitesi rezervasyon ekranında görünür.'],
    ['Pasife alma', 'Kullanım dışı salon, kayıtları silinmeden yeni rezervasyona kapatılır.'],
  ], 1.2, 4.15);
  s.addNotes('Yeni bir işletme oluşturulduğunda sistem kendiliğinden bir "Ana Salon" açar.');
}

/* ── 5 Rezervasyon ve tahsilat ───────────────────────────────────── */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  head(s, 'REZERVASYON', 'Rezervasyon kaydı ve tahsilat');
  shot(s, img('panel-rezervasyon-detay.png'), 0.7, 1.75, 7.2, 4.5,
       'Rezervasyon bilgileri, ödeme durumu ve tahsilat listesi tek sayfada.');
  notes(s, 8.35, 1.9, [
    ['Kalan alacak', 'Toplam tutardan tahsilatlar düşülerek hesaplanır.'],
    ['Tahsilat kaydı', 'Tarih, tutar, ödeme şekli ve açıklama tutulur.'],
    ['Kapora kontrolü', 'Kapora toplam tutarı aşamaz.'],
    ['Durum', 'Ön rezervasyon, kesin rezervasyon, tamamlandı, iptal.'],
  ], 1.2, 4.25);
  s.addNotes('Ekrandaki örnekte 210.000 ₺ toplam, 63.000 ₺ tahsilat, 147.000 ₺ kalan alacak görünüyor.');
}

/* ── 6 Ödeme planı (YENİ) ────────────────────────────────────────── */
{
  const s = pres.addSlide();
  s.background = { color: SURFACE };
  head(s, 'ÖDEME PLANI', 'Vade tarihli taksit planı');
  shot(s, img('panel-odeme-plani.png'), 0.7, 1.75, 7.6, 3.6,
       'Taksitler, vadeleri ve durumları; üstte planlanan, tahsil edilen ve vadesi geçen tutarlar.');
  notes(s, 8.7, 1.9, [
    ['Otomatik bölme', 'Kalan tutar istenen sayıda taksite bölünür. Yuvarlama artığı ilk taksite eklenir; toplam daima kalan tutara eşittir.'],
    ['Tahsilat eşleştirme', 'Toplam tahsilat, vadesi önce gelen taksitten başlayarak düşülür.'],
    ['Durum', 'Ödendi, gecikti, yaklaşıyor, bekliyor.'],
  ], 1.55, 3.9);
  s.addText('Taksit toplamının rezervasyon tutarını aşması veritabanı düzeyinde engellenir.', {
    x: 0.7, y: 5.85, w: 7.6, h: 0.4, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 12, color: INK });
  s.addNotes('Ekrandaki örnekte ilk iki taksitin vadesi geçmiş, bu yüzden gecikmiş olarak işaretli.');
}

/* ── 7 Menüler ───────────────────────────────────────────────────── */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  head(s, 'MENÜLER', 'Menü ve paket tanımları');
  shot(s, img('panel-menuler.png'), 0.7, 1.75, 7.3, 4.4,
       'Menü kartları; kişi başı menülerde örnek kişi sayılarına göre tutarlar.');
  notes(s, 8.45, 1.9, [
    ['İki fiyat türü', 'Kişi başı ya da sabit tutar.'],
    ['Tutar önerisi', 'Rezervasyona menü seçildiğinde toplam tutar hesaplanıp önerilir; kullanıcı değiştirebilir.'],
    ['Örnek tutarlar', '150, 300 ve 500 kişilik karşılıklar menü kartında görünür.'],
  ], 1.55, 4.15);
  s.addNotes('Fiyatlar kuruş cinsinden tamsayı olarak saklanır.');
}

/* ── 8 Sözleşme ve makbuz ────────────────────────────────────────── */
{
  const s = pres.addSlide();
  s.background = { color: SURFACE };
  head(s, 'BELGELER', 'Sözleşme ve tahsilat makbuzu');
  shot(s, img('panel-sozlesme.png'), 0.7, 1.75, 5.6, 4.35, 'Salon kiralama sözleşmesi.');
  shot(s, img('panel-makbuz.png'), 6.9, 1.75, 5.7, 4.35, 'Tahsilat makbuzu.');
  s.addText('Her iki belge de rezervasyon kaydından üretilir; bilgiler ikinci kez girilmez. A4 çıktı için biçimlendirilmiştir.', {
    x: 0.7, y: 6.35, w: 11.9, h: 0.4, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 12.5, color: INK });
  s.addNotes('Makbuz her tahsilat satırı için ayrı ayrı üretilir ve kendi belge numarasını taşır.');
}

/* ── 9 İş emri (YENİ) ────────────────────────────────────────────── */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  head(s, 'İŞ EMRİ', 'Etkinlik günü iş emri');
  shot(s, img('panel-is-emri.png'), 0.7, 1.75, 7.6, 3.5,
       'Saat, iş, sorumlu ve tamamlanma durumu.');
  notes(s, 8.7, 1.9, [
    ['Saat bazlı plan', 'Organizasyon günü hangi işin ne zaman yapılacağı sırayla yazılır.'],
    ['Sorumlu', 'Her satıra servis, mutfak, resepsiyon gibi bir sorumlu atanır.'],
    ['Takip', 'Tamamlanan işler işaretlenir; üstte kaç işten kaçının bittiği görünür.'],
  ], 1.5, 3.9);
  s.addText('Yeni bir iş emri, salonların ortak akışını içeren örnek bir listeyle başlatılabilir.', {
    x: 0.7, y: 5.7, w: 7.6, h: 0.4, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 12, color: INK });
  s.addNotes('Yabancı ürünlerde BEO (banquet event order) olarak geçen belgenin karşılığıdır.');
}

/* ── 10 Tedarikçiler (YENİ) ──────────────────────────────────────── */
{
  const s = pres.addSlide();
  s.background = { color: SURFACE };
  head(s, 'TEDARİKÇİLER', 'Tedarikçi defteri ve atama');
  shot(s, img('panel-tedarikciler.png'), 0.7, 1.75, 6.0, 3.75, 'Tedarikçi defteri.');
  shot(s, img('panel-tedarikci-atama.png'), 7.1, 1.75, 5.5, 2.2, 'Organizasyona atama.');
  notes(s, 7.1, 4.6, [
    ['Kategori ve iletişim', 'Orkestra, fotoğraf, çiçek, pasta gibi kategoriler ve telefon bilgisi.'],
    ['Atama', 'Her organizasyona geliş saati ve ücretiyle tedarikçi eklenir; toplam maliyet gösterilir.'],
  ], 1.05, 5.5);
  s.addText('Bir organizasyona atanmış tedarikçi silinemez, pasife alınır. Başka bir işletmenin tedarikçisi atanamaz.', {
    x: 0.7, y: 5.9, w: 6.0, h: 0.7, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 12, color: INK, lineSpacing: 16 });
  s.addNotes('Tedarikçi ücretleri organizasyonun dış gider yükünü gösterir.');
}

/* ── 11 Masa düzeni ──────────────────────────────────────────────── */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  head(s, 'MASA DÜZENİ', 'Masa oturma planı');
  shot(s, img('panel-masa-duzeni.png'), 4.0, 1.7, 5.3, 3.7, null);
  s.addText('80 davetli için önerilen plan; masa sayısı, koltuk toplamı ve fazlalık üstte özetlenir.', {
    x: 3.1, y: 5.4, w: 7.1, h: 0.3, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 10.5, color: MUTED });
  [['Plan önerisi', 'Davetli sayısı ve masa başına koltuktan plan üretilir.'],
   ['Eksik uyarısı', 'Koltuk toplamı davetliyi karşılamıyorsa eksik sayısı gösterilir.'],
   ['Masa notu', 'Her masaya açıklama yazılabilir.'],
  ].forEach(([bas, ack], i) => {
    const x = 0.7 + i * 4.07;
    s.addText(bas, { x, y: 5.95, w: 3.77, h: 0.28, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 13.5, bold: true, color: NAVY });
    s.addText(ack, { x, y: 6.25, w: 3.77, h: 0.55, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 11.5, color: INK, lineSpacing: 15 });
  });
  s.addNotes('Önerilen planın koltuk toplamı her zaman davetli sayısına eşittir.');
}

/* ── 12 SMS ──────────────────────────────────────────────────────── */
{
  const s = pres.addSlide();
  s.background = { color: SURFACE };
  head(s, 'SMS', 'Müşteriye SMS gönderimi');
  [['Rezervasyon onayı', 'Kayıt açıldığında tarih, seans ve doğrulama kodu gönderilir.'],
   ['Tarih hatırlatması', 'Organizasyon öncesi hatırlatma gönderilir.'],
   ['Tahsilat bildirimi', 'Ödeme alındığında müşteriye bilgi geçilir.'],
  ].forEach(([bas, ack], i) => {
    const x = 0.7 + i * 4.07;
    s.addShape(pres.ShapeType.roundRect, { x, y: 1.8, w: 3.77, h: 1.9, rectRadius: 0.1,
      fill:{color:WHITE}, line:{color:LINE, width:1} });
    s.addText(bas, { x: x+0.32, y: 2.08, w: 3.15, h: 0.32, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 14.5, bold: true, color: NAVY });
    s.addText(ack, { x: x+0.32, y: 2.46, w: 3.15, h: 1.0, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 12.5, color: INK, lineSpacing: 17 });
  });
  s.addShape(pres.ShapeType.roundRect, { x: 0.7, y: 4.0, w: 11.9, h: 2.4, rectRadius: 0.1,
    fill:{color:NAVY}, line:{color:NAVY} });
  s.addText('İYS kuralları', { x: 1.1, y: 4.3, w: 6.4, h: 0.36, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 19, bold: true, color: WHITE });
  s.addText('Rezervasyon onayı, hatırlatma ve doğrulama kodu işlem bildirimi sayılır ve İYS onayı gerektirmez. Ticari ileti (kampanya, tanıtım) yalnızca müşteri onay verdiyse gönderilebilir; bu kural veritabanı düzeyinde uygulanır.', {
    x: 1.1, y: 4.76, w: 6.7, h: 1.4, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 12.5, color: PALE, lineSpacing: 18 });
  [['Gönderim kuyruğu', 'Operatörden cevap alınamazsa mesaj yeniden denenir.'],
   ['Günlük üst sınır', 'Günlük gönderim adedi sınırlıdır.'],
  ].forEach(([bas, ack], i) => {
    const y = 4.35 + i * 1.0;
    s.addText(bas, { x: 8.2, y, w: 4.1, h: 0.3, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 13.5, bold: true, color: SKY });
    s.addText(ack, { x: 8.2, y: y+0.32, w: 4.1, h: 0.6, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 12, color: PALE, lineSpacing: 16 });
  });
  s.addNotes('SMS gönderimi için Netgsm aboneliği ve onaylı başlık gerekir.');
}

/* ── 13 Kod doğrulama ────────────────────────────────────────────── */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  head(s, 'KOD DOĞRULAMA', 'Müşterinin rezervasyon sorgusu');
  s.addText('Her rezervasyona bir kod verilir. Müşteri bu kodu sitenizden sorgulayarak tarihini, seansını ve tutarını görebilir.', {
    x: 3.15, y: 1.72, w: 7, h: 0.55, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 14, color: INK, lineSpacing: 19 });
  shot(s, img('site-kod-dogrulama.png'), 3.9, 2.4, 5.5, 2.62,
       'Telefon numarası maskeli gösterilir; ödeme bilgisi görünmez.');
  [['Maskeleme', 'Telefon 532*****00 biçiminde gösterilir.'],
   ['Ödeme bilgisi', 'Tahsilat ve kalan alacak dışarı açılmaz.'],
   ['Erişim', 'Sorgu için üyelik gerekmez.'],
  ].forEach(([bas, ack], i) => {
    const x = 0.7 + i * 4.07;
    s.addText(bas, { x, y: 5.6, w: 3.77, h: 0.3, isTextBox: true, margin: 0,
      align: 'center', fontFace: B, fontSize: 13.5, bold: true, color: NAVY });
    s.addText(ack, { x, y: 5.92, w: 3.77, h: 0.5, isTextBox: true, margin: 0,
      align: 'center', fontFace: B, fontSize: 11.5, color: INK, lineSpacing: 15 });
  });
  s.addNotes('Kod, rezervasyon onayı SMS’inde müşteriye gönderilir.');
}

/* ── 14 Kasa ve raporlar ─────────────────────────────────────────── */
{
  const s = pres.addSlide();
  s.background = { color: SURFACE };
  head(s, 'KASA VE RAPORLAR', 'Gelir gider ve raporlama');
  shot(s, img('panel-raporlar.png'), 0.7, 1.75, 6.05, 3.78, null);
  shot(s, img('panel-kasa.png'), 7.15, 1.75, 5.45, 3.4, null);
  s.addText('Solda aylık ciro ve organizasyon dağılımı, sağda gelir–gider kasası ve anlık bakiye.', {
    x: 0.7, y: 5.65, w: 11.9, h: 0.3, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 10.5, color: MUTED });
  [['Kasa bakiyesi', 'Gelir ve gider tek yerde'],
   ['Aylık ciro', 'Ay bazında dağılım'],
   ['Alacak bakiyesi', 'Toplam kalan alacak'],
   ['CSV aktarım', 'Listeler dışa aktarılır'],
  ].forEach(([bas, ack], i) => {
    const x = 0.7 + i * 3.05;
    s.addText(bas, { x, y: 6.15, w: 2.85, h: 0.28, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 13, bold: true, color: NAVY });
    s.addText(ack, { x, y: 6.45, w: 2.85, h: 0.28, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 11.5, color: MUTED });
  });
  s.addNotes('Raporlar tarih aralığına göre filtrelenebilir.');
}

/* ── 15 e-Fatura ─────────────────────────────────────────────────── */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  head(s, 'e-ARŞİV / e-FATURA', 'Fatura düzenleme');
  const adim = [['Rezervasyon','Müşteri, tarih, tutar'],
                ['Tahsilat','Ödemeler işlenir'],
                ['Fatura','KDV hesaplanır'],
                ['e-Arşiv','GİB’e gönderilir']];
  adim.forEach(([bas, ack], i) => {
    const x = 0.7 + i*3.13;
    s.addShape(pres.ShapeType.roundRect, { x, y: 1.8, w: 2.72, h: 1.3, rectRadius: 0.1,
      fill:{color: i===3 ? NAVY : SURFACE}, line:{color: i===3 ? NAVY : 'E3E9F4', width:1} });
    s.addText(bas, { x: x+0.28, y: 2.04, w: 2.2, h: 0.32, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 14.5, bold: true, color: i===3 ? WHITE : NAVY });
    s.addText(ack, { x: x+0.28, y: 2.4, w: 2.2, h: 0.5, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 11.5, color: i===3 ? PALE : INK, lineSpacing: 15 });
    if (i < 3) s.addShape(pres.ShapeType.rightArrow, { x: x+2.82, y: 2.3, w: 0.28, h: 0.3,
      fill:{color:ACCENT}, line:{color:ACCENT} });
  });
  shot(s, img('panel-faturalar.png'), 0.7, 3.55, 6.6, 2.35, 'Fatura listesi ve durumları.');
  notes(s, 7.75, 3.55, [
    ['Süre takibi', 'Fatura düzenleme süresi (VUK, 7 gün) ekranda gösterilir.'],
    ['Değiştirilemezlik', 'Gönderilmiş fatura değiştirilemez ve silinemez; yalnızca iptal edilebilir.'],
    ['Tutar tutarlılığı', 'Matrah + KDV = toplam kuralı zorunludur.'],
  ], 0.85, 4.85);
  s.addNotes('Gönderim Paraşüt üzerinden yapılır. Mükellefiyet durumu mali müşavire sorulmalıdır.');
}

/* ── 16 Talepler ─────────────────────────────────────────────────── */
{
  const s = pres.addSlide();
  s.background = { color: SURFACE };
  head(s, 'TALEPLER', 'Siteden gelen müşteri talepleri');
  shot(s, img('panel-talepler.png'), 0.7, 1.75, 7.4, 4.63,
       'Talepler durumlarına göre sayılır ve filtrelenir.');
  notes(s, 8.45, 1.9, [
    ['Tek liste', 'İletişim formu, demo talebi ve salon teklif formu aynı yerde toplanır.'],
    ['Durum ve not', 'Her talep yeni, işlemde ya da kapatıldı olarak işaretlenir; not yazılabilir.'],
    ['Değiştirilemezlik', 'Talebin içeriği sonradan değiştirilemez, kayıt silinemez.'],
    ['Erişim', 'Talepleri yalnızca yönetici görür.'],
  ], 1.2, 4.15);
  s.addNotes('Talep geldiğinde işleyen kullanıcı ve zaman damgası kaydedilir.');
}

/* ── 17 Yetkiler ─────────────────────────────────────────────────── */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  head(s, 'YETKİLER', 'Kullanıcı yetkileri');
  s.addText('Her personele ayrı hesap açılır ve hangi ekrana erişebileceği tek tek belirlenir. Örnek bir dağılım:', {
    x: 0.7, y: 1.68, w: 11.9, h: 0.34, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 14, color: MUTED });
  const satir = [
    ['Rezervasyon görüntüleme','✓','✓'], ['Rezervasyon ekleme / düzenleme','✓','✓'],
    ['Rezervasyon silme','✓','—'], ['Gelir – gider (kasa)','✓','—'],
    ['Raporlar ve ciro','✓','—'], ['Müşteri talepleri','✓','—'],
    ['Kullanıcı ve yetki yönetimi','✓','—'],
  ];
  const rows = [[
    { text: 'YETKİ', options: { bold: true, color: WHITE, fill: { color: NAVY }, fontSize: 12, align: 'left' } },
    { text: 'YÖNETİCİ', options: { bold: true, color: WHITE, fill: { color: NAVY }, fontSize: 12, align: 'center' } },
    { text: 'PERSONEL', options: { bold: true, color: WHITE, fill: { color: NAVY }, fontSize: 12, align: 'center' } },
  ]];
  satir.forEach(([ad, y1, y2], i) => {
    const bg = i % 2 ? SURFACE : WHITE;
    rows.push([
      { text: ad, options: { color: INK, fill: { color: bg }, fontSize: 12.5, align: 'left' } },
      { text: y1, options: { color: y1 === '✓' ? '1E7B3C' : MUTED, bold: true, fill: { color: bg }, fontSize: 13.5, align: 'center' } },
      { text: y2, options: { color: y2 === '✓' ? '1E7B3C' : MUTED, bold: true, fill: { color: bg }, fontSize: 13.5, align: 'center' } },
    ]);
  });
  s.addTable(rows, { x: 0.7, y: 2.2, w: 7.3, colW: [4.1, 1.6, 1.6], rowH: 0.42,
    border: { type: 'solid', color: LINE, pt: 1 }, fontFace: B, valign: 'middle', margin: 0.08 });

  s.addShape(pres.ShapeType.roundRect, { x: 8.45, y: 2.2, w: 4.15, h: 2.5, rectRadius: 0.1,
    fill:{color:NAVY}, line:{color:NAVY} });
  s.addText('Denetim kaydı', { x: 8.8, y: 2.5, w: 3.45, h: 0.36, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 19, bold: true, color: WHITE });
  s.addText('Ekleme, değişiklik ve silme işlemleri kullanıcı ve zaman bilgisiyle kaydedilir. Değişen alanın eski ve yeni değeri birlikte tutulur. Kayıtlar silinemez ve değiştirilemez.', {
    x: 8.8, y: 2.96, w: 3.45, h: 1.6, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 12, color: PALE, lineSpacing: 17 });
  s.addText('Personel hesapları ayrı şifreyle açılır; şifreler yöneticiye görünmez.', {
    x: 8.45, y: 4.95, w: 4.15, h: 0.7, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 12, color: INK, lineSpacing: 16 });
  s.addNotes('Yedi ayrı yetki tanımlıdır; tablo bunlardan bir dağılım örneğidir.');
}

/* ── 18 Veri güvenliği ───────────────────────────────────────────── */
{
  const s = pres.addSlide();
  s.background = { color: NAVY };
  head(s, 'VERİ', 'Veri saklama ve yedekleme', true);
  [['Sunucu konumu', 'Veriler AB bölgesinde (Frankfurt) tutulur.'],
   ['Gecelik yedek', 'Her gece otomatik yedek alınır; geri yükleme prosedürü belgelidir.'],
   ['Veri ayrımı', 'Her hesap yalnızca kendi verisini görür. Ayrım sunucu düzeyindedir.'],
  ].forEach(([bas, ack], i) => {
    const x = 0.7 + i*4.07;
    s.addShape(pres.ShapeType.roundRect, { x, y: 1.85, w: 3.77, h: 1.95, rectRadius: 0.1,
      fill:{color:BRAND}, line:{color:BRAND} });
    s.addText(bas, { x: x+0.32, y: 2.15, w: 3.15, h: 0.34, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 15, bold: true, color: WHITE });
    s.addText(ack, { x: x+0.32, y: 2.56, w: 3.15, h: 1.0, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 12, color: PALE, lineSpacing: 16 });
  });
  [['Giriş koruması', 'Art arda hatalı girişte hesap geçici olarak kilitlenir.'],
   ['Silinemeyen kayıtlar', 'Fatura, denetim kaydı ve müşteri talepleri silinemez.'],
   ['Sistem durumu ekranı', 'Yedek, SMS kuyruğu ve İYS durumu panelden izlenir.'],
  ].forEach(([bas, ack], i) => {
    const x = 0.7 + i*4.07;
    s.addText(bas, { x, y: 4.3, w: 3.77, h: 0.3, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 13.5, bold: true, color: SKY });
    s.addText(ack, { x, y: 4.63, w: 3.77, h: 0.8, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 12, color: PALE, lineSpacing: 16 });
  });
  s.addText('Kuralların çoğu arayüzde değil veritabanı düzeyinde tanımlıdır: çifte rezervasyon, kapora aşımı, onaysız ticari SMS, gönderilmiş faturanın değiştirilmesi ve taksit toplamının rezervasyon tutarını aşması kayıt aşamasında reddedilir.', {
    x: 0.7, y: 5.7, w: 11.9, h: 0.9, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 12.5, color: PALE, lineSpacing: 18 });
  s.addNotes('Veriler Supabase (PostgreSQL) üzerinde tutulur.');
}

/* ── 19 Kurulum ──────────────────────────────────────────────────── */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  head(s, 'KURULUM', 'Kurulum ve gereksinimler');
  const rows = [[
    { text: 'BİLEŞEN', options: { bold: true, color: WHITE, fill: { color: NAVY }, fontSize: 12, align: 'left' } },
    { text: 'GEREKLİ Mİ', options: { bold: true, color: WHITE, fill: { color: NAVY }, fontSize: 12, align: 'center' } },
    { text: 'AÇIKLAMA', options: { bold: true, color: WHITE, fill: { color: NAVY }, fontSize: 12, align: 'left' } },
  ]];
  [['Veritabanı ve barındırma','Evet','Sistem bunlar olmadan çalışmaz.'],
   ['SMS sağlayıcısı','Hayır','Tanımlı değilse mesaj gönderilmez, kayıt tutulur.'],
   ['e-Fatura entegratörü','Hayır','Tanımlı değilse fatura taslak olarak kalır.'],
   ['İYS entegrasyonu','Hayır','Yalnızca ticari ileti gönderilecekse gerekir.'],
   ['Hata izleme','Hayır','Tanımlı değilse dış servise istek gitmez.'],
  ].forEach(([a, b2, c], i) => {
    const bg = i % 2 ? SURFACE : WHITE;
    rows.push([
      { text: a, options: { color: INK, fill: { color: bg }, fontSize: 12.5, align: 'left' } },
      { text: b2, options: { color: b2 === 'Evet' ? NAVY : MUTED, bold: true, fill: { color: bg }, fontSize: 12.5, align: 'center' } },
      { text: c, options: { color: INK, fill: { color: bg }, fontSize: 12, align: 'left' } },
    ]);
  });
  s.addTable(rows, { x: 0.7, y: 1.9, w: 11.9, colW: [3.6, 1.8, 6.5], rowH: 0.5,
    border: { type: 'solid', color: LINE, pt: 1 }, fontFace: B, valign: 'middle', margin: 0.08 });
  s.addText('Kurulum gerektirmez; tarayıcıdan kullanılır. Bilgisayar, tablet ve telefonda aynı ekranlar çalışır.', {
    x: 0.7, y: 5.6, w: 11.9, h: 0.4, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 13, color: INK });
  s.addText('Bir sağlayıcı tanımlı değilse ilgili özellik kapanır; sistemin geri kalanı çalışmaya devam eder ve arayüz durumu açıkça belirtir.', {
    x: 0.7, y: 6.1, w: 11.9, h: 0.5, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 12.5, color: MUTED, lineSpacing: 17 });
  s.addNotes('Netgsm başlık onayı birkaç iş günü sürer; en erken başvurulması gereken adımdır.');
}

/* ── 20 Maliyet ──────────────────────────────────────────────────── */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  head(s, 'MALİYET', 'Aylık ve tek seferlik giderler');

  /** Bir sütun: başlık, kalem/tutar satırları ve altına açıklama. */
  function sutun(x, baslik, kalemler, aciklama) {
    s.addShape(pres.ShapeType.roundRect, { x, y: 1.75, w: 3.85, h: 3.95, rectRadius: 0.1,
      fill: { color: SURFACE }, line: { color: 'E3E9F4', width: 1 } });
    s.addText(baslik, { x: x + 0.3, y: 2.0, w: 3.25, h: 0.34, isTextBox: true, margin: 0,
      fontFace: H, fontSize: 16, bold: true, color: NAVY });
    kalemler.forEach(([ad, tutar], i) => {
      const y = 2.55 + i * 0.52;
      s.addText(ad, { x: x + 0.3, y, w: 2.1, h: 0.34, isTextBox: true, margin: 0,
        fontFace: B, fontSize: 12, color: INK });
      s.addText(tutar, { x: x + 2.35, y, w: 1.2, h: 0.34, isTextBox: true, margin: 0,
        align: 'right', fontFace: B, fontSize: 12, bold: true, color: NAVY });
    });
    s.addText(aciklama, { x: x + 0.3, y: 4.95, w: 3.25, h: 0.65, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 10.5, color: MUTED, lineSpacing: 14 });
  }

  sutun(0.7, 'Zorunlu — her ay', [
    ['Supabase Pro', '$25'],
    ['Vercel Pro', '$20'],
  ], 'Veritabanı, gecelik yedek, barındırma ve zamanlanmış görevler. Vercel’in ücretsiz planı ticari kullanıma kapalıdır ve zamanlanmış görevi günde bire indirir.');

  sutun(4.75, 'SMS — kullandıkça', [
    ['1.000 SMS', '370 ₺'],
    ['5.000 SMS', '1.089 ₺'],
    ['10.000 SMS', '1.699 ₺'],
    ['25.000 SMS', '4.179 ₺'],
  ], 'Netgsm paket fiyatları, KDV ve ÖİV dahil. Paketsiz tarife adet başına 0,42 ₺. Marka başlığı onayı gönderimden önce alınır.');

  sutun(8.8, 'e-Fatura — isteğe bağlı', [
    ['Paraşüt e-Portal', '150 ₺/ay'],
    ['Mali mühür (3 yıl)', '1.620 ₺'],
    ['100 e-kontör', '400 ₺'],
  ], 'Paraşüt tutarları KDV hariç. Bir fatura bir kontördür; kontör paketi 12 ay geçerlidir. Mali mühür tüzel kişi tutarıdır.');

  s.addText('Bir sağlayıcı tanımlanmazsa yalnızca o özellik kapanır: SMS sağlayıcısı yoksa mesajlar kuyrukta bekler, e-Fatura entegratörü yoksa faturalar taslak olarak kaydedilir. Sistemin geri kalanı çalışmaya devam eder.', {
    x: 0.7, y: 5.9, w: 11.95, h: 0.55, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 12.5, color: INK, lineSpacing: 17 });
  s.addText('Fiyatlar Eylül 2026’da sağlayıcıların yayımlanmış listelerinden alınmıştır. Supabase ve Vercel dolar üzerinden faturalandırır.', {
    x: 0.7, y: 6.55, w: 11.95, h: 0.4, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 11, color: MUTED });
  s.addNotes('Ayda 30 organizasyon kaydeden bir salon, kayıt onayı ve hatırlatma ile yaklaşık 100–150 SMS gönderir; 1.000’lik paket birkaç ay yeter. Sabit gider iki abonelikten ibarettir.');
}

pres.writeFile({ fileName: 'Salon-Ajandasi-Tanitim.pptx' }).then((f) => console.log('Yazıldı:', f));
