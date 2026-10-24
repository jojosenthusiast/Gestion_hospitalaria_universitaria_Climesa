-- Care module (spec 002). Demo subset: emergency arrival, triage, admission, bed exclusivity, discharge milestones,
-- physical exit, cleaning release, census. Internal transfers, reservations and external transfers are specified, not built.
create schema care;
grant usage on schema care to climesa_app;

create table care.units (
    id uuid primary key,
    code text not null unique,
    name text not null,
    kind text not null check (kind in ('emergency','ward','icu','recovery','observation'))
);
grant select on care.units to climesa_app;

create table care.locations (
    id uuid primary key,
    unit_id uuid not null references care.units(id),
    code text not null unique,
    kind text not null check (kind in ('bed','crib','stretcher','chair')),
    exclusive boolean not null default true,
    cssp_authorized boolean not null,
    operational boolean not null default true,
    status text not null check (status in ('available','reserved','occupied','pending_cleaning','cleaning','blocked')),
    status_reason text null,
    version int not null default 1
);
grant select, update on care.locations to climesa_app;

create table care.location_status_events (
    id bigint generated always as identity primary key,
    location_id uuid not null references care.locations(id),
    from_status text not null,
    to_status text not null,
    at timestamptz not null,
    actor_username text not null,
    reason text null
);
grant select, insert on care.location_status_events to climesa_app;

create table care.triage_protocols (
    code text not null,
    version text not null,
    name text not null,
    license_note text not null,
    clinical_use_approved boolean not null,
    primary key (code, version)
);
create table care.triage_levels (
    protocol_code text not null,
    protocol_version text not null,
    level int not null,
    name text not null,
    color text not null,
    target_minutes_to_physician int not null,
    reassessment_minutes int not null,
    primary key (protocol_code, protocol_version, level),
    foreign key (protocol_code, protocol_version) references care.triage_protocols(code, version)
);
grant select on care.triage_protocols, care.triage_levels to climesa_app;

create table care.encounters (
    id uuid primary key,
    person_id uuid not null,
    class text not null check (class in ('emergency','outpatient','inpatient','day_surgery','observation')),
    status text not null check (status in ('planned','arrived','waiting','in_progress','finished','cancelled','entered_in_error')),
    arrival_mode text null,
    arrived_at timestamptz not null,
    ended_at timestamptz null,
    disposition text null,
    episode_id uuid null,
    related_encounter_id uuid null references care.encounters(id),
    version int not null default 1
);
create index on care.encounters (status, class);
grant select, insert, update on care.encounters to climesa_app;

create table care.encounter_clocks (
    id bigint generated always as identity primary key,
    encounter_id uuid not null references care.encounters(id),
    kind text not null check (kind in ('arrival','triage','reassessment','first_physician','disposition','exit')),
    act_at timestamptz not null,
    captured_at timestamptz not null,
    actor_username text not null
);
grant select, insert on care.encounter_clocks to climesa_app;

create table care.triage_assessments (
    id uuid primary key,
    encounter_id uuid not null references care.encounters(id),
    protocol_code text not null,
    protocol_version text not null,
    level int not null,
    suggested_level int null,
    discriminator text not null,
    vitals jsonb not null,
    actor_username text not null,
    act_at timestamptz not null,
    captured_at timestamptz not null,
    foreign key (protocol_code, protocol_version, level) references care.triage_levels(protocol_code, protocol_version, level)
);
grant select, insert on care.triage_assessments to climesa_app;

create table care.episodes (
    id uuid primary key,
    person_id uuid not null,
    origin text not null,
    service text not null,
    responsible_clinician text not null,
    status text not null check (status in ('requested','accepted','active','medical_discharge_signed','physically_exited','closed','cancelled')),
    admitted_at timestamptz null,
    medical_discharge_at timestamptz null,
    discharge_type text null check (discharge_type in ('medical','voluntary','referred','death','abandonment')),
    discharge_signed_by text null,
    physical_exit_at timestamptz null,
    version int not null default 1
);
grant select, insert, update on care.episodes to climesa_app;

-- Append-only event log of the episode, with explicit cancellations (ADT model, FR-013).
create table care.episode_events (
    id bigint generated always as identity primary key,
    episode_id uuid not null references care.episodes(id),
    kind text not null,
    act_at timestamptz not null,
    captured_at timestamptz not null,
    actor_username text not null,
    payload jsonb not null default '{}'::jsonb,
    cancels_event_id bigint null references care.episode_events(id),
    reason text null
);
grant select, insert on care.episode_events to climesa_app;

-- FR-017: two patients can never overlap on an exclusive location. The database is the arbiter.
create table care.location_segments (
    id uuid primary key,
    episode_id uuid not null references care.episodes(id),
    location_id uuid not null references care.locations(id),
    kind text not null check (kind in ('occupancy','reservation','absence')),
    period tstzrange not null,
    exclusive boolean not null,
    cancelled boolean not null default false,
    constraint location_segments_no_overlap exclude using gist (location_id with =, period with &&)
        where (exclusive and not cancelled and kind in ('occupancy','reservation'))
);
grant select, insert, update on care.location_segments to climesa_app;

create table care.continuity_items (
    id uuid primary key,
    episode_id uuid not null references care.episodes(id),
    description text not null,
    owner text not null,
    status text not null default 'open' check (status in ('open','resolved')),
    created_at timestamptz not null
);
grant select, insert, update on care.continuity_items to climesa_app;

create table care.cleaning_records (
    id uuid primary key,
    location_id uuid not null references care.locations(id),
    checklist_version text not null,
    items jsonb not null,
    cleaner_username text not null,
    started_at timestamptz not null,
    ended_at timestamptz not null,
    signer_username text null,
    signed_at timestamptz null,
    constraint cleaning_signer_differs check (signer_username is null or signer_username <> cleaner_username)
);
grant select, insert, update on care.cleaning_records to climesa_app;
