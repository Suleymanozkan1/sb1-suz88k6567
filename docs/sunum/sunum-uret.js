const pptxgen = require('pptxgenjs');
const path = require('path');
const SS = path.resolve(__dirname, '../ss');
const img = (n) => path.join(SS, n);

const NAVY='25365A', BRAND='37517E', SKY='47B2E4', GOLD='C9A227';
const SURFACE='F3F5FA', INK='333F55', MUTED='6B7A99', WHITE='FFFFFF', PALE='C6D2E8', LINE='DCE3EF';
const H='Cambria', B='Calibri';

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';                 // 13.3 x 7.5
pres.author = 'Düğün Takip';
pres.title = 'Düğün Takip — Salon Yönetim Sistemi';

/** Ekran görüntüsü çerçevesi + "neyi kanıtlıyor" altyazısı: sunumun tekrar eden motifi. */
function shot(s, file, x, y, w, h, caption, capColor) {
  s.addShape(pres.ShapeType.roundRect, {
    x: x-0.08, y: y-0.08, w: w+0.16, h: h+0.16, rectRadius: 0.08,
    fill: { color: WHITE }, line: { color: LINE, width: 1 },
    shadow: { type:'outer', color:'1B2A4A', opacity:0.18, blur:14, offset:4, angle:90 },
  });
  s.addImage({ path: file, x, y, w, h });
  if (caption) {
    s.addText(caption, {
      x, y: y+h+0.16, w, h: 0.3, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 10.5, italic: true, color: capColor || MUTED,
    });
  }
}

function head(s, kicker, title, onDark) {
  s.addText(kicker, {
    x: 0.7, y: 0.44, w: 9, h: 0.3, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 12, bold: true, color: SKY, charSpacing: 2,
  });
  s.addText(title, {
    x: 0.7, y: 0.78, w: 11.9, h: 0.82, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 33, bold: true, color: onDark ? WHITE : NAVY,
  });
}

/* ═══════════════════════════════════ 1 — Kapak (tam kanama, koyu) */
{
  const s = pres.addSlide();
  s.background = { color: NAVY };
  s.addShape(pres.ShapeType.ellipse, { x: 9.6, y: -2.1, w: 6.6, h: 6.6, fill:{color:BRAND}, line:{color:BRAND} });
  s.addShape(pres.ShapeType.ellipse, { x: 11.4, y: 4.9, w: 3.4, h: 3.4, fill:{color:BRAND}, line:{color:BRAND} });
  s.addText('SALON YÖNETİM SİSTEMİ', {
    x: 0.9, y: 2.0, w: 8, h: 0.32, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 13, bold: true, color: SKY, charSpacing: 3 });
  s.addText('Düğün Takip', {
    x: 0.9, y: 2.4, w: 8.4, h: 1.3, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 62, bold: true, color: WHITE });
  s.addText('Rezervasyondan tahsilata, sözleşmeden faturaya\nsalonunuzun tamamı tek ekranda.', {
    x: 0.9, y: 3.78, w: 8, h: 0.95, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 19, color: PALE, lineSpacing: 30 });
  s.addShape(pres.ShapeType.roundRect, {
    x: 0.9, y: 5.1, w: 4.6, h: 0.64, rectRadius: 0.32, fill:{color:GOLD}, line:{color:GOLD} });
  s.addText('Defterle salon yönetilmez.', {
    x: 0.9, y: 5.1, w: 4.6, h: 0.64, isTextBox: true, margin: 0,
    align:'center', valign:'middle', fontFace: B, fontSize: 15, bold: true, color: NAVY });
  s.addNotes('Açılış. Dinleyiciye "salonunuzu şu an nasıl takip ediyorsunuz?" diye sorarak başlayın; cevap sonraki slaytın zeminini kurar.');
}

/* ═══════════════════════════════════ 2 — Sorun (2x2 kart ızgarası) */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  head(s, 'SORUN', 'Salon işletmenin görünmeyen maliyeti');
  s.addText('Defter, Excel ve WhatsApp ile yönetilen bir salonda bunlar er ya da geç yaşanır:', {
    x: 0.7, y: 1.7, w: 11.9, h: 0.34, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 15, color: MUTED });
  [['Çifte rezervasyon','Aynı güne iki nikâh yazılır. Fark edildiğinde iş işten geçmiştir; müşteri kaybı ve itibar zararı.'],
   ['Takip edilmeyen alacak','Kim ne kadar ödedi, ne kadar kaldı? Kapora alınır, kalanı düğün günü hatırlanır.'],
   ['Kaybolan sözleşme','Anlaşma sözlü kalır ya da kâğıt kaybolur. Anlaşmazlıkta elinizde belge yoktur.'],
   ['Fatura ve mevzuat riski','e-Arşiv süresi kaçar, KVKK ve İYS yükümlülükleri takip edilmez. Ceza kapıya dayanır.'],
  ].forEach(([bas, ack], i) => {
    const x = 0.7 + (i%2)*6.2, y = 2.3 + Math.floor(i/2)*2.05;
    s.addShape(pres.ShapeType.roundRect, { x, y, w: 5.8, h: 1.78, rectRadius: 0.1,
      fill:{color:SURFACE}, line:{color:'E3E9F4', width:1} });
    s.addShape(pres.ShapeType.ellipse, { x: x+0.32, y: y+0.38, w: 0.64, h: 0.64, fill:{color:BRAND}, line:{color:BRAND} });
    s.addText(String(i+1), { x: x+0.32, y: y+0.38, w: 0.64, h: 0.64, isTextBox: true, margin: 0,
      align:'center', valign:'middle', fontFace: H, fontSize: 23, bold: true, color: WHITE });
    s.addText(bas, { x: x+1.14, y: y+0.32, w: 4.4, h: 0.34, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 16, bold: true, color: NAVY });
    s.addText(ack, { x: x+1.14, y: y+0.68, w: 4.42, h: 0.9, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 12, color: INK, lineSpacing: 17 });
  });
  s.addNotes('En az biri her salonun başına gelmiştir. "Bunlardan hangisi sizde oldu?" diye sorup cevabı bekleyin.');
}

