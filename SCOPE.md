# SCOPE.md — Checklist Manager v3

## Core Concept
Offline-first web app. Field workers fill checklists on mobile, sync manually when online. Admin manages templates and schedules on desktop.

## User Flows

**Field (Mobile):**
1. Enter team passcode → see "Checklists to be completed"
2. Tap checklist → fill out → save locally
3. Tap "Sync" when online → submit to server

**Admin (Desktop):**
1. Login → create/edit templates with ordered items
2. Set schedules (e.g., "Daily Cleaning at 08:00")
3. View completion history

## Data Model

- **Team:** name, passcode
- **Template:** title, items[] (ordered), is_hidden
- **Schedule:** template, team, frequency, time_of_day — auto-creates pending instances
- **Instance:** template snapshot, team, date_label, status (draft/pending/completed), synced_at
- **InstanceItem:** text snapshot, checked status, notes

## Key Behaviors

| Scenario | Behavior |
|----------|----------|
| Offline | Full functionality, local storage |
| Sync conflict | Last write wins |
| Template deleted/hidden | Existing instances preserved (snapshot data) |
| Schedule fires | Creates "pending" instance, visible on next app open |
| Data retention | Instances auto-delete after 90 days |

## Out of Scope
- Push notifications
- Real-time collaboration
- Conflict resolution UI
- Offline template creation

## Success Criteria
- [ ] Passcode login
- [ ] Create templates (admin)
- [ ] Schedule recurring checklists
- [ ] Fill offline, manual sync
- [ ] Dashboard shows pending + history
- [ ] Mobile-first responsive design
