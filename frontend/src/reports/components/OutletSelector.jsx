import { useFilters } from '../FiltersContext.jsx';

export default function OutletSelector() {
  const { outlets, selectedOutlet, setSelectedOutlet } = useFilters();

  return (
    <select
      value={selectedOutlet}
      onChange={e => setSelectedOutlet(e.target.value)}
      className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
      <option value="">All Outlets</option>
      {outlets.map(o => (
        <option key={o.id} value={o.id}>{o.name}</option>
      ))}
    </select>
  );
}