/* ═══════════════════════════════════ 3 — Öncesi / Sonrası (iki sütun) */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  head(s, 'ÇÖZÜM', 'Aynı işler, dörtte bir sürede');
  const L = ['Takvim defterde; boşluğu göz kararı bulursunuz',
             'Ödeme kaydı ayrı bir kâğıtta, çoğu zaman eksik',
             'Sözleşme Word’de elle doldurulur',
             'Müşteriye tek tek telefon açılır',
             'Ay sonu ciro hesabı akşamları yapılır',
             'Fatura için ayrı programa yeniden veri girilir'];
  const R = ['Takvim ekranda; dolu seansa ikinci kayıt açılamaz',
             'Her tahsilat kayıtlı; kalan alacak kendiliğinden',
             'Sözleşme rezervasyondan tek tıkla üretilir',
             'Onay ve hatırlatma SMS’i otomatik gider',
             'Aylık ciro ve alacak raporu hazır bekler',
             'Fatura aynı kayıttan oluşur, e-Arşiv’e gider'];
  [[ 'ÖNCESİ', L, 0.7, SURFACE, 'E3E9F4', MUTED, INK, '–', MUTED ],
   [ 'DÜĞÜN TAKİP İLE', R, 6.9, NAVY, NAVY, SKY, WHITE, '✓', GOLD ],
  ].forEach(([bas, list, x, fill, line, headC, textC, mark, markC]) => {
    s.addShape(pres.ShapeType.roundRect, { x, y: 1.78, w: 5.7, h: 4.95, rectRadius: 0.1,
      fill:{color:fill}, line:{color:line, width:1} });
    s.addText(bas, { x: x+0.4, y: 2.06, w: 4.9, h: 0.34, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 13, bold: true, charSpacing: 2, color: headC });
    list.forEach((t, i) => {
      const yy = 2.64 + i*0.67;
      s.addText(mark, { x: x+0.4, y: yy, w: 0.3, h: 0.3, isTextBox: true, margin: 0,
        fontFace: B, fontSize: 14, bold: true, color: markC });
      s.addText(t, { x: x+0.78, y: yy-0.03, w: 4.6, h: 0.58, isTextBox: true, margin: 0,
        fontFace: B, fontSize: 13, color: textC, lineSpacing: 16 });
    });
  });
  s.addNotes('Sağ sütunda vurgulanacak satır: dolu seansa ikinci kayıt AÇILAMAZ. Uyarı değil, engelleme.');
}

/* ═══════════════════════════════════ 4 — Takvim (split: görsel baskın sol) */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  head(s, 'TAKVİM', 'Çifte rezervasyon artık mümkün değil');
  shot(s, img('panel-takvim.png'), 0.7, 1.85, 7.7, 4.81,
       'Gerçek ekran: bir ayın gündüz ve gece seansları, türe göre renklendirilmiş.');
  [['Gündüz ve gece ayrı','Her gün iki seans olarak tutulur; yarım gün satışları da takip edilir.'],
   ['Renk = organizasyon türü','Düğün, nişan, kına, sünnet… Takvime bakınca ay bir bakışta okunur.'],
   ['Sistem izin vermez','Dolu bir seansa ikinci kayıt açmaya çalışırsanız kayıt reddedilir. Bu kural veritabanında tanımlıdır; hiçbir kullanıcı atlayamaz.'],
  ].forEach(([bas, ack], i) => {
    const y = 1.95 + i*1.62;
    s.addText(bas, { x: 8.85, y, w: 3.75, h: 0.32, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 15, bold: true, color: NAVY });
    s.addText(ack, { x: 8.85, y: y+0.36, w: 3.75, h: 1.15, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 12.5, color: INK, lineSpacing: 17 });
  });
  s.addNotes('En güçlü satış argümanı. "Uyarı verir" değil — sistem kaydı kabul etmez.');
}

/* ═══════════════════════════════════ 5 — Tahsilat (büyük sayı önde, görsel sağda) */
{
  const s = pres.addSlide();
  s.background = { color: SURFACE };
  head(s, 'REZERVASYON VE TAHSİLAT', 'Kimden ne kadar alacağınız her an belli');

  s.addShape(pres.ShapeType.roundRect, { x: 0.7, y: 1.85, w: 5.15, h: 2.35, rectRadius: 0.1,
    fill:{color:NAVY}, line:{color:NAVY} });
  s.addText('210.000 ₺ toplam  −  63.000 ₺ tahsilat', {
    x: 1.05, y: 2.12, w: 4.5, h: 0.3, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 12, bold: true, color: SKY });
  s.addText('147.000 ₺', { x: 1.05, y: 2.48, w: 4.5, h: 0.95, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 48, bold: true, color: GOLD });
  s.addText('kalan alacak — elle hesaplanmadan, her açtığınızda güncel.', {
    x: 1.05, y: 3.42, w: 4.5, h: 0.62, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 12.5, color: PALE, lineSpacing: 17 });

  [['Her tahsilat kayıtlı','Tarih, tutar, ödeme şekli ve açıklama. Nakit, havale, kart ayrı ayrı görünür.'],
   ['Kapora toplamı aşamaz','Hatalı giriş sistem tarafından baştan reddedilir.'],
   ['Tahsilat oranı görünür','Rezervasyonun ne kadarı tahsil edilmiş, çubuk olarak gösterilir.'],
  ].forEach(([bas, ack], i) => {
    const y = 4.45 + i*0.78;
    s.addShape(pres.ShapeType.ellipse, { x: 0.7, y: y+0.04, w: 0.3, h: 0.3, fill:{color:GOLD}, line:{color:GOLD} });
    s.addText('✓', { x: 0.7, y: y+0.04, w: 0.3, h: 0.3, isTextBox: true, margin: 0,
      align:'center', valign:'middle', fontFace: B, fontSize: 12, bold: true, color: NAVY });
    s.addText(bas, { x: 1.14, y, w: 4.7, h: 0.28, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 13.5, bold: true, color: NAVY });
    s.addText(ack, { x: 1.14, y: y+0.3, w: 4.7, h: 0.44, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 11.5, color: INK, lineSpacing: 15 });
  });
  shot(s, img('panel-rezervasyon-detay.png'), 6.35, 1.85, 6.25, 4.35,
       'Gerçek ekran: tahsilatlar ve kalan alacak, rezervasyonun kendi sayfasında.');
  s.addNotes('Salon sahibinin en çok para kaybettiği yer. "Düğün günü kalan ne kadardı?" sorusunun cevabı ekranda.');
}

