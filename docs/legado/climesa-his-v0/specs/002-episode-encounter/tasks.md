# Episode, encounter, beds and discharge implementation tasks

**Related spec:** [`spec.md`](./spec.md)
**Related plan:** [`plan.md`](./plan.md)
**Status:** Draft

Requires spec 000 T-001 to T-008 and spec 001 T-001 to T-006 (identity registration and provisional identity).

## Ordered tasks

### [ ] T-001: Care module skeleton, schema, permissions

- **Depends on:** 000/T-008, 001/T-006
- **Requirement:** FR-030, FR-032 (infrastructure)
- **Files/surfaces:** `src/Modules/Care/*`, migration `Care_Initial` with `btree_gist`, permission seed
- **Done when:** module builds; architecture tests pass; schema created by migrator; permissions seeded.
- **Evidence:** Not run

### [ ] T-002: Facility units, locations and status machine

- **Depends on:** T-001
- **Requirement:** FR-016, FR-018, FR-020
- **Files/surfaces:** `Domain/Locations/*`, `/camas` setup page
- **Done when:** location statuses follow the allowed transitions only; blocked location rejects reservation; CSSP-authorized and operational flags stored.
- **Evidence:** Not run

### [ ] T-003: Encounters, emergency arrival and clocks

- **Depends on:** T-001
- **Requirement:** FR-001, FR-002, FR-003, FR-006
- **Files/surfaces:** `Domain/Encounters/*`, `RegisterEmergencyArrival`, `/emergencia/llegada`
- **Done when:** arrival with provisional identity in one command; retry returns same encounter; clocks store act and capture instants; no economic field required.
- **Evidence:** Not run

### [ ] T-004: Triage protocol, assessments, queue and alerts

- **Depends on:** T-003
- **Requirement:** FR-004, FR-005, FR-007
- **Files/surfaces:** `triage_*` tables, `EmergencyBoard` query, alert job, `/emergencia` board
- **Done when:** reception cannot record triage; queue ordered by level then wait; fake-clock test fires alert; public board shows no names or diagnoses.
- **Evidence:** Not run

### [ ] T-005: Episode lifecycle with events and cancellations

- **Depends on:** T-002, T-003
- **Requirement:** FR-008, FR-013, FR-014, FR-026
- **Files/surfaces:** `Domain/Episodes/*`, `episode_events`, `responsible_periods`
- **Done when:** status derived from events; cancel keeps original; return creates related encounter; responsible periods never overlap or leave gaps while active.
- **Evidence:** Not run

### [ ] T-006: Location segments, reservations and exclusivity

- **Depends on:** T-005
- **Requirement:** FR-017, FR-021, FR-024
- **Files/surfaces:** `location_segments` exclusion constraint, `AssignLocation`, `ReserveBed`, expiry job
- **Done when:** concurrent assignment test yields one `location_conflict`; reservation expires with event; absence keeps bed occupied.
- **Evidence:** Not run

### [ ] T-007: Internal transfers

- **Depends on:** T-006
- **Requirement:** FR-022, FR-023
- **Files/surfaces:** `Domain/Transfers/*`, transfer pages
- **Done when:** rejection keeps location and responsible; execution closes and opens segments at the same instant with handover recorded.
- **Evidence:** Not run

### [ ] T-008: Discharge milestones, types and revocation

- **Depends on:** T-005, T-006
- **Requirement:** FR-009, FR-010, FR-011, FR-012, FR-027
- **Files/surfaces:** `SignMedicalDischarge`, `RevokeMedicalDischarge`, `RecordPhysicalExit`, `continuity_items`
- **Done when:** discharge and exit stored separately; event carries discharge instant; voluntary without form/witnesses rejected; revocation restores active with history; discharge blocked until continuity items owned.
- **Evidence:** Not run

### [ ] T-009: Cleaning records and bed release

- **Depends on:** T-002, T-008
- **Requirement:** FR-018, FR-019
- **Files/surfaces:** `cleaning_records`, `/camas/limpieza`
- **Done when:** exit puts bed in `pending_cleaning`; only signed record by a different user releases it.
- **Evidence:** Not run

### [ ] T-010: External transfers

- **Depends on:** T-005
- **Requirement:** FR-025
- **Files/surfaces:** `external_transfers`, form
- **Done when:** `accepted` without receiver name rejected by constraint and mapped to a clear error; state history kept.
- **Evidence:** Not run

### [ ] T-011: Administrative closure and late events

- **Depends on:** T-008
- **Requirement:** FR-015, FR-028
- **Files/surfaces:** `CloseEpisodeAdministratively`, continuity routing handler
- **Done when:** closure ignores balance; requires exit and owned items; late result routed to owner without reopening.
- **Evidence:** Not run

### [ ] T-012: Census and occupancy

- **Depends on:** T-006
- **Requirement:** FR-029
- **Files/surfaces:** `Census`, `Occupancy` queries and pages
- **Done when:** census at arbitrary instant matches seeded scenario; occupancy shows authorized and operational denominators separately.
- **Evidence:** Not run

### [ ] T-013: Identity merge consumer

- **Depends on:** T-005, 001 merge tasks
- **Requirement:** FR-031
- **Files/surfaces:** inbox handler `IdentityMerged`, `IdentityMergeReversed`
- **Done when:** re-pointing idempotent; acknowledgement written; reversal restores.
- **Evidence:** Not run

### [ ] T-014: Audit and events verification

- **Depends on:** T-001 to T-013
- **Requirement:** FR-030, FR-032
- **Files/surfaces:** integration test suite
- **Done when:** every command emits its event once through the outbox; every patient-data view writes an audit row.
- **Evidence:** Not run

## Verification log

| Task | Command or procedure | Observed result | Date |
|---|---|---|---|
| | | | |
