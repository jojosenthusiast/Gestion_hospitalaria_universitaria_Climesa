# Patient identity specification

**Status:** Draft
**Owner:** Project lead; CLIMESA owners PENDING-INS04 (admission/archive, clinical direction, privacy)
**Last updated:** 2026-10-13 (rev. 2, research dossier R01)

## Problem and outcome

CLIMESA identifies patients through paper records accumulated over decades, and a previous system attempt failed. Before any clinical, billing or migration work, the hospital needs one trustworthy answer to "who is this person and which records are theirs". The Aldara prototype cannot give it: it forces a document number, birth date and gender on every patient (fabricated data for unknown patients), treats one untyped document number as unique, overwrites demographics without history and has no duplicate handling (research V3 B301-B309).

Outcome: every person who receives care has exactly one active internal identity; registration searches before creating; Salvadoran identifiers are typed and validated; uncertainty is explicit instead of invented; newborns get their own identity; every change has history; duplicates and overlays are resolved through a supervised, reversible, auditable process whose effects reach every consumer module.

## Scope

### In scope

- Search before registration, with match reasons and minimal disclosure.
- Internal identifier and facility medical record number (MRN).
- Typed identifiers (DUI, NUI, partida de nacimiento, carné de minoridad, pasaporte, carné de residente, NIT for legacy records, ISSS affiliation, legacy paper MRN, legacy system ids, temporary alias), validation and uniqueness by issuing domain.
- Names in Salvadoran structure, birth date with precision, administrative sex, contact points, all with provenance.
- Provisional identity for unknown or undocumented patients, and its later resolution.
- Newborn identities linked to the mother, including multiple births.
- Relationships (mother, legal representative, guardian, emergency contact) as data with type, scope, validity and evidence.
- Append-only demographic history with reason and evidence.
- Duplicate case workflow, supervised merge with manifest, consumer reconciliation, unmerge, overlay case.
- Deceased status and entered-in-error state.
- Identity events for other modules and audit events for every access.

### Out of scope

