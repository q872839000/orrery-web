import React from 'react';
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
  if (!open) return null;
  return (
    <div className={`${THEME.overlay} z-[70] flex items-center justify-center p-4`} onClick={onClose}>
      <div
        className={`${THEME.modal} ${width} max-h-[85vh] flex flex-col`}
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex flex-shrink-0 items-center justify-between">
          <h3 className="text-base font-black tracking-tight text-neutral-900">{title}</h3>
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
