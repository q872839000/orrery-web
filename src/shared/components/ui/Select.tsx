import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { THEME } from '../../styles/theme';

export interface SelectOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
  /** 辅助说明（选项副行） */
  desc?: string;
  /** 分组名（相同分组名的连续选项渲染在同一个分组标题下；无分组的不带标题） */
  group?: string;
}

interface SelectProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** 紧凑模式（表格行内等场景） */
  compact?: boolean;
}

const DROPDOWN_GAP = 6;
const DROPDOWN_MAX_H = 256; // 与 max-h-64 一致

interface DropdownPos {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
}

/**
 * 自定义下拉选择器：原生 select 的弹出列表在 Windows 上是系统渲染不可定制，
 * 全站统一改用此组件（按钮 + 浮层选项）。
 *
 * 浮层通过 portal 挂到 body 并以 fixed 定位跟随按钮：卡片容器上的
 * backdrop-blur / overflow 会创建独立层叠上下文并裁剪后代，若浮层留在卡片
 * 内部，z-index 再高也会被后续卡片遮挡（审计日志页下拉只剩一项高度即此因）。
 */
export function Select<T extends string = string>({ value, onChange, options, placeholder = '请选择', className = '', disabled, compact }: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<DropdownPos | null>(null);

  // 打开时定位浮层，并在滚动 / 窗口变化时跟随（capture 以覆盖任意滚动容器）
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const el = rootRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom - DROPDOWN_GAP;
      const openUp = spaceBelow < DROPDOWN_MAX_H && r.top - DROPDOWN_GAP > spaceBelow;
      setPos(openUp
        ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + DROPDOWN_GAP }
        : { left: r.left, width: r.width, top: r.bottom + DROPDOWN_GAP });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      // 浮层在 portal 中，必须一并判定，否则 mousedown 先关闭导致 click 丢失
      if (rootRef.current?.contains(t) || dropdownRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = options.find(o => o.value === value);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        className={`${compact
          ? 'w-full rounded-lg border border-neutral-200/70 bg-white/88 px-2.5 py-1.5 text-[12px] font-medium'
          : `${THEME.input} cursor-pointer`
        } flex items-center justify-between gap-2 text-left transition-all hover:border-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <span className={`min-w-0 flex-1 truncate ${current ? '' : 'text-neutral-400'}`}>
          {current ? current.label : placeholder}
        </span>
        <ChevronDown size={14} className={`flex-shrink-0 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && pos && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: 'fixed', left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}
          className={`${THEME.dropdown} z-[100] max-h-64 overflow-y-auto p-1.5`}
        >
          {options.map((opt, i) => {
            const active = opt.value === value;
            const groupHeader = opt.group && (i === 0 || options[i - 1].group !== opt.group);
            return (
              <React.Fragment key={opt.value}>
                {groupHeader && (
                  <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                    {opt.group}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] font-medium transition-colors ${
                    active ? 'bg-black text-white' : 'text-neutral-600 hover:bg-neutral-100'
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{opt.label}</span>
                    {opt.desc && <span className={`block truncate text-[11px] ${active ? 'text-white/60' : 'text-neutral-400'}`}>{opt.desc}</span>}
                  </span>
                  {active && <Check size={13} className="flex-shrink-0" />}
                </button>
              </React.Fragment>
            );
          })}
          {options.length === 0 && <div className="px-3 py-4 text-center text-xs text-neutral-400">暂无可选项</div>}
        </div>,
        document.body
      )}
    </div>
  );
}

export default Select;