/* ═══════════════════════════════════ 6 — Sözleşme (ters split: metin sol) */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  head(s, 'SÖZLEŞME', 'Sözleşme tek tıkla, elle doldurmadan');
  s.addText('Rezervasyondaki bilgiler sözleşmeye kendiliğinden geçer: müşteri, tarih, seans, hizmetler, tutar ve ödeme planı. Yazdırıp imzalatırsınız — anlaşmazlıkta elinizde belge olur.', {
    x: 0.7, y: 1.85, w: 5.2, h: 1.5, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 14, color: INK, lineSpacing: 21 });
  [['Yazım hatası olmaz','Veri tek yerden gelir, ikinci kez yazılmaz.'],
   ['Her rezervasyonun kendi sözleşmesi','Klasör karıştırmaya son.'],
   ['Yazdırmaya hazır düzen','A4 çıktı için biçimlenmiştir.']].forEach(([bas, ack], i) => {
    const y = 3.6 + i*1.05;
    s.addShape(pres.ShapeType.ellipse, { x: 0.7, y: y+0.04, w: 0.34, h: 0.34, fill:{color:GOLD}, line:{color:GOLD} });
    s.addText('✓', { x: 0.7, y: y+0.04, w: 0.34, h: 0.34, isTextBox: true, margin: 0,
      align:'center', valign:'middle', fontFace: B, fontSize: 13, bold: true, color: NAVY });
    s.addText(bas, { x: 1.2, y, w: 4.7, h: 0.3, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 14.5, bold: true, color: NAVY });
    s.addText(ack, { x: 1.2, y: y+0.33, w: 4.7, h: 0.3, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 12.5, color: MUTED });
  });
  shot(s, img('panel-sozlesme.png'), 6.35, 1.85, 6.25, 4.6,
       'Gerçek çıktı: rezervasyon bilgileriyle dolmuş kiralama sözleşmesi.');
  s.addNotes('Sözlü anlaşmanın riskini hatırlatın. Bu slayt hukuki güvence mesajı verir.');
}

/* ═══════════════════════════════════ 7 — SMS (kart satırı + koyu bant) */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  head(s, 'OTOMATİK SMS', 'Müşteriniz bilgilendirilir, siz uğraşmazsınız');
  [['Rezervasyon onayı','Kayıt açılır açılmaz müşteriye tarih, seans ve doğrulama kodu gider.'],
   ['Yaklaşan tarih hatırlatması','Organizasyon öncesi otomatik hatırlatma; "unuttum" diye bir şey kalmaz.'],
   ['Tahsilat bildirimi','Ödeme alındığında müşteriye bilgi geçilir; güven artar.'],
  ].forEach(([bas, ack], i) => {
    const x = 0.7 + i*4.07;
    s.addShape(pres.ShapeType.roundRect, { x, y: 1.8, w: 3.77, h: 2.2, rectRadius: 0.1,
      fill:{color:SURFACE}, line:{color:'E3E9F4', width:1} });
    s.addShape(pres.ShapeType.ellipse, { x: x+0.32, y: 2.05, w: 0.5, h: 0.5, fill:{color:SKY}, line:{color:SKY} });
    s.addText(String(i+1), { x: x+0.32, y: 2.05, w: 0.5, h: 0.5, isTextBox: true, margin: 0,
      align:'center', valign:'middle', fontFace: H, fontSize: 18, bold: true, color: WHITE });
    s.addText(bas, { x: x+0.32, y: 2.68, w: 3.15, h: 0.34, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 15, bold: true, color: NAVY });
    s.addText(ack, { x: x+0.32, y: 3.06, w: 3.15, h: 0.85, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 12.5, color: INK, lineSpacing: 17 });
  });
  s.addShape(pres.ShapeType.roundRect, { x: 0.7, y: 4.28, w: 11.9, h: 2.42, rectRadius: 0.1,
    fill:{color:NAVY}, line:{color:NAVY} });
  s.addText('Mevzuata uygun gönderim', { x: 1.1, y: 4.55, w: 6.4, h: 0.38, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 21, bold: true, color: WHITE });
  s.addText('Rezervasyon onayı, hatırlatma ve doğrulama kodu işlem bildirimidir; İYS onayı gerektirmez. Kampanya SMS’i ise ancak müşteri onay verdiyse gönderilebilir — bu kural sistemin içine yazılmıştır, onaysız ticari mesaj hiçbir şekilde çıkmaz.', {
    x: 1.1, y: 5.02, w: 6.7, h: 1.4, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 13, color: PALE, lineSpacing: 19 });
  [['Gönderim kuyruğu','Operatör anlık cevap vermezse mesaj kaybolmaz, yeniden denenir.'],
   ['Günlük üst sınır','Hatalı bir işlem kontörünüzü tüketemez.']].forEach(([bas, ack], i) => {
    const y = 4.62 + i*1.0;
    s.addText(bas, { x: 8.2, y, w: 4.1, h: 0.3, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 14, bold: true, color: SKY });
    s.addText(ack, { x: 8.2, y: y+0.32, w: 4.1, h: 0.62, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 12, color: PALE, lineSpacing: 16 });
  });
  s.addNotes('İYS cezaları yüksek ve salon sahipleri çoğu zaman bilmez. Burada bilgi vererek güven kazanırsınız.');
}

