# Clinical documents specification

**Status:** Draft
**Owner:** Project lead; CLIMESA owners PENDING-INS04 (clinical direction, expediente committee)
**Last updated:** 2026-10-13 (rev. 1, research dossiers R01, R02, R03, R21)

## Problem and outcome

The expediente clínico is permanent, per person, and must keep authenticity and integrity whether on paper or electronic (Norma técnica del expediente clínico, Acuerdo 1616 of 2024, Art. 13). Each professional signs with a simple electronic signature assigned to them while certified signature is not adopted (Art. 23 a.4, Art. 70). Since Acuerdo 698 (2026), any rectification must record date, time, user and detail automatically, and paper/electronic discrepancies go to the committee (Art. 42). Removing or altering pages is a serious infraction (LDDPPSS Art. 42 g).

Outcome: every clinical document (typed note, form, scanned page, external report, consent, discharge report) is an immutable signed version with author, professional registration and hash; corrections are new versions or addenda, never edits; templates make mandatory content explicit; and other modules (episodes, migration, exports) reference documents through one contract.

## Scope

### In scope

- Document types catalog with versioned templates and required sections (Norma Art. 16-17).
- Document lifecycle: draft, signed, amended (addendum), superseded (corrected version), entered in error; no deletion.
- Simple electronic signature: authenticated user, re-authentication at signing, privilege and license check at the act (R17), signature manifest with hash.
- Author display with full name and junta registration number (LDDPPSS Art. 13 a).
- Binary documents (scans, external PDFs, images) stored content-addressed with hash and provenance; text extraction optional and never treated as validated.
- Consent records: type, version of form, who informed, who consented (patient or representative with relationship from spec 001), capacity statement, revocation.
- Discharge report assembly: clinical summary plus a reference to the cost detail provided by spec 006 (LDDPPSS Art. 14).
- Document index per person and per episode, filtered by permission.
- Paper/electronic discrepancy case routed to the expediente committee (Art. 42).

### Out of scope

- Orders, medication administration, results: later clinical specs (they produce documents through this contract).
- Certified electronic signature with an accredited provider (future integration; Art. 70 allows simple signature).
- Copies, certified exports and retention clocks: spec 005.
- Scanning operation, batches and QC: spec 004 (uses this spec to publish).

## Functional requirements (EARS)

- **FR-001:** The system shall keep a catalog of document types with code, name, category (clinical note, form, consent, report, scanned, external), required sections per template version, who may author and who may sign.
- **FR-002:** When a document is created, the system shall bind it to a person, optionally to an encounter or episode, to a document type and template version, and to its author.
- **FR-003:** When a user signs a document, the system shall require re-authentication within the last configurable minutes, verify at that instant the permission, privilege and professional license required by the type (R17), compute a SHA-256 over the canonical content, and store a signature record with signer, license number, instant, method `simple_electronic` and hash (Norma Art. 23 a.4, 70).
- **FR-004:** If a required section of the template is empty, then the system shall prevent signing and list the missing sections.
- **FR-005:** While a document is signed, the system shall reject any change to its content or metadata that affects meaning; corrections shall be made through an addendum (adds content, keeps original visible) or a corrected version (supersedes, keeps original retrievable), each requiring a reason and its own signature (Norma Art. 42 reformed; AC313).
- **FR-006:** When an addendum or corrected version is signed, the system shall record automatically date, time, user and a diff or the added content, and shall show readers that the document has later versions.
- **FR-007:** The system shall not provide deletion of documents; a document filed on the wrong patient or entered in error shall be marked `entered_in_error` with reason by an authorized user, hidden from default views, retained, and flagged to the author and to the correct patient's record owner when known.
- **FR-008:** When a binary file is attached, the system shall store it content-addressed by SHA-256, record original filename, media type, size, page count, source (scanned, uploaded, external system, migrated), capture device or operator, and capture instant; identical content shall be stored once.
- **FR-009:** If text is extracted from a binary document, then the system shall store it as a derived, unvalidated rendition that is searchable but never displayed as the authoritative content and never used to populate structured data without human validation.
- **FR-010:** When a document is displayed, the system shall show author full name, professional registration (junta and number), signing instant, document status and whether later versions exist (LDDPPSS Art. 13 a).
- **FR-011:** The system shall record consents with type, form version, procedure or scope, informing professional, consenting person (patient or representative with relationship and scope from spec 001 FR-019), capacity statement, signature evidence (signed scanned form or electronic signature), validity, and revocation with instant and author.
- **FR-012:** When a consent's representative lacks the `may_consent` scope in spec 001, the system shall warn and require a reason to proceed (emergency exception per Norma de anestesiología Art. 17).
- **FR-013:** When the medical discharge is signed in spec 002, the system shall provide a discharge report document containing diagnoses, results, procedures, length of stay, follow-up instructions and, for private services, a reference to the itemized cost statement produced by spec 006 (LDDPPSS Art. 14).
- **FR-014:** The system shall expose a document index per person and per episode, ordered by clinical date, filtered by the reader's permissions, and auditing each open (spec 000 FR-017).
- **FR-015:** When a discrepancy between a paper and an electronic document is reported, the system shall open a discrepancy case with both references, reporter and description, route it to the expediente committee role, and record the decision and resulting addendum or corrected version (Norma Art. 42).
- **FR-016:** The system shall provide a `IDocumentQueries` contract so other modules can verify a document exists, its type, status and signer without reading content.
- **FR-017:** When an identity merge event arrives, the system shall re-point documents of the retired identity to the survivor and acknowledge; on reversal, restore per manifest.

