import React, { useState, useEffect } from 'react';
import { X, AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';
import { THEME } from '../../styles/theme';

export type ToastType = 'success' | 'error' | 'warning' | 'info';
export type ToastPosition = 'top-right' | 'top-center' | 'top-left' | 'bottom-right' | 'bottom-center' | 'bottom-left';

interface ToastProps {
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
  position?: ToastPosition;
  onClose?: () => void;
}

const Toast: React.FC<ToastProps> = ({ 
  type, 
  title, 
  message, 
  duration = 3000, 
  position = 'top-center',
  onClose 
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    setIsVisible(true);
    
    if (duration > 0) {
      const timer = setTimeout(() => {
        handleClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration]);

  const handleClose = () => {
    setIsLeaving(true);
    setTimeout(() => {
      setIsVisible(false);
      onClose?.();
    }, 300);
  };

  const getIcon = () => {
    const iconClass = "w-5 h-5";
    switch (type) {
      case 'success':
        return <CheckCircle className={`${iconClass} text-green-500`} />;
      case 'error':
        return <AlertCircle className={`${iconClass} text-red-500`} />;
      case 'warning':
        return <AlertTriangle className={`${iconClass} text-yellow-500`} />;
      case 'info':
        return <Info className={`${iconClass} text-blue-500`} />;
      default:
        return <Info className={`${iconClass} text-blue-500`} />;
    }
  };

  const getBackgroundColor = () => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200';
      case 'error':
        return 'bg-red-50 border-red-200';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200';
      case 'info':
        return 'bg-blue-50 border-blue-200';
      default:
        return 'bg-neutral-50 border-neutral-200';
    }
  };

  const getPositionStyles = () => {
    switch (position) {
      case 'top-right':
        return 'top-4 right-4';
      case 'top-center':
        return 'top-4 left-1/2 -translate-x-1/2';
      case 'top-left':
        return 'top-4 left-4';
      case 'bottom-right':
        return 'bottom-4 right-4';
      case 'bottom-center':
        return 'bottom-4 left-1/2 -translate-x-1/2';
      case 'bottom-left':
        return 'bottom-4 left-4';
      default:
        return 'top-4 left-1/2 -translate-x-1/2';
    }
  };

  if (!isVisible) return null;

  return (
    <div className={`fixed ${getPositionStyles()} z-[9999] animate-toast-in ${isLeaving ? 'animate-toast-out' : ''}`}>
      <div className={`min-w-[320px] max-w-[420px] p-5 rounded-[24px] shadow-2xl ${THEME.glass} ${getBackgroundColor()}`}>
        {/* 无标题时单行内容垂直居中；有关标题时图标与首行对齐（关闭按钮高于内容行，items-start 会把单行文字顶到上方） */}
        <div className={`flex space-x-4 ${title ? 'items-start' : 'items-center'}`}>
          <div className={`flex-shrink-0 ${title ? 'mt-0.5' : ''}`}>
            {getIcon()}
          </div>
          <div className="flex-1 min-w-0">
            {title && (
              <h3 className={`text-sm font-black tracking-tight ${type === 'error' ? 'text-red-900' : type === 'success' ? 'text-green-900' : type === 'warning' ? 'text-yellow-900' : 'text-blue-900'}`}>
                {title}
              </h3>
            )}
            <p className={`text-sm font-medium ${type === 'error' ? 'text-red-700' : type === 'success' ? 'text-green-700' : type === 'warning' ? 'text-yellow-700' : 'text-blue-700'} ${title ? 'mt-1.5' : ''}`}>
              {message}
            </p>
          </div>
          <button
            onClick={handleClose}
            className={THEME.buttonIcon}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Toast;