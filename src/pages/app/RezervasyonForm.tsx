import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Seo from '../../components/Seo';
import Alert from '../../components/Alert';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../lib/authHelpers';
import { kurusToLira, menuTotalKurus } from '../../lib/seating';
import {
  useHalls, useMenus, useReservation, useReservations, useSaveReservation, useSendSms,
  useLead, useLeadStatuses, useSaveLead,
} from '../../lib/queries';
import { kazanimDurumu } from '../../lib/lead';
import { QueryBoundary } from '../../components/QueryState';
import { formatDate, formatMoney, todayIso } from '../../lib/format';
import { LEAD_CHANNELS, ORGANIZATION_TYPES, ORG_TO_COLOR_KEY } from '../../data/constants';
import type {
  LeadChannel, OrganizationType, Reservation, ReservationStatus, SessionSlot,
} from '../../types';

const STATUSES: ReservationStatus[] = ['Ön Rezervasyon', 'Kesin Rezervasyon', 'Tamamlandı', 'İptal'];

interface FormState {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  secondPersonName: string;
  secondPhone: string;
  identityNo: string;
  hallId: string;
  menuId: string;
  date: string;
  startTime: string;
  endTime: string;
  slot: SessionSlot;
  organizationType: OrganizationType;
  guestCount: string;
  totalAmount: string;
  deposit: string;
  status: ReservationStatus;
  note: string;
  address: string;
  sourceChannel: LeadChannel | '';
  sourceDetail: string;
  services: string[];
}

const EMPTY: FormState = {
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  secondPersonName: '',
  secondPhone: '',
  identityNo: '',
  hallId: '',
  menuId: '',
  date: todayIso(),
  startTime: '',
  endTime: '',
  slot: 'Gece',
  organizationType: 'Düğün',
  guestCount: '',
  totalAmount: '',
  deposit: '',
  status: 'Kesin Rezervasyon',
  note: '',
  address: '',
  sourceChannel: '',
  sourceDetail: '',
  services: [],
};

