# Audit review, retention, access requests and exports specification

**Status:** Draft
**Owner:** Project lead; CLIMESA owners PENDING-INS04 (direction, expediente committee, privacy responsible), PENDING-INS12 (custody)
**Last updated:** 2026-10-13 (rev. 1, research dossiers R01, R20, R21)

## Problem and outcome

Spec 000 writes a tamper-evident audit trail. This spec makes it useful and makes custody obligations operable: access logs reviewed monthly and kept two years (Norma técnica del expediente clínico Art. 55-56), retention clocks per expediente (active 5 years, passive 5 more; deceased 5 or 10 by cause; auxiliary series 1 year; Art. 34-35, 37), disposal only with acta and inventory (Art. 34, 66), copies and exports to titular, representative or authorized relatives (Art. 41 reformed), certified copies (Art. 21, 64), judicial requests (Art. 32), incidents of loss or damage (Art. 26-27), data-subject requests in 20 business days (LPDP Art. 16, 18, 20) and breach notification within 72 hours (LPDP Art. 25).

Outcome: every obligation has a queue, a clock, an owner and evidence; nothing is destroyed or delivered without a recorded decision; and the hospital can show an auditor what happened.

## Scope

### In scope

- Access review: monthly sampling and rule-based flags (self-lookup, coworker lookup, VIP, no-relationship access, after-hours bulk), reviewer decision, retention of logs.
- Integrity checks of the audit chain and of document blobs, with incident on failure.
- Retention clocks per person record and per document series, derived from activity, death and cause category; annual review list.
- Legal holds that suspend disposal.
- Disposal proposals, approval, acta, inventory and secure deletion evidence.
- Access and copy requests: requester identity, relationship proof, scope, format (copy, summary, digital export), deadline, decision, delivery evidence.
- Certified copy and export packages with manifest, hashes and encryption.
- Data-subject requests under LPDP (access, rectification, cancellation, opposition, portability, limitation) with 20 business-day clock and business-day calendar.
- Rectification route: personal data via spec 001, clinical content via spec 003; suppression only as reviewed case (Art. 43).
- Incidents: document loss or damage (15 business-day verification, Art. 26-27) and personal data breach (72 h clock, LPDP Art. 25).
- Business-day calendar with national holidays (asuetos) as versioned configuration.

### Out of scope

- Patient complaints workflow (Reglamento LDDPPSS Art. 9): planned spec 010, reusing clocks and case engine from this spec.
- Physical archive loans and scanning: spec 004.
- Writing the audit events themselves: spec 000.

## Functional requirements (EARS)

**Audit review and integrity**

- **FR-001:** The system shall keep access audit events online and queryable for at least 2 years and then move them to archive storage that remains verifiable, never deleting them before the configured retention (Norma Art. 55).
- **FR-002:** When a month closes, the system shall generate an access review set combining rule-based flags and a random sample of configurable size, assign it to reviewers, and require a decision per item (justified, needs explanation, incident) within a configurable deadline (Norma Art. 56).
- **FR-003:** The system shall evaluate rules that flag: access by a user to their own record or to records of persons sharing their surname and address, access to records marked VIP or staff, access with no active encounter, care relationship or assigned task, and access volume above a threshold in a period.
- **FR-004:** When a reviewer marks an item as incident, the system shall open a privacy incident with the evidence and notify the privacy responsible.
- **FR-005:** The system shall run the audit hash-chain verification and a document blob integrity scrub on a schedule and on demand, recording result, range checked and duration; a failure shall open an integrity incident.

**Retention and disposal**

- **FR-006:** The system shall compute for each person's expediente a retention state (active, passive, deceased, held, eligible for disposal) from last clinical activity, deceased date and cause category, using versioned rules: active until 5 years without activity, then passive for 5 more; deceased 5 years for natural cause or 10 years for violence, accident or investigation (Norma Art. 34-35).
- **FR-007:** The system shall support document series with their own retention rule (auxiliary records such as agendas, census, daily registers: 1 year, Art. 37) and a series catalog where each rule cites its legal basis.
- **FR-008:** When the annual review runs, the system shall list records changing state, physical archive movements needed (active to passive area, Art. 22) and records eligible for disposal.
- **FR-009:** While a legal hold covers a person, series or document, the system shall exclude it from disposal and show the hold reason, authority and review date.
- **FR-010:** When disposal is proposed, the system shall require approval by a role different from the proposer, generate an inventory and an acta with the legal basis, method and witnesses, and only then execute deletion of electronic content and record evidence (hashes deleted, storage locations, backups covered by expiry), keeping a minimal tombstone (identity id, series, dates, acta reference) (Norma Art. 34, 66).
- **FR-011:** The system shall never delete content automatically because a retention period ended.

**Access, copies and exports**

