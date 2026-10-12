/**
 * 文档类型图标元数据：按扩展名给出图标种类、类型色与浅色底。
 * 图标为文件页造型 + 折角 + 类型专属标记（字母/符号/色带），
 * 形状与颜色双重区分（Word 蓝 W / Excel 绿 X / PPT 橙 P / PDF 红色带…），
 * 风格对齐常见的文件类型图标库，内联 SVG 无外部资源依赖。
 */

export type DocIconKind = 'pdf' | 'word' | 'excel' | 'ppt' | 'markdown' | 'text' | 'html' | 'file';

export interface DocIconMeta {
  kind: DocIconKind;
  /** 类型标签（title 悬浮提示） */
  label: string;
  /** 主色（描边 / 字母 / 色带） */
  color: string;
  /** 浅色底（文件页填充） */
  tint: string;
}

const META_BY_EXT: Record<string, DocIconMeta> = {
  pdf:  { kind: 'pdf',      label: 'PDF 文档',   color: '#dc2626', tint: '#fef2f2' },
  doc:  { kind: 'word',     label: 'Word 文档',  color: '#2563eb', tint: '#eff6ff' },
  docx: { kind: 'word',     label: 'Word 文档',  color: '#2563eb', tint: '#eff6ff' },
  xls:  { kind: 'excel',    label: 'Excel 表格', color: '#16a34a', tint: '#f0fdf4' },
  xlsx: { kind: 'excel',    label: 'Excel 表格', color: '#16a34a', tint: '#f0fdf4' },
  csv:  { kind: 'excel',    label: 'CSV 表格',   color: '#16a34a', tint: '#f0fdf4' },
  ppt:  { kind: 'ppt',      label: 'PPT 演示',   color: '#ea580c', tint: '#fff7ed' },
  pptx: { kind: 'ppt',      label: 'PPT 演示',   color: '#ea580c', tint: '#fff7ed' },
  md:   { kind: 'markdown', label: 'Markdown',   color: '#7c3aed', tint: '#f5f3ff' },
  txt:  { kind: 'text',     label: '文本文件',   color: '#737373', tint: '#fafafa' },
  html: { kind: 'html',     label: '网页文件',   color: '#0891b2', tint: '#ecfeff' },
  htm:  { kind: 'html',     label: '网页文件',   color: '#0891b2', tint: '#ecfeff' },
};

const DEFAULT_META: DocIconMeta = { kind: 'file', label: '文件', color: '#a3a3a3', tint: '#fafafa' };

const extOf = (name?: string | null): string | undefined =>
  name?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();

/** 文档类型图标：优先取显示名扩展名，退化为 fileKey（重命名可能去掉扩展名） */
export const docIconMeta = (name?: string | null, fileKey?: string | null): DocIconMeta =>
  META_BY_EXT[extOf(name) ?? ''] ?? META_BY_EXT[extOf(fileKey) ?? ''] ?? DEFAULT_META;