export default function RezervasyonForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const businessId = user?.activeBusinessId ?? '';
  const existingQuery = useReservation(id);
  const existing = existingQuery.data ?? undefined;
  const { data: allReservations = [] } = useReservations();
  const { data: halls = [] } = useHalls();
  const { data: menus = [] } = useMenus();
  const saveMutation = useSaveReservation();
  const sendSmsMutation = useSendSms();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [conflictWarning, setConflictWarning] = useState('');
  const [saveError, setSaveError] = useState('');

  /*
    WhatsApp talebinden gelen alanlar.

    Talep bir taslak rezervasyon olarak yazılmıyor: vazgeçilen her talepte
    yarım bir kayıt kalırdı. Alanlar adres satırında taşınıp forma
    dolduruluyor, kaydeden kişi görüp onaylıyor.
  */
  const [aramaParam] = useSearchParams();
  const adayId = aramaParam.get('aday') ?? '';
  const { data: aday } = useLead(adayId || undefined);
  const { data: adayDurumlari = [] } = useLeadStatuses();
  const adayiKaydet = useSaveLead();

  useEffect(() => {
    if (id || !adayId) return;
    setForm((f) => ({
      ...f,
      customerName: aramaParam.get('ad') ?? f.customerName,
      customerPhone: aramaParam.get('telefon') ?? f.customerPhone,
      customerEmail: aramaParam.get('eposta') ?? f.customerEmail,
      date: aramaParam.get('tarih') ?? f.date,
      guestCount: aramaParam.get('davetli') ?? f.guestCount,
      organizationType: (aramaParam.get('tur') as OrganizationType | null) ?? f.organizationType,
      sourceChannel: (aramaParam.get('kanal') as LeadChannel | null) ?? f.sourceChannel,
      sourceDetail: aramaParam.get('kanalDetay') ?? f.sourceDetail,
      note: aramaParam.get('not') ?? f.note,
    }));
  }, [id, adayId, aramaParam]);

  useEffect(() => {
    if (!id || !existing) return;
    setForm({
      customerName: existing.customerName,
      customerPhone: existing.customerPhone,
      customerEmail: existing.customerEmail ?? '',
      secondPersonName: existing.secondPersonName ?? '',
      secondPhone: existing.secondPhone ?? '',
      identityNo: existing.identityNo ?? '',
      hallId: existing.hallId,
      menuId: existing.menuId ?? '',
      date: existing.date,
      startTime: existing.startTime ?? '',
      endTime: existing.endTime ?? '',
      slot: existing.slot,
      organizationType: existing.organizationType,
      guestCount: String(existing.guestCount),
      totalAmount: String(existing.totalAmount),
      deposit: String(existing.deposit),
      status: existing.status,
      note: existing.note ?? '',
      address: existing.address ?? '',
      sourceChannel: existing.sourceChannel ?? '',
      sourceDetail: existing.sourceDetail ?? '',
      services: existing.services,
    });
  }, [id, existing]);

  // Yeni kayıtta ilk aktif salon seçili gelir; salon seçilmeden kayıt açılamaz.
  useEffect(() => {
    if (id || form.hallId) return;
    const first = halls.find((h) => h.isActive) ?? halls[0];
    if (first) setForm((f) => ({ ...f, hallId: first.id }));
  }, [id, form.hallId, halls]);

  // Menü ve davetli sayısı değişince tutarı öneririz; kullanıcı elle değiştirebilir.
  const selectedMenu = menus.find((m) => m.id === form.menuId);
  const suggestedTotal = selectedMenu
    ? kurusToLira(menuTotalKurus(selectedMenu, Number(form.guestCount) || 0))
    : null;

  // Aynı tarih + seans için başka kayıt varsa uyar (veritabanında da kısıt vardır)
  useEffect(() => {
    if (!form.date) { setConflictWarning(''); return; }
    const conflict = allReservations.find(
      (r) => r.hallId === form.hallId && r.date === form.date && r.slot === form.slot
             && r.status !== 'İptal' && r.id !== id,
    );
    setConflictWarning(
      conflict
        ? `${formatDate(form.date)} ${form.slot.toLocaleLowerCase('tr-TR')} seansında "${conflict.customerName}" adına kayıt bulunuyor.`
        : '',
    );
  }, [allReservations, form.hallId, form.date, form.slot, id]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function validate(): boolean {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!form.customerName.trim()) e.customerName = 'Müşteri adını giriniz.';

    const digits = form.customerPhone.replace(/\D/g, '');
    if (!digits) e.customerPhone = 'Telefon numarası giriniz.';
    else if (digits.length < 10) e.customerPhone = 'Telefon numarası en az 10 haneli olmalıdır.';

    if (form.customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.customerEmail.trim()))
      e.customerEmail = 'Geçerli bir e-posta adresi giriniz.';

    if (!form.date) e.date = 'Organizasyon tarihini seçiniz.';

    // TC kimlik numarası isteğe bağlı; girildiyse sözleşmeye basılacağı
    // için biçimi tutmalı.
    const kimlik = form.identityNo.replace(/\D/g, '');
    if (form.identityNo.trim() && kimlik.length !== 11)
      e.identityNo = 'TC kimlik numarası 11 haneli olmalıdır.';

    const ikinciHane = form.secondPhone.replace(/\D/g, '');
    if (form.secondPhone.trim() && ikinciHane.length < 10)
      e.secondPhone = 'Telefon numarası en az 10 haneli olmalıdır.';

    // Bitiş saati gece yarısını aşabilir; yalnızca biri girilmişse uyarılır.
    if (form.endTime && !form.startTime) e.startTime = 'Bitiş saati girdiyseniz başlangıç saatini de giriniz.';

    const guests = Number(form.guestCount);
    if (!form.hallId) e.hallId = 'Salon seçiniz.';
    if (!form.guestCount) e.guestCount = 'Davetli sayısını giriniz.';
    else if (!Number.isFinite(guests) || guests <= 0) e.guestCount = 'Davetli sayısı sıfırdan büyük olmalıdır.';

    const total = Number(form.totalAmount);
    if (!form.totalAmount) e.totalAmount = 'Toplam tutarı giriniz.';
    else if (!Number.isFinite(total) || total < 0) e.totalAmount = 'Geçerli bir tutar giriniz.';

    const deposit = Number(form.deposit || 0);
    if (!Number.isFinite(deposit) || deposit < 0) e.deposit = 'Geçerli bir kapora tutarı giriniz.';
    // "Diğer 23 kayıt" satırını raporda görüp içine bakamamak, alanı hiç
    // tutmamakla aynı kapıya çıkar.
    if (form.sourceChannel === 'Diğer' && !form.sourceDetail.trim()) {
      e.sourceDetail = 'Diğer seçildiğinde nereden ulaştığını yazınız.';
    }
    else if (Number.isFinite(total) && deposit > total) e.deposit = 'Kapora, toplam tutardan büyük olamaz.';

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setSaveError('');
    if (!validate()) {
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }

    const now = new Date().toISOString();
    const phone = form.customerPhone.replace(/\D/g, '');
    const record: Reservation = {
      id: existing?.id ?? crypto.randomUUID(),
      businessId: existing?.businessId ?? businessId,
      // Boş bırakılır: sıradaki sözleşme numarasını veritabanı atar.
      code: existing?.code ?? '',
      customerName: form.customerName.trim(),
      customerPhone: phone,
      customerEmail: form.customerEmail.trim() || undefined,
      secondPersonName: form.secondPersonName.trim() || undefined,
      secondPhone: form.secondPhone.replace(/\D/g, '') || undefined,
      identityNo: form.identityNo.replace(/\D/g, '') || undefined,
      date: form.date,
      startTime: form.startTime || undefined,
      endTime: form.endTime || undefined,
      hallId: form.hallId,
      menuId: form.menuId || undefined,
      slot: form.slot,
      organizationType: form.organizationType,
      guestCount: Number(form.guestCount),
      totalAmount: Number(form.totalAmount),
      deposit: Number(form.deposit || 0),
      currency: user?.currency ?? 'TL',
      status: form.status,
      colorKey: ORG_TO_COLOR_KEY[form.organizationType] ?? 'diger',
      note: form.note.trim() || undefined,
      address: form.address.trim() || undefined,
      sourceChannel: form.sourceChannel || undefined,
      sourceDetail: form.sourceDetail.trim() || undefined,
      services: form.services,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    try {
      const saved = await saveMutation.mutateAsync(record);

      // "Rezervasyon Kayıt ettiğinizde SMS OTOMATİK OLARAK GİDER"
      if (!existing) {
        await sendSmsMutation.mutateAsync({
          to: phone,
          body: `Sayin ${saved.customerName}, ${formatDate(saved.date)} tarihli rezervasyonunuz kayit edilmistir. Kod: ${saved.code}`,
          kind: 'Rezervasyon',
          // Rezervasyon onayı işlem bildirimidir: İYS onayı gerekmez.
          category: 'islem',
          reservationId: saved.id,
        });
      }
      // Aday "Rezervasyona Döndü" olup kayda bağlanıyor; bağlanmasaydı aynı
      // adaydan ikinci bir rezervasyon açmak serbest kalır ve dönüşüm
      // takip edilemezdi. Bağlamanın hatası kaydın kendisini geçersiz
      // kılmaz, o yüzden kaydı düşürmüyor.
      /*
        Hangi durumun "rezervasyona döndü" saydığı işletmenin kararı;
        sabit bir metin, sahibi durumu yeniden adlandırdığı anda geçersiz
        bir koda yazmaya çalışır ve bağlama sessizce başarısız olurdu.
      */
      const kazanim = kazanimDurumu(adayDurumlari);
      if (adayId && aday && kazanim) {
        try {
          await adayiKaydet.mutateAsync({
            ...aday, status: kazanim, reservationId: saved.id,
            lastContactAt: new Date().toISOString(),
          });
        } catch { /* kayıt açıldı; aday durumu sonradan elle kapatılabilir */ }
      }

      navigate(`/panel/rezervasyonlar/${saved.id}`, { replace: true });
    } catch (e) {
      setSaveError(errorMessage(e));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  if (!can('rezervasyon.duzenle')) {
    return <Alert kind="error">Bu işlem için yetkiniz bulunmuyor.</Alert>;
  }

  if (id && existingQuery.isFetched && !existing) {
    return (
      <Alert kind="error">
        Rezervasyon kaydı bulunamadı. <Link to="/panel/rezervasyonlar">Listeye dönün</Link>.
      </Alert>
    );
  }

  const isPastLocked = Boolean(existing) && existing!.date < todayIso() && form.status !== 'İptal';
  const balance = Math.max(0, (Number(form.totalAmount) || 0) - (Number(form.deposit) || 0));

  return (
    <QueryBoundary isLoading={Boolean(id) && existingQuery.isLoading} error={existingQuery.error}>
      <Seo title={`${existing ? 'Rezervasyon Düzenle' : 'Yeni Rezervasyon'} - Sahra Takip Panel`} noindex />
      {saveError && <Alert kind="error" className="mb-5">{saveError}</Alert>}

      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-brand">
          {existing ? 'Rezervasyon Düzenle' : 'Yeni Rezervasyon'}
        </h1>
        {existing && <p className="mt-1 font-mono text-sm text-brand-muted">{existing.code}</p>}
      </div>

      {conflictWarning && <Alert kind="warning" className="mb-5">{conflictWarning}</Alert>}
      {isPastLocked && (
        <Alert kind="info" className="mb-5">
          Bu kayıt geçmiş tarihlidir. Silmek için önce tarihi ileri bir tarihe alıp kaydetmeniz gerekir.
        </Alert>
      )}

      <form onSubmit={(e) => { void onSubmit(e); }} noValidate className="card p-6">
        <fieldset className="mb-8">
          <legend className="mb-4 font-heading text-lg font-bold text-brand">Müşteri Bilgileri</legend>
          <div className="grid gap-4 md:grid-cols-2">
            <Field id="customerName" label="Müşteri Adı Soyadı" required error={errors.customerName}>
              <input id="customerName" className="field-input" value={form.customerName} onChange={(e) => update('customerName', e.target.value)} aria-invalid={Boolean(errors.customerName)} />
            </Field>
            <Field id="secondPersonName" label="İkinci Kişi (varsa)">
              <input id="secondPersonName" className="field-input" value={form.secondPersonName} onChange={(e) => update('secondPersonName', e.target.value)} />
            </Field>
            <Field id="customerPhone" label="Telefon" required error={errors.customerPhone}>
              <input id="customerPhone" type="tel" className="field-input" placeholder="532xxxyyzz" value={form.customerPhone} onChange={(e) => update('customerPhone', e.target.value)} aria-invalid={Boolean(errors.customerPhone)} />
            </Field>
            <Field id="secondPhone" label="İkinci Kişi Telefonu (varsa)" error={errors.secondPhone}>
              <input id="secondPhone" type="tel" className="field-input" placeholder="533xxxyyzz" value={form.secondPhone} onChange={(e) => update('secondPhone', e.target.value)} aria-invalid={Boolean(errors.secondPhone)} />
            </Field>
            <Field id="customerEmail" label="E-Posta" error={errors.customerEmail}>
              <input id="customerEmail" type="email" className="field-input" value={form.customerEmail} onChange={(e) => update('customerEmail', e.target.value)} aria-invalid={Boolean(errors.customerEmail)} />
            </Field>
            <Field
              id="identityNo"
              label="TC Kimlik No (sözleşme için)"
              error={errors.identityNo}
              hint="Yalnızca sözleşme düzenlemek için tutulur; kod doğrulama ekranında görünmez."
            >
              <input id="identityNo" inputMode="numeric" maxLength={11} className="field-input" value={form.identityNo} onChange={(e) => update('identityNo', e.target.value)} aria-describedby="identityNo-hint" aria-invalid={Boolean(errors.identityNo)} />
            </Field>
            <Field id="address" label="Adres" className="md:col-span-2">
              <input id="address" className="field-input" value={form.address} onChange={(e) => update('address', e.target.value)} />
            </Field>
            {/*
              Ulaşım kanalı: yıl sonunda "100 düğünün kaçı Instagram'dan
              geldi" sorusunun cevabı buradan çıkıyor. Kayıt açılırken
              sorulması gerekiyor; sonradan kimse hatırlamıyor.
            */}
            <Field id="sourceChannel" label="Bize nereden ulaştı?">
              <select
                id="sourceChannel"
                className="field-input"
                value={form.sourceChannel}
                onChange={(e) => update('sourceChannel', e.target.value as LeadChannel | '')}
              >
                <option value="">Seçilmedi</option>
                {LEAD_CHANNELS.map((k) => <option key={k} value={k}>{k}</option>)}
                {/*
                  Kaydın kanalı artık listede değilse (eski "Referans",
                  "Düğün.com") yalnızca o kayıt için ekleniyor: yoksa
                  kaydı açan kullanıcı, hiç dokunmadığı alanın
                  kendiliğinden boşaldığını görürdü.
                */}
                {form.sourceChannel && !LEAD_CHANNELS.includes(form.sourceChannel) && (
                  <option value={form.sourceChannel}>{form.sourceChannel} (eski)</option>
                )}
              </select>
            </Field>
            <Field
              id="sourceDetail"
              label={form.sourceChannel === 'Tavsiye' || form.sourceChannel === 'Referans'
                ? 'Tavsiye eden (varsa)' : 'Kanal açıklaması'}
              error={errors.sourceDetail}
              hint={form.sourceChannel === 'Diğer' ? 'Diğer seçildiğinde bu alan zorunludur.' : undefined}
            >
              <input
                id="sourceDetail"
                className="field-input"
                value={form.sourceDetail}
                // "Referans" madde 8 ile "Tavsiye" oldu; eski kayıtlarda
                // hâlâ geçtiği için ikisi de açık bırakılıyor.
                disabled={form.sourceChannel !== 'Tavsiye'
                  && form.sourceChannel !== 'Referans'
                  && form.sourceChannel !== 'Diğer'}
                placeholder={form.sourceChannel === 'Referans' ? 'Ayşe Yılmaz' : 'Tabela, fuar, tanıdık esnaf...'}
                onChange={(e) => update('sourceDetail', e.target.value)}
                aria-describedby={form.sourceChannel === 'Diğer' ? 'sourceDetail-hint' : undefined}
                aria-invalid={Boolean(errors.sourceDetail)}
              />
            </Field>
          </div>
        </fieldset>

        <fieldset className="mb-8">
          <legend className="mb-4 font-heading text-lg font-bold text-brand">Organizasyon Bilgileri</legend>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Field id="hallId" label="Salon" required error={errors.hallId}>
              <select id="hallId" className="field-input" value={form.hallId}
                onChange={(e) => update('hallId', e.target.value)} aria-invalid={Boolean(errors.hallId)}>
                <option value="">Salon seçiniz</option>
                {halls.filter((h) => h.isActive || h.id === form.hallId).map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}{h.capacity > 0 ? ` (${h.capacity} kişi)` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="date" label="Tarih" required error={errors.date}>
              <input id="date" type="date" className="field-input" value={form.date} onChange={(e) => update('date', e.target.value)} aria-invalid={Boolean(errors.date)} />
            </Field>
            <Field id="startTime" label="Başlangıç Saati" error={errors.startTime}>
              <input id="startTime" type="time" className="field-input" value={form.startTime} onChange={(e) => update('startTime', e.target.value)} aria-invalid={Boolean(errors.startTime)} />
            </Field>
            <Field id="endTime" label="Bitiş Saati">
              <input id="endTime" type="time" className="field-input" value={form.endTime} onChange={(e) => update('endTime', e.target.value)} />
            </Field>
            <Field id="slot" label="Seans" required>
              <select id="slot" className="field-input" value={form.slot} onChange={(e) => update('slot', e.target.value as SessionSlot)}>
                <option value="Gündüz">Gündüz</option>
                <option value="Gece">Gece</option>
              </select>
            </Field>
            <Field id="organizationType" label="Organizasyon Türü" required>
              <select id="organizationType" className="field-input" value={form.organizationType} onChange={(e) => update('organizationType', e.target.value as OrganizationType)}>
                {ORGANIZATION_TYPES.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field id="guestCount" label="Davetli Sayısı" required error={errors.guestCount}>
              <input id="guestCount" inputMode="numeric" className="field-input" value={form.guestCount} onChange={(e) => update('guestCount', e.target.value)} aria-invalid={Boolean(errors.guestCount)} />
            </Field>
          </div>

          {/*
            "Extralar" (hizmet kutucukları) kaldırıldı (madde 8). Sabit bir
            liste her salona uymuyordu ve seçilen kutucuk hiçbir tutara
            dönüşmüyordu; hizmetler artık Ürün ve Hizmet ekranında fiyatıyla
            tanımlanıp Düğün İçi Giderler'e satır olarak giriyor.

            Alanın kendisi kaldırılmadı: eski sözleşmelerde yazılı olan
            hizmetler çıktıda görünmeye devam ediyor. Silinseydi imzalanmış
            bir sözleşmenin içeriği sistemden kaybolurdu.
          */}
        </fieldset>

        <fieldset className="mb-8">
          <legend className="mb-4 font-heading text-lg font-bold text-brand">Ödeme Bilgileri</legend>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Field id="menuId" label="Menü / Paket" className="md:col-span-2">
              <select id="menuId" className="field-input" value={form.menuId}
                onChange={(e) => update('menuId', e.target.value)}>
                <option value="">Menü seçilmedi</option>
                {menus.filter((m) => m.isActive || m.id === form.menuId).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {formatMoney(kurusToLira(m.priceKurus), 'TL')}
                    {m.pricing === 'kisi_basi' ? ' / kişi' : ' sabit'}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="totalAmount" label="Toplam Tutar" required error={errors.totalAmount}>
              <input id="totalAmount" inputMode="decimal" className="field-input" value={form.totalAmount} onChange={(e) => update('totalAmount', e.target.value)} aria-invalid={Boolean(errors.totalAmount)} />
            </Field>
            {suggestedTotal !== null && suggestedTotal > 0
              && Number(form.totalAmount) !== suggestedTotal && (
              <div className="md:col-span-2 lg:col-span-4 -mt-2">
                <button
                  type="button"
                  onClick={() => update('totalAmount', String(suggestedTotal))}
                  className="btn-outline btn-sm"
                >
                  Menüye göre {formatMoney(suggestedTotal, 'TL')} uygula
                </button>
                <span className="ml-2 text-xs text-brand-muted">
                  {selectedMenu?.pricing === 'kisi_basi'
                    ? `${formatMoney(kurusToLira(selectedMenu.priceKurus), 'TL')} × ${Number(form.guestCount) || 0} kişi`
                    : 'Sabit paket fiyatı'}
                </span>
              </div>
            )}
            <Field id="deposit" label="Kapora" error={errors.deposit}>
              <input id="deposit" inputMode="decimal" className="field-input" value={form.deposit} onChange={(e) => update('deposit', e.target.value)} aria-invalid={Boolean(errors.deposit)} />
            </Field>
            <Field id="balance" label="Kalan Alacak">
              <input id="balance" className="field-input bg-surface" value={balance.toLocaleString('tr-TR')} readOnly tabIndex={-1} />
            </Field>
            <Field id="status" label="Durum">
              <select id="status" className="field-input" value={form.status} onChange={(e) => update('status', e.target.value as ReservationStatus)}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>
        </fieldset>

        <Field id="note" label="Not">
          <textarea id="note" rows={4} className="field-input" value={form.note} onChange={(e) => update('note', e.target.value)} />
        </Field>

        <div className="mt-6 flex flex-wrap gap-2">
          <button type="submit" className="btn-primary text-white hover:text-white" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
          <Link to={existing ? `/panel/rezervasyonlar/${existing.id}` : '/panel/rezervasyonlar'} className="btn-outline">
            Vazgeç
          </Link>
        </div>
      </form>
    </QueryBoundary>
  );
}

function Field({
  id, label, required, error, hint, className = '', children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  /** Alanın altında görünen açıklama. Alanı okuyan çağıran taraf
   *  aria-describedby ile `${id}-hint` kimliğine bağlar. */
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="field-label">
        {label}
        {required && <span className="ml-0.5 text-danger" aria-hidden="true">*</span>}
      </label>
      {children}
      {hint && <p id={`${id}-hint`} className="mt-1 text-xs text-brand-muted">{hint}</p>}
      {error && <p className="mt-1 text-xs text-danger" role="alert">{error}</p>}
    </div>
  );
}