## Scenarios and edge cases

| Requirement | Given | When | Then |
|---|---|---|---|
| FR-003 | Physician's license expired yesterday | Signs a note | Rejected; draft kept; message names the expired license |
| FR-003 | Session idle 20 min, re-auth window 5 min | Sign | Password or second factor requested |
| FR-004 | Discharge summary without follow-up section | Sign | Blocked; section listed |
| FR-005 | Wrong dose written in signed note | Physician corrects | Corrected version signed with reason; original retrievable; readers see "corrected" |
| FR-007 | Note filed on wrong patient | Marked entered-in-error | Hidden by default; retained; author notified |
| FR-008 | Same PDF uploaded twice | Upload | One blob, two references if in two contexts |
| FR-009 | OCR reads "alergia penicilina" | Structured allergy list | Not populated automatically |
| FR-011 | Mother consents for minor | Consent recorded | Relationship `mother` with `may_consent` |
| FR-012 | Neighbor brings unconscious patient | Emergency surgery | Warning; reason "emergency, Art. 17" recorded |
| FR-013 | Discharge signed | Report generated | Clinical summary plus cost statement reference |
| FR-015 | Paper sheet differs from scanned version | Reported | Case to committee; decision produces addendum |

## Definition of done

- [ ] Every in-scope outcome is represented by one or more testable `FR-*` requirements.
- [ ] Scenarios cover normal behavior and material edge/failure cases.
- [ ] Out-of-scope items and unresolved decisions are explicit.
- [ ] Acceptance and verification are observable, with no claim of unrun checks.
- [ ] The approved requirements are traceable to tasks in `tasks.md`.

## Research traceability

| Research item | Requirement(s) |
|---|---|
| Norma 1616 Art. 13, 16-17, 23 a.4, 42 (Acuerdo 698), 70 | FR-001, FR-003 to FR-006, FR-015 |
| LDDPPSS Art. 13 a, 14, 42 g | FR-005, FR-007, FR-010, FR-013 |
| V3 AC313 correction of signed note | FR-005, FR-006 |
| V8 DOC02 scanned provenance, OCR not authoritative | FR-008, FR-009 |
| R09 anesthesia Art. 17 emergency omission | FR-012 |

## Open decisions

| Item | Default until decided | Owner |
|---|---|---|
| Templates and required sections per type | Minimal set: emergency note, admission note, progress note, discharge summary, consent, scanned document | PENDING-INS04 |
| Re-authentication window for signing | 5 minutes | PENDING-INS12 |
| Certified electronic signature provider | Not used in v1 | PENDING-INS10 (legal) |
| Who forms the expediente committee | Clinical direction designates | PENDING-INS04 |