/* ═══════════════════════════════════ 8 — Kod doğrulama (ortalanmış kompozisyon) */
{
  const s = pres.addSlide();
  s.background = { color: SURFACE };
  head(s, 'GÜVEN', 'Müşteri rezervasyonunu kendi doğrular');
  s.addText('Her rezervasyona bir kod verilir. Müşteri bu kodu sitenizden sorgulayarak tarihini, seansını ve tutarını görür — sizi aramasına gerek kalmaz.', {
    x: 3.15, y: 1.72, w: 7, h: 0.6, isTextBox: true, margin: 0,
    align: 'center', fontFace: B, fontSize: 14, color: INK, lineSpacing: 20 });
  shot(s, img('site-kod-dogrulama.png'), 3.9, 2.45, 5.5, 2.62,
       'Gerçek ekran: telefon 532*****00 olarak maskeli, ödeme bilgisi hiç görünmüyor.');
  [['Telefon maskeli','532*****00 biçiminde gösterilir.'],
   ['Ödeme bilgisi gizli','Tutar ve tahsilat dışarı açılmaz.'],
   ['Telefon trafiği azalır','"Kaydım yapıldı mı?" araması biter.'],
  ].forEach(([bas, ack], i) => {
    const x = 0.7 + i*4.07;
    s.addText(bas, { x, y: 5.65, w: 3.77, h: 0.3, isTextBox: true, margin: 0,
      align: 'center', fontFace: B, fontSize: 14, bold: true, color: NAVY });
    s.addText(ack, { x, y: 5.98, w: 3.77, h: 0.55, isTextBox: true, margin: 0,
      align: 'center', fontFace: B, fontSize: 12, color: INK, lineSpacing: 16 });
  });
  s.addNotes('Küçük ama fark yaratan özellik: salonu kurumsal gösterir.');
}


/* ═══════════════════════════════════ 4b — Salonlar (kart + görsel) */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  head(s, 'SALONLAR', 'Birden çok salonu tek takvimden yönetin');
  s.addText('Kristal Salon, Bahçe, Teras… Her salon ayrı takvim gibi çalışır.', {
    x: 0.7, y: 1.7, w: 11.9, h: 0.36, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 15, color: MUTED });
  shot(s, img('panel-salonlar.png'), 0.7, 2.2, 7.3, 4.56,
       'Gerçek ekran: her salonun kapasitesi ve bağlı rezervasyon sayısı.');
  [['Çakışma salon bazında','Aynı salona ikinci kayıt açılamaz; farklı salona açılabilir. Kural veritabanında tanımlıdır.'],
   ['Kapasite takibi','Salonun kaç kişilik olduğunu tanımlar, rezervasyonda görürsünüz.'],
   ['Pasife alma','Tadilattaki salonu listeden kaldırmadan yeni rezervasyona kapatırsınız.'],
  ].forEach(([bas, ack], i) => {
    const y = 2.3 + i*1.55;
    s.addText(bas, { x: 8.45, y, w: 4.15, h: 0.32, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 15, bold: true, color: NAVY });
    s.addText(ack, { x: 8.45, y: y+0.36, w: 4.15, h: 1.05, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 12.5, color: INK, lineSpacing: 17 });
  });
  s.addNotes('Çok salonlu işletmeler için en güçlü argüman. Tek salonu olan salona da "ileride ikinciyi açarsanız hazır" denebilir.');
}

/* ═══════════════════════════════════ 5b — Menü / paket (büyük sayı + görsel) */
{
  const s = pres.addSlide();
  s.background = { color: SURFACE };
  head(s, 'MENÜ VE PAKETLER', 'Fiyatı bir kez tanımlayın, sistem hesaplasın');

  s.addShape(pres.ShapeType.roundRect, { x: 0.7, y: 1.85, w: 5.15, h: 2.3, rectRadius: 0.1,
    fill:{color:NAVY}, line:{color:NAVY} });
  s.addText('450 ₺ / kişi  ×  400 kişi', { x: 1.05, y: 2.12, w: 4.5, h: 0.3, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 12, bold: true, color: SKY });
  s.addText('180.000 ₺', { x: 1.05, y: 2.46, w: 4.5, h: 0.92, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 46, bold: true, color: GOLD });
  s.addText('tek tıkla uygulanır — hesap makinesi yok, yazım hatası yok.', {
    x: 1.05, y: 3.38, w: 4.5, h: 0.6, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 12.5, color: PALE, lineSpacing: 17 });

  [['Kişi başı ya da sabit','Açık büfe kişi başı, yemeksiz salon kirası sabit tutarlı tanımlanır.'],
   ['Öneri, dayatma değil','Pazarlık yaptıysanız tutarı elle değiştirirsiniz.'],
   ['Menü listesi hazır','150 / 300 / 500 kişilik tutarlar menü kartında görünür; müşteriye anında fiyat verirsiniz.'],
  ].forEach(([bas, ack], i) => {
    const y = 4.35 + i*0.82;
    s.addShape(pres.ShapeType.ellipse, { x: 0.7, y: y+0.04, w: 0.3, h: 0.3, fill:{color:GOLD}, line:{color:GOLD} });
    s.addText('✓', { x: 0.7, y: y+0.04, w: 0.3, h: 0.3, isTextBox: true, margin: 0,
      align:'center', valign:'middle', fontFace: B, fontSize: 12, bold: true, color: NAVY });
    s.addText(bas, { x: 1.14, y, w: 4.7, h: 0.28, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 13.5, bold: true, color: NAVY });
    s.addText(ack, { x: 1.14, y: y+0.3, w: 4.7, h: 0.48, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 11.5, color: INK, lineSpacing: 15 });
  });
  shot(s, img('panel-menuler.png'), 6.35, 1.85, 6.25, 3.9,
       'Gerçek ekran: menü kartları ve örnek kişi sayılarına göre tutarlar.');
  s.addNotes('Telefonda fiyat sorulduğunda menü ekranından anında cevap verilebilir — bu, salon sahibinin günlük derdi.');
}

