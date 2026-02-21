import { createContext, useContext, useState } from 'react';

const FiltersContext = createContext();

export function FiltersProvider({ children, outlets }) {
  const [selectedOutlet, setSelectedOutlet] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const queryString = () => {
    const params = new URLSearchParams();
    if (selectedOutlet) params.set('outlet', selectedOutlet);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    const str = params.toString();
    return str ? `?${str}` : '';
  };

  return (
    <FiltersContext.Provider value={{
      selectedOutlet, setSelectedOutlet,
      dateFrom, setDateFrom,
      dateTo, setDateTo,
      outlets: outlets || [],
      queryString,
    }}>
      {children}
    </FiltersContext.Provider>
  );
}

export function useFilters() {
  return useContext(FiltersContext);
}
