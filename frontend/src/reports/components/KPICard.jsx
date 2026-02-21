import { Link } from 'react-router-dom';

export default function KPICard({ title, value, color = 'blue', to }) {
  const colorMap = {
    blue: 'border-blue-500 text-blue-400',
    red: 'border-red-500 text-red-400',
    yellow: 'border-yellow-500 text-yellow-400',
    green: 'border-green-500 text-green-400',
    gray: 'border-gray-500 text-gray-400',
  };

  const content = (
    <div className={`bg-gray-800 rounded-lg p-5 border-l-4 ${colorMap[color] || colorMap.blue} ${to ? 'hover:bg-gray-750 hover:brightness-110 transition-all cursor-pointer' : ''}`}>
      <p className="text-sm text-gray-400 mb-1">{title}</p>
      <p className="text-3xl font-bold text-white">{value}</p>
    </div>
  );

  if (to) {
    return <Link to={to} className="block no-underline">{content}</Link>;
  }
  return content;
}
