/**
 * 图谱/本体画布共享的浅色视觉常量（与全站米白毛玻璃风格统一）。
 * 节点用饱和的品牌色系 + 柔和辉光，保持"发光感"但落在浅色底上。
 */

/** 类型→颜色 稳定分配色板（浅色底上的高辨识色，12 色循环） */
export const TYPE_PALETTE = [
  '#7c3aed', // violet-600（品牌主色）
  '#0d9488', // teal-600
  '#0284c7', // sky-600
  '#db2777', // pink-600
  '#d97706', // amber-600
  '#65a30d', // lime-600
  '#dc2626', // red-600
  '#4f46e5', // indigo-600
  '#0891b2', // cyan-600
  '#c026d3', // fuchsia-600
  '#ea580c', // orange-600
  '#475569', // slate-600
] as const;

const SEMANTIC_COLORS: Record<string, string> = {
  '项目': '#7c3aed', '人员': '#3b82f6', '组织': '#0d9488', '技术': '#d97706',
  '数据库': '#0891b2', '算法': '#4f46e5', '文档': '#65a30d', '地点': '#db2777',
};

/** 字符串→色板下标（稳定 hash，同名同色） */
export const colorIndexOf = (name: string): number => {
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = ((h << 5) + h + name.charCodeAt(i)) >>> 0;
  return h % TYPE_PALETTE.length;
};

/** 类型名→颜色 */
export const colorOfType = (type?: string | null): string =>
  SEMANTIC_COLORS[type ?? ''] ?? TYPE_PALETTE[colorIndexOf(type || '未分类')];

/** 画布引擎配色（绘制用，浅色） */
export const CANVAS = {
  bg: '#f4f4f5',
  dot: 'rgba(23,23,23,0.07)',
  dotGrid: 24,
  edgeBase: '163,163,170',   // zinc-400（rgba 前缀）
  edgeDim: 0.4,
  edgeHl: 0.9,
  label: '#18181b',
  labelSub: '#52525b',
  labelMuted: '#a1a1aa',
  pillBg: 'rgba(255,255,255,0.94)',
  pillBorder: 'rgba(23,23,23,0.08)',
  focusRing: '#7c3aed',
  selectRing: '#7c3aed',
  cardFill: '#ffffff',
  cardStroke: 'rgba(23,23,23,0.1)',
  cardHover: 'rgba(124,58,237,0.5)',
  get fontFamily() {
    return typeof document === 'undefined' ? 'sans-serif' : getComputedStyle(document.body).fontFamily;
  },
} as const;

/** 浅色悬浮面板（画布内 UI） */
export const GLASS = {
  panel:
    'rounded-2xl border border-black/[0.06] bg-white/85 backdrop-blur-xl shadow-[0_10px_36px_rgba(0,0,0,0.12)]',
  panelSoft: 'rounded-xl border border-black/[0.05] bg-black/[0.025]',
  divider: 'border-black/[0.06]',
  text: 'text-neutral-800',
  text2: 'text-neutral-500',
  muted: 'text-neutral-400',
  iconBtn:
    'grid h-7 w-7 place-items-center rounded-lg border border-black/[0.07] bg-white/70 text-neutral-500 transition-colors hover:border-violet-300 hover:text-violet-700 disabled:opacity-35 disabled:hover:border-black/[0.07] disabled:hover:text-neutral-500',
  iconBtnActive:
    'grid h-7 w-7 place-items-center rounded-lg border border-violet-500/60 bg-violet-50 text-violet-600 transition-colors hover:border-violet-500',
  label: 'text-[10px] font-black uppercase tracking-wider text-neutral-400',
  input:
    'w-full rounded-xl border border-black/[0.07] bg-white/70 px-3 py-2 text-[12px] font-semibold text-neutral-800 outline-none transition-colors placeholder:text-neutral-400 focus:border-violet-400',
} as const;
