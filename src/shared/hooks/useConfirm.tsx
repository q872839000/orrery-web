import { useState, useCallback } from 'react';
import ConfirmDialog, { ConfirmType } from '../components/ui/ConfirmDialog';

interface ConfirmOptions {
  title?: string;
  message: string;
  type?: ConfirmType;
  confirmText?: string;
  cancelText?: string;
}

export const useConfirm = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({
    message: '',
  });
  const [resolveCallback, setResolveCallback] = useState<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    setOptions(opts);
    setIsOpen(true);

    return new Promise<boolean>((resolve) => {
      setResolveCallback(() => resolve);
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setIsOpen(false);
    if (resolveCallback) {
      resolveCallback(true);
      setResolveCallback(null);
    }
  }, [resolveCallback]);

  const handleCancel = useCallback(() => {
    setIsOpen(false);
    if (resolveCallback) {
      resolveCallback(false);
      setResolveCallback(null);
    }
  }, [resolveCallback]);

  const ConfirmDialogComponent = (
    <ConfirmDialog
      isOpen={isOpen}
      onClose={handleCancel}
      onConfirm={handleConfirm}
      title={options.title}
      message={options.message}
      type={options.type}
      confirmText={options.confirmText}
      cancelText={options.cancelText}
    />
  );

  return { confirm, ConfirmDialog: ConfirmDialogComponent };
};