/* ═══════════════════════════════════ 8b — Masa düzeni (ortalanmış) */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  head(s, 'MASA OTURMA DÜZENİ', 'Kaç masa kuracağınızı sistem söylesin');
  s.addText('Davetli sayısını girin, plan kendiliğinden oluşsun.', {
    x: 0.7, y: 1.7, w: 11.9, h: 0.36, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 15, color: MUTED });
  shot(s, img('panel-masa-duzeni.png'), 3.1, 2.2, 7.1, 3.45, null);
  s.addText('Gerçek ekran: 80 davetli için önerilen plan; masa sayısı, koltuk toplamı ve fazlalık üstte özetlenir.', {
    x: 3.1, y: 5.8, w: 7.1, h: 0.3, isTextBox: true, margin: 0,
    align: 'center', fontFace: B, fontSize: 10.5, italic: true, color: MUTED });
  [['Otomatik plan','Davetliye göre masa sayısı hesaplanır.'],
   ['Eksik koltuk uyarısı','Plan yetersizse kaç koltuk eksik olduğu yazar.'],
   ['Masa açıklaması','“Gelin tarafı”, “damat tarafı” gibi not düşülür.'],
  ].forEach(([bas, ack], i) => {
    const x = 0.7 + i*4.07;
    s.addText(bas, { x, y: 6.25, w: 3.77, h: 0.28, isTextBox: true, margin: 0,
      align:'center', fontFace: B, fontSize: 13.5, bold: true, color: NAVY });
    s.addText(ack, { x, y: 6.55, w: 3.77, h: 0.3, isTextBox: true, margin: 0,
      align:'center', fontFace: B, fontSize: 11.5, color: MUTED });
  });
  s.addNotes('Düğün öncesi en çok zaman alan işlerden biri. Excel ile yapılan işi ekran yapıyor.');
}

/* ═══════════════════════════════════ 9b — Makbuz (ters split) */
{
  const s = pres.addSlide();
  s.background = { color: SURFACE };
  head(s, 'TAHSİLAT MAKBUZU', 'Her ödemeye imzalı belge');
  s.addText('Aldığınız her kapora ve ara ödeme için tek tıkla makbuz üretilir. Müşteri imzalar, iki tarafta da belge kalır.', {
    x: 0.7, y: 1.85, w: 5.2, h: 1.0, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 14, color: INK, lineSpacing: 21 });
  [['Belge numarası','Her makbuzun kendi numarası olur.'],
   ['Rezervasyona bağlı','Hangi organizasyonun ödemesi olduğu yazar.'],
   ['Yazdırmaya hazır','A4 çıktı için biçimlenmiştir.'],
  ].forEach(([bas, ack], i) => {
    const y = 3.15 + i*1.05;
    s.addShape(pres.ShapeType.ellipse, { x: 0.7, y: y+0.04, w: 0.34, h: 0.34, fill:{color:GOLD}, line:{color:GOLD} });
    s.addText('✓', { x: 0.7, y: y+0.04, w: 0.34, h: 0.34, isTextBox: true, margin: 0,
      align:'center', valign:'middle', fontFace: B, fontSize: 13, bold: true, color: NAVY });
    s.addText(bas, { x: 1.2, y, w: 4.7, h: 0.3, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 14.5, bold: true, color: NAVY });
    s.addText(ack, { x: 1.2, y: y+0.33, w: 4.7, h: 0.3, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 12.5, color: MUTED });
  });
  s.addText('“Kaporayı ödedim” tartışması bitiyor.', {
    x: 0.7, y: 6.15, w: 5.2, h: 0.4, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 13, italic: true, color: BRAND });
  shot(s, img('panel-makbuz.png'), 6.35, 1.85, 6.25, 4.6,
       'Gerçek çıktı: tahsil edilen tutar, ödeme şekli ve imza alanları.');
  s.addNotes('Nakit tahsilatın çok olduğu bir sektörde belge, salon sahibini korur.');
}

/* ═══════════════════════════════════ 9 — Kasa & Rapor (tam genişlik görsel bandı) */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  head(s, 'KASA VE RAPORLAR', 'Hangi ay ne kazandınız, hazır bekliyor');
  shot(s, img('panel-raporlar.png'), 0.7, 1.82, 6.05, 3.78, null);
  shot(s, img('panel-kasa.png'), 7.15, 1.82, 5.45, 3.4, null);
  s.addText('Gerçek ekranlar: aylık ciro ve organizasyon dağılımı (solda), gelir–gider kasası ve anlık bakiye (sağda).', {
    x: 0.7, y: 5.72, w: 11.9, h: 0.3, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 10.5, italic: true, color: MUTED });
  [['Anlık kasa bakiyesi', 'Gelir ve gider tek yerde'],
   ['Aylık ciro grafiği', 'Hangi ay ne kazandınız'],
   ['Toplam alacak', 'Kimden ne kadar kaldı'],
   ['Excel’e aktarım', 'Tüm listeler CSV olarak']].forEach(([bas, ack], i) => {
    const x = 0.7 + i*3.05;
    s.addText(bas, { x, y: 6.25, w: 2.85, h: 0.28, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 13.5, bold: true, color: NAVY });
    s.addText(ack, { x, y: 6.55, w: 2.85, h: 0.28, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 11.5, color: MUTED });
  });
  s.addNotes('Mali müşavire gidecek veriyi hazırlamak da kolaylaşır. CSV aktarımını vurgulayın.');
}

