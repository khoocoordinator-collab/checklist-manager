import { useFilters } from '../FiltersContext.jsx';

export default function DateRangePicker() {
  const { dateFrom, setDateFrom, dateTo, setDateTo } = useFilters();

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-gray-400">From</label>
      <input
        type="date"
        value={dateFrom}
        onChange={e => setDateFrom(e.target.value)}
        className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <label className="text-xs text-gray-400">To</label>
      <input
        type="date"
        value={dateTo}
        onChange={e => setDateTo(e.target.value)}
        className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      {(dateFrom || dateTo) && (
        <button
          onClick={() => { setDateFrom(''); setDateTo(''); }}
          className="text-xs text-gray-400 hover:text-white"
        >
          Clear
        </button>
      )}
    </div>
  );
}
