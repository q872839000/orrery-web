import React from 'react';
/**
 * 徽章色调（配合 THEME.badgeBase 使用；通道/状态元数据引用这些 key）。
 */
import { THEME } from '../../styles/theme';

export type BadgeTone =
  | 'neutral' | 'info' | 'success' | 'error' | 'warning'
  | 'purple' | 'blue' | 'amber' | 'teal' | 'black';

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-neutral-100 text-neutral-500',
  info: 'bg-sky-50 text-sky-600',
  success: 'bg-green-50 text-green-600',
  error: 'bg-red-50 text-red-600',
  warning: 'bg-amber-50 text-amber-600',
  purple: 'bg-violet-50 text-violet-600',
  blue: 'bg-blue-50 text-blue-600',
  amber: 'bg-amber-50 text-amber-700',
  teal: 'bg-teal-50 text-teal-600',
  black: 'bg-black text-white',
};

interface BadgeProps {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}

/** 通用徽章（状态/通道/角色/类型标签统一入口） */
export const Badge: React.FC<BadgeProps> = ({ tone = 'neutral', children, className = '' }) => (
  <span className={`${THEME.badgeBase} ${TONE_CLASSES[tone]} ${className}`}>{children}</span>
);

export default Badge;
