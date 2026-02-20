#!/bin/bash
# Dev server auto-restart loop

cd /root/.openclaw/workspace-dev/checklist-manager-v3
source venv/bin/activate

echo "Starting Django dev server with auto-restart..."
echo "Press Ctrl+C to stop completely"

while true; do
    echo "[$(date)] Starting server..."
    python manage.py runserver 0.0.0.0:8000
    echo "[$(date)] Server exited, restarting in 2 seconds..."
    sleep 2
done
