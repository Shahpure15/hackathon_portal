import React from 'react';
import { Search, X } from 'lucide-react';
import './uikit.css';

export default function FilterBar({
  searchValue = '',
  onSearchChange,
  searchPlaceholder = 'Search...',
  dropdowns = [],
  activeFilters = [],
  onRemoveFilter,
  onClearAll,
  children,
}) {
  return (
    <div className="ui-filter-bar">
      <div className="ui-filter-bar-main">
        {onSearchChange && (
          <div className="ui-filter-search-wrap">
            <Search size={16} style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="ui-filter-search-input"
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            {searchValue && (
              <button
                type="button"
                className="ui-filter-tag-close"
                onClick={() => onSearchChange('')}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}

        {dropdowns.length > 0 && (
          <div className="ui-filter-dropdowns">
            {dropdowns.map((d) => (
              <select
                key={d.id}
                className="ui-filter-select"
                value={d.value}
                onChange={(e) => d.onChange(e.target.value)}
                aria-label={d.label}
              >
                {d.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ))}
          </div>
        )}

        {children}
      </div>

      {activeFilters.length > 0 && (
        <div className="ui-filter-tags-row">
          {activeFilters.map((f) => (
            <span key={f.id} className="ui-filter-tag">
              <span>{f.label}</span>
              {onRemoveFilter && (
                <button
                  type="button"
                  className="ui-filter-tag-close"
                  onClick={() => onRemoveFilter(f.id)}
                  aria-label={`Remove filter ${f.label}`}
                >
                  <X size={12} />
                </button>
              )}
            </span>
          ))}
          {onClearAll && (
            <button
              type="button"
              className="ui-filter-clear-all"
              onClick={onClearAll}
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
