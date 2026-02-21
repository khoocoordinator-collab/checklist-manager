import { NavLink, Outlet } from 'react-router-dom';
import { useFilters } from './FiltersContext.jsx';
import OutletSelector from './components/OutletSelector.jsx';
import DateRangePicker from './components/DateRangePicker.jsx';
import './reports.css';

const navItems = [
  { to: '/reports', label: 'Overview', end: true },
  { to: '/reports/flagged-items', label: 'Flagged Items' },
  { to: '/reports/expired-checklists', label: 'Expired Checklists' },
  { to: '/reports/expired-supervisor', label: 'Expired Supervisor' },
  { to: '/reports/open-reworks', label: 'Open Reworks' },
  { to: '/reports/trends', label: 'Trends' },
];

export default function ReportsLayout({ user, onLogout }) {
  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      {/* Sidebar */}
      <aside className="w-60 bg-gray-900 flex flex-col shrink-0">
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-lg font-bold text-white">Reports</h2>
          <p className="text-xs text-gray-400 mt-1">{user.first_name || user.username}</p>
        </div>
        <nav className="flex-1 py-2">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block px-4 py-2 text-sm ${isActive ? 'bg-gray-800 text-white font-medium border-l-2 border-blue-500' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-800">
          <button
            onClick={onLogout}
            className="w-full py-1.5 px-3 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {/* Filters bar */}
        <div className="sticky top-0 z-10 bg-gray-900/80 backdrop-blur border-b border-gray-800 px-6 py-3 flex items-center gap-4">
          <OutletSelector />
          <DateRangePicker />
        </div>
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