- Enforcement of representation authority for consent, copies and exports (specs 003 and 005 consume FR-019 data).
- Payer, coverage and guarantor responsibility (spec 006).
- Wristbands and label printing (spec 002, at episode opening).
- Online verification against RNPN or other registries (no available interface identified).
- Cross-institution patient index or MINSAL exchange.
- Biometric identification.
- Bulk loading from paper and legacy systems (spec 004 reuses this spec's commands).

## Functional requirements (EARS)

**Search and registration**

- **FR-001:** When a user starts registering a new patient, the system shall require that a search was executed in the same registration session, with its criteria and result count recorded, before the create action is enabled.
- **FR-002:** When a search is executed, the system shall first match identifiers exactly by type, issuer and normalized value, then match demographics, and shall return each candidate with the reasons it matched (for example "same DUI", "same names and birth year", "phonetically similar surnames").
- **FR-003:** The system shall derive normalized and phonetic search keys from names (case, diacritics, spacing, particles such as "de", "del", "de la", compound surnames, and Spanish sound equivalences such as b/v, s/z/c, ll/y, silent h) in separate fields, without altering the recorded name.
- **FR-004:** When a user without clinical-record permission views search candidates, the system shall show only the attributes needed to distinguish them (names, birth date or year, MRN, masked identifier, municipality) and no clinical data.
- **FR-005:** When a new identity is created, the system shall assign an internal identifier that is immutable, independent of MRN and documents, and never reused.
- **FR-006:** When a new identity is created, the system shall assign an MRN unique within the facility, never reassigned, generated from the facility's configured format (Norma técnica del expediente clínico Art. 11). PENDING-INS05 (format).
- **FR-007:** If a legacy paper record number exists for the patient, then the system shall store it as an identifier of type `legacy_paper_mrn` with its archive source, and shall not use it as the internal identifier (Norma Art. 14: paper and electronic numbers must correspond).

**Identifiers**

- **FR-008:** The system shall record each identifier with type, issuing system, original value, normalized value, verification status (unverified, verified, retired, entered-in-error), validity period, evidence reference and provenance (who, when, from which source).
- **FR-009:** Where an identifier type defines a format or check-digit rule, the system shall validate the value on entry and reject invalid values with the specific failed rule. For DUI the rule is: eight digits, hyphen optional, one check digit equal to (10 - (sum of the eight digits weighted 9 down to 2) mod 10) mod 10.
- **FR-010:** While an identifier type is marked exclusive in its issuing system, the system shall enforce at database level that no two active identifiers share type, issuer and normalized value, so that two concurrent registrations produce one success and one explicit conflict that lists the existing holder for authorized users (research AC303).
- **FR-011:** When the same value exists under different types or issuers, the system shall treat them as unrelated and shall not infer that the holders are the same person (AC302).
- **FR-012:** When an identifier is corrected, the system shall retire the previous value with reason and evidence, keep it searchable for authorized users, and keep the same internal identifier (AC305).
- **FR-013:** When a minor's NUI or carné de minoridad is replaced by a DUI, the system shall record the new identifier and keep the previous one as historical, without creating a new identity.

**Uncertainty and provisional identity**

- **FR-014:** When a patient cannot be identified, the system shall allow creating a provisional identity with a generated, non-reusable temporary alias and without requiring document, names, birth date or sex (AC301; Norma Art. 14).
- **FR-015:** The system shall record birth date with a precision of exact, year and month, year only, estimated from age at a stated date, or unknown, and shall never store an estimate as an exact date.
- **FR-016:** The system shall record administrative sex with the values recorded in the identity document plus `unknown` and `not_recorded`, separate from any clinical parameter.
- **FR-017:** When a provisional identity is later identified, the system shall run the FR-002 search with the new data and either verify the same identity or open a duplicate case; the temporary alias shall remain in history and searchable.

**Names, contact and relationships**

- **FR-018:** The system shall record names as given names, first surname, second surname, optional married surname with optional particle "de" (Ley del Nombre de la Persona Natural Art. 14 and 21), and type (official, known-as, alias, temporary), each with validity and source; multiple names may coexist, and search shall match any combination of first, second and married surname.
- **FR-019:** The system shall record relationships of type mother, father, legal representative, guardian, emergency contact and other, each with the related person (registered identity or free-text contact), scope flags (may consent, may receive information, may request copies), validity, evidence reference and status; an emergency contact shall have no scope flag by default (AC311, AC312).
- **FR-020:** The system shall record contact points (phone, address, email) with use, validity and source, and allow the same phone to belong to several identities without implying a relationship. Addresses shall be structured as department, municipality and district from a versioned territorial catalog (44 municipalities and 262 districts since 2024-05-01) plus free text; an address recorded under the pre-2024 municipality shall keep the original value and its mapping to the current district.

**Newborns**

- **FR-021:** When a hospital birth is registered, the system shall create one identity per newborn, linked to the mother by a `mother` relationship with birth order and birth instant, with its own MRN and no identifier copied from the mother (Norma Art. 10; V3 ID03).
- **FR-022:** While newborns of the same mother have temporary names, the system shall display birth order and a distinct-twin warning wherever they appear together in search results.

**History and correction**

- **FR-023:** When any identity attribute changes, the system shall append a version recording actor, acting permission, instant, previous and new values, reason, evidence reference and command id; current values shall be derivable from history (Norma Art. 42 as reformed by Acuerdo 698 of 2026).
- **FR-024:** If a change targets an attribute in verified status, then the system shall require the `identity.correct_verified` permission and a non-empty reason.
- **FR-025:** When an identity update is submitted with a stale version, the system shall reject it with a conflict showing the current version.

**Duplicates, overlays and merge**

- **FR-026:** The system shall keep duplicate cases with states suspected, under investigation, approved, rejected, applying, reconciling, completed and completed-with-incidents, and record who moved each transition and why.
- **FR-027:** The system shall never merge identities automatically; matching scores shall only open or prioritize suspected cases (V3 D303).
- **FR-028:** When a merge is approved, the system shall require that approver and requester are different users and that the approver holds `identity.merge.approve`.
- **FR-029:** When an approved merge is applied, the system shall, in one transaction: mark the non-surviving identity `retired_merged` pointing to the survivor; move or alias its identifiers, names, contacts and relationships per the decided survivor values; write a manifest listing every affected record with before and after references and its content hash; and enqueue an `IdentityMerged` event (AC306).
- **FR-030:** When a merge command is resubmitted with the same idempotency key and content, the system shall return the original result without a second effect (AC307).
- **FR-031:** While any registered consumer module has not acknowledged an `IdentityMerged` event, the case shall remain `reconciling` and list the pending consumers; a consumer failure shall move the case to `completed-with-incidents` only after an authorized user records the incident owner (AC308).
- **FR-032:** When a merge targets an identity that is already `retired_merged`, the system shall resolve to its current survivor; if the resolution would create a cycle, it shall reject the merge.
- **FR-033:** When a user flags that one record mixes two people, the system shall open an overlay case that blocks merge for that identity and routes to supervised separation, and shall restrict clinical display of the mixed record to users with `identity.overlay.review` plus clinical permission until resolved (AC309).
- **FR-034:** When an applied merge is reversed, the system shall restore every assignment listed in the manifest, list records created after the merge that reference the survivor for manual attribution without redistributing them, emit `IdentityMergeReversed`, and keep the original merge and its reversal in history (AC310).

**Status**

- **FR-035:** The system shall record deceased status with date and its precision, source, evidence and retention category (natural cause; violence or accident; under investigation) without recording a diagnosis, independent of any other status; a deceased identity remains searchable, is flagged clearly wherever it is displayed, and its records remain accessible to authorized users (V3 D306; Norma Art. 35; SAFER 2.6).
- **FR-036:** The system shall not provide hard deletion of identities; it shall allow `entered_in_error` with reason only while no episode, document, charge or payment references the identity, and otherwise require a merge or overlay case.

**Events and audit**

- **FR-037:** When an identity is created, verified, changed, merged, unmerged, marked deceased or marked entered-in-error, the system shall publish the corresponding integration event through the outbox with the identity's version.
- **FR-038:** When a user searches, views, creates or changes identity data, the system shall write an audit event with search criteria hash (not raw criteria), patient id(s) returned or touched, purpose and outcome (spec 000 FR-017).

**Additions from research dossier R01**

- **FR-039:** When an identity is registered or its identification data change, the system shall record who provided the information (patient, relative, representative, other with name) and the user who captured it, with date and time (Norma Art. 15).
- **FR-040:** When a newborn identity is created before an official name exists, the system shall assign a temporary name built from the mother's surnames and given name plus the newborn's sex and, for multiple births, a letter suffix (A, B, C) in birth order, and shall replace it with the official name later keeping the temporary one in history (Joint Commission R3 Report 17; WHO Patient Safety Solution 2).
- **FR-041:** The system shall compute identity quality indicators with defined numerators and denominators: duplicates created per registrations in a period, open duplicate and overlay cases by age, provisional identities unresolved after a configurable time, and reversed merges (Norma Art. 12; SAFER 3.1, 3.2).
- **FR-042:** When a user previews a merge, the system shall show the records and consumer modules that would be affected and the resulting survivor values without changing any data (HL7 FHIR Patient $merge preview).
- **FR-043:** The system shall generate MRNs that include a check digit and reject on entry any MRN whose check digit does not validate (SAFER 1.5).
- **FR-044:** While two or more identities with similar names (same phonetic key of first surname and given name) have simultaneously open episodes, the system shall show a similar-name alert wherever either is selected; where a photo exists with recorded consent, it shall be displayed on identity selection (SAFER 1.2, 2.5).

## Scenarios and edge cases

| Requirement | Given | When | Then |
|---|---|---|---|
| FR-001 | Receptionist opens "new patient" | Tries to save without searching | Create disabled; message asks to search first |
| FR-002 | Patient exists with DUI 00016297-5 | Search by that DUI typed without hyphen | One candidate, reason "same DUI", shown first |
| FR-003 | Existing "Hernández Vásquez, Ana Belén" | Search "hernandes basquez ana" | Candidate returned with reason "phonetically similar names" |
| FR-004 | Cashier role searches | Results displayed | Names, birth year, MRN, masked DUI (`*****297-5`), municipality; no diagnoses |
| FR-006 | Two registrations commit at the same instant | MRNs generated | Two different MRNs; no gap requirement |
| FR-009 | DUI 00016297-4 entered | Save | Rejected: "DUI check digit mismatch" |
| FR-010 | Two sessions register the same DUI concurrently | Both save | One succeeds; the other gets `identifier_conflict` naming the holder (if permitted) and an option to open that identity |
| FR-011 | Passport number 123456 from GTM and from HND | Both registered | Two identities allowed; no duplicate case opened automatically |
| FR-012 | DUI mistyped and verified later | Corrected | Old value retired with reason; same internal id; old value findable by authorized search |
| FR-013 | 18-year-old patient with NUI gets DUI | DUI added | NUI kept as historical; one identity |
| FR-014 | Unconscious adult arrives at emergency with no documents | Provisional registration | Identity with alias like `NN-2026-000123`, no birth date, sex `unknown` |
| FR-015 | Family says "about 70 years old" | Birth recorded | Precision `estimated`, age 70 at 2026-10-13; displayed as "~70 years" |
| FR-017 | Provisional NN identified as existing patient | Data entered | Duplicate case opened; NN alias kept in history |
| FR-019 | Daughter listed as emergency contact asks for copies | Spec 005 checks scope | No `may_request_copies` flag: denied (enforced in spec 005) |
| FR-021 | Twin birth | Births registered | Two identities, birth order 1 and 2, each linked to mother, distinct MRNs |
| FR-022 | Twins "RN1 de María López" and "RN2 de María López" | Searched together | Birth order and twin warning displayed |
| FR-023 | Address changed | Saved | New version with actor, reason; previous address visible in history |
| FR-024 | Verified birth date edited by receptionist without permission | Save | Denied and audited |
| FR-025 | Two users edit the same identity | Second saves | Conflict with current version shown; no overwrite |
| FR-027 | Matching score 0.99 between two identities | Nightly job | Suspected case opened; identities untouched |
| FR-028 | Archive clerk requests and tries to approve own case | Approve | Rejected: approver must differ |
| FR-029 | Approved merge applied | Apply | Retired identity points to survivor; manifest lists every moved identifier, name, relationship; event in outbox |
| FR-030 | Network failure after apply | Client retries same key | Same result, no second manifest |
| FR-031 | Episode module acknowledged, accounting module down | Case viewed | `reconciling`, pending consumer "accounting" listed |
| FR-032 | A merged into B, then request to merge B into A | Apply | Rejected as cycle |
| FR-033 | Nurse notices allergies of another person in record | Flags overlay | Overlay case; merge blocked; restricted clinical display |
| FR-034 | Merge reversed after new note added to survivor | Unmerge | Manifest items restored; new note listed for manual attribution, not moved |
| FR-035 | Patient died at home, family reports year only | Deceased recorded | Precision `year`, source "family report"; record still searchable |
| FR-036 | Test identity created by mistake, no episodes | Mark entered-in-error | Allowed with reason; hidden from default search, visible to auditors |
| FR-036 | Identity with an episode | Mark entered-in-error | Rejected; user directed to merge or overlay case |
| FR-038 | Any search | Executed | Audit event with criteria hash, returned ids, outcome |
| FR-039 | Daughter gives data of unconscious mother | Registration saved | Informant "daughter, Ana López" and capturing user stored with time |
| FR-040 | Twins born to María Elena López Pérez | Registered | Temporary names "López Pérez, María Elena, niña A" and "... niño B"; replaced later with official names, history kept |
| FR-041 | Month closes | Indicators computed | Duplicate creation rate shows numerator, denominator and period |
| FR-042 | Reviewer previews merge | Preview opened | Impact list shown; database unchanged |
| FR-043 | MRN typed with one digit wrong | Search by MRN | Rejected as invalid check digit, not "not found" |
| FR-044 | Two "Juan Carlos Hernández" admitted the same day | Either selected | Similar-name alert shown |

Empty state: a search with no candidates enables creation and records "0 results" (FR-001). Unavailable dependency: if the outbox dispatcher is down, commands still commit; events publish later (spec 000 FR-014).

## Definition of done

- [ ] Every in-scope outcome is represented by one or more testable `FR-*` requirements.
- [ ] Scenarios cover normal behavior and material edge/failure cases.
- [ ] Out-of-scope items and unresolved decisions are explicit.
- [ ] Acceptance and verification are observable, with no claim of unrun checks.
- [ ] The approved requirements are traceable to tasks in `tasks.md`.

## Research traceability

| Research criterion | Requirement(s) |
|---|---|
| AC301 provisional without fictitious values | FR-014, FR-015, FR-016 |
| AC302 same value, different issuers | FR-011 |
| AC303 concurrent creation | FR-010 |
| AC304 homonyms, no auto-merge | FR-002, FR-027 |
| AC305 stable id on correction | FR-012, FR-023 |
| AC306 supervised merge with manifest | FR-029 |
| AC307 repeated merge | FR-030 |
| AC308 consumer down | FR-031 |
| AC309 overlay | FR-033 |
| AC310 unmerge with ambiguous later data | FR-034 |
| AC311, AC312 contact and expired representation (data part) | FR-019 |
| AC-P01-007 ambiguous legacy identifier | FR-007, FR-008, FR-011 (mapping process in spec 004) |
| P01 C01 search, verify, register | FR-001 to FR-006 |
| Dossier R01 section 8 | FR-039 to FR-044; adjustments to FR-018, FR-020, FR-035 |

## Open decisions

| Item | Default until decided | Owner |
|---|---|---|
| MRN format and whether paper numbers are kept as the visible MRN | New sequential MRN; paper number stored as `legacy_paper_mrn` | PENDING-INS05 |
| Documents accepted to mark an identity verified | DUI, NUI, partida, carné de minoridad, pasaporte, carné de residente | PENDING-INS05 |
| Who approves merges | Archive head plus clinical reviewer when clinical data conflicts | PENDING-INS04 |
| Minimum data to create a non-provisional identity | Names plus one identifier or birth date of any precision | PENDING-INS05 |
| Matching thresholds | Calibrated on synthetic and, later, de-identified CLIMESA samples; not copied from literature | Project lead with archive |
