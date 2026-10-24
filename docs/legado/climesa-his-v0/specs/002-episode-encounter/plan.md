# Episode, encounter, beds and discharge implementation plan

**Related spec:** [`spec.md`](./spec.md)
**Status:** Draft
**Last updated:** 2026-10-13

## Goal and scope

Implement module `Care` (encounters, episodes, locations, beds, transfers, discharge milestones, continuity items, emergency queue) on top of specs 000 and 001. Non-goals: clinical note content, charges, scheduling, MINSAL export.

## Architecture and boundaries

- **Components/layers:**
  - `Climesa.Modules.Care.Domain`: aggregates `Encounter` (class, status, clocks, triage assessments, responsible periods), `Episode` (inpatient lifecycle and milestones, discharge record, continuity items), `Location` (bed or place with status machine), `Transfer` (internal request lifecycle), `ExternalTransfer`, `CleaningRecord`. Value objects: `ActTime` (act instant + capture instant), `TriageLevel`, `DischargeType`.
  - `Climesa.Modules.Care.Application`: commands, queries (board, census, occupancy), policies (reservation expiry, triage intervals) read through the policy registry (spec 000).
  - `Climesa.Modules.Care.Infrastructure`: `CareDbContext` (schema `care`), exclusion constraints, background jobs (reservation expiry, triage interval alerts).
  - `Climesa.Modules.Care.Contracts`: `ICareQueries` (current location, active episode for person, responsible clinician at instant), integration events.
  - UI: Razor pages `/emergencia` (board, arrival, triage), `/hospitalizacion` (census, admission, transfers, discharge), `/camas` (bed board, cleaning).
- **Boundaries:** `Care` stores `PersonId` only and resolves display through `IIdentityQueries`. It never computes money; it publishes milestones. Documents referenced by id (spec 003 contract `IDocumentQueries.Exists(docId, type)`; until 003 exists, a stub accepting uploaded file references).
- **Flow (emergency arrival):** `RegisterEmergencyArrival(personId | provisionalData, arrivalMode, arrivedAt)` → if no person, call `Identity.RegisterProvisionalPerson` in the same request (two module commands, each idempotent with derived keys) → `Encounter(emergency, waiting)` → outbox `EncounterCreated` → board updates.
- **Flow (discharge):** physician opens discharge → system lists continuity items without owner (FR-027) → `SignMedicalDischarge(type, docs)` validates type requirements (FR-011) → milestone + `MedicalDischargeSigned` → nursing records `RecordPhysicalExit` → segment closed, bed `pending_cleaning` → `CleaningRecord` signed → bed `available`.
- **Alternatives and decision:**
  - One `Stay` table with status vs separate milestones: chose milestone columns plus `episode_events` append-only table; status is derived from the latest non-cancelled event (mirrors ADT event + cancel pairs).
  - Bed exclusivity in application code vs database: chose PostgreSQL `EXCLUDE USING gist (location_id WITH =, occupied tstzrange WITH &&) WHERE (exclusive AND NOT cancelled)` with `btree_gist`; the database is the arbiter under concurrency.
  - Encounter and episode as one aggregate vs two: two, because an emergency encounter can end with no admission, and an episode can span several encounters (emergency + inpatient).

## Contracts

