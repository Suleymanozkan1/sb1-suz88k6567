import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Seo from '../../components/Seo';
import { QueryBoundary } from '../../components/QueryState';
import { useAuth } from '../../context/AuthContext';
import { useLeadStatuses, useLeads, useStaff } from '../../lib/queries';
import { formatDate, formatPhone, normalizeTr } from '../../lib/format';
import {
  bugunAranacakMi, durumAdi, durumHaritasi, durumSinifi, etkinlikTarihi, gecikmisMi,
  type DurumHaritasi,
} from '../../lib/lead';
import { IconSearch } from '../../components/Icons';
import { LEAD_SOURCES } from '../../types';
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
  const { data: durumlar = [] } = useLeadStatuses();
  const { data: personel = [] } = useStaff();
  const { can } = useAuth();
  // Dashboard'daki kutular buraya süzgeçle geliyor; tıklanan kutu ile
  // açılan listenin farklı şey göstermesi güveni bozardı.
  const [param] = useSearchParams();
  const [arama, setArama] = useState('');
  // Durum süzgeci adres satırından geliyor. Geçerliliği burada
  // denetlenmiyor: durumlar henüz yüklenmemiş olabilir ve bilinmeyen bir
  // kod zaten hiçbir adayla eşleşmez, listeyi boş gösterir.
  const [durum, setDurum] = useState<'' | LeadStatus>(() => param.get('durum') ?? '');
  const [kaynak, setKaynak] = useState<'' | LeadSource>('');
  const [sorumlu, setSorumlu] = useState('');
  /*
    Tarih aralıkları. İki ayrı eksen var ve karıştırılmamalı: kaydın
    AÇILDIĞI tarih ("geçen hafta kaç talep geldi") ile ETKİNLİĞİN
    tarihi ("ağustosta kimler var"). Tek bir tarih süzgeci olsaydı
    bunlardan biri hep eksik kalırdı.
  */
  const [kayitBas, setKayitBas] = useState('');
  const [kayitBit, setKayitBit] = useState('');
  const [etkBas, setEtkBas] = useState('');
  const [etkBit, setEtkBit] = useState('');
  const [suzgec, setSuzgec] = useState<Suzgec>(() => {
    const istenen = param.get('suzgec');
    return istenen === 'bugun' || istenen === 'geciken' || istenen === 'acik' ? istenen : 'hepsi';
  });

  const adaylar = useMemo(() => data ?? [], [data]);
  const harita = useMemo(() => durumHaritasi(durumlar), [durumlar]);

  const gorunen = useMemo(() => {
    const q = normalizeTr(arama);
    return adaylar.filter((l) => {
      if (durum && l.status !== durum) return false;
      if (kaynak && l.source !== kaynak) return false;
      if (sorumlu && l.assignedTo !== sorumlu) return false;
      if (suzgec === 'bugun' && !bugunAranacakMi(harita, l)) return false;
      if (suzgec === 'geciken' && !gecikmisMi(harita, l)) return false;
      if (suzgec === 'acik' && (harita.get(l.status)?.isClosed ?? false)) return false;

      // Kayıt tarihi ISO damga; ilk on karakter gün demek.
      const kayitGunu = l.createdAt.slice(0, 10);
      if (kayitBas && kayitGunu < kayitBas) return false;
      if (kayitBit && kayitGunu > kayitBit) return false;
      /*
        Etkinlik tarihi süzgeci, tarihi ÇÖZÜLMEMİŞ adayları eler
        ("Mayısın ilk haftası"). Bu bilinçli: hangi güne denk geldiği
        bilinmeyen bir kaydı aralığın içinde ya da dışında saymak,
        ikisi de yanlış bir cevap üretirdi.
      */
      if ((etkBas || etkBit) && !l.eventDate) return false;
      if (etkBas && l.eventDate < etkBas) return false;
      if (etkBit && l.eventDate > etkBit) return false;
      if (q && !normalizeTr(`${l.name} ${l.phone} ${l.email} ${l.organizationType}`).includes(q)) {
        return false;
      }
      return true;
    });
  }, [adaylar, arama, durum, kaynak, sorumlu, suzgec, harita,
    kayitBas, kayitBit, etkBas, etkBit]);

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
          <div className="flex flex-wrap gap-2">
            <Link to="/panel/musteri-adaylari/yeni" className="btn-primary text-white hover:text-white">
              Yeni aday
            </Link>
            <Link to="/panel/musteri-adaylari/durumlar" className="btn-ghost">Durumlar</Link>
            <Link to="/panel/whatsapp-ayarlari" className="btn-ghost">WhatsApp ayarları</Link>
          </div>
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
            {durumlar.map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}
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

        <fieldset className="md:col-span-2">
          <legend className="field-label">Kayıt tarihi</legend>
          <div className="flex items-center gap-2">
            <input type="date" className="field-input" aria-label="Kayıt tarihi başlangıç"
              value={kayitBas} onChange={(e) => setKayitBas(e.target.value)} />
            <span className="text-brand-muted">–</span>
            <input type="date" className="field-input" aria-label="Kayıt tarihi bitiş"
              value={kayitBit} onChange={(e) => setKayitBit(e.target.value)} />
          </div>
        </fieldset>

        <fieldset className="md:col-span-2">
          <legend className="field-label">Etkinlik tarihi</legend>
          <div className="flex items-center gap-2">
            <input type="date" className="field-input" aria-label="Etkinlik tarihi başlangıç"
              value={etkBas} onChange={(e) => setEtkBas(e.target.value)} />
            <span className="text-brand-muted">–</span>
            <input type="date" className="field-input" aria-label="Etkinlik tarihi bitiş"
              value={etkBit} onChange={(e) => setEtkBit(e.target.value)} />
          </div>
        </fieldset>

        {(kayitBas || kayitBit || etkBas || etkBit) && (
          <div className="md:col-span-4">
            <button
              type="button"
              className="text-sm text-brand-muted underline hover:text-brand"
              onClick={() => {
                setKayitBas(''); setKayitBit(''); setEtkBas(''); setEtkBit('');
              }}
            >
              Tarih süzgeçlerini temizle
            </button>
          </div>
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
          {gorunen.map((l) => (
            <Kart key={l.id} lead={l} personelAdi={personelAdi} harita={harita} />
          ))}
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
function Kart({ lead, personelAdi, harita }: {
  lead: CustomerLead; personelAdi: (id?: string) => string; harita: DurumHaritasi;
}) {
  const geciken = gecikmisMi(harita, lead);
  const bugun = bugunAranacakMi(harita, lead);

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
        <span className={`rounded-full px-2.5 py-0.5 text-xs ${durumSinifi(harita, lead.status)}`}>
          {durumAdi(harita, lead.status)}
        </span>
      </div>

      <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Kalem etiket="Etkinlik" deger={etkinlikTarihi(lead) && (lead.eventDate ? formatDate(lead.eventDate) : lead.eventDateText)} />
        <Kalem etiket="Kişi" deger={lead.guestCount !== null ? String(lead.guestCount) : ''} />
        <Kalem etiket="Organizasyon" deger={lead.organizationType} />
        <Kalem etiket="Kaynak" deger={lead.source} />
        <Kalem etiket="İlk iletişim" deger={lead.createdAt ? formatDate(lead.createdAt.slice(0, 10)) : ''} />
        <Kalem etiket="Sorumlu" deger={personelAdi(lead.assignedTo)} />
        <Kalem
          etiket="Sonraki takip"
          deger={lead.nextFollowupAt ? formatDate(lead.nextFollowupAt) : ''}
          vurgu={geciken ? 'text-[#b91c1c]' : bugun ? 'text-[#92600e]' : undefined}
        />
      </dl>

      {lead.requestText && (
        <p className="mt-2 text-sm text-brand">
          <span className="text-brand-muted">Talep: </span>{lead.requestText}
        </p>
      )}

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