/* ═══════════════════════════════════ 10 — e-Fatura (süreç akışı) */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  head(s, 'e-ARŞİV / e-FATURA', 'Fatura aynı kayıttan çıkar');
  s.addText('Rezervasyon bilgisi faturaya doğrudan geçer. Hiçbir veriyi ikinci kez yazmazsınız:', {
    x: 0.7, y: 1.7, w: 11.9, h: 0.34, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 15, color: MUTED });

  const adim = [['Rezervasyon','Müşteri, tarih, tutar'],
                ['Tahsilat','Ödemeler işlenir'],
                ['Fatura','KDV kuruş hassasiyetinde'],
                ['e-Arşiv','GİB’e gönderilir']];
  adim.forEach(([bas, ack], i) => {
    const x = 0.7 + i*3.13;
    s.addShape(pres.ShapeType.roundRect, { x, y: 2.25, w: 2.72, h: 1.35, rectRadius: 0.1,
      fill:{color: i===3 ? NAVY : SURFACE}, line:{color: i===3 ? NAVY : 'E3E9F4', width:1} });
    s.addText(bas, { x: x+0.28, y: 2.5, w: 2.2, h: 0.34, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 15, bold: true, color: i===3 ? WHITE : NAVY });
    s.addText(ack, { x: x+0.28, y: 2.88, w: 2.2, h: 0.55, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 11.5, color: i===3 ? PALE : INK, lineSpacing: 15 });
    if (i < 3) {
      s.addShape(pres.ShapeType.rightArrow, { x: x+2.82, y: 2.78, w: 0.3, h: 0.3,
        fill:{color:GOLD}, line:{color:GOLD} });
    }
  });

  shot(s, img('panel-faturalar.png'), 0.7, 4.05, 6.6, 2.35,
       'Gerçek ekran: fatura listesi, durum ve kalan süre bilgisiyle.');
  [['7 günlük süre takibi','Fatura kesme süresi ekranda gösterilir; VUK süresini kaçırmazsınız.'],
   ['Kesilen fatura değiştirilemez','Vergi belgesi olarak korunur; yalnızca iptal edilebilir, silinemez.'],
   ['Toplamlar birbirini tutar','Matrah + KDV = toplam kuralı sistemce zorunlu kılınır.'],
  ].forEach(([bas, ack], i) => {
    const y = 4.05 + i*0.9;
    s.addText(bas, { x: 7.75, y, w: 4.85, h: 0.3, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 14, bold: true, color: NAVY });
    s.addText(ack, { x: 7.75, y: y+0.32, w: 4.85, h: 0.52, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 12, color: INK, lineSpacing: 16 });
  });
  s.addNotes('Zorunluluk hadlerinin mali müşavire sorulması gerektiğini mutlaka söyleyin; söz vermeyin.');
}

/* ═══════════════════════════════════ 11 — Talepler (akış + görsel) */
{
  const s = pres.addSlide();
  s.background = { color: SURFACE };
  head(s, 'MÜŞTERİ TALEPLERİ', 'Siteden gelen her talep bir yerde toplanır');

  [['Müşteri siteden yazar','Fiyat sorar, salonu gezmek ister'],
   ['Talep kutusuna düşer','Yeni olarak işaretli, kaybolmaz'],
   ['Siz sonuçlandırırsınız','Not düşer, işlemde ya da kapatıldı yaparsınız'],
  ].forEach(([bas, ack], i) => {
    const y = 1.85 + i*1.32;
    s.addShape(pres.ShapeType.roundRect, { x: 0.7, y, w: 5.3, h: 1.1, rectRadius: 0.1,
      fill:{color:WHITE}, line:{color:LINE, width:1} });
    s.addShape(pres.ShapeType.ellipse, { x: 1.0, y: y+0.3, w: 0.5, h: 0.5, fill:{color:BRAND}, line:{color:BRAND} });
    s.addText(String(i+1), { x: 1.0, y: y+0.3, w: 0.5, h: 0.5, isTextBox: true, margin: 0,
      align:'center', valign:'middle', fontFace: H, fontSize: 18, bold: true, color: WHITE });
    s.addText(bas, { x: 1.68, y: y+0.24, w: 4.0, h: 0.3, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 14.5, bold: true, color: NAVY });
    s.addText(ack, { x: 1.68, y: y+0.55, w: 4.0, h: 0.32, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 12, color: INK });
    if (i < 2) {
      s.addText('▼', { x: 3.05, y: y+1.1, w: 0.6, h: 0.32, isTextBox: true, margin: 0,
        align: 'center', fontFace: B, fontSize: 15, bold: true, color: GOLD });
    }
  });
  s.addText('Kaçan talep, kaçan cirodur. Bu ekran onu kaçırmanızı engeller.', {
    x: 0.7, y: 5.95, w: 5.3, h: 0.5, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 13, italic: true, color: BRAND, lineSpacing: 18 });
  shot(s, img('panel-talepler.png'), 6.5, 1.85, 6.1, 3.82,
       'Gerçek ekran: talepler durumlarına göre sayılmış ve filtrelenebilir.');
  s.addText('Talebin içeriği sonradan değiştirilemez ve kayıt silinemez. Talepleri yalnızca yönetici görür; personel müşteri iletişim bilgisine erişemez.', {
    x: 6.5, y: 6.1, w: 6.1, h: 0.6, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 12, color: INK, lineSpacing: 16 });
  s.addNotes('Satışa doğrudan dokunan slayt. "Geçen ay kaç kişi fiyat sordu?" diye sorun — çoğu bilmez.');
}

