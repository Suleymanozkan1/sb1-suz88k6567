import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Seo from '../../components/Seo';
import Alert from '../../components/Alert';
import { useAuth } from '../../context/AuthContext';
import { useAddLeadMessage, useSaveLead, useStaff } from '../../lib/queries';
import { errorMessage } from '../../lib/authHelpers';
import { uid } from '../../lib/ids';
import { todayIso } from '../../lib/format';
import { telefonSadelestir } from '../../lib/whatsappTalep';
import { ORGANIZATION_TYPES } from '../../data/constants';
import { LEAD_SOURCES, LEAD_STATUSES } from '../../types';
import type { CustomerLead, LeadSource, LeadStatus } from '../../types';

/**
 * Elle müşteri adayı açma.
 *
 * Telefonla arayan, kapıdan giren ya da WhatsApp bağlantısı kurulmadan önce
 * gelen müşteriler için. Modül yalnızca webhook'a bağlı olsaydı, bağlantı
 * kurulana kadar hiç kullanılamazdı.
 */
export default function MusteriAdayiYeni() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const kaydet = useSaveLead();
  const mesajEkle = useAddLeadMessage();
  const { data: personel = [] } = useStaff();

  const [hata, setHata] = useState('');
  const [form, setForm] = useState({
    name: '', phone: '', email: '', guestCount: '',
    eventDate: '', eventDateText: '', organizationType: 'Düğün',
    source: 'Telefon' as LeadSource, sourceDetail: '',
    status: 'Aranmadı' as LeadStatus, nextFollowupAt: '', assignedTo: '', note: '',
  });
  const yaz = <A extends keyof typeof form>(alan: A, deger: (typeof form)[A]) =>
    setForm((f) => ({ ...f, [alan]: deger }));

  async function gonder(e: React.FormEvent) {
    e.preventDefault();
    setHata('');

    if (!form.name.trim()) { setHata('Müşteri adı giriniz.'); return; }
    // Telefon zorunlu değil ama girildiyse doğru olmalı: yanlış numara,
    // aynı kişinin ikinci bir kayıt olarak açılmasına yol açıyor.
    const telefon = form.phone.trim() ? telefonSadelestir(form.phone) : '';
    if (form.phone.trim() && !telefon) {
      setHata('Geçerli bir cep telefonu giriniz (5XX XXX XX XX).'); return;
    }
    const kisi = form.guestCount.trim() ? Number(form.guestCount) : null;
    if (kisi !== null && (!Number.isFinite(kisi) || kisi <= 0)) {
      setHata('Geçerli bir kişi sayısı giriniz.'); return;
    }

    const simdi = new Date().toISOString();
    const aday: CustomerLead = {
      id: uid('lead'),
      businessId: user?.activeBusinessId ?? '',
      name: form.name.trim(),
      phone: telefon,
      email: form.email.trim(),
      guestCount: kisi,
      eventDate: form.eventDate,
      eventDateText: form.eventDateText.trim(),
      organizationType: form.organizationType,
      source: form.source,
      sourceDetail: form.sourceDetail.trim(),
      status: form.status,
      assignedTo: form.assignedTo || undefined,
      nextFollowupAt: form.nextFollowupAt,
      lastContactAt: simdi,
      note: form.note.trim(),
      createdAt: simdi,
      updatedAt: simdi,
    };

    try {
      const kayit = await kaydet.mutateAsync(aday);
      // Geçmiş ilk satırıyla başlasın: kaydın nereden geldiği sonradan
      // sorulduğunda cevabı burada dursun.
      await mesajEkle.mutateAsync({
        id: uid('olay'), businessId: kayit.businessId, leadId: kayit.id,
        direction: 'olay', channel: 'sistem',
        body: `Müşteri adayı elle oluşturuldu. Kaynak: ${kayit.source}`,
        actorEmail: user?.email ?? '', createdAt: simdi,
      });
      navigate(`/panel/musteri-adaylari/${kayit.id}`, { replace: true });
    } catch (err) {
      setHata(errorMessage(err));
    }
  }

  return (
    <>
      <Seo title="Yeni Müşteri Adayı" noindex />
      <div className="mb-4">
        <Link to="/panel/musteri-adaylari" className="text-sm text-brand-muted hover:text-brand">
          ← Müşteri adayları
        </Link>
      </div>
      <h1 className="mb-6 font-heading text-2xl font-bold text-brand">Yeni Müşteri Adayı</h1>

      {hata && <Alert kind="error" className="mb-4">{hata}</Alert>}

      <form onSubmit={(e) => { void gonder(e); }} noValidate className="card p-5">
        <fieldset className="mb-6">
          <legend className="mb-3 font-heading font-bold text-brand">Müşteri</legend>
          <div className="grid gap-4 md:grid-cols-2">
            <Alan id="ml-name" etiket="Ad Soyad" zorunlu>
              <input id="ml-name" className="field-input" value={form.name}
                onChange={(e) => yaz('name', e.target.value)} />
            </Alan>
            <Alan id="ml-phone" etiket="Telefon">
              <input id="ml-phone" type="tel" className="field-input" placeholder="533xxxyyzz"
                value={form.phone} onChange={(e) => yaz('phone', e.target.value)} />
            </Alan>
            <Alan id="ml-email" etiket="E-posta">
              <input id="ml-email" type="email" className="field-input" value={form.email}
                onChange={(e) => yaz('email', e.target.value)} />
            </Alan>
            <Alan id="ml-source" etiket="Kaynak">
              <select id="ml-source" className="field-input" value={form.source}
                onChange={(e) => yaz('source', e.target.value as LeadSource)}>
                {LEAD_SOURCES.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </Alan>
            <Alan id="ml-source-detail" etiket="Kaynak açıklaması" className="md:col-span-2">
              <input id="ml-source-detail" className="field-input" value={form.sourceDetail}
                placeholder="Instagram hikâyesi, tabela, tanıdık esnaf..."
                onChange={(e) => yaz('sourceDetail', e.target.value)} />
            </Alan>
          </div>
        </fieldset>

        <fieldset className="mb-6">
          <legend className="mb-3 font-heading font-bold text-brand">Organizasyon</legend>
          <div className="grid gap-4 md:grid-cols-2">
            <Alan id="ml-type" etiket="Tür">
              <select id="ml-type" className="field-input" value={form.organizationType}
                onChange={(e) => yaz('organizationType', e.target.value)}>
                {ORGANIZATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Alan>
            <Alan id="ml-guests" etiket="Kişi sayısı">
              <input id="ml-guests" inputMode="numeric" className="field-input" value={form.guestCount}
                onChange={(e) => yaz('guestCount', e.target.value)} />
            </Alan>
            <Alan id="ml-date" etiket="Etkinlik tarihi">
              <input id="ml-date" type="date" className="field-input" value={form.eventDate}
                onChange={(e) => yaz('eventDate', e.target.value)} />
            </Alan>
            {/*
              Kesin tarih verilmemiş olabilir. "Mayıs ilk hafta" gibi bir
              ifadeyi uydurma bir güne çevirmek, salonun o gün dolu
              sanılmasına yol açardı; olduğu gibi duruyor.
            */}
            <Alan id="ml-date-text" etiket="Tarih net değilse" ipucu="Mayıs ilk hafta, yaz sonu...">
              <input id="ml-date-text" className="field-input" value={form.eventDateText}
                onChange={(e) => yaz('eventDateText', e.target.value)} />
            </Alan>
          </div>
        </fieldset>

        <fieldset className="mb-6">
          <legend className="mb-3 font-heading font-bold text-brand">Takip</legend>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Alan id="ml-status" etiket="Durum">
              <select id="ml-status" className="field-input" value={form.status}
                onChange={(e) => yaz('status', e.target.value as LeadStatus)}>
                {LEAD_STATUSES.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </Alan>
            <Alan id="ml-followup" etiket="Sonraki takip tarihi">
              <input id="ml-followup" type="date" className="field-input" min={todayIso()}
                value={form.nextFollowupAt} onChange={(e) => yaz('nextFollowupAt', e.target.value)} />
            </Alan>
            <Alan id="ml-assignee" etiket="Sorumlu personel">
              <select id="ml-assignee" className="field-input" value={form.assignedTo}
                onChange={(e) => yaz('assignedTo', e.target.value)}>
                <option value="">Atanmadı</option>
                {personel.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
              </select>
            </Alan>
            <Alan id="ml-note" etiket="Not" className="md:col-span-2 lg:col-span-3">
              <textarea id="ml-note" rows={3} className="field-input" value={form.note}
                onChange={(e) => yaz('note', e.target.value)} />
            </Alan>
          </div>
        </fieldset>

        <div className="flex gap-3">
          <button type="submit" className="btn-primary text-white hover:text-white"
            disabled={kaydet.isPending}>
            {kaydet.isPending ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
          <Link to="/panel/musteri-adaylari" className="btn-ghost">Vazgeç</Link>
        </div>
      </form>
    </>
  );
}

function Alan({ id, etiket, zorunlu, ipucu, className, children }: {
  id: string; etiket: string; zorunlu?: boolean; ipucu?: string;
  className?: string; children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="field-label">
        {etiket}{zorunlu && <span aria-hidden="true"> *</span>}
      </label>
      {children}
      {ipucu && <p className="mt-1 text-xs text-brand-muted">{ipucu}</p>}
    </div>
  );
}
