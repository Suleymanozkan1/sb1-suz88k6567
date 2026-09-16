import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Seo from '../../components/Seo';
import { tarafEtiketleri } from '../../lib/taraflar';
import { fiyatHesapla, KDV_ORANLARI } from '../../lib/rezervasyonFiyat';
import { CITIES } from '../../data/constants';
import Alert from '../../components/Alert';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../lib/authHelpers';
import { kurusToLira, menuTotalKurus } from '../../lib/menuFiyat';
import {
  useHalls, useMenus, useReservation, useReservations, useSaveReservation, useSendSms,
  useStaff, useVendors,
  useLead, useLeadStatuses, useSaveLead,
} from '../../lib/queries';
import { kazanimDurumu } from '../../lib/lead';
import { QueryBoundary } from '../../components/QueryState';
import { formatDate, formatMoney, todayIso } from '../../lib/format';
import { LEAD_CHANNELS, ORGANIZATION_TYPES, ORG_TO_COLOR_KEY, PAYMENT_METHODS } from '../../data/constants';
import type {
  LeadChannel, OrganizationType, PaymentMethod, Reservation, ReservationStatus, SessionSlot,
} from '../../types';

const STATUSES: ReservationStatus[] = ['Ön Rezervasyon', 'Kesin Rezervasyon', 'Tamamlandı', 'İptal'];

interface FormState {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  homePhone: string;
  contractDate: string;
  staffId: string;
  staffEmail: string;
  groomName: string;
  groomPhone: string;
  groomEmail: string;
  groomHometown: string;
  groomDistrict: string;
  brideName: string;
  bridePhone: string;
  brideEmail: string;
  brideHometown: string;
  brideDistrict: string;
  menuNote: string;
  pricePerPerson: string;
  discount: string;
  discountIsPercent: boolean;
  vatRate: string;
  identityNo: string;
  hallId: string;
  /** Seçilen menü/paket kimlikleri. Birden fazla olabilir. */
  menuIds: string[];
  date: string;
  startTime: string;
  endTime: string;
  slot: SessionSlot;
  organizationType: OrganizationType;
  guestCount: string;
  totalAmount: string;
  deposit: string;
  /** Kaporanın hangi kanaldan alındığı; kasa dağılımı buna bakıyor. */
  depositMethod: PaymentMethod;
  status: ReservationStatus;
  note: string;
  address: string;
  city: string;
  district: string;
  sourceChannel: LeadChannel | '';
  sourceDetail: string;
  services: string[];
}

