import React from 'react';
import { docIconMeta, type DocIconKind } from '../utils/docIcon';

interface DocTypeIconProps {
  /** 文档显示名（优先取它的扩展名） */
  name?: string | null;
  /** 文件存储 key（重命名去掉扩展名时的兜底） */
  fileKey?: string | null;
  /** 渲染尺寸（px），默认 18 */
  size?: number;
}

/** 类型专属前景标记：字母（W/X/P）、色带（PDF）、符号（M↓ / 文本线 / </>） */
const Foreground: React.FC<{ kind: DocIconKind; color: string }> = ({ kind, color }) => {
  switch (kind) {
    case 'pdf':
      return (
        <>
          <rect x={4.5} y={12.8} width={15} height={5.6} rx={1.4} fill={color} />
          <text x={12} y={17.2} textAnchor="middle" fontSize={5} fontWeight={800} fill="#fff" letterSpacing={0.4}>PDF</text>
        </>
      );
    case 'word':
      return (
        <>
          <path d="M8 6.8h3.5M8 9.4h8" stroke={color} strokeWidth={1.1} strokeLinecap="round" opacity={0.35} />
          <text x={12} y={17.8} textAnchor="middle" fontSize={10} fontWeight={900} fill={color}>W</text>
        </>
      );
    case 'excel':
      return (
        <>
          <path d="M8 6.8h3.5M8 9.4h8" stroke={color} strokeWidth={1.1} strokeLinecap="round" opacity={0.35} />
          <text x={12} y={17.8} textAnchor="middle" fontSize={10} fontWeight={900} fill={color}>X</text>
        </>
      );
    case 'ppt':
      return (
        <>
          <path d="M8 6.8h3.5M8 9.4h8" stroke={color} strokeWidth={1.1} strokeLinecap="round" opacity={0.35} />
          <text x={12} y={17.8} textAnchor="middle" fontSize={10} fontWeight={900} fill={color}>P</text>
        </>
      );
    case 'markdown':
      return (
        <>
          <path d="M8 7h5.5" stroke={color} strokeWidth={1.1} strokeLinecap="round" opacity={0.35} />
          <text x={12} y={17.4} textAnchor="middle" fontSize={8.5} fontWeight={900} fill={color}>M↓</text>
        </>
      );
    case 'text':
      return <path d="M8 8.2h8M8 11.6h8M8 15h5" stroke={color} strokeWidth={1.2} strokeLinecap="round" />;
    case 'html':
      return (
        <path
          d="M10.2 9.4 7.2 12.4l3 3M13.8 9.4l3 3-3 3M13 9.2l-2 6.4"
          stroke={color} strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" fill="none"
        />
      );
    default:
      return null;
  }
};

/**
 * 文档类型图标：文件页 + 折角基底，类型专属前景标记与颜色双重区分。
 * 内联 SVG 手绘风格对齐常见文件图标库，无外部资源/版权依赖。
 */
const DocTypeIcon: React.FC<DocTypeIconProps> = ({ name, fileKey, size = 18 }) => {
  const meta = docIconMeta(name, fileKey);
  return (
    <span title={meta.label} className="inline-flex flex-shrink-0 select-none">
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M7 2.5h7l4.5 4.5V19a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 19V5A2.5 2.5 0 0 1 7 2.5Z"
          fill={meta.tint} stroke={meta.color} strokeWidth={1.4} strokeLinejoin="round"
        />
        <path d="M14 2.5V7h4.5Z" fill="#fff" stroke={meta.color} strokeWidth={1.4} strokeLinejoin="round" />
        <Foreground kind={meta.kind} color={meta.color} />
      </svg>
    </span>
  );
};

export default DocTypeIcon;
