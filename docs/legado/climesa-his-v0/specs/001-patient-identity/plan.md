# Patient identity implementation plan

**Related spec:** [`spec.md`](./spec.md)
**Status:** Draft
**Last updated:** 2026-10-13

## Goal and scope

Implement module `Identity` on top of spec 000: registration with search-before-create, typed identifiers, provisional and newborn identities, append-only history, duplicate/overlay cases and supervised merge/unmerge with consumer reconciliation. Non-goals: representation enforcement, payers, wristbands, registry verification, bulk migration.

## Architecture and boundaries

- **Components/layers:**
  - `Climesa.Modules.Identity.Domain`: aggregates `Person` (identity root: status, names, birth, sex, identifiers, contacts, relationships, deceased) and `DuplicateCase` (case lifecycle, merge operation, consumer acknowledgements). Value objects: `IdentifierValue`, `PartialDate`, `PersonName`, `SearchKeys`.
  - `Climesa.Modules.Identity.Application`: commands, queries, matching service, MRN generator, validators.
  - `Climesa.Modules.Identity.Infrastructure`: EF Core `IdentityDbContext` (schema `identity`), PostgreSQL search queries, outbox/audit wiring.
  - `Climesa.Modules.Identity.Contracts`: `IIdentityQueries` (resolve current survivor, get display summary), integration events.
  - UI: Razor pages under `/admision/pacientes` (search, register, provisional, detail, history, duplicate cases).
- **Boundaries:** other modules store only `PersonId`; they never copy names or identifiers as keys. To display a patient they call `IIdentityQueries.GetSummary(personId)`, which resolves merges.
- **Flow (registration):** search query (audited) → candidates with reasons → user picks existing or "create" (enabled only with a recorded search token, FR-001) → `RegisterPerson` command (idempotent) → insert person, identifiers (unique index), names, first history version, MRN → outbox `PersonRegistered` + audit → response.
- **Flow (merge):** nightly or on-demand matching → `DuplicateCase(suspected)` → reviewer investigates and proposes survivor values → approver (different user, MFA) approves → `ApplyMerge` (idempotent, single transaction, manifest) → `IdentityMerged` → each consumer re-points or aliases its references and calls `AcknowledgeIdentityMerge` → case `completed`.
- **Alternatives and decision:**
  - Event sourcing for `Person` vs current-state tables plus history table: chose current state + append-only `person_versions` (simpler queries, history still complete; FR-023).
  - Survivorship by re-pointing foreign keys in every module vs alias resolution: chose resolution through `IIdentityQueries.ResolveSurvivor` plus asynchronous re-pointing by each consumer; unmerge stays possible because the manifest records originals.
  - Phonetic algorithm: Double Metaphone and Soundex are tuned for English; chose a small Spanish phonetic key (rules in Data section) plus PostgreSQL `pg_trgm` similarity, calibrated with synthetic data.

## Contracts

- **User/API contracts (all POST commands carry `Idempotency-Key`):**

| Operation | Permission | Notes |
|---|---|---|
| `SearchPersons(criteria)` | `identity.search` | Returns candidates + reasons + `searchToken` |
| `RegisterPerson(searchToken, data)` | `identity.create` | Fails without valid token from same session |
| `RegisterProvisionalPerson(context)` | `identity.create_provisional` | No mandatory demographics |
| `RegisterNewborns(motherId, births[])` | `identity.create` | One identity per birth |
| `UpdateDemographics(personId, expectedVersion, changes, reason, evidence)` | `identity.update` / `identity.correct_verified` | Optimistic concurrency |
| `AddIdentifier` / `RetireIdentifier` / `VerifyIdentifier` | `identity.update` / `identity.verify_identifier` | |
| `AddRelationship` / `EndRelationship` | `identity.update` | Scope flags require `identity.relationship.scope` |
| `MarkDeceased` | `identity.mark_deceased` | |
| `MarkEnteredInError` | `identity.entered_in_error` | Blocked if referenced (query to consumer contracts) |
| `OpenDuplicateCase` / `ProposeSurvivor` / `ApproveMerge` / `RejectCase` | `identity.duplicate.review`, `identity.merge.approve` (MFA) | Approver ≠ requester |
| `ApplyMerge(caseId)` | `identity.merge.apply` (MFA) | Single transaction, manifest |
| `AcknowledgeIdentityMerge(caseId, consumer, result)` | module service account | |
| `ReverseMerge(caseId, reason)` | `identity.unmerge` (MFA) | |
| `OpenOverlayCase(personId, reason)` | `identity.update` | Restricts display |

