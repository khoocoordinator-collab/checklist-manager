import { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../api.js';
import { useFilters } from '../FiltersContext.jsx';
import ReportTable from '../components/ReportTable.jsx';

export default function OpenReworksPage() {
  const { queryString } = useFilters();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/reports/open-reworks/${queryString()}`)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [queryString]);

  const columns = useMemo(() => [
    { accessorKey: 'checklist_title', header: 'Checklist' },
    { accessorKey: 'team_name', header: 'Team' },
    { accessorKey: 'outlet_name', header: 'Outlet' },
    { accessorKey: 'date_label', header: 'Date' },
    { accessorKey: 'supervisor_name', header: 'Rejected By' },
    {
      accessorKey: 'rejected_at',
      header: 'Rejected At',
      cell: ({ getValue }) => getValue() ? new Date(getValue()).toLocaleString() : '',
    },
    {
      accessorKey: 'rejected_items',
      header: 'Rejected Items',
      cell: ({ getValue }) => {
        const items = getValue();
        if (!items || items.length === 0) return '-';
        return (
          <ul className="list-disc list-inside text-xs space-y-0.5">
            {items.map((item, i) => (
              <li key={i}>
                {item.item_text}
                {item.supervisor_comment && (
                  <span className="text-gray-500 ml-1">- {item.supervisor_comment}</span>
                )}
              </li>
            ))}
          </ul>
        );
      },
    },
  ], []);

  if (loading) return <p className="text-gray-400">Loading...</p>;

  return (
    <div>
      <h1 className="text-xl font-bold text-white mb-4">Open Reworks</h1>
      <ReportTable data={data} columns={columns} />
    </div>
  );
}
