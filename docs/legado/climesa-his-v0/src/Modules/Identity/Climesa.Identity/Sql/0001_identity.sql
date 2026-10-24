-- Identity module (spec 001). Demo subset: registration with search token, typed identifiers, provisional and newborn
-- identities, append-only history, suspected duplicate cases. Merge/unmerge are specified but not implemented in the demo.
create schema identity;
grant usage on schema identity to climesa_app;

create table identity.identifier_types (
    code text primary key,
    name text not null,
    default_issuer text not null,
    exclusive boolean not null,
    validator text null
);
insert into identity.identifier_types values
 ('dui', 'Documento Único de Identidad', 'RNPN', true, 'dui'),
 ('nui', 'Número Único de Identidad', 'RNPN', true, null),
 ('partida_nacimiento', 'Partida de nacimiento', 'municipio', false, null),
 ('carne_minoridad', 'Carné de minoridad', 'municipio', false, null),
 ('pasaporte', 'Pasaporte', 'país', true, null),
 ('carne_residente', 'Carné de residente', 'DGME', true, null),
 ('nit', 'NIT (registros antiguos)', 'MH', true, null),
 ('isss_afiliacion', 'Afiliación ISSS', 'ISSS', true, null),
 ('legacy_paper_mrn', 'Número de expediente en papel', 'archivo CLIMESA', true, null),
 ('temporary_alias', 'Alias temporal', 'CLIMESA', true, 'generated');
grant select on identity.identifier_types to climesa_app;

create sequence identity.mrn_seq start 1;
create sequence identity.provisional_seq start 1;
grant usage on identity.mrn_seq, identity.provisional_seq to climesa_app;

create table identity.persons (
    id uuid primary key,
    facility_id uuid not null,
    status text not null check (status in ('provisional','active','verified','retired_merged','entered_in_error')),
    birth_date date null,
    birth_precision text not null check (birth_precision in ('exact','year_month','year','estimated','unknown')),
    birth_estimated_age int null,
    birth_estimated_at date null,
    admin_sex text not null check (admin_sex in ('female','male','unknown','not_recorded')),
    municipality text null,
    address_text text null,
    phone text null,
    informant text null,
    captured_by uuid null,
    deceased_at date null,
    created_at timestamptz not null,
    version int not null default 1
);
grant select, insert, update on identity.persons to climesa_app;

create table identity.person_names (
    id uuid primary key,
    person_id uuid not null references identity.persons(id),
    type text not null check (type in ('official','known_as','alias','temporary')),
    given_names text null,
    first_surname text null,
    second_surname text null,
    married_surname text null,
    search_normalized text not null,
    phon_first_surname text not null,
    phon_given text not null,
    valid_from timestamptz not null,
    valid_to timestamptz null,
    source text not null
);
create index person_names_trgm on identity.person_names using gin (search_normalized gin_trgm_ops);
create index person_names_phon on identity.person_names (phon_first_surname, phon_given);
grant select, insert, update on identity.person_names to climesa_app;

create table identity.identifiers (
    id uuid primary key,
    person_id uuid not null references identity.persons(id),
    type_code text not null references identity.identifier_types(code),
    issuer text not null,
    value_original text not null,
    value_normalized text not null,
    status text not null check (status in ('unverified','verified','retired','entered_in_error')),
    is_exclusive boolean not null,
    source text not null,
    created_at timestamptz not null
);
-- FR-010: exclusivity enforced by the database, not by the application.
create unique index identifiers_exclusive on identity.identifiers (type_code, issuer, value_normalized)
    where is_exclusive and status in ('unverified','verified');
create index identifiers_lookup on identity.identifiers (value_normalized);
grant select, insert, update on identity.identifiers to climesa_app;

create table identity.medical_record_numbers (
    facility_id uuid not null,
    mrn text not null,
    person_id uuid not null references identity.persons(id),
    created_at timestamptz not null,
    primary key (facility_id, mrn)
);
create index on identity.medical_record_numbers (person_id);
grant select, insert on identity.medical_record_numbers to climesa_app;

-- FR-023: append-only history. The application role cannot update or delete it.
create table identity.person_versions (
    person_id uuid not null references identity.persons(id),
    version int not null,
    changed_at timestamptz not null,
    actor_user_id uuid null,
    actor_username text not null,
    permission text not null,
    reason text not null,
    diff jsonb not null,
    primary key (person_id, version)
);
grant select, insert on identity.person_versions to climesa_app;

create table identity.registration_searches (
    token uuid primary key,
    user_id uuid not null,
    criteria_hash text not null,
    result_count int not null,
    created_at timestamptz not null,
    expires_at timestamptz not null
);
grant select, insert on identity.registration_searches to climesa_app;

create table identity.relationships (
    id uuid primary key,
    person_id uuid not null references identity.persons(id),
    related_person_id uuid null references identity.persons(id),
    related_name text null,
    type text not null check (type in ('mother','father','legal_representative','guardian','emergency_contact','other')),
    birth_order int null,
    may_consent boolean not null default false,
    may_receive_info boolean not null default false,
    may_request_copies boolean not null default false,
    status text not null default 'active',
    created_at timestamptz not null
);
grant select, insert on identity.relationships to climesa_app;

create table identity.duplicate_cases (
    id uuid primary key,
    type text not null check (type in ('duplicate','overlay')),
    status text not null check (status in ('suspected','under_investigation','approved','rejected','completed')),
    person_ids uuid[] not null,
    reason text not null,
    opened_by text not null,
    opened_at timestamptz not null
);
-- One open suspected case per pair (matching is idempotent).
create unique index duplicate_cases_open_pair on identity.duplicate_cases (person_ids) where status in ('suspected','under_investigation');
grant select, insert, update on identity.duplicate_cases to climesa_app;
