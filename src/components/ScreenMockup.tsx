import { DEFAULT_COLOR_SETTINGS, MONTH_NAMES } from '../data/constants';

/** Ekranlar sayfasında gösterilen, uygulama arayüzünü temsil eden statik önizlemeler */
export default function ScreenMockup({ kind }: { kind: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-white">
      <div className="flex items-center gap-1.5 border-b border-line bg-surface px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-3 truncate text-[10px] text-brand-muted">duguntakip.com/panel</span>
      </div>
      <div className="p-4">{renderBody(kind)}</div>
    </div>
  );
}

function renderBody(kind: string) {
  switch (kind) {
    case 'calendar':
      return <CalendarPreview />;
    case 'report-program':
      return <ProgramPreview />;
    case 'report-month':
      return <MonthPreview />;
    case 'colors':
      return <ColorsPreview />;
    case 'cashflow':
      return <CashFlowPreview />;
    case 'reservation':
      return <ReservationPreview />;
    case 'contract':
      return <ContractPreview />;
    default:
      return <BusinessPreview />;
  }
}

function CalendarPreview() {
  const booked: Record<number, string> = {
    3: '#47b2e4', 5: '#18d26e', 8: '#f39c12', 11: '#47b2e4', 14: '#e74c3c',
    17: '#47b2e4', 19: '#8e44ad', 22: '#47b2e4', 26: '#16a085', 29: '#47b2e4',
  };
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="font-heading text-sm font-bold text-brand">{MONTH_NAMES[new Date().getMonth()]} 2026</span>
        <span className="text-[10px] text-brand-muted">Gündüz / Gece</span>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 35 }, (_, i) => (
          <span
            key={i}
            className="flex h-7 items-center justify-center rounded text-[9px]"
            style={booked[i] ? { background: booked[i], color: '#fff' } : { background: '#f3f5fa', color: '#9db0cc' }}
          >
            {i + 1 <= 31 ? i + 1 : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

function ProgramPreview() {
  const rows = [
    ['Düğün', 42, 2_940_000],
    ['Nişan', 18, 720_000],
    ['Sünnet', 11, 385_000],
    ['Kına', 9, 225_000],
    ['Konferans', 6, 210_000],
  ] as const;
  const max = Math.max(...rows.map((r) => r[2]));
  return (
    <div className="space-y-2">
      {rows.map(([label, count, total]) => (
        <div key={label}>
          <div className="mb-0.5 flex justify-between text-[10px] text-brand">
            <span>{label} ({count})</span>
            <span>{total.toLocaleString('tr-TR')} ₺</span>
          </div>
          <div className="h-2 rounded bg-surface">
            <div className="h-full rounded bg-accent" style={{ width: `${(total / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function MonthPreview() {
  const values = [12, 18, 9, 22, 27, 31, 24, 19, 28, 33, 21, 15];
  const max = Math.max(...values);
  return (
    <div className="flex h-40 items-end gap-1.5">
      {values.map((v, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1">
          <div className="w-full rounded-t bg-accent" style={{ height: `${(v / max) * 120}px` }} />
          <span className="text-[8px] text-brand-muted">{MONTH_NAMES[i].slice(0, 3)}</span>
        </div>
      ))}
    </div>
  );
}

function ColorsPreview() {
  return (
    <div className="grid grid-cols-2 gap-2">
      {DEFAULT_COLOR_SETTINGS.slice(0, 8).map((c) => (
        <div key={c.key} className="flex items-center gap-2 rounded border border-line px-2 py-1.5">
          <span className="h-5 w-5 rounded" style={{ background: c.color }} />
          <span className="text-[10px] text-brand">{c.label}</span>
        </div>
      ))}
    </div>
  );
}

function CashFlowPreview() {
  const rows = [
    ['15.08.2026', 'Rezervasyon Tahsilatı', 'Gelir', '45.000 ₺'],
    ['12.08.2026', 'Personel Maaş', 'Gider', '28.000 ₺'],
    ['08.08.2026', 'Rezervasyon Kaparo', 'Gelir', '15.000 ₺'],
    ['05.08.2026', 'Elektrik', 'Gider', '9.400 ₺'],
  ];
  return (
    <table className="w-full text-[10px]">
      <thead>
        <tr className="border-b border-line text-left text-brand-muted">
          <th className="pb-1.5 font-medium">Tarih</th>
          <th className="pb-1.5 font-medium">Kategori</th>
          <th className="pb-1.5 font-medium">Tür</th>
          <th className="pb-1.5 text-right font-medium">Tutar</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r[0] + r[1]} className="border-b border-line/60">
            <td className="py-1.5 text-brand">{r[0]}</td>
            <td className="py-1.5 text-brand">{r[1]}</td>
            <td className={`py-1.5 ${r[2] === 'Gelir' ? 'text-[#18d26e]' : 'text-[#e74c3c]'}`}>{r[2]}</td>
            <td className="py-1.5 text-right text-brand">{r[3]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReservationPreview() {
  const fields = [
    ['Müşteri Adı', 'Ahmet & Elif Yılmaz'],
    ['Telefon', '0532 123 45 67'],
    ['Tarih / Seans', '12.09.2026 · Gece'],
    ['Organizasyon', 'Düğün'],
    ['Davetli Sayısı', '450'],
    ['Toplam Tutar', '185.000 ₺'],
    ['Kaparo', '45.000 ₺'],
    ['Kalan Alacak', '140.000 ₺'],
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {fields.map(([label, value]) => (
        <div key={label} className="rounded border border-line p-2">
          <div className="text-[8px] uppercase text-brand-muted">{label}</div>
          <div className="mt-0.5 text-[10px] font-medium text-brand">{value}</div>
        </div>
      ))}
    </div>
  );
}

function ContractPreview() {
  return (
    <div className="space-y-1.5 rounded border border-line p-3">
      <div className="text-center text-[10px] font-bold text-brand">SALON KİRALAMA SÖZLEŞMESİ</div>
      <div className="h-1.5 w-full rounded bg-surface" />
      <div className="h-1.5 w-11/12 rounded bg-surface" />
      <div className="h-1.5 w-full rounded bg-surface" />
      <div className="h-1.5 w-9/12 rounded bg-surface" />
      <div className="h-1.5 w-full rounded bg-surface" />
      <div className="mt-3 flex justify-between pt-3">
        <div className="text-[8px] text-brand-muted">KİRAYA VEREN</div>
        <div className="text-[8px] text-brand-muted">KİRACI</div>
      </div>
    </div>
  );
}

function BusinessPreview() {
  const rows = [
    ['Grand Yıldız Düğün Sarayı', 'Beylikdüzü / İstanbul', '600 kişi'],
    ['Yıldız Kır Bahçesi', 'Silivri / İstanbul', '350 kişi'],
  ];
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r[0]} className="flex items-center justify-between rounded border border-line px-3 py-2">
          <div>
            <div className="text-[10px] font-semibold text-brand">{r[0]}</div>
            <div className="text-[9px] text-brand-muted">{r[1]}</div>
          </div>
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[9px] text-accent">{r[2]}</span>
        </div>
      ))}
    </div>
  );
}
