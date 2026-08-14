import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-react';

const DataTable = ({
  columns,
  data = [],
  page = 1,
  pages = 1,
  totalCount = 0,
  onPageChange,
  sortKey: propSortKey,
  sortDir: propSortDir,
  onSortChange,
  loading = false,
  emptyState,
  hideTopPagination = false
}) => {
  const [internalSortKey, setInternalSortKey] = useState(propSortKey || '');
  const [internalSortDir, setInternalSortDir] = useState(propSortDir || 'asc');

  const currentSortKey = propSortKey !== undefined && propSortKey !== '' ? propSortKey : internalSortKey;
  const currentSortDir = propSortDir !== undefined && propSortDir !== '' ? propSortDir : internalSortDir;

  const isColSortable = (col) => {
    if (col.sortable === false) return false;
    if (!col.accessor || col.accessor === 'checkbox' || col.accessor === 'actions') return false;
    return true;
  };

  const handleHeaderClick = (col) => {
    if (!isColSortable(col)) return;
    const nextDir = currentSortKey === col.accessor && currentSortDir === 'asc' ? 'desc' : 'asc';
    
    if (onSortChange) {
      onSortChange(col.accessor, nextDir);
    }
    setInternalSortKey(col.accessor);
    setInternalSortDir(nextDir);
  };

  const getSortValue = (item, accessor) => {
    if (!item || !accessor) return '';
    const val = item[accessor];
    if (val === null || val === undefined) return '';
    if (typeof val === 'number') return val;
    if (typeof val === 'boolean') return val ? 1 : 0;
    return String(val).toLowerCase();
  };

  const sortedData = React.useMemo(() => {
    if (!currentSortKey || !data || data.length === 0) return data;
    return [...data].sort((a, b) => {
      const valA = getSortValue(a, currentSortKey);
      const valB = getSortValue(b, currentSortKey);
      if (valA < valB) return currentSortDir === 'asc' ? -1 : 1;
      if (valA > valB) return currentSortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, currentSortKey, currentSortDir]);

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
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-light)', background: 'rgba(255,255,255,0.01)' }}>
                  {columns.map((col, idx) => (
                    <th
                      key={idx}
                      style={{
                        padding: '16px 24px',
                        fontSize: '0.8rem',
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        width: col.width || 'auto',
                        textAlign: col.align || 'left'
                      }}
                    >
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...Array(5)].map((_, rowIdx) => (
                  <tr key={rowIdx} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    {columns.map((col, colIdx) => (
                      <td
                        key={colIdx}
                        style={{
                          padding: col.padding || '20px 24px',
                          textAlign: col.align || 'left'
                        }}
                      >
                        <div 
                          className="skeleton" 
                          style={{ 
                            height: '18px', 
                            borderRadius: '4px', 
                            width: colIdx === 0 ? '70%' : colIdx === 1 ? '45%' : '80%',
                            maxWidth: '100%'
                          }}
                        ></div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !sortedData || sortedData.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
            {emptyState || <p>No records found.</p>}
          </div>
        ) : (
          <div style={{ overflowX: 'auto', transition: 'opacity 0.18s ease-out' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-light)', background: 'rgba(255,255,255,0.01)' }}>
                  {columns.map((col, idx) => {
                    const sortable = isColSortable(col);
                    const isActiveSort = currentSortKey === col.accessor;
                    return (
                      <th
                        key={idx}
                        onClick={() => handleHeaderClick(col)}
                        style={{
                          padding: '16px 24px',
                          fontSize: '0.8rem',
                          color: isActiveSort ? 'var(--primary)' : 'var(--text-muted)',
                          fontWeight: isActiveSort ? 700 : 600,
                          textTransform: 'uppercase',
                          cursor: sortable ? 'pointer' : 'default',
                          userSelect: 'none',
                          width: col.width || 'auto',
                          textAlign: col.align || 'left',
                          transition: 'color 0.15s ease'
                        }}
                        title={sortable ? `Click to sort by ${col.header}` : undefined}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: col.align === 'right' ? 'flex-end' : 'flex-start' }}>
                          <span>{col.header}</span>
                          {sortable && (
                            <div style={{ display: 'inline-flex', alignItems: 'center', color: isActiveSort ? 'var(--primary)' : 'var(--text-muted)', opacity: isActiveSort ? 1 : 0.35 }}>
                              {isActiveSort ? (
                                currentSortDir === 'desc' ? <ChevronDown size={14} /> : <ChevronUp size={14} />
                              ) : (
                                <ArrowUpDown size={12} />
                              )}
                            </div>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sortedData.map((row, rowIdx) => (
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
