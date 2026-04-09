#!/bin/bash
set -e

# ------------------------------------------------------------------
# 1. Start MySQL and wait for it to be ready
# ------------------------------------------------------------------
mkdir -p /run/mysqld
chown -R mysql:mysql /run/mysqld 2>/dev/null || true

mysqld_safe --datadir=/var/lib/mysql &
MYSQL_PID=$!

echo "Waiting for MySQL..."
for i in $(seq 1 60); do
  if mysqladmin ping -h 127.0.0.1 --silent 2>/dev/null; then
    echo "MySQL is ready."
    break
  fi
  sleep 1
done

# ------------------------------------------------------------------
# 2. Backend — install deps & start FastAPI
# ------------------------------------------------------------------
cd /app/backend
pip install -r requirements.txt -q
python main.py &

# ------------------------------------------------------------------
# 3. Frontend — install deps & start Next.js dev server
# ------------------------------------------------------------------
cd /app/frontend
npm install
npm run dev &
