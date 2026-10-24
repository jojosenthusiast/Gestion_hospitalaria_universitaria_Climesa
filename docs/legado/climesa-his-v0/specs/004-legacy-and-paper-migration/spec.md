# Legacy and paper migration specification

**Status:** Draft
**Owner:** Project lead; CLIMESA owners PENDING-INS05 (archive), PENDING-INS04 (expediente committee), PENDING-INS11 (legacy systems)
**Last updated:** 2026-10-13 (rev. 1, research dossier R02)

## Problem and outcome

CLIMESA's history lives mostly on paper, accumulated over about 54 years, plus whatever the previous vendor left. Migration projects fail in two opposite ways: limited manual abstraction that loses active orders, and bulk conversion that imports bad codes, broken characters and duplicates (Schreiber and Garber, ACI Open 2020). There is no Salvadoran scanning standard; the expediente norm requires that paper and electronic numbers correspond (Norma 1616 Art. 14), that duplicates be prevented (Art. 12), that loans be controlled with 48-hour return (Art. 29-31), and that paper/electronic discrepancies go to the committee (Art. 42).

Outcome: migration is a set of measured, reversible batches. Every source record ends in a destination or a justified rejection; every identity mapping states its certainty; every scanned page has provenance, hash and QC; clinicians abstract critical data with their names on it; and during coexistence exactly one source is authoritative for each object and window.

## Scope

### In scope

- Archive inventory: physical records by number, year range, status (active, passive, deceased, unknown), condition, location.
- Legacy identity index load (from paper index typing or legacy files) through spec 001 commands, with probabilistic duplicate detection before creation.
- Migration batches with source fingerprint, transformation version, counts in/out/rejected, and reconciliation.
- Mapping of legacy identifiers to identities with certainty and conflict queue.
- Scanning pipeline: physical loan to scanning, preparation, capture, indexing (person, document type, date range), QC, publication to spec 003 as read-only scanned documents, return to archive.
- Structured abstraction of critical data (allergies, active problems, current medications, relevant history, last evolution) by clinical staff, marked as abstracted and validated at next encounter.
- Scan-on-demand trigger for patients with upcoming appointments or admissions.
- Legacy structured data import (if any exists), with versioned transformations.
- Coexistence write-authority registry and cutover plan per service, rollback rehearsal.
- Paper/electronic discrepancy reporting (handled by spec 003 FR-015).
- Migration indicators.

### Out of scope

- Destruction of paper originals: decided by spec 005 disposal with acta, never by migration.
- Migration of open financial balances and payments from a legacy system: spec 006 reuses the batch and reconciliation framework (AC-P01-009) when the source is known.
- OCR-driven structured extraction without human validation (forbidden by spec 003 FR-009).

## Functional requirements (EARS)

**Inventory and loans**

- **FR-001:** The system shall register physical expediente units with legacy number, holder name as written, year range, archive area, condition and status, allowing units with unknown owner.
- **FR-002:** When a physical expediente leaves the archive for scanning or consultation, the system shall record a loan with requester, purpose, out instant and due instant, and shall flag loans not returned within the configured period (default 48 hours, Norma Art. 29-31).

**Batches and reconciliation**

- **FR-003:** The system shall execute every load as a batch with source description, source file fingerprint (SHA-256), transformation code version, operator, environment, start and end instants, and counts of records read, created, updated, matched, rejected and pending.
- **FR-004:** When a batch completes, the system shall verify that read = created + updated + matched + rejected + pending and shall refuse to mark it complete otherwise (AC-P01-008).
- **FR-005:** When a record is rejected, the system shall store the source record reference, the rule that failed and a resolution status in a queue with an owner; there shall be no silent drops.
- **FR-006:** The system shall allow re-running a batch with the same source fingerprint and transformation version idempotently, producing no additional effects.
- **FR-007:** The system shall preserve original characters (ñ, accents, apostrophes) end to end and shall include in every batch report a character validation sample comparing source and destination.

**Identity mapping**

- **FR-008:** When legacy identities are loaded, the system shall run probabilistic matching (Fellegi-Sunter style, with explained per-field weights) against existing identities and within the batch, and shall create identities only through spec 001 commands; candidate duplicates open spec 001 duplicate cases instead of being merged.
- **FR-009:** The system shall record each legacy identifier mapping with source system, legacy value, mapped person, certainty (exact identifier match, reviewed, provisional) and decider, and shall send ambiguous mappings to a conflict queue without inventing issuer, birth date or equivalence (AC-P01-007).
- **FR-010:** The system shall store the legacy paper number as a `legacy_paper_mrn` identifier (spec 001 FR-007) so that paper and electronic numbers correspond (Norma Art. 14).
- **FR-011:** When names were typed from paper as a single string, the system shall require separation into given names and surnames before load, flagging records where separation is uncertain (Fraser 2018).

**Scanning**

- **FR-012:** The system shall manage scanning work orders per expediente with states: requested, pulled, prepared, scanned, indexed, QC passed, QC failed, published, returned.
- **FR-013:** When pages are captured, the system shall record for each image file its resolution, color mode, page count, operator, device and instant, and shall reject captures below the configured minimum for the document class (defaults: 400 dpi clean text; 600 dpi handwriting or low contrast; color when seals or colored ink matter) (Arizona Minimum Standards 2025).
- **FR-014:** When an expediente is prepared, the system shall record the physical folio count, and QC shall compare it with captured pages, recording explained differences (blank backs, attachments).
- **FR-015:** QC shall sample pages by a configured rate and require a second user to pass or fail with reasons (legibility, missing page, wrong patient, orientation); failed items return to capture.
- **FR-016:** When a scanned expediente passes QC, the system shall publish it through spec 003 as scanned documents in PDF/A, bound to the person and indexed by document type and date range, and the published content shall be read-only.
- **FR-017:** The system shall prioritize scanning work orders automatically for persons with an appointment, admission or emergency encounter in the next configurable days.

