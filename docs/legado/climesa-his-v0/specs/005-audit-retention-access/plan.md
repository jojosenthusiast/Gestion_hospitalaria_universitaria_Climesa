# Audit review, retention, access requests and exports implementation plan

**Related spec:** [`spec.md`](./spec.md)
**Status:** Draft
**Last updated:** 2026-10-13

## Goal and scope

Implement module `Custody`: access review, integrity jobs, retention engine, legal holds, disposal, requests (clinical access and LPDP), packages, incidents, business-day calendar.

## Architecture and boundaries

- **Components:** `Climesa.Modules.Custody.{Domain, Application, Infrastructure, Contracts}`; UI `/custodia`.
- **Case engine:** one generic `Case` aggregate (type, status machine per type, deadline, owner, evidence list, decisions) reused by requests, disposals, incidents and, later, complaints (spec 010). Types define allowed transitions and required evidence in code, with deadlines from the policy registry.
- **Reads from other modules only through contracts:** `IIdentityQueries` (relationships, deceased), `ICareQueries` (last activity, care relationships for FR-003), `IDocumentQueries` (documents and blobs), audit store reader (spec 000).
- **Retention engine:** nightly job computes state per person from last activity date (max of encounter end, document signature) and death data; stores current state and next transition date; rules versioned in the policy registry with legal citation.
- **Packages:** renderer produces PDF/A-2b (QuestPDF or wkhtmltopdf decision in task) plus originals; manifest JSON signed with the hospital's key; zip encrypted with AES-256 (password delivered by separate channel) per Art. 61.
- **Alternatives:** separate workflow engine (Elsa, Camunda) vs internal case engine: internal, because the types are few and legal deadlines must be testable with a fake clock without an external runtime.

## Contracts

| Operation | Permission |
|---|---|
| `GenerateMonthlyReview`, `DecideReviewItem` | `custody.review.manage`, `custody.review.decide` |
| `RunIntegrityCheck` | `custody.integrity.run` |
| `PlaceLegalHold` / `ReleaseLegalHold` | `custody.hold` (MFA) |
| `ProposeDisposal` / `ApproveDisposal` / `ExecuteDisposal` | `custody.disposal.propose` / `.approve` (MFA, ≠ proposer) / `.execute` |
| `RegisterRequest` / `DecideRequest` / `BuildPackage` / `RecordDelivery` | `custody.request.*` |
| `RegisterDataSubjectRequest` and decisions | `custody.lpdp.*` |
| `ReportDocumentIncident` / `ReportBreach` / incident transitions | `custody.incident.*` |
| `SetCalendarYear` | `custody.calendar.admin` |

Events: `RetentionStateChanged`, `DisposalExecuted`, `RequestDecided`, `PackageDelivered`, `IncidentOpened`, `IncidentClosed`.

## Data and migrations

Schema `custody`: `cases` (type, status, opened_at, deadline_at, owner, subject person ids, payload jsonb), `case_events` (append-only), `case_evidence` (blob hashes from records store), `review_sets`, `review_items`, `integrity_runs`, `retention_states` (person, state, since, next_at, rule_version), `series_catalog`, `legal_holds`, `disposal_items` (tombstones), `packages` (manifest jsonb, manifest_hash, encrypted file hash), `business_calendar` (date, is_business_day, year_version).

## Security and privacy

- Package building runs with a service identity whose actions are audited per item.
- Tombstones keep no clinical content.
- Breach and privacy incident cases visible only to privacy roles.

## Failure and recovery

- Disposal execution is resumable: per-item status; partial failure leaves the case `executing` with the failed items listed; never reports complete until all items confirmed.
- Retention job idempotent; recomputation yields same state for same inputs and rule version.
- Package build failure leaves request approved but undelivered with alert.

## Verification

| Check | Command or procedure | Expected evidence |
|---|---|---|
| Retention rules | `dotnet test --filter RetentionStateRules` (fake clock, table-driven) | Active/passive/deceased cases match Art. 34-35 table |
| Hold blocks disposal | `--filter LegalHoldExcludesDisposal` | Excluded |
| Segregated approval | `--filter DisposalApproverDiffers` | Rejected same user |
| No auto delete | `--filter RetentionNeverDeletes` | Content intact after period |
| Requester rules | `--filter CopyRequestRequesterRules` | Living vs deceased degrees enforced |
| Package manifest | `--filter PackageManifestHashes` | Hashes match blobs; zip encrypted |
| Business days | `--filter BusinessDayDeadlines` | Holidays skipped |
| Review flags | `--filter AccessReviewRules` | Self, surname/address, no-relationship flagged |
| Integrity incident | `--filter IntegrityFailureOpensIncident` | Incident opened |
| Breach clock | `--filter BreachClock72h` | Deadline = detection + 72 h |

## Risks and decisions

- **Risk:** monthly review becomes a rubber stamp. Mitigation: small sample, rule hits first, reviewer metrics.
- **Risk:** disposal of electronic content conflicts with backups. Mitigation: backup expiry documented in acta; no promise of instant erasure in backups (V8 DOC03).

## Plan review

- [ ] Architecture, contracts, data, migration, security, and failure handling are addressed.
- [ ] Verification is scoped, exact, and tied to requirements.
- [ ] No unresolved decision is silently treated as approved.
