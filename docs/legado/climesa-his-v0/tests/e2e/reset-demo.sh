#!/bin/bash
# Recreate the demo database and restart the web app (local development only; assumes PostgreSQL on this machine and sudo-less su).
fuser -k 5007/tcp >/dev/null 2>&1; pkill -f "dotnet run --no-build --urls" ; sleep 2
su postgres -c "psql -q -c 'drop database if exists climesa' -c 'create database climesa owner climesa_owner'"
su postgres -c "psql -q -d climesa -c 'create extension btree_gist; create extension pg_trgm; create extension pgcrypto;'"
cd "$(dirname "$0")/../../src/Climesa.Web" && (ASPNETCORE_ENVIRONMENT=Development nohup dotnet run --no-build --urls http://127.0.0.1:5007 > /tmp/climesa-web.log 2>&1 &)
for i in $(seq 1 30); do curl -s -o /dev/null http://127.0.0.1:5007/Cuenta/Login && break; sleep 1; done
echo restarted
