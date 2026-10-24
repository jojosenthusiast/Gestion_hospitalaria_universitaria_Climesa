# Feature specifications

Each feature gets `specs/<nnn-feature-name>/` with `spec.md`, `plan.md` and `tasks.md` copied from [`_template/`](./_template/).

## Workflow

1. Agree on outcome, scope, scenarios and numbered `FR-*` requirements in `spec.md` before designing implementation.
2. Write and review `plan.md`: boundaries, contracts, data and migration impact, security, failure handling, verification.
3. Break the plan into dependency-ordered atomic tasks in `tasks.md`, each linked to `FR-*` and with an observable "Done when".
4. Implement one task at a time; record the exact verification command and observed result.

## Conventions

- English for technical artifacts; Salvadoran legal terms keep their Spanish name.
- `FR-001`, `FR-002`... per spec, written as EARS ("When/While/If/Where ..., the system shall ...").
- Cite law and research with source and version. Research IDs refer to the package in `docs/research/` (V3 `ACxxx`, P01 `AC-P01-xxx`, institutional register `INS01-INS12`).
- `PENDING-INS<nn>`: depends on a CLIMESA fact not yet confirmed. Implement as versioned configuration with a safe default and keep it visible in the spec's "Open decisions".
- Status values: Draft, In review, Approved, Implemented, Superseded.

## Roadmap

Order follows the agreed strategy: build a service-agnostic, legally sound foundation and the paper-to-system migration first; then the economic circuit that CLIMESA's accounting contact needs; then clinical services once the portfolio (INS02) is confirmed.

| Spec | Scope | Depends on | Research anchors | Status |
|---|---|---|---|---|
| [000-platform-foundation](./000-platform-foundation/spec.md) | Solution layout, authentication, permission model, idempotency, outbox, audit event contract, time handling | none | V9 principles 2, 6; P01 section 4 | Draft |
| [001-patient-identity](./001-patient-identity/spec.md) | Master patient index: search before create, Salvadoran identifiers, provisional and newborn identities, demographic history, duplicate and overlay cases, supervised merge and unmerge | 000 | V3 ID01-ID06, AC301-AC312; P01 C01; AC-P01-007 | Draft |
| [002-episode-encounter](./002-episode-encounter/spec.md) | Emergency arrival and triage record, encounters, inpatient episode milestones, beds with cleaning release, transfers, discharge types, continuity items, census | 001 | V3 AT01-AT04, AC315-AC318; P01 C02, C09; R03, R04 | Draft |
| [003-clinical-documents](./003-clinical-documents/spec.md) | Typed clinical documents, templates, simple electronic signature with license check, addenda and corrections, binary store, consents, discharge report, discrepancy cases | 001, 002 | Norma 1616 Art. 13, 16-17, 23, 42, 70; LDDPPSS Art. 13-14; AC313 | Draft |
| [004-legacy-and-paper-migration](./004-legacy-and-paper-migration/spec.md) | Archive inventory and loans, batches with reconciliation, identity load with probabilistic matching, scanning with QC, clinical abstraction, write authority, cutover and rollback | 001, 003 | P01 T310, AC-P01-007 to AC-P01-012; Norma Art. 12, 14, 29-31; R02 | Draft |
| [005-audit-retention-access](./005-audit-retention-access/spec.md) | Access review, integrity checks, retention clocks, legal holds, disposal with acta, copy and LPDP requests, certified exports, documentary incidents and breach clock, business-day calendar | 000, 001, 003 | Norma Art. 21-37, 41-43, 55-66; LPDP Art. 16-25; V3 AC314; R20, R21 | Draft |
| [006-patient-account-charges](./006-patient-account-charges/spec.md) | Catalog and tariffs, accounts, charges with snapshots, bed-days to discharge signature, estimates and statements, deposits, payments, cashier sessions, payer split, exception queues | 002 | P01 C05-C08; V3 E01-E03, AC319-AC326; LDDPPSS Art. 13-14, 29; R14, R16 | Draft |
| 007-dte-fiscal-documents | DTE preparation, signing, transmission, uncertain state, contingency, invalidation, archive, MH test suite | 006 | V3 08_DTE, AC330-AC332; MH Normativa 2.0 | Planned |
| 008-accounting-posting | Event-driven posting rules, periods and closing, reconciliation queues | 006, 007 | V3 E10, AC327-AC329; P01 section 7 | Planned |
| 009-claims-and-remittances | Insurer claims, acknowledgements, partial payment and rejection, disputes, bank reconciliation | 006, 008 | P01 T309, AC-P01-001 to AC-P01-006 | Planned |
| 010-complaints | Complaints office: intake, priority clocks (immediate/24 h, 3-5 days, 15 days), investigation, written response, external cases | 005 | Reglamento LDDPPSS Art. 9; LDDPPSS Art. 21, 44 d; R21 | Planned |

Clinical service specs (orders, pharmacy and medication loop, nursing, laboratory and imaging integration, surgery) are scheduled after INS02 (portfolio) and INS03 (own, external or referred modality) are answered.
