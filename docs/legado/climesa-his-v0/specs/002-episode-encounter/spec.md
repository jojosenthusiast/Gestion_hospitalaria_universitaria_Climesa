# Episode, encounter, beds and discharge specification

**Status:** Draft
**Owner:** Project lead; CLIMESA owners PENDING-INS04 (admission, nursing management, emergency, clinical direction)
**Last updated:** 2026-10-13 (rev. 1, research dossiers R03 and R04)

## Problem and outcome

The Aldara prototype mixes care, stay, bed, discharge and payment in one status: discharge frees the bed instantly, nothing separates the physician's signed discharge from the patient walking out, and an emergency cannot start without administrative data. In El Salvador that is not only bad design: private hospital stay is billable only until the physician signs the discharge (LDDPPSS Art. 29), care can never be denied or degraded for economic reasons (Art. 11, 42 b), voluntary discharge requires the patient's written statement (Art. 9 k, 27 e), and a bed may only be reused after terminal cleaning with a signed checklist (MINSAL Acuerdo 941 of 2024, V.8).

Outcome: every contact with a patient is an encounter; every inpatient stay is an episode with explicit milestones; location history is a non-overlapping timeline enforced by the database; transfers and discharges are multi-step with responsible people; the bed lifecycle includes cleaning; emergency care starts in one step with no economic gate; and every milestone is an event that other modules (charges, documents, pharmacy) consume.

## Scope

### In scope

- Encounter classes: emergency, outpatient, inpatient, day surgery, observation; with arrival, start, end and status.
- Emergency arrival with provisional identity, arrival clocks and triage assessment against a versioned protocol chosen by CLIMESA.
- Inpatient episode lifecycle: requested, accepted, active, medical discharge signed, physically exited, administratively closed; cancellations as explicit events.
- Facility structure: services, units, rooms, beds, with authorized (CSSP) and operational flags.
- Bed lifecycle: available, reserved, occupied, pending cleaning, cleaning, blocked; terminal cleaning record with checklist and supervisor signature.
- Location segments with database-enforced exclusivity, temporary leave, internal transfer request, acceptance, execution and reception.
- Discharge types (medical, voluntary, referred, death, abandonment) with the document each requires.
- External transfer record (destination, receiver name, documents sent, transport).
- Continuity items (pending results, appointments, tasks) owned by a person at and after discharge.
- Responsible clinician and responsible service per period.
- Census and occupancy with explicit denominators.
- Events consumed by spec 006 (bed-days, charge milestones) and by later clinical specs.

### Out of scope