/* ═══════════════════════════════════ 12 — Yetkiler (yerel tablo) */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  head(s, 'YETKİ YÖNETİMİ', 'Personeliniz yalnızca işini görür');
  s.addText('Her personele ayrı hesap açar, hangi ekrana girebileceğini tek tek belirlersiniz. Örnek bir dağılım:', {
    x: 0.7, y: 1.68, w: 11.9, h: 0.34, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 15, color: MUTED });

  const satir = [
    ['Rezervasyon görüntüleme','✓','✓'],
    ['Rezervasyon ekleme / düzenleme','✓','✓'],
    ['Rezervasyon silme','✓','—'],
    ['Gelir – gider (kasa)','✓','—'],
    ['Raporlar ve ciro','✓','—'],
    ['Müşteri talepleri','✓','—'],
    ['Kullanıcı ve yetki yönetimi','✓','—'],
  ];
  const rows = [[
    { text: 'YETKİ', options: { bold: true, color: WHITE, fill: { color: NAVY }, fontSize: 12.5, align: 'left' } },
    { text: 'YÖNETİCİ', options: { bold: true, color: WHITE, fill: { color: NAVY }, fontSize: 12.5, align: 'center' } },
    { text: 'PERSONEL', options: { bold: true, color: WHITE, fill: { color: NAVY }, fontSize: 12.5, align: 'center' } },
  ]];
  satir.forEach(([ad, y1, y2], i) => {
    const bg = i % 2 ? SURFACE : WHITE;
    rows.push([
      { text: ad, options: { color: INK, fill: { color: bg }, fontSize: 13, align: 'left' } },
      { text: y1, options: { color: y1 === '✓' ? '1E7B3C' : MUTED, bold: true, fill: { color: bg }, fontSize: 14, align: 'center' } },
      { text: y2, options: { color: y2 === '✓' ? '1E7B3C' : MUTED, bold: true, fill: { color: bg }, fontSize: 14, align: 'center' } },
    ]);
  });
  s.addTable(rows, {
    x: 0.7, y: 2.25, w: 7.3, colW: [4.1, 1.6, 1.6], rowH: 0.42,
    border: { type: 'solid', color: LINE, pt: 1 },
    fontFace: B, valign: 'middle', margin: 0.08,
  });

  s.addShape(pres.ShapeType.roundRect, { x: 8.45, y: 2.25, w: 4.15, h: 2.6, rectRadius: 0.1,
    fill:{color:NAVY}, line:{color:NAVY} });
  s.addText('Denetim kaydı', { x: 8.8, y: 2.55, w: 3.45, h: 0.36, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 20, bold: true, color: WHITE });
  s.addText('Kim, neyi, ne zaman değiştirdi — hepsi kayıtlı. Rezervasyonun tutarı değiştiyse eski ve yeni değer birlikte görünür. Bu kayıtlar silinemez ve değiştirilemez.', {
    x: 8.8, y: 3.02, w: 3.45, h: 1.6, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 12.5, color: PALE, lineSpacing: 18 });
  s.addShape(pres.ShapeType.roundRect, { x: 8.45, y: 5.1, w: 4.15, h: 1.55, rectRadius: 0.1,
    fill:{color:SURFACE}, line:{color:'E3E9F4', width:1} });
  s.addText('Şifreyi siz görmezsiniz', {
    x: 8.8, y: 5.38, w: 3.45, h: 0.34, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 14, bold: true, color: NAVY });
  s.addText('Her personel kendi şifresini belirler. Siz yalnızca yetkilerini bu ekrandan düzenlersiniz.', {
    x: 8.8, y: 5.75, w: 3.45, h: 0.72, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 12, color: INK, lineSpacing: 16 });
  s.addNotes('Personel devri yüksek salonlar için önemli. "Rezervasyonu kim sildi?" sorusunun cevabı var.');
}

/* ═══════════════════════════════════ 13 — Güvenlik (koyu, stat callout) */
{
  const s = pres.addSlide();
  s.background = { color: NAVY };
  head(s, 'GÜVENCE', 'Verileriniz emanet değil, güvence altında', true);
  [['Her gece','otomatik yedek','Yedekten geri dönüş prosedürü belgeli ve gerçekten denenmiştir.'],
   ['AB','sunucularında','Veriler Frankfurt’ta tutulur — KVKK açısından tercih edilen bölge.'],
   ['0','silinebilir kayıt','Fatura ve denetim kayıtları silinemez; iz her zaman kalır.'],
  ].forEach(([buyuk, alt, ack], i) => {
    const x = 0.7 + i*4.07;
    s.addShape(pres.ShapeType.roundRect, { x, y: 1.95, w: 3.77, h: 2.55, rectRadius: 0.1,
      fill:{color:BRAND}, line:{color:BRAND} });
    s.addText(buyuk, { x: x+0.32, y: 2.18, w: 3.15, h: 0.88, isTextBox: true, margin: 0,
      fontFace: H, fontSize: 40, bold: true, color: GOLD });
    s.addText(alt, { x: x+0.32, y: 3.04, w: 3.15, h: 0.32, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 14, bold: true, color: WHITE });
    s.addText(ack, { x: x+0.32, y: 3.44, w: 3.15, h: 0.95, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 12, color: PALE, lineSpacing: 16 });
  });
  [['Şifre denemesi sınırlı','Art arda hatalı girişte hesap geçici olarak kilitlenir.'],
   ['Salon verileri ayrık','Her hesap yalnızca kendi verisini görür; sunucu düzeyinde ayrılmıştır.'],
   ['Sistem durumu ekranı','Yedek alındı mı, mesaj gitti mi — kendiniz görürsünüz.'],
  ].forEach(([bas, ack], i) => {
    const x = 0.7 + i*4.07;
    s.addText(bas, { x, y: 4.95, w: 3.77, h: 0.3, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 14, bold: true, color: SKY });
    s.addText(ack, { x, y: 5.3, w: 3.77, h: 0.85, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 12, color: PALE, lineSpacing: 16 });
  });
  s.addNotes('"Verim nerede duruyor?" sorusunun cevabı hazır: AB sunucusu, gecelik yedek, silinemez kayıt.');
}

/* ═══════════════════════════════════ 14 — Mobil (ortalanmış, telefonlar merkezde) */
{
  const s = pres.addSlide();
  s.background = { color: SURFACE };
  head(s, 'HER CİHAZDAN', 'Salonda, evde, yoldayken');
  s.addText('Kurulum gerekmez, program indirilmez. Telefonun tarayıcısından girer, aynı ekranları kullanırsınız.', {
    x: 0.7, y: 1.72, w: 11.9, h: 0.36, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 15, color: MUTED });

  shot(s, img('mobil-anasayfa.png'), 4.85, 2.25, 1.75, 3.79, null);
  shot(s, img('mobil-panel.png'), 6.9, 2.25, 1.75, 3.79, null);
  s.addText('Gerçek ekranlar: site ve panel, telefon genişliğinde.', {
    x: 4.5, y: 6.2, w: 4.5, h: 0.3, isTextBox: true, margin: 0,
    align: 'center', fontFace: B, fontSize: 10.5, italic: true, color: MUTED });

  [['Bilgisayar gerekmez','Düğün alanında telefondan rezervasyon açabilirsiniz.'],
   ['Güncelleme derdi yok','Sistem sürekli güncel; siz bir şey yapmazsınız.'],
  ].forEach(([bas, ack], i) => {
    const y = 2.6 + i*1.5;
    s.addText(bas, { x: 0.7, y, w: 3.85, h: 0.3, isTextBox: true, margin: 0,
      align: 'right', fontFace: B, fontSize: 14.5, bold: true, color: NAVY });
    s.addText(ack, { x: 0.7, y: y+0.34, w: 3.85, h: 0.65, isTextBox: true, margin: 0,
      align: 'right', fontFace: B, fontSize: 12.5, color: INK, lineSpacing: 17 });
  });
  [['Aynı anda birden çok kişi','Resepsiyon ve yönetici aynı veriyi aynı anda görür.'],
   ['Her yerden erişim','Salonda, evde ya da yolda; internet yeterli.'],
  ].forEach(([bas, ack], i) => {
    const y = 2.6 + i*1.5;
    s.addText(bas, { x: 8.95, y, w: 3.65, h: 0.3, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 14.5, bold: true, color: NAVY });
    s.addText(ack, { x: 8.95, y: y+0.34, w: 3.65, h: 0.65, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 12.5, color: INK, lineSpacing: 17 });
  });
  s.addNotes('Kısa geçin. Asıl mesaj: kurulum yok, güncelleme yok.');
}

