import { THEME } from '../../styles/theme';

interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string; title?: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** 分段选择器（检索模式等小集合单选统一组件） */
export function SegmentedControl<T extends string>({ options, value, onChange, className = '' }: SegmentedControlProps<T>) {
  return (
    <div className={`${THEME.segment} ${className}`}>
      {options.map(opt => (
        <button
          key={opt.value}
          title={opt.title}
          onClick={() => onChange(opt.value)}
          className={`${THEME.segmentItem} ${value === opt.value ? THEME.segmentItemActive : ''}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default SegmentedControl;
