import React from 'react';

interface SwitchProps {
  on: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
  title?: string;
}

/** 开关（行内即时生效场景） */
export const Switch: React.FC<SwitchProps> = ({ on, onChange, disabled, title }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    title={title}
    disabled={disabled}
    onClick={e => { e.stopPropagation(); onChange(!on); }}
    className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200 ${
      on ? 'bg-black' : 'bg-neutral-200'
    } ${disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
  >
    <span className={`absolute left-[2px] top-[2px] h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
      on ? 'translate-x-[16px]' : ''
    }`} />
  </button>
);

export default Switch;