- **FR-012:** When an access or copy request is received, the system shall record requester, identity evidence, relationship to the patient and its evidence, requested scope and format, channel, received instant and the deadline from the configured rule.
- **FR-013:** When deciding a request for a living patient, the system shall allow release only to the titular or a representative with `may_request_copies` scope (spec 001 FR-019); for a deceased patient, to relatives up to 4th degree of consanguinity or 2nd of affinity with evidence (Norma Art. 41 reformed); any other requester requires a legal basis recorded by an authorized decider.
- **FR-014:** When a request is approved, the system shall build a package with the selected documents, a manifest listing each item with version and SHA-256, the request id and decision, rendered to PDF/A for documents and original files for binaries, encrypted for digital delivery, and record delivery channel, recipient and acknowledgement (Norma Art. 41, 61, 64; V3 AC314).
- **FR-015:** When a certified copy is requested, the system shall produce the package with a certification page per Art. 21 for physical sealing and signing by direction or its delegate, and record who certified.
- **FR-016:** When a judicial or authority request is received, the system shall record authority, reference, scope and deadline, require legal review before release, and deliver certified and encrypted digital copies with evidence (Norma Art. 32).

**Data-subject rights (LPDP)**

- **FR-017:** The system shall manage data-subject requests by type (access, rectification, cancellation, opposition, portability, limitation) with a 20 business-day deadline computed with the business-day calendar, alerts before expiry, decision with reasons, and delivery evidence (LPDP Art. 16, 18, 20).
- **FR-018:** When a rectification of personal data is approved, the system shall execute it through spec 001 commands with the request id as evidence; clinical content corrections shall be routed to the author or delegate through spec 003 (Norma Art. 42).
- **FR-019:** When a cancellation or suppression is requested for clinical data, the system shall open a reviewed case and allow suppression only when a decider records that the data are not needed for care or legal retention (Norma Art. 43); otherwise it shall respond with the legal basis for retention.

**Incidents**

- **FR-020:** When loss or damage of an expediente or document is reported, the system shall open a documentary incident with immediate notification to the archive head and direction, a verification deadline of 15 business days, and an outcome of found, reconstructed (with sources) or acta of loss (Norma Art. 26-27).
- **FR-021:** When a suspected personal data breach is recorded, the system shall start a 72-hour clock from detection, guide the assessment (data, persons, cause, containment), and record the notification to the authority and to affected persons with instants and content (LPDP Art. 25).

**Calendar and audit**

- **FR-022:** The system shall keep a business-day calendar with weekends and national holidays as versioned configuration per year, used by every business-day deadline.
- **FR-023:** Every request, decision, package, disposal and incident shall be written to the audit store with actor and evidence.

## Scenarios and edge cases

| Requirement | Given | When | Then |
|---|---|---|---|
| FR-002 | October closes | Review generated | 50 random + all flagged items assigned; decision required per item |
| FR-003 | Nurse opens her own expediente | Month review | Flagged "self access" |
| FR-005 | Someone altered an audit row with superuser | Nightly verification | Integrity incident with row id |
| FR-006 | Last visit 2020-03-01, no death | 2026 review | Passive since 2025-03-01; eligible for disposal 2030-03-01 |
| FR-006 | Deceased by traffic accident 2022 | Review | Retain until 2032 |
| FR-009 | Patient under judicial hold | Disposal run | Excluded with hold shown |
| FR-010 | Proposer tries to approve own disposal | Approve | Rejected |
| FR-011 | Retention ended, no proposal | Time passes | Nothing deleted |
| FR-013 | Neighbor asks for a living patient's copy | Decision | Not allowed without legal basis |
| FR-013 | Nephew (3rd degree) asks for deceased uncle's record | Evidence of relationship | Allowed |
| FR-014 | Approved digital export | Delivered | Encrypted package, manifest with hashes, delivery logged |
| FR-017 | Request received Friday before a holiday week | Deadline | Computed with calendar, skipping holidays |
| FR-019 | Patient asks to erase diagnosis | Case | Rejected with retention basis unless decider records otherwise |
| FR-020 | Expediente not found after loan | Reported | Incident with 15 business-day deadline |
| FR-021 | Laptop with exports stolen | Breach recorded | 72 h clock; notification evidence required to close |

## Definition of done

- [ ] Every in-scope outcome is represented by one or more testable `FR-*` requirements.
- [ ] Scenarios cover normal behavior and material edge/failure cases.
- [ ] Out-of-scope items and unresolved decisions are explicit.
- [ ] Acceptance and verification are observable, with no claim of unrun checks.
- [ ] The approved requirements are traceable to tasks in `tasks.md`.

## Research traceability

| Research item | Requirement(s) |
|---|---|
| Norma 1616 Art. 21, 22, 26-27, 32, 34-35, 37, 41 (reformed), 43, 55-56, 61, 64, 66 | FR-001 to FR-016, FR-019, FR-020 |
| LPDP Art. 16, 18, 20, 25 (as reformed by Decreto 659) | FR-017, FR-018, FR-021 |
| V3 AC314 export with hash and receiver | FR-014 |
| V8 CMP03, CMP04, DOC03 | FR-009, FR-010, FR-017 to FR-019 |
| R20 section 6 (incident clock, evidence) | FR-005, FR-021 |

## Open decisions

| Item | Default until decided | Owner |
|---|---|---|
| Deadline for clinical copy requests (Norma does not fix one in the read text) | 10 business days, configurable | PENDING-INS12 |
| Monthly review sample size and reviewers | 50 items; privacy responsible plus archive head | PENDING-INS04 |
| VIP and staff list maintenance | Staff automatically flagged from HR; VIP manual | PENDING-INS04 |
| Holiday calendar source | Código de Trabajo asuetos plus decreed days, entered yearly | PENDING-INS10 |
| Online audit window before archive | 2 years | PENDING-INS12 |
