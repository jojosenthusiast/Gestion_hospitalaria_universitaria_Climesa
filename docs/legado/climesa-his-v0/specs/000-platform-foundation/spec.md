# Platform foundation specification

**Status:** Draft
**Owner:** Project lead (technical); CLIMESA IT owner PENDING-INS11
**Last updated:** 2026-10-13

## Problem and outcome

Every later module (identity, episodes, documents, accounts, DTE) needs the same guarantees: who is acting and with what authority, no duplicated effects on retry, reliable cross-module events, an audit trail the law accepts, and consistent time. The Aldara prototype had none of these as shared mechanisms. Outcome: a running, empty application shell where any module can declare commands, permissions, events and audit points, and those guarantees hold by construction.

## Scope

### In scope

- Solution layout for a modular monolith with enforced module boundaries.
- Authentication with local accounts, lockout and second factor for sensitive permissions.
- Permission-based authorization with resource context and audited denials.
- Idempotent command handling, transactional outbox, idempotent inbox.
- Audit event contract and append-only, tamper-evident audit store (write path and integrity check).
- Versioned policy registry for legal, contractual and institutional parameters.
- Facility scoping, UTC time handling and request correlation.

### Out of scope

- Audit review reports, retention clocks and data-subject requests (spec 005).
- Single sign-on with an external directory (no CLIMESA directory known, PENDING-INS11).
- Message broker infrastructure: the outbox dispatches in-process until a module needs an external consumer.
- High availability topology (replica, failover); recorded in the deployment plan, not here.

## Functional requirements (EARS)

**Structure**

- **FR-001:** The system shall be organized as one host plus modules, each module exposing only a `Contracts` assembly to other modules; when an architecture test runs, any reference from one module to another module's non-contract assembly shall fail the build.
- **FR-002:** The system shall store each module's tables in its own PostgreSQL schema, and no module's data access code shall query another module's schema.

**Authentication**

- **FR-003:** When a user signs in, the system shall authenticate against local accounts with a configurable password policy and lock the account after a configurable number of consecutive failures.
- **FR-004:** While a user holds any permission flagged `requires_mfa`, the system shall require a time-based one-time password at sign-in.
- **FR-005:** When an account is deactivated, the system shall reject that account's existing sessions on their next request.
- **FR-006:** While a session is idle longer than the configured timeout for its workstation profile, the system shall require re-authentication before the next action.

**Authorization**

- **FR-007:** The system shall authorize every command and query by permission code plus resource context (facility, and where the module defines it, service or care relationship); role names shall not be checked directly in application code.
- **FR-008:** When authorization is denied for an operation on patient data, the system shall record an audit event with outcome `denied`.
- **FR-009:** When a user's roles or permissions change, the system shall record actor, target user, before and after sets, and reason; a user shall not be able to grant permissions to themselves.

**Commands and events**

- **FR-010:** When a state-changing command is received without an idempotency key, the system shall reject it.
- **FR-011:** When a command is received with a key already completed in the same scope and an equivalent request hash, the system shall return the original durable result without executing again.
- **FR-012:** When a command is received with a key already used in the same scope and a different request hash, the system shall reject it as `idempotency_conflict` and record an audit event.
- **FR-013:** When a command produces integration events, the system shall persist them in an outbox in the same database transaction as the state change.
- **FR-014:** While outbox events are unpublished, a dispatcher shall deliver them at least once, in order per aggregate, with exponential backoff, and mark them published after delivery.
- **FR-015:** When a consumer receives an event whose id it already processed, the system shall ignore it without side effects.
- **FR-016:** Each integration event shall carry id, type, contract version, aggregate id and version, occurred-at, recorded-at, source module, correlation id and causation id.

**Audit**

