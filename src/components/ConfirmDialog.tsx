import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  /**
   * Onay düğmesinin başındaki ikon.
   *
   * Yıkıcı olmayan ama sonucu para tablosunu değiştiren eylemlerde
   * (örneğin "kasaya gönder") metin tek başına eylemi ayırt
   * ettirmiyordu.
   */
  confirmIcon?: ReactNode;
  /**
   * Onay düğmesinin rengi.
   *
   * Varsayılan KIRMIZI: bu bileşen çoğunlukla silme onayı için
   * kullanılıyor. Ama yıkıcı olmayan eylemlerde ("kasaya gönder")
   * kırmızı düğme kullanıcıyı bir şey kaybedeceğine inandırıyordu.
   */
  confirmTone?: 'tehlike' | 'olagan';
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Onayla',
  confirmIcon,
  confirmTone = 'tehlike',
  cancelLabel = 'Vazgeç',
  onConfirm,
  onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={description ? 'confirm-desc' : undefined}
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title" className="font-heading text-lg font-bold text-brand">{title}</h2>
        {description && <p id="confirm-desc" className="mt-2 text-sm leading-relaxed">{description}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-outline btn-sm" onClick={onCancel}>{cancelLabel}</button>
          <button
            ref={confirmRef}
            type="button"
            className={`btn btn-sm inline-flex items-center gap-1.5 text-white ${
              confirmTone === 'tehlike'
                ? 'bg-danger hover:bg-[#c0392b]'
                : 'bg-brand hover:bg-brand-dark'
            }`}
            onClick={onConfirm}
          >
            {confirmIcon}{confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
