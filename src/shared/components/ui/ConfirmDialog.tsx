import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { THEME } from '../../styles/theme';

export type ConfirmType = 'warning' | 'error' | 'info' | 'success';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: string;
  type?: ConfirmType;
  confirmText?: string;
  cancelText?: string;
  confirmButtonClass?: string;
  cancelButtonClass?: string;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  type = 'warning',
  confirmText = '确认',
  cancelText = '取消',
  confirmButtonClass,
  cancelButtonClass
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setIsLeaving(false);
    } else {
      handleClose();
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsLeaving(true);
    setTimeout(() => {
      setIsVisible(false);
      onClose();
    }, 300);
  };

  const handleConfirm = () => {
    setIsLeaving(true);
    setTimeout(() => {
      setIsVisible(false);
      onConfirm();
    }, 300);
  };

  const getIcon = () => {
    const iconClass = "w-5 h-5";
    switch (type) {
      case 'success':
        return <CheckCircle className={`${iconClass} text-green-500`} />;
      case 'error':
        return <AlertCircle className={`${iconClass} text-red-500`} />;
      case 'info':
        return <Info className={`${iconClass} text-blue-500`} />;
      case 'warning':
      default:
        return <AlertTriangle className={`${iconClass} text-yellow-500`} />;
    }
  };

  const getConfirmButtonClass = () => {
    const baseClass = "px-6 py-2 text-sm font-semibold rounded-xl transition-all duration-300 shadow-md active:scale-95";
    if (confirmButtonClass) return `${baseClass} ${confirmButtonClass}`;

    switch (type) {
      case 'error':
        return `${baseClass} bg-red-500 text-white hover:bg-red-600`;
      case 'success':
        return `${baseClass} bg-green-500 text-white hover:bg-green-600`;
      case 'info':
        return `${baseClass} bg-blue-500 text-white hover:bg-blue-600`;
      case 'warning':
      default:
        return `${baseClass} bg-black text-white hover:bg-neutral-800`;
    }
  };

  const getCancelButtonClass = () => {
    const baseClass = "px-5 py-2 text-sm font-semibold bg-neutral-50 border border-neutral-200 rounded-xl hover:bg-neutral-100 transition-all";
    return cancelButtonClass ? `${baseClass} ${cancelButtonClass}` : baseClass;
  };

  if (!isVisible) return null;

  return (
    <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 ${isLeaving ? 'animate-fade-out' : 'animate-fade-in'}`}>
      <div className={`shadow-2xl w-full max-w-md overflow-hidden rounded-2xl ${isLeaving ? 'animate-scale-out' : 'animate-scale-in'} ${THEME.glass}`}>
        <div className="p-6 border-b border-neutral-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {getIcon()}
              <h3 className="text-base font-bold text-neutral-900 tracking-tight">
                {title || (type === 'error' ? '错误' : type === 'success' ? '成功' : type === 'info' ? '信息' : '警告')}
              </h3>
            </div>
            <button
              onClick={handleClose}
              className={THEME.buttonIcon}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="p-6 bg-white/40">
          <p className="text-[13px] font-medium text-neutral-600 leading-relaxed">
            {message}
          </p>
        </div>
        <div className="p-6 border-t border-neutral-100 flex items-center justify-end space-x-3">
          <button
            onClick={handleClose}
            className={THEME.button.secondary}
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            className={getConfirmButtonClass()}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;