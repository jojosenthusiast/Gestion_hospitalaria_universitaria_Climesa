# Patient identity implementation tasks

**Related spec:** [`spec.md`](./spec.md)
**Related plan:** [`plan.md`](./plan.md)
**Status:** Draft

Requires spec 000 tasks T-001 to T-008 complete (solution, test harness, auth, permissions, idempotency, outbox, audit).

## Ordered tasks

### [ ] T-001: Identity module skeleton, schema and permissions

- **Depends on:** 000/T-008
- **Requirement:** FR-005, FR-037 (infrastructure)
- **Files/surfaces:** `src/Modules/Identity/*`, migration `Identity_Initial`, permission seed
- **Done when:** module builds, architecture tests pass, schema `identity` created by migrator role, permissions listed in plan seeded with MFA flags for merge/unmerge/approve.
- **Evidence:** Not run

### [ ] T-002: Identifier types, normalization and validators

- **Depends on:** T-001
- **Requirement:** FR-008, FR-009
- **Files/surfaces:** `Domain/Identifiers/*`, seed for `identifier_types`
- **Done when:** DUI tests pass (`00016297-5` valid, `00016297-4` invalid, `000162975` normalizes to `00016297-5`); types without a validator accept any trimmed value; seed matches plan table.
- **Evidence:** Not run

### [ ] T-003: Partial dates, names and Spanish search keys

- **Depends on:** T-001
- **Requirement:** FR-003, FR-015, FR-016, FR-018
- **Files/surfaces:** `Domain/ValueObjects/PartialDate.cs`, `PersonName.cs`, `SearchKeys.cs`
- **Done when:** unit tests show estimates never serialize as exact dates; normalization keeps recorded names intact; phonetic key maps a list of at least 30 synthetic variant pairs (b/v, s/z/c, ll/y, h, particles, compound surnames) to equal keys and 30 distinct-name pairs to different keys.
- **Evidence:** Not run

### [ ] T-004: Person aggregate persistence, history and concurrency

- **Depends on:** T-002, T-003
- **Requirement:** FR-023, FR-024, FR-025
- **Files/surfaces:** `Infrastructure/IdentityDbContext.cs`, `person_versions`
- **Done when:** every change writes a version with diff, actor, reason; `climesa_app` cannot UPDATE/DELETE `person_versions`; stale version returns `version_conflict`; verified attribute change without `identity.correct_verified` denied and audited.
- **Evidence:** Not run

### [ ] T-005: Search with match reasons and minimal projection

- **Depends on:** T-004
- **Requirement:** FR-002, FR-004, FR-038
- **Files/surfaces:** `Application/Search/*`, trigram index migration
- **Done when:** exact identifier match ranks first with reason; phonetic and trigram candidates carry reasons; projection without clinical permission excludes clinical fields and masks identifiers; each search writes an audit row with criteria hash and returned ids.
- **Evidence:** Not run

### [ ] T-006: Registration with search token and MRN

- **Depends on:** T-005
- **Requirement:** FR-001, FR-005, FR-006, FR-007, FR-010, FR-011
- **Files/surfaces:** `Application/Registration/RegisterPerson.cs`, `mrn_sequences`
- **Done when:** create without a valid search token from the same session is rejected; concurrent registration of the same DUI yields one success and one `identifier_conflict`; same passport number under two countries registers twice; legacy paper MRN stored as identifier; MRNs unique under parallel load (100 concurrent registrations).
- **Evidence:** Not run

### [ ] T-007: Identifier lifecycle

- **Depends on:** T-006
- **Requirement:** FR-012, FR-013
- **Files/surfaces:** `Application/Identifiers/*`
- **Done when:** correction retires old value with reason and keeps internal id; NUI to DUI transition keeps NUI as historical; retired values found only by users with the audit-search permission.
- **Evidence:** Not run

### [ ] T-008: Provisional identity and its resolution

- **Depends on:** T-006
- **Requirement:** FR-014, FR-017
- **Files/surfaces:** `Application/Registration/RegisterProvisionalPerson.cs`, `ResolveProvisional.cs`
- **Done when:** provisional identity created with no demographics and a unique alias; resolution with data matching an existing identity opens a duplicate case; alias remains in history and searchable.
- **Evidence:** Not run

### [ ] T-009: Newborn registration

- **Depends on:** T-006
- **Requirement:** FR-021, FR-022
- **Files/surfaces:** `Application/Registration/RegisterNewborns.cs`
- **Done when:** twin registration yields two identities with birth order, own MRNs, mother relationship, no copied identifiers; search over both shows birth order and twin warning.
- **Evidence:** Not run

### [ ] T-010: Relationships and contact points

- **Depends on:** T-004
- **Requirement:** FR-019, FR-020
- **Files/surfaces:** `Application/Relationships/*`
- **Done when:** emergency contact created without scope flags; setting a scope flag requires `identity.relationship.scope` and evidence; expired relationship returns `active=false` from the contract query; shared phone across identities creates no relationship.
- **Evidence:** Not run

### [ ] T-011: Deceased and entered-in-error

- **Depends on:** T-004
- **Requirement:** FR-035, FR-036
- **Files/surfaces:** `Application/Status/*`, `IReferenceCheck` contract
- **Done when:** deceased with year precision recorded and still searchable; entered-in-error allowed for an unreferenced identity and rejected when a fake consumer reports a reference.
- **Evidence:** Not run

### [ ] T-012: Duplicate case workflow and matching job

- **Depends on:** T-005
- **Requirement:** FR-026, FR-027, FR-028
- **Files/surfaces:** `Domain/Cases/DuplicateCase.cs`, `Application/Matching/MatchingJob.cs`
- **Done when:** matching job opens suspected cases only and is idempotent per candidate set; transitions recorded with actor and reason; self-approval rejected.
- **Evidence:** Not run

