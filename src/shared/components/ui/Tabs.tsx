import React from 'react';
import { THEME } from '../../styles/theme';

export interface TabItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  /** 角标（如 dirty 数、文档数） */
  badge?: React.ReactNode;
}

interface TabsProps {
  items: TabItem[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}

/** 页签栏（详情页功能分区统一组件） */
export const Tabs: React.FC<TabsProps> = ({ items, active, onChange, className = '' }) => (
  <div className={`${THEME.tabs} ${className}`}>
    {items.map(item => (
      <button
        key={item.key}
        onClick={() => onChange(item.key)}
        className={`${THEME.tab} ${active === item.key ? THEME.tabActive : ''}`}
      >
        {item.icon}
        <span>{item.label}</span>
        {item.badge}
      </button>
    ))}
  </div>
);

export default Tabs;
