import React from 'react';
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react';

const DataTable = ({
  columns,
  data,
  page = 1,
  pages = 1,
  totalCount = 0,
  onPageChange,
  sortKey,
  sortDir,
  onSortChange,
  loading = false,
  emptyState,
  hideTopPagination = false
}) => {
  const handleHeaderClick = (col) => {
    if (!col.sortable || !onSortChange) return;
    const newDir = sortKey === col.accessor && sortDir === 'asc' ? 'desc' : 'asc';
    onSortChange(col.accessor, newDir);
  };

  const renderPagination = (isTop = false) => {
    if (pages <= 1) return null;
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: isTop ? '16px' : '0',
        marginTop: isTop ? '0' : '24px', 
        flexWrap: 'wrap', 
        gap: '12px' 
      }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {isTop ? (
            <>Found <strong style={{ color: 'var(--text)' }}>{totalCount}</strong> records. Showing page {page} of {pages}.</>
          ) : (
            <>Showing page {page} of {pages}</>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => onPageChange(Math.max(page - 1, 1))}
            disabled={page === 1}
            className="btn btn-secondary"
            style={{ padding: '6px 10px', minHeight: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Page {page} / {pages}</span>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(page + 1, pages))}
            disabled={page === pages}
            className="btn btn-secondary"
            style={{ padding: '6px 10px', minHeight: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div>
      {!hideTopPagination && renderPagination(true)}

      <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <span className="spinner" style={{ width: '40px', height: '40px', margin: '0 auto' }}></span>
            <p style={{ marginTop: '16px', color: 'var(--text-secondary)' }}>Loading data...</p>
          </div>
        ) : !data || data.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
            {emptyState || <p>No records found.</p>}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-light)', background: 'rgba(255,255,255,0.01)' }}>
                  {columns.map((col, idx) => (
                    <th
                      key={idx}
                      onClick={() => handleHeaderClick(col)}
                      style={{
                        padding: '16px 24px',
                        fontSize: '0.8rem',
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        cursor: col.sortable ? 'pointer' : 'default',
                        userSelect: 'none',
                        width: col.width || 'auto',
                        textAlign: col.align || 'left'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: col.align === 'right' ? 'flex-end' : 'flex-start' }}>
                        <span>{col.header}</span>
                        {col.sortable && (
                          <div style={{ display: 'flex', flexDirection: 'column', color: sortKey === col.accessor ? 'var(--primary)' : 'var(--text-muted)', opacity: sortKey === col.accessor ? 1 : 0.4 }}>
                            {sortKey === col.accessor && sortDir === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                          </div>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, rowIdx) => (
                  <tr key={row.id || rowIdx} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    {columns.map((col, colIdx) => (
                      <td
                        key={colIdx}
                        style={{
                          padding: col.padding || '20px 24px',
                          textAlign: col.align || 'left'
                        }}
                      >
                        {col.render ? col.render(row) : row[col.accessor]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!hideTopPagination && renderPagination(false)}
    </div>
  );
};

export default DataTable;
