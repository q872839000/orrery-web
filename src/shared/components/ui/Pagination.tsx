import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { THEME } from '../../styles/theme';

interface PaginationProps {
  page: number;
  total: number;
  size: number;
  onChange: (page: number) => void;
  className?: string;
}

/** 分页条（沿用 THEME.pagination token；页码窗口 ±2） */
export const Pagination: React.FC<PaginationProps> = ({ page, total, size, onChange, className = '' }) => {
  const totalPage = Math.max(1, Math.ceil(total / size));
  if (totalPage <= 1) return null;

  const windowStart = Math.max(1, Math.min(page - 2, totalPage - 4));
  const pages = Array.from({ length: Math.min(5, totalPage) }, (_, i) => windowStart + i);

  return (
    <div className={`flex items-center justify-center gap-1.5 ${className}`}>
      <button
        className={THEME.pagination.button}
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        title="上一页"
        aria-label="上一页"
      >
        <ChevronLeft size={14} />
      </button>
      {pages.map(p => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`${THEME.pagination.button} ${p === page ? THEME.pagination.active : THEME.pagination.inactive}`}
        >
          {p}
        </button>
      ))}
      <button
        className={THEME.pagination.button}
        disabled={page >= totalPage}
        onClick={() => onChange(page + 1)}
        title="下一页"
        aria-label="下一页"
      >
        <ChevronRight size={14} />
      </button>
      <span className={THEME.pagination.info}>共 {total} 条</span>
    </div>
  );
};

export default Pagination;
