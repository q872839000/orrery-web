import React from 'react';
import { THEME } from '../../styles/theme';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  desc?: string;
  /** 引导动作（如"去配置"按钮） */
  action?: React.ReactNode;
}

/** 空态/引导态统一组件（无本体/无图谱/无条目等场景） */
export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, desc, action }) => (
  <div className={THEME.empty}>
    {icon && <div className={THEME.emptyIcon}>{icon}</div>}
    <div className={THEME.emptyTitle}>{title}</div>
    {desc && <div className={THEME.emptyDesc}>{desc}</div>}
    {action}
  </div>
);

export default EmptyState;
