# Patient account, charges, deposits and payments implementation tasks

**Related spec:** [`spec.md`](./spec.md)
**Related plan:** [`plan.md`](./plan.md)
**Status:** Draft

## Ordered tasks

### [ ] T-001: Billing module skeleton and Money

- **Depends on:** 000/T-008
- **Requirement:** FR-028
- **Done when:** decimal Money with half-up line rounding; schema and permissions.
- **Evidence:** Not run

### [ ] T-002: Catalog, price rules, tax policies, max prices

- **Depends on:** T-001
- **Requirement:** FR-001, FR-002, FR-010, FR-011
- **Done when:** precedence resolution explainable; equal precedence yields conflict; segregated approval.
- **Evidence:** Not run

### [ ] T-003: Accounts and payers

- **Depends on:** T-001, 002 events
- **Requirement:** FR-004
- **Done when:** account opened on encounter/episode events; payers ordered.
- **Evidence:** Not run

### [ ] T-004: Charges from events with snapshots

- **Depends on:** T-002, T-003
- **Requirement:** FR-003, FR-005, FR-006, FR-007
- **Done when:** one effective charge per origin; snapshot stored; corrections by reversal or adjustment only.
- **Evidence:** Not run

### [ ] T-005: Bed-day engine

- **Depends on:** T-004, 002 segments
- **Requirement:** FR-008, FR-009
- **Done when:** stops at discharge signature; resumes on revocation; recomputation reverses only affected days.
- **Evidence:** Not run

### [ ] T-006: Estimates and itemized statement

- **Depends on:** T-004
- **Requirement:** FR-012 to FR-014
- **Done when:** versioned estimates with delivery; estimate vs actual view; statement on discharge event.
- **Evidence:** Not run

### [ ] T-007: Deposits, payments, applications, refunds

- **Depends on:** T-003
- **Requirement:** FR-015 to FR-018, FR-020, FR-027
- **Done when:** concurrency tests pass; idempotency conflict; reversal restores; refund segregated; late payment does not touch episode.
- **Evidence:** Not run

### [ ] T-008: Cashier sessions

- **Depends on:** T-007
- **Requirement:** FR-019
- **Done when:** open, movements by means, close with difference explanation.
- **Evidence:** Not run

### [ ] T-009: Responsibility split

- **Depends on:** T-004
- **Requirement:** FR-021, FR-022
- **Done when:** plan rules split lines; rejected or pending stays provisional with owner.
- **Evidence:** Not run

### [ ] T-010: Exceptions and reconciliation

- **Depends on:** T-004, T-007
- **Requirement:** FR-024, FR-025
- **Done when:** queues with owner; false-positive closure counted; per-account reconciliation report.
- **Evidence:** Not run

### [ ] T-011: No-blocking guarantee and events

- **Depends on:** T-001 to T-010
- **Requirement:** FR-023, FR-026
- **Done when:** architecture test proves no Billing dependency into Care commands; events emitted once.
- **Evidence:** Not run

## Verification log

| Task | Command or procedure | Observed result | Date |
|---|---|---|---|
| | | | |
