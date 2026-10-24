# Legacy and paper migration implementation tasks

**Related spec:** [`spec.md`](./spec.md)
**Related plan:** [`plan.md`](./plan.md)
**Status:** Draft

Requires spec 001 registration and duplicate cases, spec 003 binary store and documents.

## Ordered tasks

### [ ] T-001: Migration module skeleton

- **Depends on:** 000/T-008
- **Requirement:** infrastructure
- **Done when:** schema and permissions created; architecture tests forbid writes to other schemas.
- **Evidence:** Not run

### [ ] T-002: Archive inventory and loans

- **Depends on:** T-001
- **Requirement:** FR-001, FR-002
- **Done when:** units registered with unknown owner allowed; overdue loans flagged by fake-clock test.
- **Evidence:** Not run

### [ ] T-003: Batch framework

- **Depends on:** T-001
- **Requirement:** FR-003 to FR-007
- **Done when:** fingerprint, transform version, per-item outcomes, arithmetic check, idempotent rerun, character sample report.
- **Evidence:** Not run

### [ ] T-004: Index load with name separation

- **Depends on:** T-003, 001 registration
- **Requirement:** FR-010, FR-011
- **Done when:** CSV of typed paper index loads through spec 001 commands; uncertain name splits flagged; legacy number stored as identifier.
- **Evidence:** Not run

### [ ] T-005: Probabilistic matching and mapping conflicts

- **Depends on:** T-004
- **Requirement:** FR-008, FR-009
- **Done when:** decision Splink vs native recorded; explained pair output stored; cases opened; conflicts queued; no auto-merge.
- **Evidence:** Not run

### [ ] T-006: Scanning work orders and capture ingestion

- **Depends on:** T-002, 003/T-005
- **Requirement:** FR-012, FR-013, FR-017
- **Done when:** inbox ingestion reads dpi and color; below-minimum rejected; barcode separator links to work order; priority from upcoming encounters.
- **Evidence:** Not run

### [ ] T-007: QC and publication

- **Depends on:** T-006
- **Requirement:** FR-014 to FR-016
- **Done when:** folio vs page check; segregated QC; PDF/A published read-only through spec 003.
- **Evidence:** Not run

### [ ] T-008: Abstraction and confirmation

- **Depends on:** 003/T-003
- **Requirement:** FR-018 to FR-020
- **Done when:** abstraction requires clinical role and page references; items unconfirmed until treating professional decides; medications require item verification.
- **Evidence:** Not run

### [ ] T-009: Legacy structured import

- **Depends on:** T-003
- **Requirement:** FR-021
- **Done when:** raw extract stored read-only; versioned mappings; unknown authorship marked. Blocked until a legacy source exists (PENDING-INS11).
- **Evidence:** Not run

### [ ] T-010: Write authority, cutover checklist, rollback rehearsal

- **Depends on:** T-001
- **Requirement:** FR-022 to FR-024
- **Done when:** non-overlapping windows enforced; transcription marking; checklist sign-off; rehearsal record lists post-cutover operations and external effects.
- **Evidence:** Not run

### [ ] T-011: Indicators and pilot report

- **Depends on:** T-002 to T-008
- **Requirement:** FR-025
- **Done when:** dashboard with defined numerators/denominators; pilot of 100 expedientes measured.
- **Evidence:** Not run

## Verification log

| Task | Command or procedure | Observed result | Date |
|---|---|---|---|
| | | | |
