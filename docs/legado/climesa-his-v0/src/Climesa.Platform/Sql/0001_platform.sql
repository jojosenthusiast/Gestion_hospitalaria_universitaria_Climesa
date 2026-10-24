-- Platform schema: security, audit, idempotency, outbox/inbox, policies (spec 000).
create schema if not exists platform;
grant usage on schema platform to climesa_app;

create table platform.facilities (
    id uuid primary key,
    code text not null unique,
    name text not null,
    time_zone text not null default 'America/El_Salvador'
);
grant select on platform.facilities to climesa_app;

create table platform.users (
    id uuid primary key,
    username text not null unique,
    display_name text not null,
    password_hash text not null,
    professional_board text null,          -- junta de vigilancia (JVPM, JVPE, ...)
    professional_number text null,
    license_valid_until date null,
    active boolean not null default true,
    created_at timestamptz not null default now()
);
grant select on platform.users to climesa_app;

create table platform.roles (
    code text primary key,
    name text not null
);
create table platform.role_permissions (
    role_code text not null references platform.roles(code),
    permission text not null,
    primary key (role_code, permission)
);
create table platform.user_roles (
    user_id uuid not null references platform.users(id),
    role_code text not null references platform.roles(code),
    primary key (user_id, role_code)
);
grant select on platform.roles, platform.role_permissions, platform.user_roles to climesa_app;

-- Append-only, hash-chained audit store (FR-017 to FR-020).
create table platform.audit_events (
    seq bigint generated always as identity primary key,
    event_id uuid not null unique,
    recorded_at timestamptz not null,
    actor_user_id uuid null,
    actor_username text null,
    workstation text null,
    ip text null,
    permission text null,
    action text not null,
    entity_type text not null,
    entity_id text null,
    patient_id uuid null,
    purpose text null,
    outcome text not null check (outcome in ('success','denied','failed')),
    correlation_id text null,
    detail jsonb not null default '{}'::jsonb,
    prev_hash bytea not null,
    hash bytea not null
);
create index on platform.audit_events (patient_id, recorded_at);
create index on platform.audit_events (actor_user_id, recorded_at);
grant select, insert on platform.audit_events to climesa_app;

-- Idempotency keys (FR-011, FR-012).
create table platform.idempotency (
    scope text not null,
    key text not null,
    request_hash text not null,
    status text not null check (status in ('in_progress','completed')),
    response jsonb null,
    created_at timestamptz not null default now(),
    primary key (scope, key)
);
grant select, insert, update on platform.idempotency to climesa_app;

-- Transactional outbox and per-consumer inbox (FR-013 to FR-016).
create table platform.outbox (
    seq bigint generated always as identity primary key,
    event_id uuid not null unique,
    event_type text not null,
    aggregate_type text not null,
    aggregate_id text not null,
    payload jsonb not null,
    occurred_at timestamptz not null,
    correlation_id text null,
    published_at timestamptz null,
    attempts int not null default 0,
    last_error text null
);
create index outbox_unpublished on platform.outbox (seq) where published_at is null;
grant select, insert on platform.outbox to climesa_app;
grant update (published_at, attempts, last_error) on platform.outbox to climesa_app;

create table platform.inbox (
    consumer text not null,
    event_id uuid not null,
    processed_at timestamptz not null default now(),
    primary key (consumer, event_id)
);
grant select, insert on platform.inbox to climesa_app;

-- Versioned policy registry (FR-022, FR-023).
create table platform.policies (
    id bigint generated always as identity primary key,
    key text not null,
    value jsonb not null,
    effective tstzrange not null,
    source_reference text not null,
    approved_by text not null,
    approved_at timestamptz not null default now(),
    exclude using gist (key with =, effective with &&)
);
grant select on platform.policies to climesa_app;
