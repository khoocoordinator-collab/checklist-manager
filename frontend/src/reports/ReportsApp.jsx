import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { apiFetch } from './api.js';
import { FiltersProvider } from './FiltersContext.jsx';
import ReportsLogin from './ReportsLogin.jsx';
import ReportsLayout from './ReportsLayout.jsx';
import OverviewPage from './pages/OverviewPage.jsx';
import FlaggedItemsPage from './pages/FlaggedItemsPage.jsx';
import ExpiredChecklistsPage from './pages/ExpiredChecklistsPage.jsx';
import ExpiredSupervisorPage from './pages/ExpiredSupervisorPage.jsx';
import OpenReworksPage from './pages/OpenReworksPage.jsx';
import TrendsPage from './pages/TrendsPage.jsx';
import './reports.css';

export default function ReportsApp() {
  const [user, setUser] = useState(null);
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    apiFetch('/reports/me/')
      .then(data => {
        setUser(data.user);
        setOutlets(data.user.outlets);
        if (data.csrfToken) localStorage.setItem('reports_csrf', data.csrfToken);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleLogin = useCallback(async (username, password) => {
    const data = await apiFetch('/reports/login/', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setUser(data.user);
    setOutlets(data.user.outlets);
    if (data.csrfToken) localStorage.setItem('reports_csrf', data.csrfToken);
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await apiFetch('/reports/logout/', { method: 'POST' });
    } catch {}
    setUser(null);
    setOutlets([]);
    localStorage.removeItem('reports_csrf');
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-gray-400">
        Loading...
      </div>
    );
  }

  if (!user) {
    return <ReportsLogin onLogin={handleLogin} />;
  }

  return (
    <FiltersProvider outlets={outlets}>
      <Routes>
        <Route element={<ReportsLayout user={user} onLogout={handleLogout} />}>
          <Route index element={<OverviewPage />} />
          <Route path="flagged-items" element={<FlaggedItemsPage />} />
          <Route path="expired-checklists" element={<ExpiredChecklistsPage />} />
          <Route path="expired-supervisor" element={<ExpiredSupervisorPage />} />
          <Route path="open-reworks" element={<OpenReworksPage />} />
          <Route path="trends" element={<TrendsPage />} />
          <Route path="login" element={<Navigate to="/reports" replace />} />
        </Route>
      </Routes>
    </FiltersProvider>
  );
}
