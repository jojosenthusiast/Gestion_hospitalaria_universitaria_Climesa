# Audit review, retention, access requests and exports implementation tasks

**Related spec:** [`spec.md`](./spec.md)
**Related plan:** [`plan.md`](./plan.md)
**Status:** Draft

## Ordered tasks

### [ ] T-001: Custody module skeleton and case engine

- **Depends on:** 000/T-008
- **Requirement:** FR-023
- **Done when:** generic case with typed transitions, deadlines and append-only events; fake-clock tests pass.
- **Evidence:** Not run

### [ ] T-002: Business-day calendar

- **Depends on:** T-001
- **Requirement:** FR-022
- **Done when:** yearly calendar loaded; deadline function skips weekends and holidays.
- **Evidence:** Not run

### [ ] T-003: Integrity jobs

- **Depends on:** T-001, 003/T-005
- **Requirement:** FR-005
- **Done when:** chain verification and blob scrub record runs; failure opens incident.
- **Evidence:** Not run

### [ ] T-004: Access review sets and rules

- **Depends on:** T-001, 002 care relationships
- **Requirement:** FR-001 to FR-004
- **Done when:** monthly set generated with flags and sample; decisions required; incident on flag.
- **Evidence:** Not run

### [ ] T-005: Retention engine and series catalog

- **Depends on:** T-001
- **Requirement:** FR-006 to FR-008, FR-011
- **Done when:** table-driven tests match Art. 34-35, 37; annual review list produced; nothing deleted.
- **Evidence:** Not run

### [ ] T-006: Legal holds and disposal with acta

- **Depends on:** T-005
- **Requirement:** FR-009, FR-010
- **Done when:** holds exclude; segregated approval; acta and inventory generated; resumable execution with tombstones.
- **Evidence:** Not run

### [ ] T-007: Access and copy requests

- **Depends on:** T-002, 001 relationships
- **Requirement:** FR-012, FR-013, FR-016
- **Done when:** requester rules enforced for living and deceased; judicial route requires legal review.
- **Evidence:** Not run

### [ ] T-008: Packages and certified copies

- **Depends on:** T-007, 003/T-005
- **Requirement:** FR-014, FR-015
- **Done when:** PDF/A rendering, manifest with hashes, encrypted zip, certification page, delivery evidence.
- **Evidence:** Not run

### [ ] T-009: LPDP requests and rectification routing

- **Depends on:** T-002
- **Requirement:** FR-017 to FR-019
- **Done when:** 20 business-day clock; rectification executes through spec 001/003; suppression only by reviewed decision.
- **Evidence:** Not run

### [ ] T-010: Documentary incidents and breach

- **Depends on:** T-001
- **Requirement:** FR-020, FR-021
- **Done when:** 15 business-day verification; 72 h breach clock with notification evidence required to close.
- **Evidence:** Not run

## Verification log

| Task | Command or procedure | Observed result | Date |
|---|---|---|---|
| | | | |
