import { useMemo, useState } from 'react';
import Seo from '../../components/Seo';
import Alert from '../../components/Alert';
import { QueryBoundary } from '../../components/QueryState';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../lib/authHelpers';
import { useMessages, useSetMessageStatus } from '../../lib/queries';
import { formatDateTime, formatPhone } from '../../lib/format';
import { IconMail, IconUser } from '../../components/Icons';
import {
  MESSAGE_KIND_LABELS, MESSAGE_STATUS_LABELS,
  type ContactMessage, type MessageKind, type MessageStatus,
} from '../../types';

const STATUS_TONE: Record<MessageStatus, string> = {
  yeni: 'bg-[#fdf0d5] text-[#8a6100]',
  islemde: 'bg-[#e3f0fb] text-[#1c5a8a]',
  kapatildi: 'bg-[#e6f4ea] text-[#1e7b3c]',
};

const STATUS_ORDER: MessageStatus[] = ['yeni', 'islemde', 'kapatildi'];

export default function Talepler() {
  const { user } = useAuth();
  const { data: messages = [], isLoading, error: loadError } = useMessages();
  const setStatus = useSetMessageStatus();

  const [kindFilter, setKindFilter] = useState<'hepsi' | MessageKind>('hepsi');
  const [statusFilter, setStatusFilter] = useState<'hepsi' | MessageStatus>('hepsi');
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const counts = useMemo(() => ({
    yeni: messages.filter((m) => m.status === 'yeni').length,
    islemde: messages.filter((m) => m.status === 'islemde').length,
    kapatildi: messages.filter((m) => m.status === 'kapatildi').length,
  }), [messages]);

  const filtered = useMemo(() => messages.filter(
    (m) => (kindFilter === 'hepsi' || m.kind === kindFilter)
      && (statusFilter === 'hepsi' || m.status === statusFilter),
  ), [messages, kindFilter, statusFilter]);

  function open(message: ContactMessage) {
    setOpenId(message.id === openId ? null : message.id);
    setNote(message.note);
    setError('');
  }

  async function apply(message: ContactMessage, status: MessageStatus) {
    setError('');
    try {
      await setStatus.mutateAsync({ id: message.id, status, note: note.trim() });
      if (status !== message.status) setOpenId(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  // Talepler kişisel veri içerir (ad, e-posta, telefon); okuma yöneticiye kapalıdır.
  if (user?.role !== 'owner') {
    return <Alert kind="error">Talep kutusu yalnızca yönetici hesabı ile görüntülenebilir.</Alert>;
  }

  return (
    <QueryBoundary isLoading={isLoading} error={loadError}>
      <Seo title="Talepler - Düğün Takip Panel" noindex />

      <h1 className="mb-2 font-heading text-2xl font-bold text-brand">Talepler</h1>
      <p className="mb-6 text-sm text-brand-muted">
        Siteden gelen iletişim, demo ve salon teklifi formları burada toplanır. Bir talebi
        açıp not düşebilir, durumunu güncelleyebilirsiniz. Talep içeriği kanıt niteliğinde
        olduğu için değiştirilemez ve silinemez.
      </p>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(statusFilter === s ? 'hepsi' : s)}
            aria-pressed={statusFilter === s}
            className={`card p-4 text-left transition ${statusFilter === s ? 'ring-2 ring-brand' : ''}`}
          >
            <span className="block text-sm text-brand-muted">{MESSAGE_STATUS_LABELS[s]}</span>
            <span className="block font-heading text-2xl font-bold text-brand">{counts[s]}</span>
          </button>
        ))}
      </div>

      <div className="card mb-5 flex flex-wrap items-end gap-4 p-4">
        <div>
          <label htmlFor="msg-kind" className="field-label">Talep türü</label>
          <select
            id="msg-kind"
            className="field-input"
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as 'hepsi' | MessageKind)}
          >
            <option value="hepsi">Hepsi</option>
            {(Object.keys(MESSAGE_KIND_LABELS) as MessageKind[]).map((k) => (
              <option key={k} value={k}>{MESSAGE_KIND_LABELS[k]}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="msg-status" className="field-label">Durum</label>
          <select
            id="msg-status"
            className="field-input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'hepsi' | MessageStatus)}
          >
            <option value="hepsi">Hepsi</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{MESSAGE_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <p className="ml-auto text-sm text-brand-muted">{filtered.length} talep listeleniyor</p>
      </div>

      {error && <Alert kind="error" className="mb-4">{error}</Alert>}

      {filtered.length === 0 ? (
        <div className="card p-10 text-center">
          <IconMail size={32} className="mx-auto mb-3 text-brand-muted" />
          <p className="text-brand-muted">
            {messages.length === 0
              ? 'Henüz talep gelmemiş. Siteden gönderilen formlar burada görünür.'
              : 'Bu filtreye uyan talep yok.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((m) => (
            <li key={m.id} className="card overflow-hidden">
              <button
                type="button"
                onClick={() => open(m)}
                aria-expanded={openId === m.id}
                className="flex w-full flex-wrap items-center gap-3 p-4 text-left hover:bg-[#faf7f3]"
              >
                <IconUser size={18} className="shrink-0 text-brand-muted" />
                <span className="font-heading font-bold text-brand">{m.name}</span>
                <span className="rounded-full bg-[#f2ece4] px-2 py-0.5 text-xs text-brand-muted">
                  {MESSAGE_KIND_LABELS[m.kind]}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[m.status]}`}>
                  {MESSAGE_STATUS_LABELS[m.status]}
                </span>
                <span className="ml-auto text-sm text-brand-muted">{formatDateTime(m.createdAt)}</span>
              </button>

              {openId === m.id && (
                <div className="border-t border-[#eee6dc] p-4">
                  <dl className="mb-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-brand-muted">E-Posta</dt>
                      <dd><a className="text-brand underline" href={`mailto:${m.email}`}>{m.email}</a></dd>
                    </div>
                    <div>
                      <dt className="text-brand-muted">Telefon</dt>
                      <dd>
                        {m.phone
                          ? <a className="text-brand underline" href={`tel:${m.phone}`}>{formatPhone(m.phone)}</a>
                          : '—'}
                      </dd>
                    </div>
                    {m.handledAt && (
                      <div className="sm:col-span-2">
                        <dt className="text-brand-muted">İşlem zamanı</dt>
                        <dd>{formatDateTime(m.handledAt)}</dd>
                      </div>
                    )}
                  </dl>

                  <p className="mb-4 whitespace-pre-wrap rounded bg-[#faf7f3] p-3 text-sm text-brand">
                    {m.message}
                  </p>

                  <label htmlFor={`note-${m.id}`} className="field-label">Not</label>
                  <textarea
                    id={`note-${m.id}`}
                    rows={2}
                    className="field-input mb-3"
                    placeholder="Görüşme notu, verilen fiyat, sonuç…"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />

                  <div className="flex flex-wrap gap-2">
                    {STATUS_ORDER.filter((s) => s !== m.status).map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={setStatus.isPending}
                        onClick={() => { void apply(m, s); }}
                        className="btn-outline btn-sm"
                      >
                        {MESSAGE_STATUS_LABELS[s]} yap
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={setStatus.isPending}
                      onClick={() => { void apply(m, m.status); }}
                      className="btn-primary btn-sm text-white hover:text-white"
                    >
                      Notu kaydet
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </QueryBoundary>
  );
}
