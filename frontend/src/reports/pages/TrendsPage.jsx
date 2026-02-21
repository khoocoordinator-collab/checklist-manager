import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { apiFetch } from '../api.js';
import { useFilters } from '../FiltersContext.jsx';

export default function TrendsPage() {
  const { queryString } = useFilters();
  const [chartData, setChartData] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/reports/flag-trends/${queryString()}`)
      .then(raw => {
        const byDate = {};
        const outletSet = new Set();
        for (const row of raw) {
          if (!byDate[row.date]) byDate[row.date] = { date: row.date };
          byDate[row.date][row.outlet] = row.count;
          outletSet.add(row.outlet);
        }
        setChartData(Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)));
        setOutlets([...outletSet]);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [queryString]);

  const colors = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899'];

  if (loading) return <p className="text-gray-400">Loading...</p>;

  return (
    <div>
      <h1 className="text-xl font-bold text-white mb-6">Flag Trends</h1>
      {chartData.length === 0 ? (
        <p className="text-gray-500">No trend data available for the selected range.</p>
      ) : (
        <div className="bg-gray-800 rounded-lg p-6">
          <ResponsiveContainer width="100%" height={500}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" stroke="#9ca3af" tick={{ fontSize: 12 }} />
              <YAxis stroke="#9ca3af" tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#fff' }}
              />
              <Legend />
              {outlets.map((outlet, i) => (
                <Bar
                  key={outlet}
                  dataKey={outlet}
                  fill={colors[i % colors.length]}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