| Operation | Permission | Notes |
|---|---|---|
| `RegisterEmergencyArrival` | `care.emergency.register` | No economic validation (FR-001, FR-002) |
| `RecordTriage` | `emergency.triage` | New assessment each time |
| `RecordClock(encounterId, kind, actAt)` | `care.encounter.update` | first_physician, disposition, etc. |
| `RequestAdmission` / `AcceptAdmission` / `CancelAdmission` | `care.admission.request` / `care.admission.accept` | Cancel needs reason |
| `AssignLocation(episodeId, locationId, at)` | `care.location.assign` | Exclusion constraint |
| `ReserveBed` | `care.location.assign` | Expiry policy |
| `RequestTransfer` / `AcceptTransfer` / `RejectTransfer` / `ExecuteTransfer` / `CancelTransfer` | `care.transfer.*` | Destination unit role accepts |
| `StartAbsence` / `EndAbsence` | `care.location.assign` | Bed stays occupied |
| `SignMedicalDischarge` / `RevokeMedicalDischarge` | `care.discharge.sign` (physician privilege, spec 000 privileges) | Type requirements |
| `RecordPhysicalExit` | `care.exit.record` | |
| `CloseEpisodeAdministratively` | `care.episode.close` | FR-015 |
| `RecordExternalTransfer` and state changes | `care.transfer.external` | Receiver name for `accepted` |
| `AssignContinuityOwner` / `ResolveContinuityItem` | `care.continuity.manage` | |
| `BlockLocation` / `UnblockLocation` | `care.location.admin` | |
| `RegisterCleaning` / `SignCleaning` | `care.cleaning.register` / `care.cleaning.sign` | Signer ≠ cleaner |
| Queries: `EmergencyBoard`, `Census(at)`, `Occupancy(from,to,denominator)` | `care.view.*` | Audited |

- **Events (contract v1):** `EncounterCreated`, `TriageRecorded`, `EpisodeRequested`, `EpisodeAccepted`, `PatientAdmitted {episodeId, locationId, at}`, `PatientTransferred`, `AbsenceStarted/Ended`, `MedicalDischargeSigned {episodeId, at, type}`, `MedicalDischargeRevoked`, `PhysicalExitRecorded`, `EpisodeClosed`, `AdmissionCancelled`, `TransferCancelled`, `LocationStatusChanged`, `ExternalTransferStateChanged`.
- **Consumed:** `IdentityMerged`, `IdentityMergeReversed` (spec 001).

## Data and migrations

Schema `care`:

| Table | Purpose and key constraints |
|---|---|
| `facility_units` | service, unit, name, type (ward, emergency, icu, recovery, observation) |
| `locations` | `unit_id`, code, kind (bed, crib, chair, stretcher), `exclusive`, `cssp_authorized`, `cssp_reference`, `operational`, `status`, `version` |
| `location_status_events` | append-only status history with reason and actor |
| `encounters` | `person_id`, class, status, `arrival_mode`, `arrived_at`, `started_at`, `ended_at`, `related_encounter_id`, `episode_id null`, `version` |
| `encounter_clocks` | `encounter_id`, kind, `act_at`, `captured_at`, actor |
| `triage_protocols` / `triage_levels` | protocol code, version, license note; levels with code, color, target minutes to physician, reassessment minutes |
| `triage_assessments` | encounter, protocol version, level, suggested level, discriminator, vitals jsonb, actor, `act_at` |
| `episodes` | `person_id`, origin, admitting service, status (derived cache), `admitted_at`, `medical_discharge_at`, `discharge_type`, `physical_exit_at`, `closed_at`, `version` |
| `episode_events` | append-only: kind, payload, `act_at`, actor, `cancels_event_id null`, reason |
| `location_segments` | `episode_id`, `location_id`, kind (occupancy, reservation, absence), `range tstzrange`, `exclusive` copied, `cancelled`; exclusion constraint on occupancy and reservation for exclusive locations |
| `responsible_periods` | `episode_id or encounter_id`, clinician, service, `range`; exclusion constraint so periods do not overlap per episode |
| `transfers` | origin, destination, status, requester, decided_by, reason, timestamps |
| `external_transfers` | fields of FR-025, status, `receiver_name` NOT NULL when status ≥ accepted (check constraint) |
| `discharge_documents` | episode, type, document id (spec 003) or witness record |
| `continuity_items` | episode, kind, description, owner (user or service), due, status |
| `cleaning_records` | location, checklist version, items jsonb, cleaner, start, end, signer, signed_at; signer ≠ cleaner check |

