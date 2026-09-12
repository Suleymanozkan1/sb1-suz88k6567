# Tanıtım sunumu

`sunum-uret.js`, 28 slaytlık tanıtım sunumunu üretir. Anlatım düzdür: slogan,
satış cümlesi ve ölçülemeyen iddia içermez; her slayt ilgili ekranın ne yaptığını
açıklar. Ekran görüntüleri uygulamadan gerçek zamanlı yakalanır; sunum elle
çizilmiş görsel içermez.

## Üretim

```bash
npm install                                        # tek seferlik
sudo apt-get install fonts-crosextra-carlito fonts-crosextra-caladea   # PDF için, aşağıya bakınız
npm run build                                      # önizleme sunucusu derlenmiş sürümü sunar
npm run preview -- --port 4173 --host 127.0.0.1 &  # ayrı terminalde bırakılabilir
node docs/sunum/ss-yakala.mjs                      # docs/ss/ altına 21 ekran görüntüsü
node docs/sunum/sunum-uret.js                      # Sahra-Takip-Tanitim.pptx
soffice --headless --convert-to pdf Sahra-Takip-Tanitim.pptx           # Sahra-Takip-Tanitim.pdf
```

## PDF'e çevirirken font şartı

Sunum başlıklarda Cambria, metinde Calibri kullanır. Bu iki font Windows ve
Office ile gelir; Linux'ta kurulu değildir. Kurulu olmadan `soffice` ile PDF
üretilirse LibreOffice yerlerine DejaVu koyar. DejaVu'nun harf genişlikleri
farklı olduğu için metinler kutularından taşar, kart başlıklarının üstüne
biner; ayrıca PPTX'teki ₺ işareti `ł` olarak çıkar.

Linux'ta çözüm, metrik olarak birebir eşdeğer olan açık kaynak ikizlerini
kurmaktır — Carlito (Calibri) ve Caladea (Cambria):

```bash
sudo apt-get install fonts-crosextra-carlito fonts-crosextra-caladea
```

Üretilen PDF'i `pdffonts Sahra-Takip-Tanitim.pdf` ile doğrulayın: listede
`Carlito` ve `Caladea` görünmelidir. Yalnızca `DejaVu` görünüyorsa fontlar
kurulmamış demektir, PDF kaymalı üretilmiştir.

`DejaVuSans`'ın listede Carlito/Caladea ile birlikte görünmesi sorun değildir:
Carlito'da ₺ karakteri yoktur, LibreOffice yalnızca o harf için DejaVu'ya
düşer. Geri kalan metnin ölçüleri doğrudur.

`ss-yakala.mjs` demo hesabıyla giriş yapar, sunumda görünen örnek kayıtları
(rezervasyonlar ve siteden gelen talepler) oluşturur, sonra ekranları yakalar.
Demo modu uyarı bandı gizlenir: kurulum notudur, ürünün parçası değildir.

`docs/ss/` üretilen bir klasördür ve depoya alınmaz; sunumu yeniden üretmek için
yukarıdaki komutları sırayla çalıştırmak yeterlidir.

## Elle düzenlenecek yer

Son slayttaki `[telefon]`, `[e-posta]`, `[web adresi]` alanlarını kendi
iletişim bilgilerinizle değiştirin.