const EMPTY: FormState = {
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  homePhone: '',
  contractDate: '',
  staffId: '',
  staffEmail: '',
  groomName: '',
  groomPhone: '',
  groomEmail: '',
  groomHometown: '',
  groomDistrict: '',
  brideName: '',
  bridePhone: '',
  brideEmail: '',
  brideHometown: '',
  brideDistrict: '',
  menuNote: '',
  pricePerPerson: '',
  discount: '',
  discountIsPercent: false,
  vatRate: '0',
  identityNo: '',
  hallId: '',
  menuIds: [],
  date: todayIso(),
  startTime: '',
  endTime: '',
  slot: 'Gece',
  organizationType: 'Düğün',
  guestCount: '',
  totalAmount: '',
  deposit: '',
  depositMethod: 'Nakit',
  status: 'Kesin Rezervasyon',
  note: '',
  address: '',
  city: '',
  district: '',
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
  /*
    Pakete dahil hizmetler Ürün ve Hizmet listesinden geliyor; burada ayrı
    bir hizmet listesi tutulsaydı iki yerde iki farklı liste olurdu.
  */
  const { data: kalemler = [] } = useVendors();
  // Yalnızca etkin HİZMET kalemleri: ürün (su, gazoz) stoktan düşer,
  // sözleşmenin hizmet listesine girmez.
  const hizmetler = useMemo(
    () => kalemler.filter((k) => k.kind === 'hizmet' && k.isActive),
    [kalemler],
  );
  const saveMutation = useSaveReservation();
  const sendSmsMutation = useSendSms();
  const [form, setForm] = useState<FormState>(EMPTY);

  /*
    Taraf etiketleri organizasyon türüne bağlı. Tür değiştiğinde alan
    başlıkları da değişiyor -- kullanıcı "Toplantı"yı seçtiği anda
    formun ondan damat ismi istemesi anlamsız olurdu.
  */
  const etiket = tarafEtiketleri(form.organizationType);
  const { data: personeller = [] } = useStaff();
  const currency = user?.currency ?? 'TL';
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
      homePhone: existing.homePhone ?? '',
      contractDate: existing.contractDate ?? '',
      staffId: existing.staffId ?? '',
      staffEmail: existing.staffEmail ?? '',
      groomName: existing.groomName ?? '',
      groomPhone: existing.groomPhone ?? '',
      groomEmail: existing.groomEmail ?? '',
      groomHometown: existing.groomHometown ?? '',
      groomDistrict: existing.groomDistrict ?? '',
      brideName: existing.brideName ?? '',
      bridePhone: existing.bridePhone ?? '',
      brideEmail: existing.brideEmail ?? '',
      brideHometown: existing.brideHometown ?? '',
      brideDistrict: existing.brideDistrict ?? '',
      menuNote: existing.menuNote ?? '',
      pricePerPerson: existing.pricePerPerson ? String(existing.pricePerPerson) : '',
      discount: existing.discount ? String(existing.discount) : '',
      discountIsPercent: existing.discountIsPercent ?? false,
      vatRate: String(existing.vatRate ?? 0),
      identityNo: existing.identityNo ?? '',
      hallId: existing.hallId,
      menuIds: existing.menuIds ?? [],
      date: existing.date,
      startTime: existing.startTime ?? '',
      endTime: existing.endTime ?? '',
      slot: existing.slot,
      organizationType: existing.organizationType,
      guestCount: String(existing.guestCount),
      totalAmount: String(existing.totalAmount),
      deposit: String(existing.deposit),
      depositMethod: existing.depositMethod ?? 'Nakit',
      status: existing.status,
      note: existing.note ?? '',
      address: existing.address ?? '',
      city: existing.city ?? '',
      district: existing.district ?? '',
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
  const selectedMenus = menus.filter((m) => form.menuIds.includes(m.id));
  /*
    Öneri, seçilen MENÜLERİN TOPLAMI. Yalnızca ilki hesaplansaydı
    kınası ayrı, düğünü ayrı paketli bir sözleşmede öneri gerçek
    tutarın yarısı çıkar ve kullanıcı farkı elle bulmak zorunda kalırdı.
  */
  const suggestedTotal = selectedMenus.length > 0
    ? kurusToLira(selectedMenus.reduce(
      (t, m) => t + menuTotalKurus(m, Number(form.guestCount) || 0), 0,
    ))
    : null;

  /*
    ÖNERİNİN NEREDEN ÇIKTIĞI. Tek menü varken "1.500 TL x 300 kişi"
    yazmak yetiyordu. Birden fazla menü seçilebildiğinden artık tek bir
    çarpım yok: kınası kişi başı, düğünü sabit paket olabiliyor.
    Açıklama bu yüzden seçime göre değişiyor; yanlış bir çarpım
    göstermektense hiç göstermemek yeğdir.
  */
  const oneriAciklamasi = (() => {
    const kisiBasi = selectedMenus.filter((m) => m.pricing === 'kisi_basi');
    const davetli = Number(form.guestCount) || 0;
    if (kisiBasi.length === selectedMenus.length) {
      const birimKurus = kisiBasi.reduce((t, m) => t + m.priceKurus, 0);
      return `${formatMoney(kurusToLira(birimKurus), 'TL')} × ${davetli} kişi`;
    }
    if (kisiBasi.length === 0) {
      return selectedMenus.length === 1 ? 'Sabit paket fiyatı' : `${selectedMenus.length} sabit paket toplamı`;
    }
    return `${selectedMenus.length} menü toplamı`;
  })();

  /*
    EKLER (Extralar): pakete dahil edilen hizmetlerin ücretleri.

    Önceden hesaba hiç girmiyordu (`ekler: 0`): kullanıcı orkestra ve
    fotoğrafçıyı işaretliyor, genel toplam değişmiyordu. Sözleşme
    fiyatı bu kalemleri içeriyor; hesabın içermemesi, önerilen tutarı
    sistematik olarak düşük gösteriyordu.
  */
  const eklerToplami = useMemo(
    () => hizmetler
      .filter((h) => form.services.includes(h.name))
      .reduce((t, h) => t + h.unitPrice, 0),
    [hizmetler, form.services],
  );

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

    /*
      İSTEĞE BAĞLI ALANLAR DA DOĞRULANIYOR.

      Form `noValidate` ile gönderiliyor -- tarayıcının `type="email"`
      denetimi devrede DEĞİL, `type="tel"` zaten hiç denetlemiyor.
      Doğrulama yalnızca gelin telefonuna bakıyordu; ev telefonu, damat
      telefonu ve iki e-posta bozuk hâliyle kaydediliyordu.

      Sessiz sonucu şu: o numaraya hatırlatma gönderilmeye
      çalışıldığında düşer, e-postaya yazıldığında geri döner -- ikisi
      de kaydı açan kişiye değil, günler sonra kimsenin bakmadığı bir
      kuyruğa yansır.

      Boş geçmek serbest: bu alanların hiçbiri zorunlu değil.
    */
    const telefonDenetle = (alan: keyof FormState, deger: string, mesaj: string) => {
      const haneler = deger.replace(/\D/g, '');
      if (deger.trim() && haneler.length < 10) e[alan] = mesaj;
    };
    telefonDenetle('bridePhone', form.bridePhone, 'Telefon numarası en az 10 haneli olmalıdır.');
    telefonDenetle('groomPhone', form.groomPhone, 'Telefon numarası en az 10 haneli olmalıdır.');
    telefonDenetle('homePhone', form.homePhone, 'Ev telefonu en az 10 haneli olmalıdır.');

    const epostaDenetle = (alan: keyof FormState, deger: string) => {
      if (deger.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(deger.trim()))
        e[alan] = 'Geçerli bir e-posta adresi giriniz.';
    };
    epostaDenetle('groomEmail', form.groomEmail);
    epostaDenetle('brideEmail', form.brideEmail);
    epostaDenetle('staffEmail', form.staffEmail);

    /*
      FİYAT GİRDİLERİ.

      Metin kutusuna "abc" yazıldığında `Number(...)` NaN veriyor,
      `|| undefined` onu kayıttan düşürüyor ve depo katmanı boş değeri
      0'a çeviriyordu: kullanıcı bir şey yazdı, sistem sessizce sıfır
      kaydetti. Aynı `||` GEÇERLİ bir sıfırı da düşürüyordu.

      Artık bozuk değer kaydı durduruyor, sıfır ise olduğu gibi
      kaydediliyor.
    */
    const sayisalDenetle = (alan: keyof FormState, deger: string, mesaj: string) => {
      if (!deger.trim()) return;
      const sayi = Number(deger);
      if (!Number.isFinite(sayi) || sayi < 0) e[alan] = mesaj;
    };
    sayisalDenetle('pricePerPerson', form.pricePerPerson, 'Geçerli bir kişi başı fiyat giriniz.');
    sayisalDenetle('discount', form.discount, 'Geçerli bir iskonto giriniz.');

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
      brideName: form.brideName.trim() || undefined,
      bridePhone: form.bridePhone.replace(/\D/g, '') || undefined,
      groomHometown: form.groomHometown.trim() || undefined,
      brideHometown: form.brideHometown.trim() || undefined,
      homePhone: form.homePhone.replace(/\D/g, '') || undefined,
      contractDate: form.contractDate || undefined,
      staffId: form.staffId || undefined,
      staffEmail: form.staffEmail.trim() || undefined,
      groomName: form.groomName.trim() || undefined,
      groomPhone: form.groomPhone.replace(/\D/g, '') || undefined,
      groomEmail: form.groomEmail.trim() || undefined,
      groomDistrict: form.groomDistrict.trim() || undefined,
      brideEmail: form.brideEmail.trim() || undefined,
      brideDistrict: form.brideDistrict.trim() || undefined,
      menuNote: form.menuNote.trim() || undefined,
      pricePerPerson: form.pricePerPerson.trim() ? Number(form.pricePerPerson) : undefined,
      discount: form.discount.trim() ? Number(form.discount) : undefined,
      discountIsPercent: form.discountIsPercent,
      vatRate: Number(form.vatRate) || 0,
      identityNo: form.identityNo.replace(/\D/g, '') || undefined,
      date: form.date,
      startTime: form.startTime || undefined,
      endTime: form.endTime || undefined,
      hallId: form.hallId,
      menuIds: form.menuIds,
      slot: form.slot,
      organizationType: form.organizationType,
      guestCount: Number(form.guestCount),
      totalAmount: Number(form.totalAmount),
      deposit: Number(form.deposit || 0),
      /*
        Kapora tipi yalnızca kapora VARSA yazılıyor: sıfır kaporaya
        "Nakit" yazmak, alınmamış bir parayı kasa dağılımında nakit
        gösterirdi.
      */
      depositMethod: Number(form.deposit || 0) > 0 ? form.depositMethod : undefined,
      currency: user?.currency ?? 'TL',
      status: form.status,
      colorKey: ORG_TO_COLOR_KEY[form.organizationType] ?? 'diger',
      note: form.note.trim() || undefined,
      address: form.address.trim() || undefined,
      city: form.city.trim() || undefined,
      district: form.district.trim() || undefined,
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

  /*
    FİYAT HESABI EKRANDA CANLI. Kişibaşı toplam, iskonto tutarı ve KDV
    hesaplanıyor, saklanmıyor: saklansaydı fiyat sonradan
    düzeltildiğinde birbirini tutmayan sayılar kalırdı.

    `totalAmount` (Fiyat) hâlâ elle giriliyor -- pazarlık sonucu tutar
    neredeyse her zaman hesaptan farklı oluyor. Hesap ÖNERİ; altında
    "hesaplanan" olarak gösteriliyor ki kullanıcı farkı görebilsin.
  */
  const fiyat = fiyatHesapla({
    kisiBasi: Number(form.pricePerPerson) || 0,
    davetli: Number(form.guestCount) || 0,
    ekler: eklerToplami,
    iskonto: Number(form.discount) || 0,
    yuzdeMi: form.discountIsPercent,
    kdvOrani: Number(form.vatRate) || 0,
  });

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
          <legend className="mb-4 font-heading text-lg font-bold text-brand">Sözleşme</legend>
          <div className="grid gap-4 md:grid-cols-2">
            {/*
              SÖZLEŞME TARİHİ, REZERVASYON TARİHİNDEN AYRI. Sözleşme
              bugün imzalanıp düğün iki yıl sonra olabiliyor; ikisi tek
              alanda tutulsaydı "bu yıl kaç sözleşme yaptık" sorusunun
              cevabı düğün tarihlerinden üretilir, yanlış çıkardı.
            */}
            <Field id="contractDate" label="Sözleşme Tarihi">
              <input id="contractDate" type="date" className="field-input" value={form.contractDate} onChange={(e) => update('contractDate', e.target.value)} />
            </Field>
            <Field id="contractNo" label="Sözleşme No" hint={existing ? undefined : 'Kayıt açılınca sıradaki numara otomatik verilir.'}>
              <input id="contractNo" className="field-input" value={existing?.code ?? ''} readOnly disabled />
            </Field>
            {/*
              YETKİLİ: sözleşmeyi yapan personel. Kimin sattığı
              kayıtta durmazsa prim de sorumluluk da konuşulamıyor.
            */}
            <Field id="staffId" label="Yetkili (isteğe bağlı)">
              <select id="staffId" className="field-input" value={form.staffId} onChange={(e) => update('staffId', e.target.value)}>
                <option value="">Seçiniz</option>
                {personeller.map((p) => <option key={p.id} value={p.id}>{p.fullName || p.email}</option>)}
              </select>
            </Field>
            <Field id="staffEmail" label="Yetkili E-Posta" error={errors.staffEmail}>
              <input id="staffEmail" type="email" className="field-input" value={form.staffEmail} onChange={(e) => update('staffEmail', e.target.value)} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="mb-8">
          <legend className="mb-4 font-heading text-lg font-bold text-brand">Müşteri Bilgileri</legend>
          <div className="grid gap-4 md:grid-cols-2">
            {/*
              ÜÇ AYRI KİŞİ VAR, İKİ DEĞİL.

              "Ad Soyad" sözleşmeyi İMZALAYAN kişi ve çoğu zaman damat
              ya da gelin değil: gelinin babası, damadın amcası, bir
              şirket yetkilisi. Salon parayı ondan alıyor, sözleşmeyi
              onunla yapıyor -- ama düğün damat ve gelinin.

              Önceden yalnızca iki isim tutuluyordu ve bu üçüncü kişi ya
              damadın yerine yazılıyordu (damadın adı kayda hiç
              girmiyordu) ya da hiç yazılmıyordu (imzası olan kişi
              belirsiz kalıyordu).
            */}
            <Field id="customerName" label="Ad Soyad (sözleşmeyi imzalayan)" required error={errors.customerName}>
              <input id="customerName" className="field-input" value={form.customerName} onChange={(e) => update('customerName', e.target.value)} aria-invalid={Boolean(errors.customerName)} />
            </Field>
            <Field
              id="identityNo"
              label="TC Kimlik No"
              error={errors.identityNo}
              hint="Yalnızca sözleşme düzenlemek için tutulur; kod doğrulama ekranında görünmez."
            >
              <input id="identityNo" inputMode="numeric" maxLength={11} className="field-input" value={form.identityNo} onChange={(e) => update('identityNo', e.target.value)} aria-describedby="identityNo-hint" aria-invalid={Boolean(errors.identityNo)} />
            </Field>
            {/* Cebe ulaşılamadığında aranan sabit hat. */}
            <Field id="homePhone" label="Ev Telefonu" error={errors.homePhone}>
              <input id="homePhone" type="tel" className="field-input" placeholder="3123334455" value={form.homePhone} onChange={(e) => update('homePhone', e.target.value)} />
            </Field>
            <Field id="customerPhone" label="Cep Telefonu" required error={errors.customerPhone}>
              <input id="customerPhone" type="tel" className="field-input" placeholder="532xxxyyzz" value={form.customerPhone} onChange={(e) => update('customerPhone', e.target.value)} aria-invalid={Boolean(errors.customerPhone)} />
            </Field>
            <Field id="customerEmail" label="E-Posta" error={errors.customerEmail}>
              <input id="customerEmail" type="email" className="field-input" value={form.customerEmail} onChange={(e) => update('customerEmail', e.target.value)} aria-invalid={Boolean(errors.customerEmail)} />
            </Field>
            {/*
              İl ve ilçe serbest metin adresten AYRI: "il bazlı rapor"
              adresi ayrıştırarak üretilseydi "Merkez/Konya" ile "Konya
              Merkez" ayrı il sayılırdı.
            */}
            <Field id="city" label="İl">
              <input id="city" className="field-input" value={form.city} onChange={(e) => update('city', e.target.value)} />
            </Field>
            <Field id="district" label="İlçe">
              <input id="district" className="field-input" value={form.district} onChange={(e) => update('district', e.target.value)} />
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

        {/*
          DAMAT VE GELİN, SÖZLEŞMEYİ İMZALAYANDAN AYRI.

          Etiketler organizasyon türüne göre: düğün, nişan, kına ve
          nikâhta "Damat / Gelin"; konferans ya da toplantıda "Müşteri /
          İkinci Kişi". Sabit "Damat" olsaydı bir şirket toplantısını
          giren kişi kendi müşterisini damat diye kaydetmek zorunda
          kalırdı.
        */}
        <fieldset className="mb-8">
          <legend className="mb-4 font-heading text-lg font-bold text-brand">
            {etiket.birinci} ve {etiket.ikinci}
          </legend>
          <div className="grid gap-4 md:grid-cols-2">
            <Field id="groomName" label={`${etiket.birinci} Ad Soyad`}>
              <input id="groomName" className="field-input" value={form.groomName} onChange={(e) => update('groomName', e.target.value)} />
            </Field>
            <Field id="brideName" label={`${etiket.ikinci} Ad Soyad`}>
              <input id="brideName" className="field-input" value={form.brideName} onChange={(e) => update('brideName', e.target.value)} />
            </Field>
            <Field id="groomPhone" label={`${etiket.birinci} Cep`} error={errors.groomPhone}>
              <input id="groomPhone" type="tel" className="field-input" placeholder="532xxxyyzz" value={form.groomPhone} onChange={(e) => update('groomPhone', e.target.value)} aria-invalid={Boolean(errors.groomPhone)} />
            </Field>
            <Field id="bridePhone" label={`${etiket.ikinci} Cep`} error={errors.bridePhone}>
              <input id="bridePhone" type="tel" className="field-input" placeholder="533xxxyyzz" value={form.bridePhone} onChange={(e) => update('bridePhone', e.target.value)} aria-invalid={Boolean(errors.bridePhone)} />
            </Field>
            {/*
              MEMLEKET LİSTEDEN. Serbest metin olsaydı
              "Kahramanmaraş", "K.maraş" ve "Maraş" üç ayrı memleket
              sayılırdı; il bazlı bir sayım hiç yapılamazdı.

              Aşağıdaki "İl" ile karıştırılmamalı: o, müşterinin ŞU AN
              yaşadığı yer. İstanbul'da oturan bir Sivaslı için ikisi
              farklıdır.
            */}
            <Field id="groomHometown" label={`${etiket.birinci} Memleket`}>
              <select id="groomHometown" className="field-input" value={form.groomHometown} onChange={(e) => update('groomHometown', e.target.value)}>
                <option value="">Seçiniz</option>
                {CITIES.map((il) => <option key={il} value={il}>{il}</option>)}
              </select>
            </Field>
            <Field id="brideHometown" label={`${etiket.ikinci} Memleket`}>
              <select id="brideHometown" className="field-input" value={form.brideHometown} onChange={(e) => update('brideHometown', e.target.value)}>
                <option value="">Seçiniz</option>
                {CITIES.map((il) => <option key={il} value={il}>{il}</option>)}
              </select>
            </Field>
            {/* Köy/ilçe serbest: listesi yok ve olmamalı. */}
            <Field id="groomDistrict" label={`${etiket.birinci} Köy / İlçe`}>
              <input id="groomDistrict" className="field-input" value={form.groomDistrict} onChange={(e) => update('groomDistrict', e.target.value)} />
            </Field>
            <Field id="brideDistrict" label={`${etiket.ikinci} Köy / İlçe`}>
              <input id="brideDistrict" className="field-input" value={form.brideDistrict} onChange={(e) => update('brideDistrict', e.target.value)} />
            </Field>
            <Field id="groomEmail" label={`${etiket.birinci} E-Posta`} error={errors.groomEmail}>
              <input id="groomEmail" type="email" className="field-input" value={form.groomEmail} onChange={(e) => update('groomEmail', e.target.value)} aria-invalid={Boolean(errors.groomEmail)} />
            </Field>
            <Field id="brideEmail" label={`${etiket.ikinci} E-Posta`} error={errors.brideEmail}>
              <input id="brideEmail" type="email" className="field-input" value={form.brideEmail} onChange={(e) => update('brideEmail', e.target.value)} aria-invalid={Boolean(errors.brideEmail)} />
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
            EXTRALAR BURADA DEĞİL. Sabit hizmet kutucukları (madde 8)
            kaldırıldı; yerine formun altındaki "Pakete dahil hizmetler"
            bölümü geldi ve seçenekler Ürün ve Hizmet listesinden,
            fiyatlarıyla birlikte geliyor. Sabit liste her salona
            uymuyordu ve seçilen kutucuk hiçbir tutara dönüşmüyordu.
          */}
        </fieldset>

        <fieldset className="mb-8">
          <legend className="mb-4 font-heading text-lg font-bold text-brand">Ödeme Bilgileri</legend>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/*
              ÇOKLU SEÇİM. Sözleşmeye çoğu zaman tek menü girmiyor:
              kına için ayrı, düğün için ayrı paket anlaşılıyor. Tek
              seçim olduğunda gerisi not alanına yazılıyor, yani fiyat
              önerisine ve sözleşmeye hiç yansımıyordu.

              Kutucuk listesi kullanıldı, `<select multiple>` değil:
              çoklu select'te seçim Ctrl basılı tutmayı gerektiriyor,
              bunu bilmeyen kullanıcı ikinci menüyü seçtiğinde
              birincisi sessizce kayboluyor.
            */}
            {/*
              `Field` KULLANILMIYOR. O bileşen `label htmlFor` üretiyor;
              bir etiket `div`'e bağlanamaz -- etikete tıklamak hiçbir
              şey seçmez ve ekran okuyucu grubu duyurmaz. Kutucuk
              listesinin doğru karşılığı `fieldset`/`legend`.
            */}
            <fieldset className="md:col-span-2 lg:col-span-4">
              <legend className="field-label">Menü / Paket (birden fazla seçilebilir)</legend>
              <div className="grid gap-2 rounded-md border border-line p-3 sm:grid-cols-2">
                {menus.filter((m) => m.isActive || form.menuIds.includes(m.id)).map((m) => (
                  <label key={m.id} className="flex items-start gap-2 text-sm text-brand">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={form.menuIds.includes(m.id)}
                      onChange={(e) => update(
                        'menuIds',
                        e.target.checked
                          ? [...form.menuIds, m.id]
                          : form.menuIds.filter((k) => k !== m.id),
                      )}
                    />
                    <span>
                      {m.name} · {formatMoney(kurusToLira(m.priceKurus), 'TL')}
                      {m.pricing === 'kisi_basi' ? ' / kişi' : ' sabit'}
                    </span>
                  </label>
                ))}
                {menus.length === 0 && (
                  <p className="text-sm text-brand-muted">Henüz menü tanımlanmamış.</p>
                )}
              </div>
            </fieldset>
            {/*
              FİYAT GİRDİLERİ VE HESAPLANANLAR.

              Kişi başı fiyat, iskonto ve KDV oranı SAKLANIYOR; bunlardan
              çıkan kişibaşı toplam, iskonto tutarı ve KDV tutarı
              SAKLANMIYOR, her açılışta hesaplanıyor. Hesaplanan değer
              saklansaydı fiyat sonradan düzeltildiğinde birbirini
              tutmayan sayılar kalır, hangisinin doğru olduğu
              bilinemezdi -- üstelik yanlış olan, faturaya gidendi.
            */}
            <Field id="pricePerPerson" label="Fiyat Kişibaşı" error={errors.pricePerPerson}>
              <input id="pricePerPerson" inputMode="decimal" className="field-input" value={form.pricePerPerson} onChange={(e) => update('pricePerPerson', e.target.value)} />
            </Field>
            <Field id="discount" label="İskonto" error={errors.discount}>
              <input id="discount" inputMode="decimal" className="field-input" value={form.discount} onChange={(e) => update('discount', e.target.value)} />
            </Field>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-brand">
                <input
                  type="checkbox"
                  checked={form.discountIsPercent}
                  onChange={(e) => update('discountIsPercent', e.target.checked)}
                />
                Yüzde olarak hesapla
              </label>
            </div>
            <Field id="vatRate" label="KDV Oranı">
              <select id="vatRate" className="field-input" value={form.vatRate} onChange={(e) => update('vatRate', e.target.value)}>
                {KDV_ORANLARI.map((o) => <option key={o} value={String(o)}>%{o}</option>)}
              </select>
            </Field>

            {/*
              Hesap ÖNERİ olarak duruyor, dayatılmıyor: pazarlık sonucu
              tutar neredeyse her zaman hesaptan farklı oluyor. "Toplam
              Tutar" elle giriliyor, hesap altında görünüyor ki
              kullanıcı farkı fark edebilsin.
            */}
            <div className="md:col-span-2 lg:col-span-4 rounded-md bg-surface p-3 text-sm">
              <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-4">
                <div className="flex justify-between gap-2">
                  <dt className="text-brand-muted">Kişibaşı Toplam</dt>
                  <dd className="text-brand">{formatMoney(fiyat.kisiBasiToplam, currency)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-brand-muted">İskonto</dt>
                  <dd className="text-brand">{formatMoney(fiyat.iskontoTutari, currency)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-brand-muted">KDV (%{Number(form.vatRate) || 0})</dt>
                  <dd className="text-brand">{formatMoney(fiyat.kdvTutari, currency)}</dd>
                </div>
                <div className="flex justify-between gap-2 font-medium">
                  <dt className="text-brand">Genel Toplam</dt>
                  <dd className="text-brand">{formatMoney(fiyat.genelToplam, currency)}</dd>
                </div>
              </dl>
            </div>

            {/*
              Paket dışında ne konuşulduğu. `menuIds` tanımlı paketleri ve
              fiyatı besliyor; bu not beslemiyor -- ikisi ayrı olmalı,
              yoksa serbest yazılan bir satır fiyatı değiştirir sanılır.
            */}
            <Field id="menuNote" label="Yemek Menüsü (varsa)" className="md:col-span-2 lg:col-span-4">
              <textarea id="menuNote" rows={2} className="field-input" value={form.menuNote} onChange={(e) => update('menuNote', e.target.value)} />
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
                <span className="ml-2 text-xs text-brand-muted">{oneriAciklamasi}</span>
              </div>
            )}
            <Field id="deposit" label="Kapora" error={errors.deposit}>
              <input id="deposit" inputMode="decimal" className="field-input" value={form.deposit} onChange={(e) => update('deposit', e.target.value)} aria-invalid={Boolean(errors.deposit)} />
            </Field>
            {/*
              KAPORA ÖDEME TİPİ. Kapora çoğu sözleşmenin en büyük ilk
              tahsilatı ve kanalı sorulmadığında kasa dağılımında
              "Belirtilmemiş" satırında birikiyordu: salonun kasasındaki
              paranın nerede durduğu (nakit mi, bankada mı) okunamıyordu.
              "Gelecek Kaporalar ve Ödemeler" raporunun ödeme tipi sütunu
              da bu alandan doluyor.
            */}
            <Field id="depositMethod" label="Kapora ödeme tipi">
              <select
                id="depositMethod"
                className="field-input"
                value={form.depositMethod}
                disabled={!(Number(form.deposit || 0) > 0)}
                onChange={(e) => update('depositMethod', e.target.value as PaymentMethod)}
              >
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
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

        {/*
          PAKETE DAHİL HİZMETLER. Alan kayıtta baştan beri vardı ve
          sözleşme onu basıyordu, ama formda girilecek yeri yoktu:
          sözleşmenin "Hizmetler" bölümü elle girilen her kayıtta boş
          çıkıyordu. Seçenekler Ürün ve Hizmet listesinden geliyor --
          burada ayrı bir liste tutulsaydı iki yerde iki farklı hizmet
          listesi olurdu.
        */}
        {hizmetler.length > 0 && (
          <fieldset className="mt-6">
            <legend className="field-label">Pakete dahil hizmetler</legend>
            <div className="flex flex-wrap gap-2">
              {hizmetler.map((h) => {
                const secili = form.services.includes(h.name);
                return (
                  <label
                    key={h.id}
                    className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${
                      secili ? 'border-accent-ink bg-accent/10 text-accent-ink' : 'border-line text-brand'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={secili}
                      onChange={() => update(
                        'services',
                        secili
                          ? form.services.filter((x) => x !== h.name)
                          : [...form.services, h.name],
                      )}
                    />
                    {h.name}
                    {/*
                      FİYAT YAZILIYOR. Bu kutucuklar artık genel toplamı
                      değiştiriyor; tutarı görünmeseydi kullanıcı bir
                      hizmeti işaretlediğinde toplamın neden değiştiğini
                      anlayamazdı.
                    */}
                    {h.unitPrice > 0 && (
                      <span className="ml-1 opacity-70">+{formatMoney(h.unitPrice, currency)}</span>
                    )}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

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
