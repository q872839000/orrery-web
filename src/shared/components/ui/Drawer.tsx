import React from 'react';
import { X } from 'lucide-react';
import { THEME } from '../../styles/theme';

interface DrawerProps {
  open: boolean;
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  /** 头部右侧附加操作 */
  actions?: React.ReactNode;
  width?: string;
}

/** 右侧抽屉（分块预览/实体详情等详情视图统一容器） */
export const Drawer: React.FC<DrawerProps> = ({ open, title, onClose, children, actions, width = 'max-w-xl' }) => {
  if (!open) return null;
  return (
    <div className={`${THEME.overlay} z-[70]`} onClick={onClose}>
      <div className={`${THEME.drawer} ${width}`} onClick={e => e.stopPropagation()}>
        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-neutral-100 px-5 py-4">
          <div className="min-w-0 flex-1 truncate text-sm font-black tracking-tight text-neutral-900">{title}</div>
          <div className="flex items-center gap-1">
            {actions}
            <button onClick={onClose} className={THEME.buttonIcon} title="关闭" aria-label="关闭">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
};

export default Drawer;
