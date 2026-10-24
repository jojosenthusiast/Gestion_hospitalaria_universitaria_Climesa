# Platform foundation implementation plan

**Related spec:** [`spec.md`](./spec.md)
**Status:** Draft
**Last updated:** 2026-10-13

## Goal and scope

Deliver an empty but production-shaped host where modules plug in commands, permissions, events, audit points and policies. Non-goals: audit review, retention, SSO, broker, HA topology.

## Architecture and boundaries

- **Components/layers:**
  - `Climesa.Host` (ASP.NET Core, Razor UI shell, composition root, background services).
  - `Climesa.SharedKernel` (Result types, clock, ids, idempotency, outbox/inbox abstractions, audit contract, permission requirement).
  - `Climesa.Platform` (module of its own: users, roles, permissions, policy registry, audit store, outbox tables). Schema `platform`.
  - `Climesa.Modules.<Name>.{Domain,Application,Infrastructure,Contracts}` per module.
  - `tests/Climesa.ArchitectureTests` (NetArchTest or ArchUnitNET), `tests/Climesa.<Module>.Tests` (xUnit + Testcontainers PostgreSQL).
- **Boundaries:** modules talk through `Contracts` (command/query interfaces and integration event types). EF Core `DbContext` per module bound to its schema.
- **Flow:** HTTP request → correlation middleware → authentication → endpoint → command dispatcher (authorization behavior → idempotency behavior → handler → unit of work: state + outbox + audit in one transaction) → response. Background dispatcher drains outbox → in-process consumers (inbox dedup).
- **Alternatives and decision:** MediatR-style pipeline vs hand-written dispatcher: hand-written minimal dispatcher (no third-party license risk; MediatR moved to a commercial license in 2025, verify before adopting). Broker (RabbitMQ) deferred: the outbox table is the durable boundary; a broker can be added behind the dispatcher later.

## Contracts

- **User/API contracts:** sign-in, sign-out, MFA enrollment, change password; admin: users, roles, role-permission bundles, policy values. All admin screens behind `platform.admin.*` permissions.
- **Internal contracts:**
  - `ICommand<TResult>` with `IdempotencyKey`, `ExpectedVersion?`, `Reason?`.
  - `IPermissionRequirement(code, IResourceContext)`.
  - `IAuditWriter.Write(AuditEvent)` (transaction-bound).
  - `IOutbox.Add(IntegrationEvent)`; `IIntegrationEventHandler<T>` with inbox dedup.
  - `IPolicyReader.Get<T>(key, instant)` → `PolicyValue<T> | PolicyMissing`.
  - `IClock.UtcNow`, `ILocalCalendar.ToLocalDate(instant)`.
- **Authorization:** permissions are rows `(code, description, requires_mfa, sensitive)`. Roles are bundles managed by admins. Policy handler resolves the user's effective permissions plus resource context.
- **Compatibility:** none; new repository.

## Data and migrations

Schema `platform`:

| Table | Key columns | Notes |
|---|---|---|
| `users` (ASP.NET Core Identity tables, renamed into schema) | id | Lockout, MFA fields from Identity |
| `staff_profiles` | id, user_id, facility_id, status | Profile details grow in HR spec |
| `permissions` | code | Seeded by each module's migration |
| `roles`, `role_permissions`, `user_roles` | ids | `user_roles` has granted_by, granted_at, reason |
| `role_assignment_changes` | id | Append-only history (FR-009) |
| `idempotency_records` | (scope, key) unique | request_hash, status, result_json, created_at, expires_at |
| `outbox_messages` | id | aggregate_id, aggregate_version, type, contract_version, payload jsonb, occurred_at, recorded_at, correlation_id, causation_id, published_at, attempts, last_error |
| `inbox_messages` | (consumer, event_id) unique | processed_at |
| `audit_events` | id bigserial | fields per FR-017, `prev_hash`, `hash`; INSERT/SELECT grants only |
| `policy_values` | id | key, value jsonb, effective_from, effective_to, source_ref, approved_by, approved_at; exclusion constraint against overlapping effective ranges per key |
| `facilities` | id | Seed one row (CLIMESA Santa Ana) |

Audit hash: SHA-256 over canonical JSON of the record without `hash`, concatenated with `prev_hash`. Serialized writes per chain via `pg_advisory_xact_lock` on a fixed key (throughput adequate for tens of users; partition chains per day if needed later).

## Security and privacy

- Two database roles: `climesa_app` (DML on module schemas, INSERT/SELECT on `audit_events`) and `climesa_migrator` (DDL). Application never runs as owner.
- Passwords: Identity PBKDF2 defaults; lockout after configurable failures; TOTP MFA for permissions flagged `requires_mfa`.
- Cookies: `Secure`, `HttpOnly`, `SameSite=Strict`; anti-forgery on all POST.
- Logs: Serilog with destructuring policies that drop properties tagged `[Sensitive]`; no request bodies logged.
- Threats addressed: insider tampering with audit (hash chain + grants), replayed commands (idempotency), privilege self-escalation (FR-009).

## Failure and recovery

- Idempotency record inserted `in_progress` in the same transaction as the handler; concurrent duplicate blocks on the unique key and then reads the completed result.
- Outbox dispatcher: at-least-once, ordered per aggregate by `aggregate_version`; poison message after N attempts goes to `failed` with alert, other aggregates continue.
- Audit write failure aborts the transaction (fail closed).
- Policy missing surfaces as a configuration error to an administrator, never a silent default.

## Verification

| Check | Command or procedure | Expected evidence |
|---|---|---|
| Module boundaries | `dotnet test tests/Climesa.ArchitectureTests` | Passes; a deliberately illegal reference in a fixture fails |
| Idempotency same key | `dotnet test --filter Category=Idempotency` (Testcontainers PostgreSQL) | One state change for two identical commands; second returns stored result |
| Idempotency conflict | same suite | Different hash returns `idempotency_conflict` and audit row |
| Outbox crash recovery | integration test kills dispatcher between commit and publish | Event delivered after restart exactly once to an inbox consumer |
| Audit fail closed | test revokes INSERT on `audit_events` | Patient read throws; no data returned |
| Audit chain | test updates a row as superuser, runs integrity check | Check reports that row id |
| Policy by date | unit test with two versions | Value effective at instant returned; gap returns `policy_missing` |
| Local date | unit test 2026-10-13T05:30Z | 2026-10-12 |

## Risks and decisions

- **Risk:** single audit hash chain becomes a write bottleneck. Mitigation: measure with the load test planned in spec 005; partition chain by day if p95 insert exceeds target.
- **Risk:** in-process dispatcher loses throughput if a consumer is slow. Mitigation: per-consumer inbox and bounded concurrency.
- **Open decision:** MFA delivery (TOTP app vs hardware token) for clinical staff without smartphones: PENDING-INS11/INS12.

## Plan review

- [ ] Architecture, contracts, data, migration, security, and failure handling are addressed.
- [ ] Verification is scoped, exact, and tied to requirements.
- [ ] No unresolved decision is silently treated as approved.
