import React from 'react';

interface RadioProps {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}

/** 单选圆点（列表行内单选，如"默认模型"列） */
export const Radio: React.FC<RadioProps> = ({ on, onClick, disabled, title }) => (
  <button
    type="button"
    role="radio"
    aria-checked={on}
    disabled={disabled}
    onClick={e => { e.stopPropagation(); onClick(); }}
    title={title}
    className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border transition-all ${
      on ? 'border-black' : 'border-neutral-300 hover:border-neutral-500'
    } ${disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
  >
    {on && <span className="h-2 w-2 rounded-full bg-black" />}
  </button>
);

export default Radio;