- **Internal contracts:** `IIdentityQueries.ResolveSurvivor(personId)`, `GetSummary(personId)`, `IsReferenced(personId)` (aggregates `IReferenceCheck` implementations registered by consumer modules).
- **Events (contract v1):** `PersonRegistered`, `PersonDemographicsChanged`, `IdentifierAdded`, `IdentifierRetired`, `IdentityVerified`, `IdentityMerged {caseId, survivorId, retiredId, manifestHash}`, `IdentityMergeReversed`, `PersonMarkedDeceased`, `PersonMarkedEnteredInError`, `OverlaySuspected`.
- **Authorization:** facility context on every call; `identity.search` results filtered by FR-004 projection unless the user also holds `clinical.record.read`.
- **Compatibility:** none.

## Data and migrations

Schema `identity` (all tables carry `facility_id`, `created_at`, `created_by`):

| Table | Purpose and key constraints |
|---|---|
| `persons` | `id uuid` PK; `status` (`provisional`, `active`, `verified`, `retired_merged`, `entered_in_error`); `merged_into uuid null`; `birth_date date null`, `birth_precision`, `birth_estimated_age`, `birth_estimated_at`; `admin_sex`; `deceased_at date null`, `deceased_precision`, `deceased_source`; `overlay_restricted bool`; `version int` (concurrency token) |
| `medical_record_numbers` | (`facility_id`, `mrn`) unique; `person_id`; never deleted |
| `mrn_sequences` | per facility, `nextval`-based generator; MRN = facility prefix + sequence + ISO 7064 MOD 11-2 check character (FR-043) |
| `identifier_types` | `code` PK, `name`, `default_issuer`, `exclusive bool`, `validator`, `active` (seeded) |
| `identifiers` | `id`, `person_id`, `type_code`, `issuer`, `value_original`, `value_normalized`, `status`, `valid_from`, `valid_to`, `evidence_ref`, `source`; `is_exclusive` copied from type; partial unique index on (`type_code`, `issuer`, `value_normalized`) where `is_exclusive and status in ('unverified','verified')` |
| `person_names` | given names, first surname, second surname, married surname, type, validity, source; generated `search_normalized`, `search_phonetic`; GIN trigram index on `search_normalized` |
| `contact_points` | type, value, use, validity, source; addresses reference `territorial_units` (department, municipality, district, valid_from, valid_to, successor) and keep original text |
| `territorial_units` | Versioned catalog seeded with the 14 departments, 44 municipalities and 262 districts in force since 2024-05-01, plus pre-2024 municipalities mapped to districts |
| `relationships` | `person_id`, `related_person_id null`, `related_name null`, `type`, `birth_order null`, `may_consent`, `may_receive_info`, `may_request_copies`, validity, `evidence_ref`, `status` |
| `person_versions` | `person_id`, `version`, `changed_at`, `actor`, `permission`, `reason`, `evidence_ref`, `command_id`, `diff jsonb` (before/after per attribute); append-only (INSERT/SELECT grants) |
| `registration_searches` | `token`, `session_id`, `user_id`, `criteria_hash`, `result_count`, `expires_at` |
| `duplicate_cases` | `id`, `type` (`duplicate`, `overlay`), `status`, `person_ids uuid[]`, `requested_by`, `approved_by`, `survivor_id`, `decision jsonb`, timestamps |
| `duplicate_case_events` | transitions with actor and reason |
| `merge_operations` | `case_id` unique, `idempotency_key`, `survivor_id`, `retired_id`, `manifest jsonb`, `manifest_hash`, `applied_at`, `reversed_at` |
| `merge_consumer_acks` | (`case_id`, `consumer`) unique, `status`, `detail`, `acked_at` |

Identifier types seeded (issuer column shown):

| Code | Issuer | Exclusive | Validator |
|---|---|---|---|
| `dui` | RNPN | yes | DUI check digit (FR-009) |
| `nui` | RNPN | yes | format PENDING (no public spec found) |
| `partida_nacimiento` | municipality (registered per value) | no | none |
| `carne_minoridad` | municipality | no | none |
| `pasaporte` | ISO 3166 country | yes | none |
| `carne_residente` | DGME | yes | none |
| `nit` | MH | yes | 14-digit format; check-digit algorithm to confirm against an MH source before enabling (legacy records only; since 17-Dec-2021 DUI serves as NIT for natural persons) |
| `isss_afiliacion` | ISSS | yes | none |
| `legacy_paper_mrn` | CLIMESA archive | yes | none |
| `legacy_system_id` | source system name | yes | none |
| `temporary_alias` | CLIMESA | yes | generated |

Spanish phonetic key (applied after lowercasing and removing diacritics; calibrate before relying on it): `v→b`, `z→s`, `ce/ci→se/si`, `qu→k`, `c(a,o,u)→k`, `ll→y`, `h` removed unless preceded by `c`, `x→s` at start, `gue/gui→ge/gi`, `ñ→n`, collapse doubled letters, drop particles `de`, `del`, `la`, `los`, `y` as separate tokens.

