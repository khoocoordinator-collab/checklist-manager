export default function ProgressRing({ value, label, subtitle }) {
  const pct = Math.round(value);
  const radius = 40;
  const stroke = 8;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  const color = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className="bg-gray-800 rounded-lg p-4 flex flex-col items-center">
      <div className="relative" style={{ width: 100, height: 100 }}>
        <svg width="100" height="100" className="-rotate-90">
          <circle
            cx="50" cy="50" r={radius}
            fill="none"
            stroke="#374151"
            strokeWidth={stroke}
          />
          <circle
            cx="50" cy="50" r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-white">{pct}%</span>
        </div>
      </div>
      <p className="text-sm text-gray-300 mt-2 text-center truncate w-full" title={label}>{label}</p>
      {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
    </div>
  );
}
