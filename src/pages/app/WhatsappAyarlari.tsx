import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Seo from '../../components/Seo';
import Alert from '../../components/Alert';
import { useAuth } from '../../context/AuthContext';
import { useSaveWhatsappAccount, useWhatsappAccount } from '../../lib/queries';
import { errorMessage } from '../../lib/authHelpers';
import { gecerliJeton } from '../../lib/oturum';
import {
  VARSAYILAN_AYAR, mesaiIcindeMi, saatiDakikayaCevir,
} from '../../lib/whatsappOtomatik';
import type { WhatsappAccount } from '../../types';

const GUNLER: { no: number; ad: string }[] = [
  { no: 1, ad: 'Pzt' }, { no: 2, ad: 'Sal' }, { no: 3, ad: 'Çar' },
  { no: 4, ad: 'Per' }, { no: 5, ad: 'Cum' }, { no: 6, ad: 'Cmt' }, { no: 7, ad: 'Paz' },
];

/**
 * WhatsApp numarası eşlemesi ve otomatik cevap ayarları.
 *
 * Ayar ekranı olmadan bu özellik yalnızca veritabanına elle SQL yazarak
 * açılabilirdi; salon sahibinden bu beklenemez.
 */
export default function WhatsappAyarlari() {
  const { user } = useAuth();
  const { data: hesap, isLoading } = useWhatsappAccount();
  const kaydet = useSaveWhatsappAccount();

  const [hata, setHata] = useState('');
  const [bilgi, setBilgi] = useState('');
  const [form, setForm] = useState<WhatsappAccount>({
    phoneNumberId: '', businessId: '', displayPhone: '',
    autoReplyEnabled: VARSAYILAN_AYAR.autoReplyEnabled,
    welcomeMessage: VARSAYILAN_AYAR.welcomeMessage,
    afterHoursEnabled: VARSAYILAN_AYAR.afterHoursEnabled,
    afterHoursMessage: VARSAYILAN_AYAR.afterHoursMessage,
    workStart: VARSAYILAN_AYAR.workStart,
    workEnd: VARSAYILAN_AYAR.workEnd,
    workDays: [...VARSAYILAN_AYAR.workDays],
    createdAt: '',
  });

  useEffect(() => { if (hesap) setForm(hesap); }, [hesap]);

  const yaz = <A extends keyof WhatsappAccount>(alan: A, deger: WhatsappAccount[A]) => {
    setForm((f) => ({ ...f, [alan]: deger }));
    setBilgi('');
  };

  const gunDegistir = (no: number) => {
    const acik = form.workDays.includes(no);
    yaz('workDays', acik ? form.workDays.filter((g) => g !== no) : [...form.workDays, no].sort());
  };

  async function gonder(e: React.FormEvent) {
    e.preventDefault();
    setHata(''); setBilgi('');

    if (!form.phoneNumberId.trim()) {
      setHata("Meta'nın verdiği Phone number ID zorunludur; bu eşleme olmadan gelen mesaj kaydedilmez.");
      return;
    }
    if (saatiDakikayaCevir(form.workStart) === null || saatiDakikayaCevir(form.workEnd) === null) {
      setHata('Çalışma saatleri SS:DD biçiminde olmalıdır.'); return;
    }
    if (form.workDays.length === 0) {
      setHata('En az bir çalışma günü seçiniz.'); return;
    }
    if (form.autoReplyEnabled && !form.welcomeMessage.trim()) {
      setHata('Karşılama mesajı boş olamaz.'); return;
    }
    if (form.afterHoursEnabled && !form.afterHoursMessage.trim()) {
      setHata('Mesai dışı mesajı boş olamaz.'); return;
    }

    try {
      await kaydet.mutateAsync({
        ...form,
        phoneNumberId: form.phoneNumberId.trim(),
        businessId: user?.activeBusinessId ?? '',
        createdAt: form.createdAt || new Date().toISOString(),
      });
      setBilgi('Ayarlar kaydedildi.');
    } catch (err) {
      setHata(errorMessage(err));
    }
  }

  // "Şu anda ne olurdu" cevabı: ayarı kaydetmeden önce görülebilsin.
  const simdiAcik = mesaiIcindeMi(
    {
      autoReplyEnabled: form.autoReplyEnabled, welcomeMessage: form.welcomeMessage,
      afterHoursEnabled: form.afterHoursEnabled, afterHoursMessage: form.afterHoursMessage,
      workStart: form.workStart, workEnd: form.workEnd, workDays: form.workDays,
    },
    new Date(),
  );

  if (isLoading) return <p className="text-brand-muted">Yükleniyor…</p>;

  return (
    <>
      <Seo title="WhatsApp Ayarları" noindex />
      <div className="mb-4">
        <Link to="/panel/musteri-adaylari" className="text-sm text-brand-muted hover:text-brand">
          ← Müşteri adayları
        </Link>
      </div>
      <h1 className="mb-2 font-heading text-2xl font-bold text-brand">WhatsApp Ayarları</h1>
      <p className="mb-6 max-w-3xl text-sm text-brand-muted">
        Otomatik cevap yalnızca “mesajınız alındı” ve “şu saatte döneceğiz” der.
        Fiyat, tarih ve doluluk sorusuna cevap vermez: müsaitlik söyleyen bir
        otomatik yanıtlayıcı, müşteri tarafında salon adına verilmiş bir taahhüt
        gibi okunur.
      </p>

      {hata && <Alert kind="error" className="mb-4">{hata}</Alert>}
      {bilgi && <Alert kind="success" className="mb-4">{bilgi}</Alert>}

      <form onSubmit={(e) => { void gonder(e); }} noValidate className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-4 font-heading text-lg font-bold text-brand">Bağlı numara</h2>
          <div className="grid gap-4">
            <div>
              <label htmlFor="wa-phone-id" className="field-label">
                Phone number ID <span aria-hidden="true">*</span>
              </label>
              <input id="wa-phone-id" className="field-input" value={form.phoneNumberId}
                onChange={(e) => yaz('phoneNumberId', e.target.value)} />
              <p className="mt-1 text-xs text-brand-muted">
                Meta for Developers → WhatsApp → API Setup ekranında yazar.
              </p>
            </div>
            <div>
              <label htmlFor="wa-display" className="field-label">Numara (görünen)</label>
              <input id="wa-display" className="field-input" placeholder="+90 555 000 00 00"
                value={form.displayPhone} onChange={(e) => yaz('displayPhone', e.target.value)} />
            </div>
          </div>
          <p className="mt-4 rounded-md bg-surface p-3 text-xs text-brand-muted">
            <strong className="text-brand">Dikkat:</strong> Cloud API’ye bağlanan numara,
            telefondaki WhatsApp ve WhatsApp Business uygulamalarından düşer. Günlük
            kullanılan hattı bağlamayın; bağlantı için ayrı bir hat açın.
          </p>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 font-heading text-lg font-bold text-brand">Çalışma saatleri</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="wa-start" className="field-label">Açılış</label>
              <input id="wa-start" type="time" className="field-input" value={form.workStart}
                onChange={(e) => yaz('workStart', e.target.value)} />
            </div>
            <div>
              <label htmlFor="wa-end" className="field-label">Kapanış</label>
              <input id="wa-end" type="time" className="field-input" value={form.workEnd}
                onChange={(e) => yaz('workEnd', e.target.value)} />
            </div>
          </div>

          <fieldset className="mt-4">
            <legend className="field-label">Çalışma günleri</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {GUNLER.map((g) => {
                const acik = form.workDays.includes(g.no);
                return (
                  <label key={g.no}
                    className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      acik
                        ? 'border-accent-ink bg-accent-ink text-white'
                        : 'border-line bg-white text-brand hover:border-brand-light'
                    }`}
                  >
                    <input type="checkbox" className="sr-only" checked={acik}
                      onChange={() => gunDegistir(g.no)} />
                    {g.ad}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <p className="mt-4 text-xs text-brand-muted">
            Saatler Türkiye saatidir (UTC+3). Şu an salon{' '}
            <strong className={simdiAcik ? 'text-success-deep' : 'text-warning-deep'}>
              {simdiAcik ? 'açık' : 'kapalı'}
            </strong>{' '}
            sayılıyor.
          </p>
        </section>

        <section className="card p-5">
          <h2 className="mb-1 font-heading text-lg font-bold text-brand">Karşılama mesajı</h2>
          <p className="mb-4 text-xs text-brand-muted">
            İlk kez yazan bir müşteriye bir kez gönderilir; aynı kişiye tekrar gönderilmez.
          </p>
          <label className="mb-3 flex items-center gap-2 text-sm text-brand">
            <input type="checkbox" id="wa-welcome-on" checked={form.autoReplyEnabled}
              onChange={(e) => yaz('autoReplyEnabled', e.target.checked)} />
            Karşılama mesajı gönderilsin
          </label>
          <label htmlFor="wa-welcome" className="field-label">Metin</label>
          <textarea id="wa-welcome" rows={3} className="field-input" value={form.welcomeMessage}
            onChange={(e) => yaz('welcomeMessage', e.target.value)} />
        </section>

        <section className="card p-5">
          <h2 className="mb-1 font-heading text-lg font-bold text-brand">
            Mesai dışı bilgilendirmesi
          </h2>
          <p className="mb-4 text-xs text-brand-muted">
            Çalışma saatleri dışında gelen mesaja gönderilir. Aynı kişiye 12 saatte
            bir defadan fazla gitmez: bir akşam beş mesaj yazan müşteri beş bildirim
            almamalı.
          </p>
          <label className="mb-3 flex items-center gap-2 text-sm text-brand">
            <input type="checkbox" id="wa-after-on" checked={form.afterHoursEnabled}
              onChange={(e) => yaz('afterHoursEnabled', e.target.checked)} />
            Mesai dışı bilgilendirmesi gönderilsin
          </label>
          <label htmlFor="wa-after" className="field-label">Metin</label>
          <textarea id="wa-after" rows={3} className="field-input" value={form.afterHoursMessage}
            onChange={(e) => yaz('afterHoursMessage', e.target.value)} />
        </section>

        <div className="lg:col-span-2">
          <button type="submit" className="btn-primary text-white hover:text-white"
            disabled={kaydet.isPending}>
            {kaydet.isPending ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
          <p className="mt-3 text-xs text-brand-muted">
            Otomatik gönderim, sunucuda tanımlı WhatsApp erişim jetonunu ve gönderen
            numara kimliğini gerektirir (kurulum adımları README’de). Tanımlı
            değilse mesaj alınmaya devam eder, yalnızca otomatik cevap gönderilmez.
          </p>
        </div>
      </form>

      <TestMesaji />
    </>
  );
}

/**
 * Test mesajı: Meta bağlanmadan sistemi denemek için.
 *
 * Yapıştırılan metin GERÇEK webhook'un boru hattından geçiyor -- aynı
 * çözümleyici, aynı "aynı numara ikinci kayıt açmaz" kuralı. Ayrı bir
 * taklit akış olsaydı burada çalışanın üretimde de çalışacağının
 * garantisi olmazdı.
 *
 * Uç nokta yalnızca WHATSAPP_MOCK_MODE=true iken açık. Kapalıysa 403
 * dönüyor ve bölüm sebebini yazıyor; bu ekranın ortam değişkenini
 * okuması mümkün değil (sunucuda kalıyor), o yüzden karar denemeden
 * sonra veriliyor.
 */
function TestMesaji() {
  const { user } = useAuth();
  const [metin, setMetin] = useState(ORNEK_MESAJ);
  const [gonderen, setGonderen] = useState('');
  const [sonuc, setSonuc] = useState<{ tur: 'ok' | 'hata'; mesaj: string } | null>(null);
  const [bekliyor, setBekliyor] = useState(false);

  async function gonder() {
    setBekliyor(true);
    setSonuc(null);
    try {
      const jeton = await gecerliJeton();
      const yanit = await fetch('/api/whatsapp-test', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(jeton ? { authorization: `Bearer ${jeton}` } : {}),
        },
        body: JSON.stringify({
          businessId: user?.activeBusinessId ?? '',
          text: metin,
          from: gonderen,
        }),
      });
      const govde = (await yanit.json()) as { error?: string; sonuc?: string; leadId?: string };
      if (!yanit.ok) {
        setSonuc({ tur: 'hata', mesaj: govde.error ?? 'Mesaj işlenemedi.' });
        return;
      }
      setSonuc({
        tur: 'ok',
        mesaj: govde.sonuc === 'yeni'
          ? 'Yeni müşteri adayı oluşturuldu.'
          : 'Mevcut aday bulundu; mesaj geçmişine eklendi.',
      });
    } catch {
      setSonuc({ tur: 'hata', mesaj: 'Sunucuya ulaşılamadı.' });
    } finally {
      setBekliyor(false);
    }
  }

  return (
    <section className="card mt-4 p-5">
      <h2 className="font-heading font-bold text-brand">Test mesajı</h2>
      <p className="mt-1 text-sm text-brand-muted">
        Meta bağlantısı kurulmadan önce sistemi denemek için. Aşağıya bir WhatsApp
        mesajı yapıştırın; gerçek webhook ile aynı yoldan geçer ve müşteri adayı
        oluşturur. Yalnızca sunucuda <code>WHATSAPP_MOCK_MODE=true</code> iken çalışır.
      </p>

      <label className="mt-4 block">
        <span className="field-label">Mesaj metni</span>
        <textarea className="field-input" rows={7} value={metin}
          onChange={(e) => setMetin(e.target.value)} />
      </label>

      <label className="mt-3 block max-w-xs">
        <span className="field-label">Gönderen numara</span>
        <input className="field-input" placeholder="Boşsa metinden çözülür"
          value={gonderen} onChange={(e) => setGonderen(e.target.value)} />
      </label>

      {sonuc && (
        <Alert kind={sonuc.tur === 'ok' ? 'success' : 'error'} className="mt-3">
          {sonuc.mesaj}
        </Alert>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" className="btn-primary text-white hover:text-white"
          disabled={bekliyor || !metin.trim()} onClick={() => { void gonder(); }}>
          {bekliyor ? 'Gönderiliyor…' : 'Test mesajı gönder'}
        </button>
        <Link to="/panel/musteri-adaylari" className="btn-ghost">Müşteri adaylarını aç</Link>
      </div>
    </section>
  );
}

/** Kutuda hazır duran örnek: sisteme ne tür bir metin beklendiğini gösterir. */
const ORNEK_MESAJ = `Ömer Ay
+905332642537
oay685126@gmail.com
Fiyat tahminen yemekli ve yemeksiz
1000
Mayısın ilk haftası
düğün`;