### [ ] T-013: Apply merge with manifest and events

- **Depends on:** T-012
- **Requirement:** FR-029, FR-030, FR-032
- **Files/surfaces:** `Application/Merge/ApplyMerge.cs`, `merge_operations`
- **Done when:** apply moves records per decision in one transaction, manifest lists every affected row with hash, `IdentityMerged` in outbox; retry with same key returns same result; merge into a retired identity resolves survivor; cycle rejected.
- **Evidence:** Not run

### [ ] T-014: Consumer acknowledgement and reconciliation view

- **Depends on:** T-013
- **Requirement:** FR-031
- **Files/surfaces:** `Application/Merge/AcknowledgeIdentityMerge.cs`, case detail page
- **Done when:** case stays `reconciling` while a registered fake consumer has not acknowledged; failure acknowledgement requires an owner before `completed-with-incidents`.
- **Evidence:** Not run

### [ ] T-015: Reverse merge

- **Depends on:** T-014
- **Requirement:** FR-034
- **Files/surfaces:** `Application/Merge/ReverseMerge.cs`
- **Done when:** manifest assignments restored; a record created after the merge is listed for manual attribution and not moved; both events kept in history.
- **Evidence:** Not run

### [ ] T-016: Overlay case

- **Depends on:** T-012
- **Requirement:** FR-033
- **Files/surfaces:** `Application/Cases/OpenOverlayCase.cs`, display restriction in `GetSummary`
- **Done when:** overlay blocks merge on that identity; summary query flags restriction; clinical display requires the overlay review permission.
- **Evidence:** Not run

### [ ] T-017: Integration events contract

- **Depends on:** T-013
- **Requirement:** FR-037
- **Files/surfaces:** `Contracts/Events/*`
- **Done when:** each listed event is emitted by its command with identity version; contract tests freeze event schemas v1.
- **Evidence:** Not run

### [ ] T-018: Registration desk UI

- **Depends on:** T-006 to T-011
- **Requirement:** FR-001, FR-002, FR-004, FR-014, FR-021 (user-facing)
- **Files/surfaces:** `Host/Pages/Admision/Pacientes/*`
- **Done when:** manual walkthrough with the 10 synthetic cases in the plan completes without fabricated data; keyboard-only registration possible; Spanish UI labels.
- **Evidence:** Not run

### [ ] T-019: Synthetic data generator and matching calibration report

- **Depends on:** T-005, T-012
- **Requirement:** FR-002, FR-027 (calibration); constitution 4.3
- **Files/surfaces:** `tools/SyntheticPatients`, `docs/reports/identity-matching-calibration.md`
- **Done when:** generator produces Salvadoran-style names, surnames, DUIs with valid check digits, twins, homonyms and typo variants with ground truth; report states precision and recall of candidate retrieval at the chosen settings, measured, with the command used.
- **Evidence:** Not run

### [ ] T-020: Research-driven additions (R01)

- **Depends on:** T-006, T-009, T-012, T-013
- **Requirement:** FR-039, FR-040, FR-041, FR-042, FR-043, FR-044
- **Files/surfaces:** `Application/Registration/*`, `Application/Merge/PreviewMerge.cs`, `Application/Indicators/*`, MRN generator, territorial catalog seed
- **Done when:** informant and capturing user stored on registration; twin temporary names follow the convention and are replaced with history; indicator query returns numerator, denominator and period; preview leaves the database unchanged (row counts and versions identical before and after); MRN with a wrong check digit is rejected; similar-name alert appears for two open episodes with equal phonetic keys; addresses validate against the territorial catalog and keep pre-2024 municipality text.
- **Evidence:** Not run

## Traceability and completion

| Requirement | Task ID(s) | Acceptance/evidence coverage |
|---|---|---|
| FR-001 | T-006, T-018 | Search token test; walkthrough |
| FR-002 | T-005, T-019 | Ranking and reasons tests; calibration report |
| FR-003 | T-003 | Phonetic pair tests |
| FR-004 | T-005 | Projection test |
| FR-005, FR-006 | T-006 | Parallel MRN test |
| FR-007 | T-006 | Legacy MRN identifier test |
| FR-008, FR-009 | T-002 | Validator tests |
| FR-010, FR-011 | T-006 | Concurrency and issuer tests |
| FR-012, FR-013 | T-007 | Identifier lifecycle tests |
| FR-014, FR-017 | T-008 | Provisional tests |
| FR-015, FR-016, FR-018 | T-003 | Value object tests |
| FR-019, FR-020 | T-010 | Relationship tests |
| FR-021, FR-022 | T-009 | Newborn tests |
| FR-023 to FR-025 | T-004 | History and concurrency tests |
| FR-026 to FR-028 | T-012 | Case workflow tests |
| FR-029, FR-030, FR-032 | T-013 | Merge tests |
| FR-031 | T-014 | Consumer ack tests |
| FR-033 | T-016 | Overlay tests |
| FR-034 | T-015 | Reverse merge tests |
| FR-035, FR-036 | T-011 | Status tests |
| FR-037 | T-017 | Contract tests |
| FR-038 | T-005 | Audit assertion |
| FR-039 to FR-044 | T-020 | Research addition tests |

- [ ] Every approved `FR-*` requirement maps to at least one task, or is explicitly deferred with approval.
- [ ] Task dependencies are ordered and each "Done when" statement is observable.
- [ ] Evidence records exact checks and observed outcomes; planned or historical checks are not presented as current proof.
- [ ] All accepted tasks are checked only after their criteria and evidence are satisfied.