- Clinical documents content (admission note, discharge summary text, signatures): spec 003. This spec stores references and milestones.
- Charges, deposits, accounts: spec 006 (consumes this spec's events).
- Scheduling of outpatient appointments and operating rooms.
- Triage algorithm content (licensed scales): stored as protocol version, level and discriminator only.
- MINSAL egress reporting format (SIMMOW): export deferred until the format is obtained (R03 pending).
- Wristband printing beyond producing the label payload (printer integration later).

## Functional requirements (EARS)

**Encounters and emergency**

- **FR-001:** When an emergency arrival is registered, the system shall create an emergency encounter in a single command with only arrival instant and arrival mode required, accepting an existing identity or creating a provisional one through spec 001, and shall require no appointment, bed, payer, deposit or document (AC315; LDDPPSS Art. 11).
- **FR-002:** If any rule, validation or integration related to coverage, deposit, balance or preauthorization fails or is unavailable, then the system shall still allow opening an emergency encounter, recording care, discharging and recording exit, and shall record the economic issue as a separate task for the account owner (LDDPPSS Art. 42 b; R04 FR 10).
- **FR-003:** The system shall record emergency clocks as separate events with act time and capture time: arrival, triage, each reassessment, first physician contact, disposition decision and physical exit.
- **FR-004:** When a triage assessment is recorded, the system shall store protocol code and version, assigned level, optional algorithm-suggested level, discriminator or criterion, vital signs captured, author and instant; a level change shall be a new assessment, and the action shall require the `emergency.triage` permission, which reception and cashier roles do not hold.
- **FR-005:** While an emergency encounter is waiting, the system shall order the queue by triage level and waiting time and shall raise an alert when the protocol's reassessment interval or target time to physician contact for that level is exceeded.
- **FR-006:** When an encounter is created through a retried command with the same idempotency key, the system shall return the original encounter without creating another (P01 C02).
- **FR-007:** The system shall publish a public board view of the emergency queue that shows a code or initials, location, level and waiting time, and no diagnosis or full name.

**Inpatient episode**

- **FR-008:** When an admission is requested, the system shall create an episode in `requested` with origin (emergency, outpatient, transfer in, scheduled), admitting service, responsible clinician and reason; when accepted, it shall move to `accepted`, and when the patient occupies a location, to `active` with the admission instant (Norma 1616 Art. 16 b, 17).
- **FR-009:** The system shall record the medical discharge as a milestone `medical_discharge_signed` with instant, signing physician and discharge type, separate from `physical_exit` with instant and the user who recorded it (LDDPPSS Art. 29).
- **FR-010:** When `medical_discharge_signed` is recorded, the system shall publish `MedicalDischargeSigned` with the instant, so that billable stay ends at that instant regardless of when the patient exits.
- **FR-011:** The system shall support discharge types: medical, voluntary, referred to another institution, death, and abandonment; each type shall require its documents before the milestone can be recorded: voluntary requires a signed voluntary discharge form reference with the explained risks, or a refusal-to-sign record with witnesses; referred requires an external transfer record; death requires death instant and certifying physician (LDDPPSS Art. 9 k, 13 e, 27 e; Norma Art. 17).
- **FR-012:** When a signed medical discharge is revoked before physical exit because the patient's condition changed, the system shall record a revocation event with reason and author, keep the original milestone in history, return the episode to `active`, and publish `MedicalDischargeRevoked`.
- **FR-013:** The system shall not provide deletion of episodes, encounters or segments; mistakes shall be corrected through explicit cancel events (cancel admission, cancel transfer, cancel discharge) that keep the original and record reason and author (HL7 v2 A11, A12, A13 model).
- **FR-014:** When a patient returns after physical exit, the system shall create a new encounter or episode related to the previous one and shall not reopen or overwrite the closed episode (AC318).
- **FR-015:** When an episode is administratively closed, the system shall require that physical exit is recorded and that every continuity item has an owner; closure shall not depend on account balance.

**Facility, beds and cleaning**

- **FR-016:** The system shall model services, units, rooms and beds with: authorized by CSSP (yes/no and authorization reference), operational (yes/no with reason), exclusive (one patient) or shared (chairs, observation stretchers), sex or age restrictions as warnings, and isolation capability.
- **FR-017:** The system shall store location occupancy as segments with a time range and shall enforce in the database that no two occupying segments overlap on an exclusive location (PostgreSQL exclusion constraint), so two concurrent assignments produce one success and one explicit conflict.
- **FR-018:** When a patient leaves an exclusive bed by exit, transfer or death, the system shall move the bed to `pending_cleaning` and not to `available`.
- **FR-019:** When terminal cleaning is registered, the system shall record the checklist version, each item result, the cleaning staff member, start and end instants and the supervising area head's signature; only a complete record with signature shall move the bed to `available` (Acuerdo 941 V.8.a, V.8.2).
- **FR-020:** The system shall allow blocking a bed with reason, expected end and author (maintenance, isolation, staffing), and blocked beds shall not accept reservations or assignments.
- **FR-021:** When a bed is reserved for an accepted episode, the reservation shall expire after a configurable time and release the bed back to `available` with an event.

**Transfers and leave**

- **FR-022:** When an internal transfer is requested, the system shall record origin, requested destination unit or bed, reason, requester and priority; the destination unit shall accept or reject with reason; on rejection the patient's current location and responsible clinician remain unchanged (AC316).
- **FR-023:** When an accepted transfer is executed, the system shall close the origin segment and open the destination segment at the same instant, record the handover giver and receiver, and change responsible service or clinician only if the transfer specifies it.
- **FR-024:** When a patient temporarily leaves the unit (procedure, imaging, surgery), the system shall record a temporary absence segment with destination and expected return while keeping the bed occupied by that patient; an absence shall not be treated as a discharge.
- **FR-025:** When an external transfer is recorded, the system shall store reason and missing capability, clinical status and stabilization done, destination institution, contact, name of the receiving person who accepted, acceptance instant, documents sent, transport and accompanying staff, with states requested, accepted, in transit, delivered and cancelled; `accepted` shall require the receiver name (Acuerdo 1653 IV.B.2.a, Tabla 1, used as reference model; R04).

**Responsibility and continuity**

- **FR-026:** The system shall keep the responsible clinician and responsible service of each encounter and episode as periods with start and end; at any instant exactly one responsible clinician exists for an active episode.
- **FR-027:** Before `medical_discharge_signed` can be recorded, the system shall list open orders, pending results, scheduled follow-ups and tasks, and require each to be assigned an owner (person or service) or explicitly closed (AC317; R07 FR 10).
- **FR-028:** When a result or event linked to a closed or exited episode arrives, the system shall route it to the continuity item owner and shall not reopen the episode (P01 C09).

**Census, events and audit**

- **FR-029:** The system shall produce a census at any instant and an occupancy report for a period with numerator (occupied bed-time) and denominator stated explicitly as authorized beds or operational beds, never mixed.
- **FR-030:** The system shall publish integration events through the outbox for: encounter created, triaged, episode requested, accepted, admitted, transferred, absence started and ended, medical discharge signed and revoked, physical exit, administrative closure, cancellations, bed status changed, external transfer state changed.
- **FR-031:** When an identity merge event (spec 001) arrives, the system shall re-point encounters and episodes of the retired identity to the survivor, record the change in the merge manifest acknowledgement, and acknowledge it.
- **FR-032:** The system shall write an audit event for every view of an episode, census or board containing patient data, and for every command (spec 000 FR-017).

## Scenarios and edge cases

| Requirement | Given | When | Then |
|---|---|---|---|
| FR-001 | Unconscious adult, no documents, no family | Nurse registers arrival | Provisional identity `NN-2026-…`, emergency encounter open; no payer asked |
| FR-002 | Insurer integration down and patient has prior debt | Physician orders admission from emergency | Episode created; task "coverage pending" for account owner; no warning blocks care |
| FR-004 | Receptionist tries to lower a patient's triage level | Submit | Denied, audited |
| FR-005 | Level with 30 min reassessment interval configured | 31 min pass with no reassessment | Alert shown on board and to triage nurse |
| FR-006 | Network timeout on arrival registration | Client retries | Same encounter returned |
| FR-009 | Discharge signed at 10:40, family picks patient up at 18:15 | Account computed (spec 006) | Stay billed until 10:40 |
| FR-011 | Patient wants to leave against advice and refuses to sign | Voluntary discharge | Requires refusal record with two witnesses and explained risks; then milestone recorded |
| FR-012 | Discharge signed, patient deteriorates at 12:00 | Physician revokes | Episode active again; both events in history; charges resume per spec 006 policy |
| FR-013 | Admission recorded on wrong patient | Cancel admission | Original kept with reason; segments closed; events published |
| FR-014 | Patient returns 2 days after exit with same complaint | Registered | New encounter linked as related; old episode untouched |
| FR-015 | Episode with unpaid balance | Administrative closure | Allowed if exit recorded and continuity items owned |
| FR-017 | Two admitters assign bed 204 at the same second | Both save | One succeeds; other receives `location_conflict` |
| FR-018 | Patient exits bed 204 | Exit recorded | Bed 204 `pending_cleaning`; not offered for assignment |
| FR-019 | Cleaning registered without supervisor signature | Save | Bed stays `cleaning`; missing signature listed |
| FR-021 | Bed reserved for ICU-transfer that never happens | Reservation expires | Bed back to `available`; event recorded |
| FR-022 | Surgery ward rejects a transfer | Rejection | Patient stays in emergency bed with emergency physician responsible |
| FR-024 | Patient goes to CT scan for 40 min | Absence recorded | Bed remains occupied by patient; census shows "temporarily absent" |
| FR-025 | Transfer to Hospital Nacional | Marked accepted without receiver name | Rejected: receiver name required |
| FR-026 | Responsible physician changes on Monday | Change recorded | Period closed and new one opened; never zero or two |
| FR-027 | Culture pending at discharge | Physician signs | Must assign owner for the culture result first |
| FR-028 | Culture result arrives after exit | Result event | Delivered to owner's work list; episode stays closed |
| FR-029 | 40 authorized beds, 36 operational | Occupancy report | Two denominators shown separately, labeled |
| FR-031 | Patient merged in spec 001 | Merge event | Episodes re-pointed; acknowledgement sent |

Concurrency, retry and unavailable dependencies are covered by FR-006, FR-017 and FR-002. Empty state: a unit with no beds configured shows the setup task, not an empty census.

## Definition of done

- [ ] Every in-scope outcome is represented by one or more testable `FR-*` requirements.
- [ ] Scenarios cover normal behavior and material edge/failure cases.
- [ ] Out-of-scope items and unresolved decisions are explicit.
- [ ] Acceptance and verification are observable, with no claim of unrun checks.
- [ ] The approved requirements are traceable to tasks in `tasks.md`.

## Research traceability

| Research item | Requirement(s) |
|---|---|
| AC315 emergency without appointment or bed | FR-001 |
| AC316 rejected transfer keeps responsible and location | FR-022 |
| AC317 post-discharge result with owner | FR-027, FR-028 |
| AC318 real return is a new encounter | FR-014 |
| P01 C02 episode opening and retry | FR-006, FR-008 |
| P01 C09 closure milestones and late events | FR-015, FR-028 |
| R03 section 7 | FR-009 to FR-011, FR-017 to FR-019, FR-022 to FR-024, FR-027, FR-029 |
| R04 section 6 | FR-001 to FR-005, FR-007, FR-025 |
| LDDPPSS Art. 9 k, 11, 27 e, 29, 42 b | FR-002, FR-009 to FR-011 |
| Acuerdo 941 (cleaning) | FR-018, FR-019 |

## Open decisions

| Item | Default until decided | Owner |
|---|---|---|
| Beds, units and CSSP authorization per service | Configured during setup; none assumed | PENDING-INS01 |
| Triage protocol and levels | Placeholder five-level protocol with configurable names, colors, targets and intervals; no licensed content | PENDING-INS04 (emergency head) |
| Voluntary discharge form and refusal-to-sign procedure | Form reference plus two witnesses | PENDING-INS06 (clinical direction, legal advice) |
| Bed reservation expiry | 2 hours | PENDING-INS06 (nursing management) |
| Who signs cleaning release | Area head (Acuerdo 941 V.8.2) | PENDING-INS04 |
| MINSAL egress export | Not implemented until format obtained | PENDING-INS06 |
