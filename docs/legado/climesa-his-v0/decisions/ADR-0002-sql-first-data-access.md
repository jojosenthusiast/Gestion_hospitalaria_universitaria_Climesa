# ADR-0002: SQL-first data access with Npgsql for the core modules

**Status:** Proposed (2026-10-13)
**Deciders:** Project lead.
**Amends:** ADR-0001 point 3 ("EF Core with Npgsql").

## Context

The first working slice (specs 000, 001, 002 and part of 004) was built in an environment where NuGet was unreachable. Npgsql was compiled from its source (tag v10.0.3); EF Core was not available. That forced a choice, but the choice has to stand on its merits, because the environment will not be the reason in production.

The core modules depend on database features that an ORM hides or fights:

- Exclusion constraints on time ranges (`EXCLUDE USING gist`) for bed occupancy (spec 002 FR-017) and policy validity (spec 000 FR-022).
- Partial unique indexes for exclusive identifiers (spec 001 FR-010).
- Per-table grants so the application role can only INSERT and SELECT on audit, history and event tables (spec 000 FR-019; spec 001 FR-023).
- Trigram similarity and phonetic keys in search (spec 001 FR-002, FR-003).
- Explicit row locks and constraint error codes mapped to business errors.

## Decision

1. Core modules use Npgsql with explicit SQL: migrations are ordered `.sql` files per module, embedded in the module assembly, applied by the owner role and recorded with their SHA-256 (a changed applied script is an error).
2. Each command runs in one transaction with its audit row and outbox event (`CommandRunner`).
3. EF Core stays an option for read-heavy, CRUD-like modules (catalogs, configuration) if it reduces code, provided it uses the same connection and transaction and does not own migrations of core schemas.

## Consequences

- Positive: every constraint the specs rely on is visible in the migration files; the database, not the application, is the arbiter under concurrency; a reviewer can audit grants by reading SQL.
- Negative: more mapping code; no LINQ; query typos surface at run time, so every query path needs a test (the suite runs against PostgreSQL, not a mock).
- The demo runs on PostgreSQL 16 because that is what the environment had; ADR-0001 targets 17+. No feature used is specific to 17.

## Alternatives considered

| Option | Why not chosen |
|---|---|
| EF Core for everything | Exclusion constraints, partial indexes and grants end up as raw SQL in migrations anyway; change tracking adds risk to append-only tables |
| Dapper | Fine choice; not used only because it was not restorable here. Can replace the small `DbTx` helpers later without changing SQL |