- **FR-017:** The system shall provide an audit write contract with: event id, recorded-at, actor (user, staff profile, workstation, IP), acting permission, action (create, read, search, update, delete-state, export, print, login, permission-change), entity type and id, patient id when applicable, purpose of use, outcome (success, denied, failed), correlation id, and a non-clinical detail payload.
- **FR-018:** When an operation that must be audited is executed, the system shall write its audit event in the same transaction as the operation; if the audit write fails, the operation shall fail.
- **FR-019:** The system shall make the audit store append-only: the application's database role shall hold INSERT and SELECT only on audit tables.
- **FR-020:** The system shall chain audit records by hash (each record stores the hash of its own content plus the previous record's hash); when the integrity check runs, it shall report the first broken link, if any.
- **FR-021:** The system shall never write clinical free text, credentials, tokens or full payment data into application logs or audit detail payloads.

**Policy registry**

- **FR-022:** The system shall store configurable rules as versioned policy values with key, value, effective-from, effective-to, source reference, approver and approval date.
- **FR-023:** When a module asks for a policy value at an instant, the system shall return the version effective at that instant; when none is effective, it shall return an explicit `policy_missing` result, never a hard-coded fallback.

**Context**

- **FR-024:** The system shall scope every patient-related and financial record to a facility id; while only one facility is configured, it shall still be stored.
- **FR-025:** The system shall store instants as UTC and convert to `America/El_Salvador` only for presentation and local-date calculations, using a single injectable clock.
- **FR-026:** The system shall assign a correlation id to every request and propagate it to commands, events, audit records and logs.

**Operations and security (added from research dossier R20)**

- **FR-027:** When a backup restore test is executed, the system shall record the backup set restored, the target environment, start and end instants, the checks run (row counts per schema, audit chain verification, sample blob hash checks) and the result; an operations report shall show the date and measured duration of the last successful restore test.
- **FR-028:** The system shall export on demand a contingency inventory (applications, servers, services, versions, ports, emergency contacts, location of break-glass credentials, but never the credentials themselves) as a printable document for offline custody.
- **FR-029:** The system shall provide a security incident register with detection instant, reporter, category, affected systems and data, containment actions, and a clock to the 72-hour personal data breach notification deadline when personal data are involved (LPDP Art. 25), linked to spec 005 breach cases.
- **FR-030:** Each release shall include an OWASP ASVS 5.0.0 verification record listing the requirements in scope (target level 2), their status and evidence, cited with version prefix (`v5.0.0-x.y.z`).
- **FR-031:** The system shall support break-glass access to patient data for emergencies with a mandatory reason, time limit, immediate notification to the privacy responsible and mandatory review in the next access review (spec 005).

## Scenarios and edge cases

| Requirement | Given | When | Then |
|---|---|---|---|
| FR-001 | Module B references Module A's Infrastructure | Build with architecture tests | Build fails naming the illegal reference |
| FR-004 | User with `identity.merge.apply` (requires MFA) and no TOTP enrolled | Signs in | Forced enrollment; no access to protected actions until enrolled |
| FR-005 | Active session; admin deactivates account | User submits next request | 401, session ended, audit `login`/`denied` |
| FR-009 | Admin edits own role assignment | Saves | Rejected; audit records attempt |
| FR-011 | Command completed; network drops before response | Client retries same key and body | Same result; one state change |
| FR-012 | Same key, different amount | Retry | `idempotency_conflict`, no effect, audited |
| FR-013 | Command succeeds but process crashes before dispatch | Restart | Dispatcher publishes pending event |
| FR-015 | Event delivered twice | Consumer handles | Second delivery is a no-op |
| FR-018 | Audit table unavailable (permissions misconfigured) | User reads a patient | Read fails with server error; no unaudited access |
| FR-020 | Someone edits an audit row directly with a superuser | Integrity check runs | Check reports the record where the chain breaks |
| FR-023 | No policy value effective for a date | Module asks | `policy_missing` returned; module surfaces a configuration error |
| FR-025 | Event at 2026-10-13T05:30Z | Local date computed | 2026-10-12 (UTC-6) |

Concurrency on shared mechanisms: N/A beyond FR-011/FR-012, which are enforced by a unique constraint on (scope, key).

## Definition of done

- [ ] Every in-scope outcome is represented by one or more testable `FR-*` requirements.
- [ ] Scenarios cover normal behavior and material edge/failure cases.
- [ ] Out-of-scope items and unresolved decisions are explicit.
- [ ] Acceptance and verification are observable, with no claim of unrun checks.
- [ ] The approved requirements are traceable to tasks in `tasks.md`.

## Open decisions

- Session timeouts per workstation profile (clinical shared station vs office): PENDING-INS12.
- Who approves policy values per domain (fiscal, clinical, payroll): PENDING-INS04.
