import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Seo from '../../components/Seo';
import Alert from '../../components/Alert';
import { QueryBoundary } from '../../components/QueryState';
import { useAuth } from '../../context/AuthContext';
import {
  useAddLeadMessage, useDeleteLead, useLead, useLeadMessages,
  useHalls, useLeadStatusHistory, useLeadStatuses, useSaveLead, useStaff,
} from '../../lib/queries';
import { daysBetween, formatDate, formatMoney, formatPhone, todayIso } from '../../lib/format';
import { errorMessage } from '../../lib/authHelpers';
import { uid } from '../../lib/ids';
import {
  durumAdi, durumHaritasi, durumSinifi, kapandiMi, secilebilirDurumlar, whatsappWebLinki,
} from '../../lib/lead';
import type { CustomerLead, LeadMessage, LeadStatus } from '../../types';

/**
 * Müşteri adayı kartı.
 *
 * Durum, takip tarihi, sorumlu personel ve iletişim geçmişi tek ekranda.
 * İki çalışanın aynı adayı habersiz araması, sorumlunun ve son işlemin
 * görünmemesinden kaynaklanıyordu.
 */
export default function MusteriAdayiDetay() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const { data: lead, isLoading, error } = useLead(id);
  const { data: gecmis = [] } = useLeadMessages(id);
  const { data: durumGecmisi = [] } = useLeadStatusHistory(id);
  const { data: durumlar = [] } = useLeadStatuses();
  const harita = durumHaritasi(durumlar);
  const { data: personel = [] } = useStaff();
  const { data: salonlar = [] } = useHalls();
  const kaydet = useSaveLead();
  const mesajEkle = useAddLeadMessage();
  const silMutation = useDeleteLead();

  const [hata, setHata] = useState('');
  const [not, setNot] = useState('');
  const duzenlenebilir = can('rezervasyon.duzenle');
  const currency = user?.currency ?? 'TL';
  const salonAdi = salonlar.find((h) => h.id === lead?.hallId)?.name ?? '';

  /*
    Opsiyon uyarısı (madde 18). Kapanmış adayda gösterilmiyor: kaybedilmiş
    bir müşterinin opsiyon tarihi kimseyi ilgilendirmiyor ve her açılışta
    uyarı veren ekran okunmaz olur.
  */
  const opsiyonUyarisi = (() => {
    if (!lead?.optionDate || kapandiMi(harita, lead)) return '';
    const kalan = daysBetween(todayIso(), lead.optionDate);
    if (kalan < 0) return `Opsiyon tarihi ${Math.abs(kalan)} gün önce geçti. Salon başkasına satılabilir; müşteriyle görüşün.`;
    if (kalan === 0) return 'Opsiyon tarihi bugün doluyor. Müşteriyle bugün görüşülmesi gerekiyor.';
    if (kalan <= 7) return `Opsiyon tarihine ${kalan} gün kaldı. Müşteriyle tekrar iletişime geçilmesi gerekiyor.`;
    return '';
  })();

  async function yaz(degisiklik: Partial<CustomerLead>, olay?: string) {
    if (!lead) return;
    setHata('');
    try {
      await kaydet.mutateAsync({ ...lead, ...degisiklik });
      if (olay) {
        await mesajEkle.mutateAsync(olayKaydi(lead, olay, user?.email ?? ''));
      }
    } catch (e) {
      setHata(errorMessage(e));
    }
  }

  /**
   * Rezervasyona dönüştürür.
   *
   * Bilgiler yeniden yazılmıyor: alanlar adres satırında forma taşınıyor,
   * kayıt açılınca aday "Rezervasyona Döndü" olup rezervasyona bağlanıyor.
   * Araya bir taslak rezervasyon koymak, vazgeçilen her adayda yarım bir
   * kayıt bırakırdı.
   */
  function rezervasyonaCevir() {
    if (!lead) return;
    const p = new URLSearchParams();
    if (lead.name) p.set('ad', lead.name);
    if (lead.phone) p.set('telefon', lead.phone);
    if (lead.email) p.set('eposta', lead.email);
    if (lead.eventDate) p.set('tarih', lead.eventDate);
    if (lead.guestCount !== null) p.set('davetli', String(lead.guestCount));
    if (lead.organizationType) p.set('tur', lead.organizationType);
    // Kanal adayın kaynağından geliyor. Listede karşılığı olmayan kaynaklar
    // "Diğer" altında adıyla duruyor; uydurma bir kanal raporu bozardı.
    if (lead.source === 'Instagram') {
      p.set('kanal', 'Instagram');
    } else {
      p.set('kanal', 'Diğer');
      p.set('kanalDetay', lead.sourceDetail || lead.source);
    }
    /*
      Nota taşınanlar: müşterinin TALEBİ, çözülemeyen tarih ifadesi ve
      personelin notu. Üçü de rezervasyon formunda görünmeli -- talep
      taşınmasaydı "yemekli mi yemeksiz mi sormuştu" bilgisi adayın
      kartında kalır, rezervasyonu açan kişiye hiç ulaşmazdı.
    */
    const notlar = [
      lead.requestText,
      lead.eventDate ? '' : lead.eventDateText,
      lead.note,
    ].filter(Boolean).join('\n');
    if (notlar) p.set('not', notlar);
    p.set('aday', lead.id);
    navigate(`/panel/rezervasyonlar/yeni?${p.toString()}`);
  }

  async function notEkle() {
    if (!lead || !not.trim()) return;
    setHata('');
    try {
      await mesajEkle.mutateAsync({
        id: uid('mesaj'), businessId: lead.businessId, leadId: lead.id,
        direction: 'olay', channel: 'sistem', body: not.trim(),
        actorEmail: user?.email ?? '', createdAt: new Date().toISOString(),
      });
      await kaydet.mutateAsync({ ...lead, lastContactAt: new Date().toISOString() });
      setNot('');
    } catch (e) {
      setHata(errorMessage(e));
    }
  }

  async function sil() {
    if (!lead) return;
    try {
      await silMutation.mutateAsync(lead.id);
      navigate('/panel/musteri-adaylari', { replace: true });
    } catch (e) {
      setHata(errorMessage(e));
    }
  }

  return (
    <QueryBoundary isLoading={isLoading} error={error}>
      {!lead ? (
        <div className="card p-6">
          <p className="text-sm text-brand-muted">Müşteri adayı bulunamadı.</p>
          <Link to="/panel/musteri-adaylari" className="btn-ghost mt-3">Listeye dön</Link>
        </div>
      ) : (
        <>
          <Seo title={lead.name || 'Müşteri Adayı'} noindex />
          <div className="mb-4">
            <Link to="/panel/musteri-adaylari" className="text-sm text-brand-muted hover:text-brand">
              ← Müşteri adayları
            </Link>
          </div>

          {hata && <Alert kind="error" className="mb-4">{hata}</Alert>}

          <header className="card mb-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="font-heading text-2xl font-bold text-brand">
                  {lead.name || 'İsimsiz aday'}
                </h1>
                <p className="mt-1 text-brand-muted">{formatPhone(lead.phone) || 'Telefon yok'}</p>
                {lead.email && <p className="text-sm text-brand-muted">{lead.email}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {lead.phone && (
                  /*
                    WhatsApp Web: tarayıcıda konuşmayı açar, mesajı personel
                    kendi eliyle gönderir. Cloud API DEĞİLDİR -- ücreti yok,
                    24 saat kuralı işlemez.
                  */
                  <a
                    href={whatsappWebLinki(lead.phone)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="btn-primary text-white hover:text-white"
                  >
                    WhatsApp&apos;ta Aç
                  </a>
                )}
                {lead.phone && (
                  <a href={`tel:+90${lead.phone}`} className="btn-ghost">Ara</a>
                )}
                {duzenlenebilir && !lead.reservationId && (
                  <button type="button" className="btn-ghost" onClick={rezervasyonaCevir}>
                    Rezervasyona Dönüştür
                  </button>
                )}
              </div>
            </div>

            <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Bilgi etiket="Etkinlik tarihi" deger={lead.eventDate ? formatDate(lead.eventDate) : lead.eventDateText} />
              <Bilgi etiket="Kişi sayısı" deger={lead.guestCount !== null ? String(lead.guestCount) : ''} />
              <Bilgi etiket="Organizasyon" deger={lead.organizationType} />
              <Bilgi etiket="Kaynak" deger={`${lead.source}${lead.sourceDetail ? ` · ${lead.sourceDetail}` : ''}`} />
              <Bilgi etiket="İlk iletişim" deger={lead.createdAt ? formatDate(lead.createdAt.slice(0, 10)) : ''} />
              <Bilgi etiket="Son iletişim" deger={lead.lastContactAt ? formatDate(lead.lastContactAt.slice(0, 10)) : ''} />
              <Bilgi etiket="Sonraki aranma" deger={lead.nextFollowupAt ? formatDate(lead.nextFollowupAt) : ''} />
              <Bilgi etiket="Görüşme tarihi" deger={lead.meetingDate ? formatDate(lead.meetingDate) : ''} />
              <Bilgi etiket="Düşünülen salon" deger={salonAdi} />
              <Bilgi etiket="Teklif fiyatı"
                deger={lead.offerAmount ? formatMoney(lead.offerAmount, currency) : ''} />
              <Bilgi etiket="Teklif geçerlilik"
                deger={lead.offerValidUntil ? formatDate(lead.offerValidUntil) : ''} />
              <Bilgi
                etiket="Rezervasyon"
                deger={lead.reservationId ? 'Oluşturuldu' : ''}
                link={lead.reservationId ? `/panel/rezervasyonlar/${lead.reservationId}` : undefined}
              />
            </dl>
            {/*
              Talep nottan ayrı ve önce duruyor: personel numarayı çevirmeden
              önce müşterinin NE SORDUĞUNU görmeli.
            */}
            {lead.requestText && (
              <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-sm text-brand">
                <span className="font-medium text-brand-muted">Talep: </span>
                {lead.requestText}
              </p>
            )}
            {lead.note && <p className="mt-3 whitespace-pre-wrap text-sm text-brand">{lead.note}</p>}
          </header>

          <div className="grid gap-4 lg:grid-cols-3">
            <section className="card p-5 lg:col-span-1">
              <h2 className="mb-3 font-heading text-lg font-bold text-brand">Takip</h2>

              <label className="field-label" htmlFor="lead-status">Durum</label>
              <select
                id="lead-status"
                className="field-input"
                value={lead.status}
                disabled={!duzenlenebilir}
                onChange={(e) => {
                  const yeni = e.target.value as LeadStatus;
                  void yaz({ status: yeni, lastContactAt: new Date().toISOString() },
                    `Durum "${durumAdi(harita, lead.status)}" → "${durumAdi(harita, yeni)}" olarak değiştirildi.`);
                }}
              >
                {secilebilirDurumlar(durumlar, lead.status).map((d) => (
                  <option key={d.code} value={d.code}>{d.label}</option>
                ))}
              </select>
              <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs ${durumSinifi(harita, lead.status)}`}>
                {lead.status}
              </span>

              <label className="field-label mt-4" htmlFor="lead-followup">Sonraki takip tarihi</label>
              <input
                id="lead-followup"
                type="date"
                className="field-input"
                value={lead.nextFollowupAt}
                min={todayIso()}
                disabled={!duzenlenebilir}
                onChange={(e) => { void yaz({ nextFollowupAt: e.target.value }); }}
              />

              {/*
                Opsiyon: salonun müşteri için tutulduğu son gün. Uyarı
                burada, alanın hemen üstünde: ayrı bir ekranda dursaydı
                tarihe bakan kişi uyarıyı görmezdi.
              */}
              <label className="field-label mt-4" htmlFor="lead-option">Opsiyon tarihi</label>
              <input
                id="lead-option"
                type="date"
                className="field-input"
                value={lead.optionDate ?? ''}
                disabled={!duzenlenebilir}
                onChange={(e) => { void yaz({ optionDate: e.target.value || undefined }); }}
              />
              {opsiyonUyarisi && (
                <p className="mt-2 rounded-md bg-[#fef3c7] px-3 py-2 text-xs text-[#92400e]" role="status">
                  {opsiyonUyarisi}
                </p>
              )}

              <label className="field-label mt-4" htmlFor="lead-offer">Teklif fiyatı</label>
              <input
                id="lead-offer"
                inputMode="decimal"
                className="field-input"
                defaultValue={lead.offerAmount ? String(lead.offerAmount) : ''}
                disabled={!duzenlenebilir}
                onBlur={(e) => {
                  const ham = e.target.value.trim();
                  const tutar = ham ? Number(ham) : undefined;
                  // Geçersiz ya da sıfır tutar KAYDEDİLMİYOR: sıfır
                  // "bedava teklif verildi" demek ve dönüşüm raporunda
                  // teklif sayılırdı.
                  if (ham && (!Number.isFinite(tutar) || (tutar ?? 0) <= 0)) return;
                  if (tutar !== lead.offerAmount) void yaz({ offerAmount: tutar });
                }}
              />

              <label className="field-label mt-4" htmlFor="lead-assignee">Görüşmeyi yapan personel</label>
              <select
                id="lead-assignee"
                className="field-input"
                value={lead.assignedTo ?? ''}
                disabled={!duzenlenebilir}
                onChange={(e) => { void yaz({ assignedTo: e.target.value || undefined }); }}
              >
                <option value="">Atanmadı</option>
                {personel.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
              </select>

              {duzenlenebilir && (
                <button
                  type="button"
                  className="btn-ghost mt-6 w-full text-danger hover:border-danger"
                  onClick={() => { void sil(); }}
                >
                  Adayı sil
                </button>
              )}
            </section>

            <section className="card p-5 lg:col-span-2">
              <h2 className="mb-3 font-heading text-lg font-bold text-brand">İletişim Geçmişi</h2>

              {duzenlenebilir && (
                <div className="mb-4 flex gap-2">
                  <label className="sr-only" htmlFor="lead-note">Görüşme notu</label>
                  <input
                    id="lead-note"
                    className="field-input"
                    placeholder="Görüşme notu ekle"
                    value={not}
                    onChange={(e) => setNot(e.target.value)}
                  />
                  <button type="button" className="btn-primary text-white hover:text-white"
                    onClick={() => { void notEkle(); }} disabled={!not.trim()}>
                    Ekle
                  </button>
                </div>
              )}

              {/* Geçmiş silinmiyor: düzeltilebilen bir geçmiş, geçmiş değildir. */}
              <ol className="space-y-3">
                {[...gecmis].reverse().map((m) => (
                  <li key={m.id} className="border-l-2 border-line pl-3">
                    <p className="text-xs text-brand-muted">
                      {m.createdAt.slice(0, 10) ? formatDate(m.createdAt.slice(0, 10)) : ''}
                      {' '}{m.createdAt.slice(11, 16)}
                      {m.actorEmail ? ` · ${m.actorEmail}` : ''}
                      {' · '}{m.direction === 'gelen' ? 'Gelen mesaj' : m.direction === 'giden' ? 'Giden mesaj' : 'İşlem'}
                      {/*
                        Otomatik gönderilen mesaj personelinkinden ayrılmalı:
                        müşteriye ne söylendiğini bilmeden arayan personel,
                        aynı şeyi ikinci kez söyler.
                      */}
                      {m.autoKind && (
                        <span className="ml-1 rounded-full bg-surface px-2 py-0.5 text-[11px] text-brand">
                          {m.autoKind === 'karsilama' ? 'otomatik karşılama' : 'otomatik mesai dışı'}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm text-brand">{m.body}</p>
                  </li>
                ))}
                {gecmis.length === 0 && (
                  <li className="text-sm text-brand-muted">Henüz kayıt yok.</li>
                )}
              </ol>

              {durumGecmisi.length > 0 && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm text-brand-muted hover:text-brand">
                    Durum değişiklikleri ({durumGecmisi.length})
                  </summary>
                  <ul className="mt-2 space-y-1 text-sm">
                    {durumGecmisi.map((d) => (
                      <li key={d.id} className="text-brand-muted">
                        {/*
                          Geçmiş KODU saklıyor, ekran adı gösteriyor.
                          Durum silinmişse durumAdi kodun kendisine düşer;
                          "bilinmiyor" yazmak hangi durum olduğunu hiç
                          söylemezdi.
                        */}
                        {formatDate(d.createdAt.slice(0, 10))} ·{' '}
                        {d.fromStatus ? durumAdi(harita, d.fromStatus) : 'Yeni kayıt'}
                        {' → '}{durumAdi(harita, d.toStatus)}
                        {d.actorEmail ? ` · ${d.actorEmail}` : ''}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          </div>
        </>
      )}
    </QueryBoundary>
  );
}

/** Durum değişikliğini geçmişe düşüren olay kaydı. */
function olayKaydi(lead: CustomerLead, metin: string, eposta: string): LeadMessage {
  return {
    id: uid('olay'), businessId: lead.businessId, leadId: lead.id,
    direction: 'olay', channel: 'sistem', body: metin,
    actorEmail: eposta, createdAt: new Date().toISOString(),
  };
}

function Bilgi({ etiket, deger, link }: { etiket: string; deger: string; link?: string }) {
  return (
    <div>
      <dt className="text-xs text-brand-muted">{etiket}</dt>
      <dd className={deger ? 'text-brand' : 'text-brand-muted'}>
        {link && deger ? <Link to={link} className="hover:text-accent-ink">{deger}</Link> : (deger || '-')}
      </dd>
    </div>
  );
}
