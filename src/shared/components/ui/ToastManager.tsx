import React, { createContext, useContext, useState, useCallback } from 'react';
import Toast, { ToastType } from './Toast';
import ConfirmDialog, { ConfirmType } from './ConfirmDialog';

interface ToastOptions {
  title?: string;
  duration?: number;
  position?: 'top-right' | 'top-center' | 'top-left' | 'bottom-right' | 'bottom-center' | 'bottom-left';
}

interface ConfirmOptions {
  title?: string;
  type?: ConfirmType;
  confirmText?: string;
  cancelText?: string;
  confirmButtonClass?: string;
  cancelButtonClass?: string;
}

interface ToastContextType {
  showToast: (type: ToastType, message: string, options?: ToastOptions) => void;
  showConfirm: (message: string, onConfirm: () => void, options?: ConfirmOptions) => void;
  showSuccess: (message: string, options?: ToastOptions) => void;
  showError: (message: string, options?: ToastOptions) => void;
  showWarning: (message: string, options?: ToastOptions) => void;
  showInfo: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
  duration?: number;
  position?: 'top-right' | 'top-center' | 'top-left' | 'bottom-right' | 'bottom-center' | 'bottom-left';
}

interface ConfirmItem {
  id: string;
  message: string;
  onConfirm: () => void;
  title?: string;
  type?: ConfirmType;
  confirmText?: string;
  cancelText?: string;
  confirmButtonClass?: string;
  cancelButtonClass?: string;
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirm, setConfirm] = useState<ConfirmItem | null>(null);

  const showToast = useCallback((type: ToastType, message: string, options?: ToastOptions) => {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const newToast: ToastItem = {
      id,
      type,
      message,
      title: options?.title,
      duration: options?.duration,
      position: options?.position || 'top-center'
    };
    setToasts(prev => [...prev, newToast]);
  }, []);

  const showConfirm = useCallback((message: string, onConfirm: () => void, options?: ConfirmOptions) => {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const newConfirm: ConfirmItem = {
      id,
      message,
      onConfirm,
      title: options?.title,
      type: options?.type || 'warning',
      confirmText: options?.confirmText,
      cancelText: options?.cancelText,
      confirmButtonClass: options?.confirmButtonClass,
      cancelButtonClass: options?.cancelButtonClass
    };
    setConfirm(newConfirm);
  }, []);

  const showSuccess = useCallback((message: string, options?: ToastOptions) => {
    showToast('success', message, options);
  }, [showToast]);

  const showError = useCallback((message: string, options?: ToastOptions) => {
    showToast('error', message, options);
  }, [showToast]);

  const showWarning = useCallback((message: string, options?: ToastOptions) => {
    showToast('warning', message, options);
  }, [showToast]);

  const showInfo = useCallback((message: string, options?: ToastOptions) => {
    showToast('info', message, options);
  }, [showToast]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const closeConfirm = useCallback(() => {
    setConfirm(null);
  }, []);

  const handleConfirm = useCallback(() => {
    if (confirm) {
      confirm.onConfirm();
      closeConfirm();
    }
  }, [confirm, closeConfirm]);

  const contextValue: ToastContextType = {
    showToast,
    showConfirm,
    showSuccess,
    showError,
    showWarning,
    showInfo
  };

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      
      {/* Toast 容器 */}
      <div className="fixed inset-0 pointer-events-none z-[9999]">
        {/* 顶部提示 */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 space-y-2">
          {toasts.filter(t => t.position === 'top-center').map(toast => (
            <div key={toast.id} className="pointer-events-auto">
              <Toast
                type={toast.type}
                title={toast.title}
                message={toast.message}
                duration={toast.duration}
                position="top-center"
                onClose={() => removeToast(toast.id)}
              />
            </div>
          ))}
        </div>
        
        <div className="absolute top-4 right-4 space-y-2">
          {toasts.filter(t => t.position === 'top-right').map(toast => (
            <div key={toast.id} className="pointer-events-auto">
              <Toast
                type={toast.type}
                title={toast.title}
                message={toast.message}
                duration={toast.duration}
                position="top-right"
                onClose={() => removeToast(toast.id)}
              />
            </div>
          ))}
        </div>
        
        <div className="absolute top-4 left-4 space-y-2">
          {toasts.filter(t => t.position === 'top-left').map(toast => (
            <div key={toast.id} className="pointer-events-auto">
              <Toast
                type={toast.type}
                title={toast.title}
                message={toast.message}
                duration={toast.duration}
                position="top-left"
                onClose={() => removeToast(toast.id)}
              />
            </div>
          ))}
        </div>
        
        {/* 底部提示 */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 space-y-2">
          {toasts.filter(t => t.position === 'bottom-center').map(toast => (
            <div key={toast.id} className="pointer-events-auto">
              <Toast
                type={toast.type}
                title={toast.title}
                message={toast.message}
                duration={toast.duration}
                position="bottom-center"
                onClose={() => removeToast(toast.id)}
              />
            </div>
          ))}
        </div>
        
        <div className="absolute bottom-4 right-4 space-y-2">
          {toasts.filter(t => t.position === 'bottom-right').map(toast => (
            <div key={toast.id} className="pointer-events-auto">
              <Toast
                type={toast.type}
                title={toast.title}
                message={toast.message}
                duration={toast.duration}
                position="bottom-right"
                onClose={() => removeToast(toast.id)}
              />
            </div>
          ))}
        </div>
        
        <div className="absolute bottom-4 left-4 space-y-2">
          {toasts.filter(t => t.position === 'bottom-left').map(toast => (
            <div key={toast.id} className="pointer-events-auto">
              <Toast
                type={toast.type}
                title={toast.title}
                message={toast.message}
                duration={toast.duration}
                position="bottom-left"
                onClose={() => removeToast(toast.id)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* 确认对话框 */}
      {confirm && (
        <ConfirmDialog
          isOpen={true}
          onClose={closeConfirm}
          onConfirm={handleConfirm}
          title={confirm.title}
          message={confirm.message}
          type={confirm.type}
          confirmText={confirm.confirmText}
          cancelText={confirm.cancelText}
          confirmButtonClass={confirm.confirmButtonClass}
          cancelButtonClass={confirm.cancelButtonClass}
        />
      )}
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};