-- Migration module (spec 004). Demo subset: archive index batches with reconciliation, legacy number mapping and conflicts.
create schema migration;
grant usage on schema migration to climesa_app;

create table migration.batches (
    id uuid primary key,
    source_name text not null,
    fingerprint text not null,
    transform_version text not null,
    operator_username text not null,
    started_at timestamptz not null,
    completed_at timestamptz null,
    status text not null check (status in ('running','completed','failed_reconciliation')),
    read_count int not null default 0,
    created_count int not null default 0,
    matched_count int not null default 0,
    rejected_count int not null default 0,
    pending_count int not null default 0,
    character_sample jsonb null,
    unique (fingerprint, transform_version)
);
grant select, insert, update on migration.batches to climesa_app;

create table migration.batch_items (
    batch_id uuid not null references migration.batches(id),
    line_no int not null,
    legacy_number text null,
    outcome text not null check (outcome in ('created','matched','rejected','pending_review')),
    rule text null,
    detail text null,
    person_id uuid null,
    resolution_status text not null default 'open' check (resolution_status in ('open','resolved','not_applicable')),
    primary key (batch_id, line_no)
);
grant select, insert, update on migration.batch_items to climesa_app;

create table migration.legacy_mappings (
    id uuid primary key,
    source_system text not null,
    legacy_value text not null,
    person_id uuid not null,
    certainty text not null check (certainty in ('exact','reviewed','provisional')),
    decided_by text not null,
    batch_id uuid not null references migration.batches(id),
    created_at timestamptz not null,
    unique (source_system, legacy_value, person_id)
);
grant select, insert on migration.legacy_mappings to climesa_app;