**Abstraction**

- **FR-018:** The system shall provide structured abstraction forms for critical data, recording the abstractor (clinical role required), the source pages referenced, and the instant, and marking every item as `abstracted_from_paper`.
- **FR-019:** When an abstracted item is first displayed during a new encounter, the system shall ask the treating professional to confirm, correct or discard it, and record the decision; unconfirmed items shall remain visibly marked.
- **FR-020:** When abstracting active medications or active orders, the system shall require item-by-item verification with the treating professional before they are used for any order (Schreiber and Garber 2020: lost active orders).

**Legacy structured data**

- **FR-021:** When importing a legacy system or spreadsheet, the system shall keep the raw extract read-only, record field mappings and code maps as versioned artifacts, and preserve historical versions, authors and corrections where present, marking unknown authorship explicitly without inventing signatures (AC-P01-010).

**Coexistence, cutover, rollback**

- **FR-022:** The system shall keep a write-authority registry per object type and service with the authoritative source (paper, legacy system, new system) and the effective window; while paper is authoritative for a service, electronic entries for that service shall be marked as transcriptions, and after cutover paper forms shall be refused except under declared contingency (AC-P01-011).
- **FR-023:** Before cutover of a service, the system shall produce a cutover checklist (identities loaded, critical data abstracted for active patients, scanning backlog for scheduled patients, staff trained, contingency forms printed) and require sign-off by the service owner.
- **FR-024:** The system shall support a rehearsed rollback per cutover that preserves operations created after cutover and their external effects (DTE, payments) and reintroduces them under control instead of discarding or duplicating them (AC-P01-012).

**Indicators**

- **FR-025:** The system shall report: expedientes inventoried, scanned, QC passed, published; pages per hour per stage; QC failure rate by reason; rejects open by age; duplicates detected and resolved; abstracted items confirmed vs discarded; loans overdue.

## Scenarios and edge cases

| Requirement | Given | When | Then |
|---|---|---|---|
| FR-002 | Expediente pulled for scanning Monday 9:00 | Not returned Wednesday 9:01 | Overdue flag to archive head |
| FR-004 | Batch read 10,000, created 9,800, rejected 150 | Complete | Refused: 50 unaccounted |
| FR-006 | Same file loaded twice | Second run | No new records; report says "already applied" |
| FR-007 | Source "Muñoz Peña" | Loaded | Exact characters in destination; sample in report |
| FR-008 | Index has "Jose Hernandez" twice with same birth date | Load | One identity created, one duplicate case opened |
| FR-009 | Legacy number "4512" appears on two different patients | Load | Both mappings to conflict queue; no merge |
| FR-011 | Paper index "MARIA ELENA LOPEZ DE PEREZ" | Separation | Married surname particle recognized; flagged for review |
| FR-013 | Handwritten notes scanned at 300 dpi | Capture | Rejected for class "handwriting" |
| FR-014 | 87 folios, 85 images | QC | Difference must be explained or recaptured |
| FR-016 | QC passed | Publish | Read-only scanned documents in patient's index |
| FR-017 | Patient with surgery next week, not scanned | Nightly | Work order priority raised |
| FR-019 | Abstracted allergy shown at admission | Physician | Confirms; item no longer marked unconfirmed |
| FR-020 | Abstracted "warfarina 5 mg" | Prescriber wants to continue | Must verify item first |
| FR-022 | Pediatrics not yet live | Nurse types a note electronically | Marked transcription; paper remains authoritative |
| FR-024 | Rollback rehearsal after 2 days live | Run | New encounters and DTE preserved and listed for re-entry; no duplicate DTE |

## Definition of done

- [ ] Every in-scope outcome is represented by one or more testable `FR-*` requirements.
- [ ] Scenarios cover normal behavior and material edge/failure cases.
- [ ] Out-of-scope items and unresolved decisions are explicit.
- [ ] Acceptance and verification are observable, with no claim of unrun checks.
- [ ] The approved requirements are traceable to tasks in `tasks.md`.

## Research traceability

| Research item | Requirement(s) |
|---|---|
| AC-P01-007 ambiguous legacy identifier | FR-009 |
| AC-P01-008 no silent loss | FR-003 to FR-005 |
| AC-P01-010 history and provenance | FR-021 |
| AC-P01-011 write authority in coexistence | FR-022 |
| AC-P01-012 rollback after new writes | FR-024 |
| Norma 1616 Art. 12, 14, 29-31, 42 | FR-002, FR-008, FR-010 |
| R02 sections 6-8 (Schreiber and Garber, CHCF, AHIMA, Splink, Fraser, Arizona) | FR-007, FR-008, FR-011, FR-013 to FR-020, FR-025 |

## Open decisions

| Item | Default until decided | Owner |
|---|---|---|
| Volume, year range and condition of paper archive | Measured in inventory sample | PENDING-INS05 |
| Whether legacy system data exist and can be exported | Assume none until shown | PENDING-INS11 |
| In-house scanning vs outsourcing | In-house pilot of 100 expedientes to measure time and cost | PENDING-INS04 |
| QC sampling rate | 10% of pages, 100% of first 20 expedientes | PENDING-INS05 |
| Which critical data to abstract per service | Allergies, active problems, current medications, relevant history, last evolution | PENDING-INS04 |
| Cutover order of services | Emergency and admission first (identity), then wards | PENDING-INS04 |
