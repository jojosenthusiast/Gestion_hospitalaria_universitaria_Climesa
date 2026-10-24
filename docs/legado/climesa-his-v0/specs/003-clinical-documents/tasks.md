# Clinical documents implementation tasks

**Related spec:** [`spec.md`](./spec.md)
**Related plan:** [`plan.md`](./plan.md)
**Status:** Draft

## Ordered tasks

### [ ] T-001: Records module skeleton, schema, grants

- **Depends on:** 000/T-008
- **Requirement:** FR-016 (infrastructure)
- **Done when:** schema created; `document_versions` and `signatures` append-only by grants; architecture tests pass.
- **Evidence:** Not run

### [ ] T-002: Document types and template versions

- **Depends on:** T-001
- **Requirement:** FR-001, FR-004
- **Done when:** seed of minimal types; JSON schema validation of required sections works.
- **Evidence:** Not run

### [ ] T-003: Drafts, signing and signature manifest

- **Depends on:** T-002, 000 privilege checks
- **Requirement:** FR-002, FR-003, FR-010
- **Done when:** sign checks re-auth window, permission, privilege and license at the act; hash stored; display shows junta number.
- **Evidence:** Not run

### [ ] T-004: Addenda, corrected versions, entered-in-error

- **Depends on:** T-003
- **Requirement:** FR-005, FR-006, FR-007
- **Done when:** signed content immutable; amendments keep original; entered-in-error hides and notifies.
- **Evidence:** Not run

### [ ] T-005: Blob store and renditions

- **Depends on:** T-001
- **Requirement:** FR-008, FR-009
- **Done when:** content-addressed write with fsync and rename; dedupe; scrub detects tamper; OCR rendition flagged derived.
- **Evidence:** Not run

### [ ] T-006: Consents

- **Depends on:** T-003, 001 relationships
- **Requirement:** FR-011, FR-012
- **Done when:** representative scope checked; emergency exception recorded with reason; revocation stored.
- **Evidence:** Not run

### [ ] T-007: Document index and audit

- **Depends on:** T-003
- **Requirement:** FR-014
- **Done when:** index filtered by permission; every open audited.
- **Evidence:** Not run

### [ ] T-008: Discharge report assembly

- **Depends on:** T-003, 002/T-008
- **Requirement:** FR-013
- **Done when:** `MedicalDischargeSigned` creates a draft with required sections and the cost statement reference slot.
- **Evidence:** Not run

### [ ] T-009: Discrepancy cases

- **Depends on:** T-004
- **Requirement:** FR-015
- **Done when:** case routed to committee role; decision produces linked amendment.
- **Evidence:** Not run

### [ ] T-010: Merge consumer

- **Depends on:** T-001, 001 merge tasks
- **Requirement:** FR-017
- **Done when:** re-pointing idempotent and acknowledged; reversal restores.
- **Evidence:** Not run

## Verification log

| Task | Command or procedure | Observed result | Date |
|---|---|---|---|
| | | | |
