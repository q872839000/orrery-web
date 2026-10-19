import React from 'react';
import { Check } from 'lucide-react';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  title?: string;
  label?: React.ReactNode;
}

/** 复选框（替代原生 input[type=checkbox]，全站统一视觉） */
export const Checkbox: React.FC<CheckboxProps> = ({ checked, onChange, disabled, title, label }) => {
  const box = (
    <span
      className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[5px] border transition-all ${
        checked ? 'border-black bg-black text-white' : 'border-neutral-300 bg-white/80'
      } ${disabled ? 'opacity-40' : 'group-hover:border-neutral-500'}`}
    >
      {checked && <Check size={11} strokeWidth={3.5} />}
    </span>
  );
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      title={title}
      disabled={disabled}
      onClick={e => { e.stopPropagation(); onChange(!checked); }}
      className={`group inline-flex items-center gap-2 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {box}
      {label != null && <span className="text-[12px] font-bold text-neutral-600">{label}</span>}
    </button>
  );
};

export default Checkbox;
