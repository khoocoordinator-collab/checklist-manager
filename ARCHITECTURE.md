# ARCHITECTURE.md — Checklist Manager

## Stack
- **Frontend:** React SPA (Vite) + localStorage for offline
- **Backend:** Django 6 + Django REST Framework + django-cors-headers
- **Database:** PostgreSQL (production), SQLite (local dev)
- **Server:** Nginx reverse proxy → Gunicorn (3 workers, Unix socket)
- **Media:** Local filesystem (dev) → S3 `ap-southeast-1` (production, when AWS credentials set)
- **URL:** https://checklist.eatcompany.co

## Infrastructure

```
checklist.eatcompany.co/         → React SPA (served from frontend/dist via Nginx)
checklist.eatcompany.co/api/     → Django REST API (Gunicorn via Unix socket)
checklist.eatcompany.co/admin/   → Django admin
checklist.eatcompany.co/media/   → Uploaded photos (served by Nginx)
checklist.eatcompany.co/static/  → Static files (served by Nginx, hashed via WhiteNoise)
```

## Data Models

### Outlet
```python
id: UUID (PK)
name: str
location: str (optional)
created_at: datetime
```

### Team
```python
id: UUID (PK)
outlet: Outlet (FK)
name: str
passcode: str (4–6 chars, unique)
team_type: enum('staff', 'supervisor')
created_at: datetime
```

### Schedule
```python
id: UUID (PK)
name: str (auto-generated, e.g. "Daily at 08:00")
frequency: enum('daily', 'weekly', 'bi_weekly', 'monthly')
time_of_day: time
day_of_week: int (0=Mon–6=Sun, required for weekly/bi-weekly)
day_of_month: int (1–28, required for monthly)
is_active: bool
created_at: datetime
```

### ChecklistTemplate
```python
id: UUID (PK)
title: str
description: str (optional)
team: Team (FK)
schedule: Schedule (FK, nullable)
created_by: User (FK)
is_hidden: bool
requires_supervisor: bool
validity_window_hours: int  # 0 = unlimited
supervisor_validity_window_hours: int  # 0 = unlimited
created_at: datetime
updated_at: datetime
```

### TemplateItem
```python
id: UUID (PK)
template: ChecklistTemplate (FK)
text: str (max 48 chars)
order: int
is_required: bool
response_type: enum('yes_no', 'number', 'text', 'photo')
```

### ChecklistInstance
```python
id: UUID (PK)
template: ChecklistTemplate (FK, nullable)  # survives template deletion
team: Team (FK)
date_label: str  # "YYYY-MM-DD"
created_by: str  # 'SYSTEM', 'ADMIN', or team passcode
completed_by: str  # name from staff signature
status: enum('draft', 'pending', 'completed', 'verified', 'expired')
created_at: datetime
synced_at: datetime (nullable)
supervisor_team: Team (FK, nullable)
supervisor_signed_off: bool
supervisor_name: str
supervisor_signature: TextField (base64 PNG)
supervisor_signed_at: datetime (nullable)
```

### InstanceItem
```python
id: UUID (PK)
instance: ChecklistInstance (FK)
template_item_id: UUID  # stored as UUID, not FK (survives item deletion)
item_text: str  # snapshot at creation
response_type: str
response_value: str
is_checked: bool
checked_at: datetime (nullable)
notes: str (optional)
photo: ImageField (nullable)
photo_uploaded_at: datetime (nullable)
```

### Signature
```python
id: UUID (PK)
instance: ChecklistInstance (OneToOne)
image_data: TextField  # base64 data URL (data:image/png;base64,...)
signed_by: str
signed_at: datetime
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/login/` | Team passcode login |
| GET | `/api/pending/?team=<id>` | Pending checklists (staff) or awaiting verification (supervisor) |
| POST | `/api/instances/sync/` | Sync completed checklists from client |
| POST | `/api/supervisor/verify/` | Supervisor sign-off |
| POST | `/api/upload-photo/` | Upload photo for an instance item |
| GET/POST | `/api/templates/` | List / create templates |
| GET/PUT | `/api/templates/<id>/` | Retrieve / update template |
| GET/POST | `/api/schedules/` | List / create schedules |
| GET/POST | `/api/instances/` | List / create instances |
| GET/POST | `/api/signatures/` | List / create signatures |

## Auth Strategy

- **Admin:** Django session auth (username/password) at `/admin/`
- **Field:** Team passcode → returns team object, stored in localStorage (no expiry)

## Offline Strategy

1. Staff opens app → fetches pending instances from server, merges with localStorage
2. Staff fills checklist → saves to `localStorage[pending_{teamId}]`
3. "Sync" button POSTs all pending to `/api/instances/sync/`
4. On success: localStorage cleared, server state reloaded

## Scheduled Checklist Generation

Three cron jobs run on the server:

| Job | Schedule | Purpose |
|-----|----------|---------|
| `generate_checklist_instances` | Every 15 min | Creates pending instances 60–75 min before scheduled time |
| `expire_checklists` | Every 5 min | Writes `expired` status to DB for overdue instances |
| `delete_old_instances` | Daily 00:00 SGT | Deletes instances older than 90 days |

Logs: `/var/log/generate_checklists.log`, `/var/log/expire_checklists.log`, `/var/log/delete_old_instances.log`

## Timezone

`TIME_ZONE = 'Asia/Singapore'` (GMT+8). All schedule times and date labels are interpreted in SGT.

## Data Retention

- Instances auto-deleted after 90 days via cron
- Hidden templates remain in DB, excluded from API and frontend
- Instance items retain snapshot text — survives template/item changes or deletion

## Conflict Resolution

Last-write-wins. Sync endpoint updates existing instances with incoming payload.

## Default Credentials

- Django admin: `admin` / `admin`
- Staff team passcode: `1234`
- Supervisor team passcode: `4321`

## File Structure

```
checklist-manager/
├── backend/                  # Django project settings
│   ├── settings.py
│   ├── urls.py
│   └── wsgi.py
├── checklists/               # Django app
│   ├── models.py
│   ├── views.py
│   ├── serializers.py
│   ├── urls.py
│   ├── admin.py
│   ├── management/commands/
│   │   ├── generate_checklist_instances.py
│   │   ├── expire_checklists.py
│   │   └── delete_old_instances.py
│   └── static/admin/checklists/js/
│       ├── schedule_fields.js
│       └── toggle_supervisor_window.js
├── frontend/                 # React + Vite SPA
│   ├── src/
│   │   ├── App.jsx
│   │   ├── config.js
│   │   └── components/
│   │       ├── Login.jsx
│   │       ├── Dashboard.jsx
│   │       ├── ChecklistForm.jsx
│   │       ├── SupervisorDashboard.jsx
│   │       └── SignaturePad.jsx
│   └── dist/                 # Built frontend (served by Nginx)
├── media/                    # Uploaded photos (local dev)
├── staticfiles/              # Collected static files
├── manage.py
├── requirements.txt
├── SCOPE.md
├── ARCHITECTURE.md
└── CHANGELOG.md
```
