import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Seo from '../../components/Seo';
import { QueryBoundary } from '../../components/QueryState';
import { useAuth } from '../../context/AuthContext';
import { useLeads, useStaff } from '../../lib/queries';
import { formatDate, formatPhone, normalizeTr } from '../../lib/format';
import { LEAD_STATUS_TONE, bugunAranacakMi, etkinlikTarihi, gecikmisMi } from '../../lib/lead';
import { IconSearch } from '../../components/Icons';
import { LEAD_SOURCES, LEAD_STATUSES } from '../../types';
import type { CustomerLead, LeadSource, LeadStatus } from '../../types';

/**
 * Müşteri adayları.
 *
 * Instagram'dan gelip WhatsApp'a yazan kişi buraya düşüyor; rezervasyona
 * dönüşene kadar takip burada yürüyor. Müşteriler ekranı rezervasyonlardan
 * türeyen bir görünüm olarak kalıyor, aday oraya karışmıyor.
 *
 * Liste telefonda kart, geniş ekranda tablo: personelin çoğu bu ekranı
 * telefondan açıyor ve yatay kaydırılan bir tablo orada kullanılamıyor.
 */
type Suzgec = 'hepsi' | 'bugun' | 'geciken' | 'acik';

export default function MusteriAdaylari() {
  const { data, isLoading, error } = useLeads();
  const { data: personel = [] } = useStaff();
  const { can } = useAuth();
  // Dashboard'daki kutular buraya süzgeçle geliyor; tıklanan kutu ile
  // açılan listenin farklı şey göstermesi güveni bozardı.
  const [param] = useSearchParams();
  const [arama, setArama] = useState('');
  const [durum, setDurum] = useState<'' | LeadStatus>(
    () => (LEAD_STATUSES as string[]).includes(param.get('durum') ?? '')
      ? (param.get('durum') as LeadStatus) : '',
  );
  const [kaynak, setKaynak] = useState<'' | LeadSource>('');
  const [sorumlu, setSorumlu] = useState('');
  const [suzgec, setSuzgec] = useState<Suzgec>(() => {
    const istenen = param.get('suzgec');
    return istenen === 'bugun' || istenen === 'geciken' || istenen === 'acik' ? istenen : 'hepsi';
  });

  const adaylar = useMemo(() => data ?? [], [data]);

  const gorunen = useMemo(() => {
    const q = normalizeTr(arama);
    return adaylar.filter((l) => {
      if (durum && l.status !== durum) return false;
      if (kaynak && l.source !== kaynak) return false;
      if (sorumlu && l.assignedTo !== sorumlu) return false;
      if (suzgec === 'bugun' && !bugunAranacakMi(l)) return false;
      if (suzgec === 'geciken' && !gecikmisMi(l)) return false;
      if (suzgec === 'acik' && (l.status === 'Rezervasyona Döndü'
        || l.status === 'Olumsuz' || l.status === 'İptal')) return false;
      if (q && !normalizeTr(`${l.name} ${l.phone} ${l.email} ${l.organizationType}`).includes(q)) {
        return false;
      }
      return true;
    });
  }, [adaylar, arama, durum, kaynak, sorumlu, suzgec]);

  const personelAdi = (id?: string) =>
    personel.find((p) => p.id === id)?.fullName ?? '';

  return (
    <QueryBoundary isLoading={isLoading} error={error}>
      <Seo title="Müşteri Adayları" noindex />
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-brand">Müşteri Adayları</h1>
          <p className="mt-1 text-sm text-brand-muted">
            WhatsApp&apos;tan gelen ve elle açılan adaylar. Rezervasyona dönüşene kadar takip burada.
          </p>
        </div>
        {can('rezervasyon.duzenle') && (
          <Link to="/panel/musteri-adaylari/yeni" className="btn-primary text-white hover:text-white">
            Yeni aday
          </Link>
        )}
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {([
          ['hepsi', 'Hepsi'], ['acik', 'Açık olanlar'],
          ['bugun', 'Bugün aranacak'], ['geciken', 'Geciken takip'],
        ] as const).map(([k, etiket]) => (
          <button
            key={k}
            type="button"
            onClick={() => setSuzgec(k)}
            className={`rounded-full px-3 py-1.5 text-sm ${
              suzgec === k ? 'bg-brand text-white' : 'border border-line text-brand-muted hover:text-brand'
            }`}
          >
            {etiket}
          </button>
        ))}
      </div>

      <div className="card mb-4 grid gap-3 p-4 md:grid-cols-4">
        <label className="relative block md:col-span-2">
          <span className="sr-only">Müşteri adayı ara</span>
          <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
          <input
            className="field-input pl-9"
            placeholder="Ad, telefon, e-posta"
            value={arama}
            onChange={(e) => setArama(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="sr-only">Durum filtresi</span>
          <select className="field-input" value={durum} onChange={(e) => setDurum(e.target.value as '' | LeadStatus)}>
            <option value="">Tüm durumlar</option>
            {LEAD_STATUSES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="sr-only">Kaynak filtresi</span>
          <select className="field-input" value={kaynak} onChange={(e) => setKaynak(e.target.value as '' | LeadSource)}>
            <option value="">Tüm kaynaklar</option>
            {LEAD_SOURCES.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        {personel.length > 0 && (
          <label className="block md:col-span-2">
            <span className="sr-only">Sorumlu personel filtresi</span>
            <select className="field-input" value={sorumlu} onChange={(e) => setSorumlu(e.target.value)}>
              <option value="">Tüm personel</option>
              {personel.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
            </select>
          </label>
        )}
      </div>

      <p className="mb-3 text-sm text-brand-muted">
        {gorunen.length} aday{adaylar.length !== gorunen.length ? ` (toplam ${adaylar.length})` : ''}
      </p>

      {gorunen.length === 0 ? (
        <div className="card p-6">
          <p className="text-sm text-brand-muted">
            {adaylar.length === 0
              ? 'Henüz müşteri adayı yok. WhatsApp bağlantısı kurulduğunda gelen mesajlar buraya düşer.'
              : 'Bu süzgeçle eşleşen aday bulunmuyor.'}
          </p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {gorunen.map((l) => <Kart key={l.id} lead={l} personelAdi={personelAdi} />)}
        </ul>
      )}
    </QueryBoundary>
  );
}

/**
 * Aday kartı.
 *
 * En önemli bilgiler ilk bakışta: ad, telefon, etkinlik, kişi, tür, durum,
 * sorumlu, sonraki takip. Personel telefonu elinde arama yaparken karta
 * bakıp konuşabilmeli.
 */
function Kart({ lead, personelAdi }: { lead: CustomerLead; personelAdi: (id?: string) => string }) {
  const geciken = gecikmisMi(lead);
  const bugun = bugunAranacakMi(lead);

  return (
    <li className={`card p-4 ${geciken ? 'border-l-4 border-l-[#b91c1c]' : bugun ? 'border-l-4 border-l-[#92600e]' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            to={`/panel/musteri-adaylari/${lead.id}`}
            className="font-heading text-lg font-bold text-brand hover:text-accent-ink"
          >
            {lead.name || 'İsimsiz aday'}
          </Link>
          <p className="text-sm text-brand-muted">{formatPhone(lead.phone) || 'Telefon yok'}</p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs ${LEAD_STATUS_TONE[lead.status]}`}>
          {lead.status}
        </span>
      </div>

      <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Kalem etiket="Etkinlik" deger={etkinlikTarihi(lead) && (lead.eventDate ? formatDate(lead.eventDate) : lead.eventDateText)} />
        <Kalem etiket="Kişi" deger={lead.guestCount !== null ? String(lead.guestCount) : ''} />
        <Kalem etiket="Organizasyon" deger={lead.organizationType} />
        <Kalem etiket="Kaynak" deger={lead.source} />
        <Kalem etiket="Sorumlu" deger={personelAdi(lead.assignedTo)} />
        <Kalem
          etiket="Sonraki takip"
          deger={lead.nextFollowupAt ? formatDate(lead.nextFollowupAt) : ''}
          vurgu={geciken ? 'text-[#b91c1c]' : bugun ? 'text-[#92600e]' : undefined}
        />
      </dl>

      {geciken && (
        <p className="mt-2 text-xs font-medium text-[#b91c1c]">Takip tarihi geçti.</p>
      )}
    </li>
  );
}

function Kalem({ etiket, deger, vurgu }: { etiket: string; deger: string; vurgu?: string }) {
  return (
    <div>
      <dt className="text-xs text-brand-muted">{etiket}</dt>
      <dd className={vurgu ?? (deger ? 'text-brand' : 'text-brand-muted')}>{deger || '-'}</dd>
    </div>
  );
}
