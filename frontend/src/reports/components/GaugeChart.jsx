import { PieChart, Pie, Cell } from 'recharts';

export default function GaugeChart({ value, label }) {
  const pct = Math.round(value);
  const data = [
    { value: pct },
    { value: 100 - pct },
  ];

  const color = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className="bg-gray-800 rounded-lg p-5 flex flex-col items-center">
      <p className="text-sm text-gray-400 mb-2">{label}</p>
      <div className="relative" style={{ width: 160, height: 90 }}>
        <PieChart width={160} height={90}>
          <Pie
            data={data}
            cx={80}
            cy={85}
            startAngle={180}
            endAngle={0}
            innerRadius={50}
            outerRadius={70}
            dataKey="value"
            stroke="none"
          >
            <Cell fill={color} />
            <Cell fill="#374151" />
          </Pie>
        </PieChart>
        <div className="absolute inset-0 flex items-end justify-center pb-1">
          <span className="text-2xl font-bold text-white">{pct}%</span>
        </div>
      </div>
    </div>
  );
}
