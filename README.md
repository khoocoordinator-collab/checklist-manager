# Checklist Manager v3

A team-based checklist management system with offline support and digital signatures.

## Stack

- **Backend:** Django + Django REST Framework + SQLite
- **Frontend:** React + Vite
- **Features:**
  - Team-based access with passcode login
  - Offline checklist completion
  - Digital signature capture
  - Auto-sync when online
  - Checkbox, number, and text response types

## Project Structure

```
checklist-manager-v3/
├── backend/           # Django backend
│   ├── checklists/    # Main app (models, views, serializers)
│   ├── manage.py
│   └── requirements.txt
├── frontend/          # React frontend
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── App.jsx
│   │   └── main.jsx
│   └── package.json
└── README.md
```

## Quick Start

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## API Endpoints

- `POST /api/login/` - Team login with passcode
- `GET /api/templates/` - List templates for team
- `POST /api/instances/sync/` - Sync completed checklists
- `GET /api/pending/?team={id}` - Get pending checklists

## Development Notes

- Frontend runs on port 5173 (Vite default)
- Backend runs on port 8000
- CORS enabled for local development
- SQLite database (db.sqlite3)
