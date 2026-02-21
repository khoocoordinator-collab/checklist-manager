import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { apiFetch } from '../api.js';
import { useFilters } from '../FiltersContext.jsx';
import KPICard from '../components/KPICard.jsx';

export default function OverviewPage() {
  const { queryString } = useFilters();
  const [summary, setSummary] = useState(null);
  const [trends, setTrends] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const qs = queryString();
    Promise.all([
      apiFetch(`/reports/summary/${qs}`),
      apiFetch(`/reports/flag-trends/${qs}`),
    ])
      .then(([summaryData, trendsData]) => {
        setSummary(summaryData);
        // Transform trends into chart data: group by date, one key per outlet
        const byDate = {};
        const outletSet = new Set();
        for (const row of trendsData) {
          if (!byDate[row.date]) byDate[row.date] = { date: row.date };
          byDate[row.date][row.outlet] = row.count;
          outletSet.add(row.outlet);
        }
        setTrends({
          data: Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)),
          outlets: [...outletSet],
        });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [queryString]);

  if (loading) return <p className="text-gray-400">Loading...</p>;

  const colors = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899'];

  return (
    <div>
      <h1 className="text-xl font-bold text-white mb-6">Overview</h1>

      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
          <KPICard title="Active Flags" value={summary.active_flags} color="red" />
          <KPICard title="Total Flags" value={summary.total_flags} color="yellow" />
          <KPICard title="Expired Checklists" value={summary.expired_checklists} color="red" />
          <KPICard title="Open Reworks" value={summary.open_reworks} color="yellow" />
          <KPICard title="Completed" value={summary.total_completed} color="green" />
          <KPICard title="Total Instances" value={summary.total_instances} color="gray" />
        </div>
      )}

      {trends.data && trends.data.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-sm font-medium text-gray-400 mb-4">Flag Trends by Outlet</h2>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={trends.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" stroke="#9ca3af" tick={{ fontSize: 12 }} />
              <YAxis stroke="#9ca3af" tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#fff' }}
              />
              <Legend />
              {trends.outlets.map((outlet, i) => (
                <Line
                  key={outlet}
                  type="monotone"
                  dataKey={outlet}
                  stroke={colors[i % colors.length]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
