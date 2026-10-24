-- Run once as a PostgreSQL superuser (DBA). Creates roles, database and extensions.
-- Passwords here are development placeholders; production passwords come from the secrets store, never from the repository.
create role climesa_owner login password 'dev_owner';
create role climesa_app login password 'dev_app';
create database climesa owner climesa_owner;
\connect climesa
create extension if not exists btree_gist;  -- exclusion constraints on time ranges (beds, policies)
create extension if not exists pg_trgm;     -- similarity search on normalized names
create extension if not exists pgcrypto;    -- gen_random_uuid in maintenance scripts
-- Migrations run as climesa_owner and grant climesa_app only what each table needs:
-- audit, history and event tables get INSERT and SELECT only.