- **Migration impact:** new schema; no Aldara data migrated by this spec (spec 004 does it through these commands).
- **Operational data steps:** seed identifier types and one MRN sequence for the CLIMESA facility.

## Security and privacy

- Search returns a minimal projection by default (FR-004); full detail requires opening the identity, which is a separately audited read.
- Audit stores a hash of search criteria, not the typed names or numbers, to avoid building a second copy of personal data in the audit store.
- Merge, unmerge and verified-data correction require MFA permissions and segregation (FR-028).
- Overlay restriction (FR-033) prevents clinicians from acting on a mixed record without explicit acknowledgement.
- Synthetic data generator for tests and demos (Norma Art. 50); no real CLIMESA names in fixtures.

## Failure and recovery

- Concurrent registration of an exclusive identifier: unique index raises; handler maps to `identifier_conflict` (FR-010).
- MRN generation uses a database sequence; gaps are acceptable, duplicates impossible.
- Stale update: concurrency token mismatch maps to `version_conflict` with current state (FR-025).
- Merge apply: single transaction for identity tables + manifest + outbox; consumer failures never roll back the local merge, they hold the case in `reconciling` (FR-031).
- Reverse merge on a case whose consumers have not acknowledged: allowed; reversal event supersedes; consumers process both in order (per-aggregate ordering, spec 000 FR-014).
- Matching job crash: idempotent by (`person_ids` sorted) unique on open suspected cases.

## Verification

All automated tests run with `dotnet test tests/Climesa.Modules.Identity.Tests` against PostgreSQL via Testcontainers.

| Check | Command or procedure | Expected evidence |
|---|---|---|
| DUI validator | `dotnet test --filter FullyQualifiedName~DuiValidatorTests` | `00016297-5` valid, `00016297-4` invalid, `000162975` normalized |
| Search-before-create | `--filter RegistrationRequiresSearch` | Create without token rejected; with token accepted |
| Concurrent exclusive identifier | `--filter ConcurrentIdentifierRegistration` | One success, one `identifier_conflict` |
| Issuer separation | `--filter SameValueDifferentIssuer` | Two identities, no case opened |
| Provisional without fabricated data | `--filter ProvisionalRegistration` | Null birth date, sex `unknown`, alias assigned |
| Partial dates | `--filter PartialDateTests` | Estimate never serialized as exact |
| Phonetic search | `--filter PhoneticSearch` | Variant spellings return the seeded person with reason |
| History append-only | `--filter PersonVersionHistory` | Each change adds a version; `climesa_app` cannot update `person_versions` |
| Stale update | `--filter StaleDemographicUpdate` | `version_conflict` |
| No auto-merge | `--filter MatchingDoesNotMerge` | High score opens case only |
| Segregation | `--filter ApproverMustDiffer` | Self-approval rejected |
| Merge manifest and idempotency | `--filter ApplyMergeTests` | Manifest lists all moved rows; retry returns same result |
| Consumer reconciliation | `--filter MergeConsumerAck` | Case stays `reconciling` until all acks |
| Merge cycle | `--filter MergeCycleRejected` | Rejected |
| Unmerge | `--filter ReverseMergeTests` | Manifest restored; post-merge records listed, not moved |
| Overlay | `--filter OverlayCaseTests` | Merge blocked; display restricted |
| Entered-in-error guard | `--filter EnteredInErrorGuard` | Rejected when referenced |
| Audit on search | `--filter IdentitySearchAudited` | Audit row with criteria hash and returned ids |
| Manual: registration desk walkthrough | Script with 10 synthetic cases (twins, NN, minor with NUI, foreigner, homonyms) run by a person playing receptionist | Each case completed without fabricated data; notes recorded |

## Risks and decisions

- **Risk:** phonetic key produces too many candidates and reception stops reading them. Mitigation: rank by exact identifier, then trigram similarity, cap visible candidates, measure false positives on synthetic set before go-live.
- **Risk:** consumers never acknowledge merges and cases pile up in `reconciling`. Mitigation: dashboard and age alert (spec 005 review screen).
- **Risk:** NUI format unknown. Mitigation: no validator; flag as PENDING; revisit when RNPN documentation or samples are available.
- **Open decision:** MRN format and legacy number policy (PENDING-INS05); merge approvers (PENDING-INS04).

## Plan review

- [ ] Architecture, contracts, data, migration, security, and failure handling are addressed.
- [ ] Verification is scoped, exact, and tied to requirements.
- [ ] No unresolved decision is silently treated as approved.
