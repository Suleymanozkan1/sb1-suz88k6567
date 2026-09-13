# ECC eklentisi ve uçtan uca test yönergesi

[ECC](https://github.com/affaan-m/ECC) (MIT), Claude Code / Codex gibi ajan
harness'leri için hazır **skill**, **agent**, **komut** ve **hook**
paketi. Bu projede iki ayrı konu var; karıştırmamak gerekiyor:

1. Eklentinin kendisinin kurulması (ajan ortamını değiştirir).
2. Eklentinin `e2e-testing` yönergesinin bu projenin test paketine
   uygulanması (yapıldı, aşağıda).

## 1. Kurulum

Claude Code içinden iki komut:

```
/plugin marketplace add https://github.com/affaan-m/ECC
/plugin install ecc@ecc
```

Aynı sonucu veren bildirimsel yol -- `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "ecc": { "source": { "source": "github", "repo": "affaan-m/ECC" } }
  },
  "enabledPlugins": { "ecc@ecc": true }
}
```

Bu dosyayı ajan kendi başına yazamıyor: harness'in kendi
yapılandırmasını değiştirmek yetki istiyor ("self-modification"). Kurulumu
yukarıdaki iki komutla ya da dosyayı elle ekleyerek siz başlatmalısınız.

### Bilinmesi gereken: kancalar (hooks)

Depodaki `hooks/hooks.json`, `Bash`, `Write` ve `Edit` çağrılarından ÖNCE
eklentinin kendi Node betiklerini çalıştırıyor. Yani eklenti etkinken bu
depoda açılan her ajan oturumunda üçüncü taraf kod otomatik yürüyor. Depo
MIT lisanslı ve açık kaynak; yine de sürüm yükseltmelerinde `hooks/`
altındaki değişikliklere bakmakta fayda var. Kapatmak için
`enabledPlugins` içindeki `"ecc@ecc"` değerini `false` yapmak yeterli.

Eklentinin getirdikleri arasında bu proje için doğrudan işe yarayanlar:
`e2e-testing` ve `accessibility` yönergeleri, `e2e-runner` alt ajanı ve
`/e2e` komutu.

## 2. `e2e-testing` yönergesinin projeye uygulanan kısmı

Yönergenin kanıt toplama ölçütleri `playwright.config.ts` dosyasına
işlendi:

| Ayar | Önce | Sonra |
| --- | --- | --- |
| `retries` | `0` | CI'da `2`, yerelde `0` |
| `trace` | `off` | `on-first-retry` |
| `screenshot` | yok | `only-on-failure` |
| `video` | yok | `retain-on-failure` |
| `reporter` | `list` | `list` + `html`, CI'da ek olarak `junit` |

Sebebi somut: paket 181 tarayıcı testi çalıştırıyor ve düşen bir test
geriye tek satır hata bırakıyordu; sebebini görmek için paketi baştan
çalıştırıp üç dakika beklemek gerekiyordu. Artık düşen testin izi,
ekran görüntüsü ve videosu `test-results/` altında kalıyor (dizin
`.gitignore`'da).

Yönergenin **uygulanmayan** önerileri ve sebepleri:

* **`data-testid` ile seçici yazmak.** Bu paket rol ve erişilebilir ad
  üzerinden seçiyor (`getByRole('row', { name: ... })`). Rol tabanlı
  seçici, ekranın erişilebilirlik ağacını da sınıyor; `data-testid`
  yalnızca testin kendisine hizmet eder ve WCAG denetimini kaçırır.
* **`waitForLoadState('networkidle')`.** Playwright'ın kendi belgeleri
  bunu önermiyor; paket zaten `expect(...).toBeVisible()` ile otomatik
  bekliyor.
* **Page Object Model dosyaları.** Ekran başına sınıf yazmak 181 testlik
  çalışan bir pakette karşılığı olmayan bir taşıma olurdu; ortak
  `login`/`block` yardımcıları her dosyada zaten var.
