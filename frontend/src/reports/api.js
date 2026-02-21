import { API_BASE } from '../config.js';

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

export async function apiFetch(path, options = {}) {
  const url = `${API_BASE}/api${path}`;
  const csrfToken = getCookie('csrftoken') || localStorage.getItem('reports_csrf');

  const headers = {
    'Content-Type': 'application/json',
    ...(csrfToken ? { 'X-CSRFToken': csrfToken } : {}),
    ...options.headers,
  };

  const res = await fetch(url, {
    credentials: 'include',
    ...options,
    headers,
  });

  if (res.status === 403 || res.status === 401) {
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res.json();
}
