/**
 * Pagination —— 增强分页
 * 手机端紧凑模式：上一页 / 第x页 / 下一页
 * 桌面端完整模式：首页 / 页码 / 末页 + 总数
 */
import React from 'react';

interface PaginationProps {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({ page, total, pageSize, onPageChange }) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;

  const go = (p: number) => {
    if (p >= 1 && p <= totalPages && p !== page) onPageChange(p);
  };

  // 生成页码序列：1 ... 3 4 [5] 6 7 ... 12
  const pages: (number | '...')[] = [];
  const showAll = totalPages <= 7;
  if (showAll) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  return (
    <div className="admin-pagination">
      <div className="admin-pagination__mobile">
        <button
          className="btn btn--secondary btn--sm"
          disabled={page <= 1}
          onClick={() => go(page - 1)}
        >
          ← 上一页
        </button>
        <span className="admin-pagination__info">第 {page} / {totalPages} 页 · 共 {total} 条</span>
        <button
          className="btn btn--secondary btn--sm"
          disabled={page >= totalPages}
          onClick={() => go(page + 1)}
        >
          下一页 →
        </button>
      </div>
      <div className="admin-pagination__desktop">
        <button className="btn btn--secondary btn--sm" disabled={page <= 1} onClick={() => go(1)}>
          首页
        </button>
        <button className="btn btn--secondary btn--sm" disabled={page <= 1} onClick={() => go(page - 1)}>
          ←
        </button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`e${i}`} className="admin-pagination__ellipsis">…</span>
          ) : (
            <button
              key={p}
              className={`admin-pagination__num ${p === page ? 'admin-pagination__num--active' : ''}`}
              onClick={() => go(p)}
            >
              {p}
            </button>
          )
        )}
        <button className="btn btn--secondary btn--sm" disabled={page >= totalPages} onClick={() => go(page + 1)}>
          →
        </button>
        <button className="btn btn--secondary btn--sm" disabled={page >= totalPages} onClick={() => go(totalPages)}>
          末页
        </button>
        <span className="admin-pagination__info">共 {total} 条</span>
      </div>
    </div>
  );
};

export default Pagination;
