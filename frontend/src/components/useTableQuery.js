import { useState } from 'react';

export const useTableQuery = (defaultSortKey = '', defaultSortDir = 'asc') => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState(defaultSortKey);
  const [sortDir, setSortDir] = useState(defaultSortDir);
  const [filters, setFilters] = useState({});

  const handlePageChange = (newPage) => {
    setPage(newPage);
  };

  const handleSortChange = (key, dir) => {
    setSortKey(key);
    setSortDir(dir);
    setPage(1);
  };

  const handleFilterChange = (filterKey, value) => {
    setFilters(prev => ({
      ...prev,
      [filterKey]: value
    }));
    setPage(1);
  };

  const clearFilters = () => {
    setSearch('');
    setFilters({});
    setPage(1);
  };

  return {
    page,
    setPage: handlePageChange,
    search,
    setSearch: (val) => { setSearch(val); setPage(1); },
    sortKey,
    sortDir,
    onSortChange: handleSortChange,
    filters,
    onFilterChange: handleFilterChange,
    clearFilters
  };
};

export default useTableQuery;
