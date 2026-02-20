# VPS Development Workflow (Option B)

## Quick Commands
```bash
./vps-dev.sh status     # Check git status
./vps-dev.sh commit "msg"  # Commit and push
./vps-dev.sh backup     # Database backup
./vps-dev.sh restart    # Restart Gunicorn
```

## Workflow
1. Edit files directly on VPS
2. Test immediately (live environment)
3. Commit when stable: `./vps-dev.sh commit "fix: description"`

## Stack
- Ubuntu 22.04, PostgreSQL 16, Nginx, Gunicorn
- Django + Django Admin + DRF
- Branch: VPS-Deployment
- URL: http://64.23.197.153/
