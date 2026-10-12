import { useState, useEffect } from 'react';

export const useTableQuery = (defaultSortKey = '', defaultSortDir = 'asc', syncUrlKey = '') => {
  const getInitialParams = () => {
    if (typeof window === 'undefined' || !syncUrlKey) {
      return {
        page: 1,
        search: '',
        sortKey: defaultSortKey,
        sortDir: defaultSortDir,
        filters: {}
      };
    }
    const params = new URLSearchParams(window.location.search);
    const pageVal = parseInt(params.get(`${syncUrlKey}_page`)) || 1;
    const searchVal = params.get(`${syncUrlKey}_search`) || params.get('q') || '';
    const sortKeyVal = params.get(`${syncUrlKey}_sortKey`) || defaultSortKey;
    const sortDirVal = params.get(`${syncUrlKey}_sortDir`) || defaultSortDir;
    
    const filtersVal = {};
    params.forEach((val, key) => {
      if (key.startsWith(`${syncUrlKey}_filter_`)) {
        const filterName = key.replace(`${syncUrlKey}_filter_`, '');
        filtersVal[filterName] = val;
      }
    });

    return {
      page: pageVal,
      search: searchVal,
      sortKey: sortKeyVal,
      sortDir: sortDirVal,
      filters: filtersVal
    };
  };

  const initial = getInitialParams();

  const [page, setPage] = useState(initial.page);
  const [search, setSearch] = useState(initial.search);
  const [sortKey, setSortKey] = useState(initial.sortKey);
  const [sortDir, setSortDir] = useState(initial.sortDir);
  const [filters, setFilters] = useState(initial.filters);

  useEffect(() => {
    if (typeof window === 'undefined' || !syncUrlKey) return;
    const params = new URLSearchParams(window.location.search);
    
    if (page > 1) {
      params.set(`${syncUrlKey}_page`, String(page));
    } else {
      params.delete(`${syncUrlKey}_page`);
    }

    if (search) {
      params.set(`${syncUrlKey}_search`, search);
    } else {
      params.delete(`${syncUrlKey}_search`);
    }

    if (sortKey && sortKey !== defaultSortKey) {
      params.set(`${syncUrlKey}_sortKey`, sortKey);
    } else {
      params.delete(`${syncUrlKey}_sortKey`);
    }

    if (sortDir && sortDir !== defaultSortDir) {
      params.set(`${syncUrlKey}_sortDir`, sortDir);
    } else {
      params.delete(`${syncUrlKey}_sortDir`);
    }

    const keysToRemove = [];
    params.forEach((_, key) => {
      if (key.startsWith(`${syncUrlKey}_filter_`)) {
        keysToRemove.push(key);
      }
    });
    keysToRemove.forEach(k => params.delete(k));

    Object.entries(filters).forEach(([k, v]) => {
      if (v) {
        params.set(`${syncUrlKey}_filter_${k}`, String(v));
      }
    });

    const newSearch = params.toString();
    const newUrl = `${window.location.pathname}${newSearch ? '?' + newSearch : ''}`;
    window.history.replaceState({ ...window.history.state }, '', newUrl);
  }, [page, search, sortKey, sortDir, filters, syncUrlKey, defaultSortKey, defaultSortDir]);

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
