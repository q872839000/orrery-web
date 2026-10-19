import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { THEME } from '../../styles/theme';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** 底部操作区 */
  footer?: React.ReactNode;
  width?: string;
}

/** 模态框（毛玻璃遮罩 + 居中卡片） */
export const Modal: React.FC<ModalProps> = ({ open, title, onClose, children, footer, width = 'max-w-lg' }) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusable = () => Array.from(panel?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') ?? []).filter(element => element.getClientRects().length > 0);
    if (!panel?.contains(document.activeElement)) focusable()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const controls = focusable(), first = controls[0], last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); if (previous?.isConnected) previous.focus(); };
  }, [open]);
  if (!open) return null;
  return (
    <div className={`${THEME.overlay} z-[70] flex items-center justify-center p-4`} onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`${THEME.modal} ${width} max-h-[85vh] flex flex-col`}
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex flex-shrink-0 items-center justify-between">
          <h3 id={titleId} className="text-base font-black tracking-tight text-neutral-900">{title}</h3>
          <button onClick={onClose} className={THEME.buttonIcon} title="关闭" aria-label="关闭">
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="mt-5 flex flex-shrink-0 items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
};

export default Modal;
