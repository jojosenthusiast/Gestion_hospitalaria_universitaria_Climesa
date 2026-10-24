# Platform foundation implementation tasks

**Related spec:** [`spec.md`](./spec.md)
**Related plan:** [`plan.md`](./plan.md)
**Status:** Draft

## Ordered tasks

### [ ] T-001: Solution skeleton and architecture tests

- **Depends on:** none
- **Requirement:** FR-001, FR-002
- **Files/surfaces:** `Climesa.sln`, `src/Climesa.Host`, `src/Climesa.SharedKernel`, `src/Climesa.Platform`, `tests/Climesa.ArchitectureTests`, `global.json` (.NET 10 SDK)
- **Done when:** `dotnet build` succeeds; architecture test fails when a fixture project references another module's Infrastructure and passes otherwise.
- **Evidence:** Not run

### [ ] T-002: PostgreSQL test harness and database roles

- **Depends on:** T-001
- **Requirement:** FR-002, FR-019
- **Files/surfaces:** `tests/Climesa.Testing` (Testcontainers fixture), `db/roles.sql`
- **Done when:** a test creates schemas with `climesa_migrator` and proves `climesa_app` cannot UPDATE or DELETE `platform.audit_events`.
- **Evidence:** Not run

### [ ] T-003: Clock, local calendar and correlation middleware

- **Depends on:** T-001
- **Requirement:** FR-025, FR-026
- **Files/surfaces:** `SharedKernel/Time`, `Host/Middleware/CorrelationMiddleware.cs`
- **Done when:** unit test converts 2026-10-13T05:30Z to local date 2026-10-12; correlation id appears in response header and log scope.
- **Evidence:** Not run

### [ ] T-004: Authentication, lockout, MFA and session rules

- **Depends on:** T-002
- **Requirement:** FR-003, FR-004, FR-005, FR-006
- **Files/surfaces:** `Platform/Identity`, `Host/Pages/Account/*`
- **Done when:** integration tests show lockout after configured failures, forced TOTP enrollment for a user with a `requires_mfa` permission, rejection of a deactivated user's session, and re-authentication after idle timeout.
- **Evidence:** Not run

### [ ] T-005: Permission model and authorization pipeline

- **Depends on:** T-004
- **Requirement:** FR-007, FR-008, FR-009
- **Files/surfaces:** `Platform/Authorization`, `SharedKernel/Authorization/PermissionRequirement.cs`
- **Done when:** tests prove permission + facility context grants access, missing permission denies with an audit row, and self-granting a role is rejected and audited.
- **Evidence:** Not run

### [ ] T-006: Idempotent command pipeline

- **Depends on:** T-002
- **Requirement:** FR-010, FR-011, FR-012
- **Files/surfaces:** `SharedKernel/Commands`, `Platform/Persistence/IdempotencyRecords`
- **Done when:** concurrent identical commands produce one effect; same key with different hash returns `idempotency_conflict`; missing key rejected.
- **Evidence:** Not run

### [ ] T-007: Transactional outbox, dispatcher and inbox

- **Depends on:** T-006
- **Requirement:** FR-013, FR-014, FR-015, FR-016
- **Files/surfaces:** `SharedKernel/Events`, `Platform/Outbox`, `Host/BackgroundServices/OutboxDispatcher.cs`
- **Done when:** crash-between-commit-and-dispatch test delivers once after restart; duplicate delivery is a no-op; per-aggregate order preserved under retries.
- **Evidence:** Not run

### [ ] T-008: Audit writer and hash chain integrity check

- **Depends on:** T-002, T-006
- **Requirement:** FR-017, FR-018, FR-019, FR-020, FR-021
- **Files/surfaces:** `Platform/Audit`, `Host/Admin/AuditIntegrity`
- **Done when:** audited operation fails when audit insert fails; integrity check finds a tampered row; log redaction test shows a `[Sensitive]` property absent from output.
- **Evidence:** Not run

### [ ] T-009: Versioned policy registry

- **Depends on:** T-002
- **Requirement:** FR-022, FR-023
- **Files/surfaces:** `Platform/Policies`
- **Done when:** overlapping effective ranges for one key are rejected by the database; lookup by instant returns the right version; a gap returns `policy_missing`.
- **Evidence:** Not run

### [ ] T-010: Facility scoping

- **Depends on:** T-002
- **Requirement:** FR-024
- **Files/surfaces:** `Platform/Facilities`, base entity conventions
- **Done when:** a module entity without `facility_id` fails a convention test; seed creates one facility.
- **Evidence:** Not run

## Traceability and completion

| Requirement | Task ID(s) | Acceptance/evidence coverage |
|---|---|---|
| FR-001, FR-002 | T-001, T-002 | Architecture tests; schema/role test |
| FR-003 to FR-006 | T-004 | Authentication integration tests |
| FR-007 to FR-009 | T-005 | Authorization tests with audit assertions |
| FR-010 to FR-012 | T-006 | Idempotency concurrency tests |
| FR-013 to FR-016 | T-007 | Outbox/inbox crash and duplicate tests |
| FR-017 to FR-021 | T-008, T-002 | Audit fail-closed, grants, chain and redaction tests |
| FR-022, FR-023 | T-009 | Policy registry tests |
| FR-024 | T-010 | Convention test |
| FR-025, FR-026 | T-003 | Clock and correlation tests |

- [ ] Every approved `FR-*` requirement maps to at least one task, or is explicitly deferred with approval.
- [ ] Task dependencies are ordered and each "Done when" statement is observable.
- [ ] Evidence records exact checks and observed outcomes; planned or historical checks are not presented as current proof.
- [ ] All accepted tasks are checked only after their criteria and evidence are satisfied.