- **Migration impact:** new schema; requires `CREATE EXTENSION btree_gist` (migrator role).
- **Operational data steps:** load units and beds from CLIMESA's CSSP authorization (INS01); seed placeholder triage protocol marked "not for clinical use" until replaced.

## Security and privacy

- Board projection with initials or code only (FR-007), served from a dedicated query; public screens use a kiosk role with only that permission.
- Discharge signature requires a physician privilege checked at the act (R17), not only the role.
- Every census/board/episode view audited with patient ids (FR-032).

## Failure and recovery

- Concurrent bed assignment: exclusion violation (`23P01`) mapped to `location_conflict` with current occupant visible to authorized users.
- Emergency arrival when Identity module call fails: retry with same derived key; if still failing, the arrival is recorded with a local provisional placeholder and a reconciliation task (never block arrival).
- Reservation expiry job is idempotent (expires only `reserved` segments past expiry, by id).
- Merge event processing idempotent by case id; re-pointing done in one transaction per case.

## Verification

Tests: `dotnet test tests/Climesa.Modules.Care.Tests` (Testcontainers PostgreSQL).

| Check | Command or procedure | Expected evidence |
|---|---|---|
| Emergency without economics | `--filter EmergencyArrivalNoEconomicGate` | Encounter created with provisional identity; no payer fields required |
| Economic failure does not block | `--filter CoverageFailureDoesNotBlock` | Admission and discharge succeed; task created |
| Triage permission | `--filter TriageRequiresPermission` | Reception denied |
| Triage interval alert | `--filter TriageReassessmentAlert` (fake clock) | Alert at interval + 1 min |
| Bed exclusivity | `--filter ConcurrentBedAssignment` | One success, one `location_conflict` |
| Bed after exit | `--filter BedPendingCleaningAfterExit` | Status `pending_cleaning` |
| Cleaning release | `--filter CleaningRequiresSignature` | Unsigned keeps bed out; signed releases; signer = cleaner rejected |
| Discharge milestone | `--filter MedicalDischargeSeparateFromExit` | Two instants stored; event carries discharge instant |
| Discharge type docs | `--filter VoluntaryDischargeRequiresForm` | Rejected without form or witnesses |
| Revocation | `--filter RevokeDischarge` | Episode active; both events in history |
| Cancel not delete | `--filter CancelAdmissionKeepsHistory` | Original event present, cancelled flag |
| Return is new | `--filter ReturnCreatesRelatedEncounter` | New encounter, link to previous |
| Rejected transfer | `--filter RejectedTransferKeepsLocation` | Location and responsible unchanged |
| Absence | `--filter AbsenceKeepsBed` | Bed occupied, census flag |
| External transfer | `--filter ExternalAcceptedNeedsReceiver` | Constraint error mapped |
| Continuity before discharge | `--filter DischargeRequiresContinuityOwners` | Rejected listing items |
| Occupancy denominators | `--filter OccupancyDenominators` | Both denominators labeled |
| Merge consumer | `--filter CareConsumesIdentityMerged` | Episodes re-pointed; ack written |
| Manual: emergency drill | 5 synthetic arrivals incl. NN and insured with failed check | Board, triage, admission, discharge, cleaning completed; timings noted |

## Risks and decisions

- **Risk:** nursing will not register cleaning signatures in real time and beds appear unavailable. Mitigation: bed board shows `pending_cleaning` duration; measure in pilot; policy may allow a delegated signer.
- **Risk:** clocks captured late make emergency metrics look worse or better. Mitigation: act time and capture time both stored; reports use act time and show capture delay distribution.
- **Open decision:** triage protocol (PENDING-INS04), bed set (PENDING-INS01), voluntary discharge form (PENDING-INS06).

## Plan review

- [ ] Architecture, contracts, data, migration, security, and failure handling are addressed.
- [ ] Verification is scoped, exact, and tied to requirements.
- [ ] No unresolved decision is silently treated as approved.
