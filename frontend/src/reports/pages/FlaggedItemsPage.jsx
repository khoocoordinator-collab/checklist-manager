import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '../api.js';
import { useFilters } from '../FiltersContext.jsx';
import ReportTable from '../components/ReportTable.jsx';

export default function FlaggedItemsPage() {
  const { queryString } = useFilters();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState([]);
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    let qs = queryString();
    if (statusFilter) {
      qs += (qs ? '&' : '?') + `status=${statusFilter}`;
    }
    apiFetch(`/reports/flagged-items/${qs}`)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [queryString, statusFilter]);

  const columns = useMemo(() => [
    {
      accessorKey: 'photo_url',
      header: 'Photo',
      enableSorting: false,
      enableGlobalFilter: false,
      cell: ({ getValue }) => {
        const url = getValue();
        if (!url) return <span className="text-gray-600">-</span>;
        return (
          <a href={url} target="_blank" rel="noopener noreferrer">
            <img
              src={url}
              alt="Flag photo"
              className="w-12 h-9 object-cover rounded border border-gray-700 hover:border-blue-500 transition-colors"
            />
          </a>
        );
      },
    },
    { accessorKey: 'item_text', header: 'Item' },
    { accessorKey: 'description', header: 'Description' },
    { accessorKey: 'checklist_title', header: 'Checklist' },
    { accessorKey: 'team_name', header: 'Team' },
    { accessorKey: 'outlet_name', header: 'Outlet' },
    { accessorKey: 'date_label', header: 'Date' },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }) => {
        const s = getValue();
        return (
          <span className={s === 'active' ? 'text-red-400 font-medium' : 'text-green-400'}>
            {s}
          </span>
        );
      },
    },
    { accessorKey: 'flagged_by', header: 'Flagged By' },
    { accessorKey: 'acknowledged_by', header: 'Acknowledged By' },
    {
      accessorKey: 'flagged_at',
      header: 'Flagged',
      cell: ({ getValue }) => getValue() ? new Date(getValue()).toLocaleString() : '',
    },
  ], []);

  if (loading) return <p className="text-gray-400">Loading...</p>;

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <h1 className="text-xl font-bold text-white">Flagged Items</h1>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded px-3 py-1.5"
        >
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="acknowledged">Acknowledged</option>
        </select>
      </div>
      <ReportTable data={data} columns={columns} />
    </div>
  );
}
