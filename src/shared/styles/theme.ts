// Color System - Design Tokens
export const COLORS = {
  primary: {
    50: '#f5f3ff',
    100: '#ede9fe',
    200: '#ddd6fe',
    300: '#c4b5fd',
    400: '#a78bfa',
    500: '#8b5cf6',
    600: '#7c3aed',
    700: '#6d28d9',
    800: '#5b21b6',
    900: '#4c1d95',
  },
  neutral: {
    50: '#fafafa',
    100: '#f5f5f5',
    200: '#e5e5e5',
    300: '#d4d4d4',
    400: '#a3a3a3',
    500: '#737373',
    600: '#525252',
    700: '#404040',
    800: '#262626',
    900: '#171717',
    950: '#0a0a0a',
  },
  status: {
    success: '#10b981',
    successLight: '#d1fae5',
    error: '#ef4444',
    errorLight: '#fee2e2',
    warning: '#f59e0b',
    warningLight: '#fef3c7',
    info: '#3b82f6',
    infoLight: '#dbeafe',
  },
  semantic: {
    blue: '#3b82f6',
    blueLight: '#eff6ff',
    purple: '#8b5cf6',
    purpleLight: '#f5f3ff',
    emerald: '#10b981',
    emeraldLight: '#d1fae5',
    amber: '#f59e0b',
    amberLight: '#fef3c7',
    rose: '#f43f5e',
    roseLight: '#ffe4e6',
    indigo: '#6366f1',
    indigoLight: '#e0e7ff',
    teal: '#14b8a6',
    tealLight: '#ccfbf1',
    sky: '#0ea5e9',
    skyLight: '#e0f2fe',
  }
};

