import React, { useMemo } from 'react';
import DOMPurify from 'dompurify';

/**
 * chunk 内容渲染（知识库域统一）。
 *
 * 引擎分块中表格以 HTML（MinerU table_html）保真存储，blockType=table 的子块与
 * 内嵌表格的父块都可能携带 <table> 标签。含表格时经 DOMPurify 白名单消毒后按
 * HTML 渲染（容器 whitespace-pre-wrap 保留文本节点换行）；纯文本原样渲染。
 */

/** 内容中是否含表格 HTML（MinerU 表格块标志） */
const TABLE_HTML_RE = /<table[\s>]/i;

/** 消毒白名单：表格结构 + 基础行内文本标签（chunk 内容不需要更多） */
const ALLOWED_TAGS = [
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
  'br', 'p', 'span', 'div', 'b', 'strong', 'i', 'em', 'u', 'sup', 'sub',
];
const ALLOWED_ATTR = ['colspan', 'rowspan', 'align', 'valign'];

const BASE_CLASS = 'whitespace-pre-wrap text-[13px] font-medium leading-relaxed text-neutral-700';

const ChunkContent: React.FC<{ content?: string | null; className?: string }> = ({ content, className }) => {
  const sanitized = useMemo(() => {
    if (!content || !TABLE_HTML_RE.test(content)) {
      return null;
    }
    return DOMPurify.sanitize(content, { ALLOWED_TAGS, ALLOWED_ATTR });
  }, [content]);

  if (sanitized == null) {
    return <p className={`${BASE_CLASS}${className ? ` ${className}` : ''}`}>{content}</p>;
  }
  return (
    <div
      className={`chunk-rich ${BASE_CLASS}${className ? ` ${className}` : ''}`}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
};

export default ChunkContent;
