import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { apiFetch } from '../api.js';
import { useFilters } from '../FiltersContext.jsx';
import KPICard from '../components/KPICard.jsx';
import GaugeChart from '../components/GaugeChart.jsx';
import ProgressRing from '../components/ProgressRing.jsx';

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function OverviewPage() {
  const { queryString } = useFilters();
  const [summary, setSummary] = useState(null);
  const [trends, setTrends] = useState([]);
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const qs = queryString();
    Promise.all([
      apiFetch(`/reports/summary/${qs}`),
      apiFetch(`/reports/flag-trends/${qs}`),
      apiFetch(`/reports/flagged-items/${qs}`),
    ])
      .then(([summaryData, trendsData, flagsData]) => {
        setSummary(summaryData);
        setFlags(flagsData.slice(0, 10));
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
          <KPICard title="Active Flags" value={summary.active_flags} color="red" to="/reports/flagged-items?status=active" />
          <KPICard title="Total Flags" value={summary.total_flags} color="yellow" to="/reports/flagged-items" />
          <KPICard title="Expired Checklists" value={summary.expired_checklists} color="red" to="/reports/expired-checklists" />
          <KPICard title="Open Reworks" value={summary.open_reworks} color="yellow" to="/reports/open-reworks" />
          <KPICard title="Completed" value={summary.total_completed} color="green" />
          <KPICard title="Total Instances" value={summary.total_instances} color="gray" />
        </div>
      )}

      {summary && summary.on_time_breakdown && summary.on_time_breakdown.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-medium text-gray-400 mb-4">On-Time Completion Rate</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {summary.on_time_breakdown.map(b => (
              <ProgressRing
                key={b.label}
                value={b.with_deadline > 0 ? (b.on_time / b.with_deadline) * 100 : 0}
                label={b.label}
                subtitle={`${b.on_time}/${b.with_deadline}`}
              />
            ))}
          </div>
        </div>
      )}

      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-gray-400">Recent Flagged Items</h2>
          <Link to="/reports/flagged-items" className="text-xs text-blue-400 hover:text-blue-300">
            View all
          </Link>
        </div>
        {flags.length === 0 ? (
          <p className="text-gray-500 text-sm">No flagged items found.</p>
        ) : (
          <div className="space-y-2">
            {flags.map(flag => (
              <div
                key={flag.id}
                className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 flex items-center gap-4"
              >
                <span
                  className={`shrink-0 w-2 h-2 rounded-full ${
                    flag.status === 'active' ? 'bg-red-400' : 'bg-green-400'
                  }`}
                />
                {flag.photo_url && (
                  <a href={flag.photo_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                    <img
                      src={flag.photo_url}
                      alt=""
                      className="w-10 h-10 object-cover rounded border border-gray-600 hover:border-blue-500 transition-colors"
                    />
                  </a>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white truncate">{flag.item_text}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {flag.checklist_title} &middot; {flag.team_name} &middot; {flag.outlet_name}
                  </p>
                </div>
                {flag.description && (
                  <p className="hidden lg:block text-xs text-gray-500 max-w-[200px] truncate">{flag.description}</p>
                )}
                <span className="shrink-0 text-xs text-gray-500 whitespace-nowrap">
                  {timeAgo(flag.flagged_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

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