export const THEME = {
  // 毛玻璃效果 - 增强版
  glass: "bg-white/80 backdrop-blur-xl border border-white/30 shadow-xl",
  glassStrong: "bg-white/70 backdrop-blur-2xl border border-white/40 shadow-2xl",
  glassLight: "bg-white/60 backdrop-blur-lg border border-white/20 shadow-lg",
  glassPanel:
    "bg-white/32 backdrop-blur-[40px] saturate-[150%] border border-white/45 shadow-[0_4px_20px_0_rgba(0,0,0,0.02),0_24px_56px_-24px_rgba(0,0,0,0.10)]",

  // 卡片样式 - 增强毛玻璃效果
  card: "bg-white/92 backdrop-blur-md border border-neutral-200/70 rounded-2xl shadow-[0_8px_24px_-12px_rgba(0,0,0,0.12)]",
  cardGlass: "bg-white/60 backdrop-blur-xl border border-white/40 rounded-2xl shadow-[0_8px_32px_-8px_rgba(0,0,0,0.15)]",
  cardHover: "hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300",

  label: "text-[11px] font-semibold text-neutral-500 uppercase tracking-wide",
  // 注意：token 不含宽度。宽度由使用处决定（补 w-full 或 w-52 等固定宽度），
  // 否则 w-full 会与固定宽度类冲突且因样式表顺序恒定胜出（Tailwind 同属性工具类按生成顺序覆盖）
  input:
    "bg-white/88 rounded-xl px-3 py-2 text-[13px] border border-neutral-200/70 focus:outline-none focus:ring-2 focus:ring-black/8 focus:border-neutral-300 transition-all shadow-sm",
  inputGlass:
    "bg-white/60 backdrop-blur-md rounded-xl px-3 py-2 text-[13px] border border-white/40 focus:outline-none focus:ring-2 focus:ring-black/8 focus:bg-white/80 transition-all shadow-sm",
  searchInput:
    "w-full bg-white/88 rounded-xl px-3 py-2 pl-11 text-[13px] border border-neutral-200/70 focus:outline-none focus:ring-2 focus:ring-black/8 focus:border-neutral-300 transition-all shadow-sm",
  searchInputGlass:
    "w-full bg-white/50 backdrop-blur-md rounded-xl px-3 py-2 pl-11 text-[13px] border border-white/40 focus:outline-none focus:ring-2 focus:ring-black/8 focus:bg-white/80 transition-all shadow-sm",
  chatInput:
    "min-h-[56px] max-h-40 w-full resize-none rounded-[24px] bg-[#F4F4F7] py-4 pl-5 pr-14 text-sm font-medium shadow-inner transition-all focus:outline-none focus:ring-2 focus:ring-black/5",
  select:
    "w-full bg-white/88 rounded-xl px-3 py-2.5 pr-10 text-[13px] font-medium border border-neutral-200/70 focus:outline-none focus:ring-2 focus:ring-black/8 focus:border-neutral-300 transition-all shadow-sm cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%23737373%22%20d%3D%22M10.293%203.293L6%207.586%201.707%203.293A1%201%200%2000.293%204.707l5%205a1%201%200%20001.414%200l5-5a1%201%200%2010-1.414-1.414z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat hover:border-neutral-300 hover:shadow-md",
  selectGlass:
    "w-full bg-white/60 backdrop-blur-md rounded-xl px-3 py-2.5 pr-10 text-[13px] font-medium border border-white/40 focus:outline-none focus:ring-2 focus:ring-black/8 focus:bg-white/80 transition-all shadow-sm cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%23737373%22%20d%3D%22M10.293%203.293L6%207.586%201.707%203.293A1%201%200%2000.293%204.707l5%205a1%201%200%20001.414%200l5-5a1%201%200%2010-1.414-1.414z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat hover:bg-white/70",
  dropdown:
    "rounded-2xl bg-white/92 backdrop-blur-xl border border-white/40 shadow-2xl shadow-black/10",
  buttonIcon:
    "w-9 h-9 flex items-center justify-center rounded-xl hover:bg-black/5 text-neutral-500 hover:text-black transition-all",
  buttonIconGlass:
    "w-9 h-9 flex items-center justify-center rounded-xl hover:bg-white/40 backdrop-blur-sm text-neutral-500 hover:text-black transition-all border border-white/20",
  button: {
    primary: "inline-flex items-center justify-center gap-1.5 whitespace-nowrap flex-shrink-0 px-4 py-2.5 text-xs font-black bg-black text-white rounded-[14px] hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all",
    secondary: "inline-flex items-center justify-center gap-1.5 whitespace-nowrap flex-shrink-0 px-4 py-2.5 text-xs font-black bg-neutral-50 border border-neutral-100 rounded-[14px] hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all",
    danger: "inline-flex items-center justify-center gap-1.5 whitespace-nowrap flex-shrink-0 px-4 py-2.5 text-xs font-black bg-red-500 text-white rounded-[14px] hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all",
    large: "w-full py-3.5 bg-black text-white rounded-2xl font-bold text-sm hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 whitespace-nowrap",
    glass: "inline-flex items-center justify-center gap-1.5 whitespace-nowrap flex-shrink-0 px-4 py-2.5 text-xs font-black bg-white/60 backdrop-blur-md border border-white/40 rounded-[14px] hover:bg-white/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm",
  },
  pagination: {
    button: "w-9 h-9 flex items-center justify-center rounded-xl border border-neutral-100 bg-white shadow-sm disabled:opacity-20 hover:bg-black hover:text-white transition-all active:scale-90",
    active: "bg-black text-white shadow-xl shadow-black/20",
    inactive: "hover:bg-neutral-50 text-neutral-400",
    info: "text-neutral-300 font-bold bg-neutral-50 px-3 py-1.5 rounded-xl border border-neutral-100",
  },
  searchWrapper: "relative w-full group",
  searchIcon: "pointer-events-none absolute left-4 sm:left-5 top-1/2 z-10 -translate-y-1/2 text-neutral-300 group-focus-within:text-black transition-colors w-3.5 h-3.5 sm:w-4 sm:h-4",
  badge: {
    success: "px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-widest bg-green-50 text-green-600 hover:bg-green-100 transition-all",
    inactive: "px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-widest bg-neutral-100 text-neutral-400 hover:bg-neutral-200 transition-all",
  },
  scrollbar: "custom-scrollbar pr-1 overflow-y-auto",
  page: "space-y-4 max-w-[1400px] mx-auto",
  pageHeader: "flex flex-col gap-2 md:flex-row md:items-start md:justify-between",
  pageTitle: "text-xl font-bold tracking-tight text-neutral-950",
  pageDesc: "text-[13px] text-neutral-500 font-medium",

  // 弹层（Modal / Drawer 共用遮罩）
  overlay: "fixed inset-0 z-50 bg-black/30 backdrop-blur-sm",
  modal: "relative w-full rounded-[24px] border border-white/50 bg-white/95 p-6 shadow-2xl backdrop-blur-xl",
  drawer: "relative ml-auto h-full w-full bg-white/95 backdrop-blur-xl border-l border-white/50 shadow-2xl flex flex-col",

  // 页签
  tabs: "flex items-center gap-1 rounded-2xl border border-neutral-100 bg-white/60 p-1 backdrop-blur-sm",
  tab: "flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-bold text-neutral-500 transition-all hover:text-black",
  tabActive: "bg-black text-white shadow-lg shadow-black/10 hover:text-white",

  // 分段选择器（检索模式等）
  segment: "inline-flex items-center gap-1 rounded-2xl border border-neutral-100 bg-neutral-50/80 p-1",
  segmentItem: "rounded-xl px-3.5 py-1.5 text-xs font-bold text-neutral-500 transition-all hover:text-black",
  segmentItemActive: "bg-white text-black shadow-md",

  // 徽章（状态/通道/角色等）；配合 BADGE_TONES 使用
  badgeBase: "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider",

  // 空态
  empty: "flex flex-col items-center justify-center gap-3 py-16 text-center",
  emptyIcon: "flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-300",
  emptyTitle: "text-sm font-bold text-neutral-500",
  emptyDesc: "max-w-sm text-xs font-medium leading-relaxed text-neutral-400",

  // 表格
  table: "w-full text-left text-[13px]",
  tableHead: "border-b border-neutral-100 text-[11px] font-semibold uppercase tracking-wider text-neutral-400",
  tableRow: "border-b border-neutral-50 transition-colors hover:bg-neutral-50/60",
  tableCell: "px-4 py-3 align-middle",
};

export default THEME;
