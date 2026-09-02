# Tanıtım sunumu

`sunum-uret.js`, 20 slaytlık satış tanıtım sunumunu üretir. Ekran görüntüleri
uygulamadan gerçek zamanlı yakalanır; sunum elle çizilmiş görsel içermez.

```bash
npm install pptxgenjs          # tek seferlik
node docs/sunum/sunum-uret.js  # Dugun-Takip-Tanitim.pptx üretir
```

Betik, ekran görüntülerini `../ss` klasöründe arar. Görselleri yenilemek için
uygulamayı `npm run preview` ile çalıştırıp Playwright ile yakalayın; demo
uyarı bantları sunumda gizlenir (ürünün parçası değil, kurulum notudur).

Son slayttaki `[telefon]`, `[e-posta]`, `[web adresi]` alanlarını kendi
iletişim bilgilerinizle değiştirin.
