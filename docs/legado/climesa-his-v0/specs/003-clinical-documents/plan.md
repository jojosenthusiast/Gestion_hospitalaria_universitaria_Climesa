# Clinical documents implementation plan

**Related spec:** [`spec.md`](./spec.md)
**Status:** Draft
**Last updated:** 2026-10-13

## Goal and scope

Implement module `Records`: document types and templates, document versions and signatures, binary store, consents, discharge report assembly, discrepancy cases, and the `IDocumentQueries` contract.

## Architecture and boundaries

- **Components:** `Climesa.Modules.Records.{Domain, Application, Infrastructure, Contracts}`; UI under `/expediente`.
- **Aggregates:** `ClinicalDocument` (header + ordered versions; each version has content, status, signature), `Consent`, `DiscrepancyCase`. `Blob` is infrastructure (content-addressed store).
- **Content model:** structured content stored as JSON validated against the template version schema; rendered to HTML for display and to PDF/A for export (spec 005). Canonical form for hashing = UTF-8 JSON with sorted keys and normalized whitespace.
- **Blob store:** filesystem under a configured root on the on-prem server, path `sha256/ab/cd/<hash>`, written once with read-only permissions; metadata in database. Replication to the hot replica and to encrypted cloud backup follows spec 000 ops.
- **Alternatives:** storing binaries in PostgreSQL (`bytea`/large objects) vs filesystem: filesystem, because scans will reach hundreds of GB and backups/restores of the database must stay fast; integrity is kept by hash check on read and periodic scrub.

## Contracts

| Operation | Permission | Notes |
|---|---|---|
| `CreateDraft(type, personId, encounterId?, content)` | per type `records.author.<category>` | |
| `UpdateDraft` | author only | Optimistic concurrency |
| `SignDocument(docId, version, reauthToken)` | per type `records.sign.<category>` + privilege | FR-003, FR-004 |
| `AddAddendum` / `CreateCorrectedVersion` | `records.amend` (author or delegate) | Reason required |
| `MarkEnteredInError` | `records.entered_in_error` | Reason, notifications |
| `AttachBinary(stream, metadata)` | `records.attach` | Returns blob hash |
| `RecordConsent` / `RevokeConsent` | `records.consent` | |
| `OpenDiscrepancyCase` / `DecideDiscrepancy` | `records.discrepancy.report` / `records.committee` | |
| `IDocumentQueries.Get(docId)` | internal | Status, type, signer, hash |

- **Events:** `DocumentSigned`, `DocumentAmended`, `DocumentEnteredInError`, `ConsentRecorded`, `ConsentRevoked`.
- **Consumed:** `MedicalDischargeSigned` (spec 002) → creates discharge report draft; `IdentityMerged`.

## Data and migrations

Schema `records`: `document_types`, `template_versions` (JSON schema, required sections), `documents` (person, encounter, episode, type, current_version, status), `document_versions` (number, kind original/addendum/correction, content jsonb, blob_hash null, reason, author, created_at), `signatures` (version, signer, license_ref, method, signed_at, content_hash), `blobs` (hash PK, media type, size, pages, source, captured_by, captured_at), `renditions` (blob, kind text/thumbnail, derived flag), `consents`, `discrepancy_cases`. `document_versions` and `signatures` are append-only (INSERT/SELECT grants).

## Security and privacy

- Document opens audited individually; index queries audited with ids.
- Sensitive document categories (e.g. psychiatric, HIV) flagged at type level for stricter permission; list PENDING-INS04.
- Blob files never served by direct path; streamed through the application after authorization.

## Failure and recovery

- Blob write: write to temp, fsync, hash, rename; metadata insert in same request; orphan blobs (no metadata) collected by a scrub job after 24 h.
- Signing race (two signers): version concurrency token; second gets conflict.
- Hash mismatch on read: document flagged, read blocked, incident opened (spec 005).

## Verification

| Check | Command or procedure | Expected evidence |
|---|---|---|
| Signature checks | `dotnet test --filter SignRequiresLicenseAndReauth` | Expired license and stale re-auth rejected |
| Required sections | `--filter SignBlockedOnMissingSections` | Missing list returned |
| Immutability | `--filter SignedVersionImmutable` | Update rejected; DB grants deny UPDATE |
| Addendum and correction | `--filter AmendmentKeepsOriginal` | Both versions retrievable; reason and diff stored |
| Dedupe blobs | `--filter BlobContentAddressed` | One file for identical uploads |
| OCR non-authoritative | `--filter RenditionNotAuthoritative` | Rendition flagged derived; no structured writes |
| Hash scrub | `--filter BlobScrubDetectsTamper` | Modified file detected |
| Merge consumer | `--filter RecordsConsumesIdentityMerged` | Documents re-pointed |

## Risks and decisions

- **Risk:** physicians resist re-authentication at each signature. Mitigation: configurable window; badge or PIN as second factor PENDING-INS12.
- **Risk:** templates designed without clinicians become checkbox theater. Mitigation: minimal required sections; review with clinical direction before go-live.

## Plan review

- [ ] Architecture, contracts, data, migration, security, and failure handling are addressed.
- [ ] Verification is scoped, exact, and tied to requirements.
- [ ] No unresolved decision is silently treated as approved.
