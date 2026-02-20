#!/bin/bash
# VPS development helper script for checklist-manager
# Place in /opt/checklist-manager/ or ~/bin/

set -e

APP_DIR="/opt/checklist-manager"
VENV="$APP_DIR/venv"

cd "$APP_DIR"

case "$1" in
    status)
        echo "=== Git Status ==="
        git status --short
        echo ""
        echo "=== Recent Commits ==="
        git log --oneline -5
        ;;
    
    commit)
        if [ -z "$2" ]; then
            echo "Usage: $0 commit 'message'"
            exit 1
        fi
        git add -A
        git commit -m "$2"
        git push origin VPS-Deployment
        echo "✅ Committed and pushed"
        ;;
    
    backup)
        BACKUP_FILE="/tmp/checklist_backup_$(date +%Y%m%d_%H%M%S).sql"
        echo "Creating database backup: $BACKUP_FILE"
        sudo -u postgres pg_dump checklist_manager > "$BACKUP_FILE"
        echo "✅ Backup saved"
        ;;
    
    restart)
        echo "Restarting Gunicorn..."
        pkill -f gunicorn || true
        sleep 2
        source "$VENV/bin/activate"
        gunicorn --daemon --workers 3 --bind unix:/opt/checklist-manager/checklist.sock backend.wsgi:application
        sleep 2
        echo "✅ Gunicorn restarted ($(pgrep -c gunicorn) workers)"
        ;;
    
    logs)
        echo "=== Gunicorn Processes ==="
        ps aux | grep gunicorn | grep -v grep || echo "No gunicorn running"
        echo ""
        echo "=== Recent Nginx Errors ==="
        sudo tail -20 /var/log/nginx/error.log
        ;;
    
    test)
        echo "=== Testing API ==="
        curl -s http://localhost/api/templates/ | head -c 200
        echo ""
        ;;
    
    migrate)
        echo "=== Running Migrations ==="
        source "$VENV/bin/activate"
        python manage.py migrate
        ;;
    
    *)
        echo "VPS Development Helper"
        echo ""
        echo "Usage: $0 <command>"
        echo ""
        echo "Commands:"
        echo "  status    - Show git status and recent commits"
        echo "  commit    - Commit and push changes (requires message)"
        echo "  backup    - Backup PostgreSQL database"
        echo "  restart   - Restart Gunicorn workers"
        echo "  logs      - Show recent errors"
        echo "  test      - Test API endpoint"
        echo "  migrate   - Run Django migrations"
        ;;
esac
