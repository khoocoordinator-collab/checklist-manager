import { useFilters } from '../FiltersContext.jsx';

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

function getPresetRange(preset) {
  const today = new Date();
  const to = formatDate(today);
  if (preset === 'today') return { from: to, to };
  if (preset === 'yesterday') {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yd = formatDate(yesterday);
    return { from: yd, to: yd };
  }
  if (preset === 'week') {
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 6);
    return { from: formatDate(weekAgo), to };
  }
  if (preset === 'month') {
    const monthAgo = new Date(today);
    monthAgo.setDate(monthAgo.getDate() - 29);
    return { from: formatDate(monthAgo), to };
  }
  return { from: '', to: '' };
}

function getActivePreset(dateFrom, dateTo) {
  const today = formatDate(new Date());
  if (!dateFrom && !dateTo) return '';
  if (dateFrom === today && dateTo === today) return 'today';
  const yesterday = getPresetRange('yesterday');
  if (dateFrom === yesterday.from && dateTo === yesterday.to) return 'yesterday';
  const week = getPresetRange('week');
  if (dateFrom === week.from && dateTo === week.to) return 'week';
  const month = getPresetRange('month');
  if (dateFrom === month.from && dateTo === month.to) return 'month';
  return '';
}

export default function DateRangePicker() {
  const { dateFrom, setDateFrom, dateTo, setDateTo } = useFilters();
  const active = getActivePreset(dateFrom, dateTo);

  const applyPreset = (preset) => {
    if (active === preset) {
      setDateFrom('');
      setDateTo('');
    } else {
      const range = getPresetRange(preset);
      setDateFrom(range.from);
      setDateTo(range.to);
    }
  };

  const presets = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
  ];

  return (
    <div className="flex items-center gap-3">
      <div className="flex rounded overflow-hidden border border-gray-700">
        {presets.map(p => (
          <button
            key={p.key}
            onClick={() => applyPreset(p.key)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              active === p.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
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
