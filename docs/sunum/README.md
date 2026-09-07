# Tanıtım sunumu

`sunum-uret.js`, 20 slaytlık tanıtım sunumunu üretir. Anlatım düzdür: slogan,
satış cümlesi ve ölçülemeyen iddia içermez; her slayt ilgili ekranın ne yaptığını
açıklar. Ekran görüntüleri uygulamadan gerçek zamanlı yakalanır; sunum elle
çizilmiş görsel içermez.

## Üretim

```bash
npm install                                        # tek seferlik
npm run build                                      # önizleme sunucusu derlenmiş sürümü sunar
npm run preview -- --port 4173 --host 127.0.0.1 &  # ayrı terminalde bırakılabilir
node docs/sunum/ss-yakala.mjs                      # docs/ss/ altına 16 ekran görüntüsü
node docs/sunum/sunum-uret.js                      # Dugun-Takip-Tanitim.pptx
```

`ss-yakala.mjs` demo hesabıyla giriş yapar, sunumda görünen örnek kayıtları
(rezervasyonlar ve siteden gelen talepler) oluşturur, sonra ekranları yakalar.
Demo modu uyarı bandı gizlenir: kurulum notudur, ürünün parçası değildir.

`docs/ss/` üretilen bir klasördür ve depoya alınmaz; sunumu yeniden üretmek için
yukarıdaki iki komutu sırayla çalıştırmak yeterlidir.

## Elle düzenlenecek yer

Son slayttaki `[telefon]`, `[e-posta]`, `[web adresi]` alanlarını kendi
iletişim bilgilerinizle değiştirin.
