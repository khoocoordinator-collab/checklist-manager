# ARCHITECTURE.md — Checklist Manager v3

## Stack
- **Frontend:** React SPA (Vite) + localStorage for offline
- **Backend:** Django 6 + Django REST Framework + django-cors-headers
- **Database:** SQLite (dev) → PostgreSQL (prod)
- **Server:** nginx reverse proxy
- **URL:** http://checklist-dev.duckdns.org

## Infrastructure

```
checklist-dev.duckdns.org/       → React dev server (port 5173)
checklist-dev.duckdns.org/api/   → Django API (port 8000)
checklist-dev.duckdns.org/admin/ → Django admin
```

## Data Models

### Team
```python
id: UUID (PK)
name: str
passcode: str (4-6 digit)
created_at: datetime
```

### ChecklistTemplate
```python
id: UUID (PK)
title: str
description: str (optional)
created_by: User (FK)
created_at: datetime
updated_at: datetime
is_hidden: bool  # soft delete
```

### TemplateItem
```python
id: UUID (PK)
template: ChecklistTemplate (FK)
text: str
order: int  # simple integer ordering
is_required: bool
```

### Schedule
```python
id: UUID (PK)
template: ChecklistTemplate (FK)
team: Team (FK)
frequency: enum('daily','weekly','monday','tuesday','wednesday','thursday','friday','saturday','sunday')
time_of_day: time
is_active: bool
created_at: datetime
```

### ChecklistInstance
```python
id: UUID (PK)
template: ChecklistTemplate (FK, nullable)  # survives template deletion
team: Team (FK)
date_label: str  # e.g., "2026-02-18"
created_by: str  # passcode used (audit)
created_at: datetime
synced_at: datetime (nullable)
status: enum('draft','pending','completed')
```

### InstanceItem
```python
id: UUID (PK)
instance: ChecklistInstance (FK)
template_item_id: UUID  # stored as UUID, not FK
item_text: str  # snapshot at creation
is_checked: bool
checked_at: datetime (nullable)
notes: str (optional)
```

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/login/` | Public | Team passcode login |
| GET | `/api/templates/` | Admin | List active templates |
| POST | `/api/templates/` | Admin | Create template with items |
| GET | `/api/templates/{id}/` | Admin | Get template + items |
| GET | `/api/schedules/` | Admin | List schedules |
| POST | `/api/schedules/` | Admin | Create schedule |
| GET | `/api/pending/` | Public | Get pending checklists for team |
| POST | `/api/instances/sync/` | Public | Submit pending checklists |

## Auth Strategy

- **Admin:** Django session auth (username/password)
- **Field:** Team passcode → returns team object, stored in localStorage

## Offline Strategy

1. React app stores templates in memory (fetched on load)
2. Creating a checklist stores in `localStorage[pending_{teamId}]`
3. User fills checklist → updates localStorage
4. "Sync" button POSTs to `/api/instances/sync/`
5. On success: clear from localStorage

## Scheduled Checklist Generation

Cron job or management command:
1. Run every hour
2. Query schedules matching current hour + today's frequency
3. Create ChecklistInstance with status="pending"
4. Field worker sees it on dashboard

**Note:** No push notifications. Passive display only.

## Data Retention

- Instances: Auto-delete after 90 days (configurable)
- Hidden templates: Remain in DB, excluded from list
- Instance items: Snapshot text survives template changes

## Conflict Resolution

Last-write-wins. Server overwrites with incoming payload.

## File Structure

```
checklist-manager-v3/
├── backend/              # Django project
│   ├── settings.py
│   ├── urls.py
│   └── wsgi.py
├── checklists/           # Django app
│   ├── models.py
│   ├── views.py
│   ├── serializers.py
│   ├── urls.py
│   └── admin.py
├── frontend/             # React app
│   ├── src/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── config.js
│   │   └── components/
│   │       ├── Login.jsx
│   │       ├── Dashboard.jsx
│   │       └── ChecklistForm.jsx
│   └── vite.config.js
├── venv/                 # Python virtualenv
├── manage.py
├── SCOPE.md
└── ARCHITECTURE.md
```

## Default Credentials

- Django admin: `admin` / `admin123`
- Team passcode: `1234`