/* ═══════════════════════════════════ 15 — Kanıt */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  head(s, 'ARKASINDAKİ İŞ', 'Sözle değil, kanıtla');
  s.addText('Bir salon yazılımı ciroyu ve müşteri verisini tutar. Bu yüzden sistemin her parçası otomatik testlerle sürekli denetlenir.', {
    x: 0.7, y: 1.7, w: 11.9, h: 0.36, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 15, color: MUTED });
  [['372','otomatik test'],['0','bilinen hata'],['%100','ekran doğrulaması']].forEach(([n, l], i) => {
    const x = 0.7 + i*4.07;
    s.addShape(pres.ShapeType.roundRect, { x, y: 2.35, w: 3.77, h: 1.8, rectRadius: 0.1,
      fill:{color:SURFACE}, line:{color:'E3E9F4', width:1} });
    s.addText(n, { x, y: 2.55, w: 3.77, h: 0.95, isTextBox: true, margin: 0,
      align:'center', fontFace: H, fontSize: 46, bold: true, color: BRAND });
    s.addText(l, { x, y: 3.52, w: 3.77, h: 0.34, isTextBox: true, margin: 0,
      align:'center', fontFace: B, fontSize: 13.5, color: MUTED });
  });
  s.addShape(pres.ShapeType.roundRect, { x: 0.7, y: 4.45, w: 11.9, h: 2.2, rectRadius: 0.1,
    fill:{color:SURFACE}, line:{color:'E3E9F4', width:1} });
  [['Kurallar sistemin içinde','Çifte rezervasyon, hatalı kapora, onaysız ticari SMS — hiçbiri kaydedilemez. Arayüzdeki bir hata bu kuralları çiğneyemez.'],
   ['Yedek gerçekten denendi','Yedek almak yetmez: alınan yedek boş bir sisteme geri yüklendi ve tutarların, kayıtların eksiksiz döndüğü kanıtlandı.'],
  ].forEach(([bas, ack], i) => {
    const x = 1.1 + i*5.85;
    s.addText(bas, { x, y: 4.75, w: 5.2, h: 0.32, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 15, bold: true, color: NAVY });
    s.addText(ack, { x, y: 5.15, w: 5.2, h: 1.25, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 12.5, color: INK, lineSpacing: 18 });
  });
  s.addNotes('Teknik dinleyici varsa burada durun. Değilse hızlı geçip "test edilmiş sistem" mesajını bırakın.');
}

/* ═══════════════════════════════════ 16 — Kapanış */
{
  const s = pres.addSlide();
  s.background = { color: NAVY };
  s.addShape(pres.ShapeType.ellipse, { x: -2.3, y: 4.2, w: 5.6, h: 5.6, fill:{color:BRAND}, line:{color:BRAND} });
  s.addText('Salonunuzu bir defterden çıkarın.', {
    x: 0.9, y: 1.3, w: 9.8, h: 1.45, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 41, bold: true, color: WHITE, lineSpacing: 48 });
  s.addText('Rezervasyon, tahsilat, sözleşme, SMS, fatura ve raporlar tek sistemde.\nKurulum yok, program yok — bugün başlayabilirsiniz.', {
    x: 0.9, y: 2.95, w: 8.4, h: 1.0, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 16, color: PALE, lineSpacing: 26 });
  [['Demo','Salonunuza özel canlı gösterim'],
   ['Kurulum','Verileriniz aktarılır, ekip eğitilir'],
   ['Destek','Sorunuz olduğunda ulaşabilirsiniz'],
  ].forEach(([bas, ack], i) => {
    const x = 0.9 + i*3.9;
    s.addText(bas, { x, y: 4.35, w: 3.6, h: 0.36, isTextBox: true, margin: 0,
      fontFace: H, fontSize: 19, bold: true, color: GOLD });
    s.addText(ack, { x, y: 4.78, w: 3.6, h: 0.6, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 13, color: PALE, lineSpacing: 18 });
  });
  s.addShape(pres.ShapeType.roundRect, { x: 0.9, y: 5.85, w: 11.5, h: 0.85, rectRadius: 0.12,
    fill:{color:BRAND}, line:{color:BRAND} });
  s.addText('Demo talebi ve fiyat bilgisi için:   [telefon]   ·   [e-posta]   ·   [web adresi]', {
    x: 0.9, y: 5.85, w: 11.5, h: 0.85, isTextBox: true, margin: 0,
    align:'center', valign:'middle', fontFace: B, fontSize: 15, bold: true, color: WHITE });
  s.addNotes('Köşeli parantezli alanları kendi iletişim bilgilerinizle değiştirin. Somut bir adım isteyin: "Salonunuzda 20 dakikalık demo yapalım mı?"');
}

pres.writeFile({ fileName: 'Dugun-Takip-Tanitim.pptx' }).then((f) => console.log('Yazıldı:', f));
