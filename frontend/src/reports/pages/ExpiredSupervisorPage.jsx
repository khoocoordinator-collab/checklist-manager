import { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../api.js';
import { useFilters } from '../FiltersContext.jsx';
import ReportTable from '../components/ReportTable.jsx';

export default function ExpiredSupervisorPage() {
  const { queryString } = useFilters();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/reports/expired-supervisor/${queryString()}`)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [queryString]);

  const columns = useMemo(() => [
    { accessorKey: 'checklist_title', header: 'Checklist' },
    { accessorKey: 'team_name', header: 'Team' },
    { accessorKey: 'outlet_name', header: 'Outlet' },
    { accessorKey: 'date_label', header: 'Date' },
    {
      accessorKey: 'completed_at',
      header: 'Completed At',
      cell: ({ getValue }) => getValue() ? new Date(getValue()).toLocaleString() : '',
    },
    {
      accessorKey: 'supervisor_deadline',
      header: 'Supervisor Deadline',
      cell: ({ getValue }) => getValue() ? new Date(getValue()).toLocaleString() : '-',
    },
  ], []);

  if (loading) return <p className="text-gray-400">Loading...</p>;

  return (
    <div>
      <h1 className="text-xl font-bold text-white mb-4">Expired Supervisor Sign-offs</h1>
      <ReportTable data={data} columns={columns} />
    </div>
  );
}
