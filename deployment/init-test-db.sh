#!/usr/bin/env bash
set -euo pipefail
# A restarted container keeps /tmp but re-runs init on the wiped tmpfs data dir: clear the healthcheck sentinel first.
rm -f /tmp/climesa-init-done
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f /checks/pruebas/00_simular_supabase.sql
for migration in /checks/migrations/*.sql; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$migration"
done
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f /checks/seed.sql
# Healthcheck sentinel: written only after migrations and seed succeed.
touch /tmp/climesa-init-done
