# Project constitution

**Status:** Draft v0.1 (2026-10-12). Replaces the Aldara prototype constitution for this repository. Changes require a recorded decision in `docs/decisions/`.

These principles are permanent constraints. A spec, plan or task that conflicts with them is wrong until the constitution is amended by an ADR.

## 1. Platform

1. Runtime: C# on .NET 10 LTS. Persistence: PostgreSQL (17 or later) through EF Core with Npgsql. Rationale and alternatives: ADR-0001.
2. Shape: one deployable modular monolith. Each module owns its own database schema and is reached by other modules only through its published contracts (commands, queries, integration events). No module reads another module's tables.
3. Deployment target: on-premise inside the hospital network with a hot replica; cloud is allowed only for encrypted backup under a contract that satisfies the data protection law (Ley para la Protección de Datos Personales, Art. 44-45).
4. Time: store instants in UTC (`timestamptz`); present and reason about local dates in `America/El_Salvador`. Clinical and fiscal events record both when they happened and when they were captured.

## 2. Domain integrity

1. Separate patient, episode, order, performed service, result/document, charge, fiscal document, payment and accounting entry. Link them by stable identifiers; never collapse two of them into one record or one status column.
2. Nothing clinical, financial or fiscal is hard-deleted. Corrections create a new version linked to the previous one, with actor, authority, instant, reason and evidence. "Entered in error" is a state, not a deletion.
3. Never fabricate data to satisfy a constraint: unknown birth dates, missing documents and uncertain values are represented explicitly with their precision and provenance.
4. Every rule that comes from law, contract or institutional policy is configuration with a version, effective date, source reference and approver. Percentages, deadlines, thresholds, tariffs and payroll rates are never hard-coded from assumptions.
5. Automation may detect, propose, queue, remind and reconcile. It may not merge patients, sign clinical content, resolve disputes, change who pays, or decide clinical priority without an authorized human decision.

## 3. Reliability

1. Every state-changing command carries an idempotency key. Same key and equivalent content returns the original durable result; same key and different content is an explicit, audited conflict.
2. Concurrency is handled by optimistic versioning or database constraints, never by "check then write" in application code alone.
3. Cross-module and external effects go through a transactional outbox. Consumers deduplicate durably. A timeout to an external party produces an "uncertain" state that is reconciled before any retry that could duplicate an effect (DTE, payment, claim).
4. The hospital keeps working without internet. Any feature that depends on an external party must define its degraded mode.

## 4. Security, privacy and audit

1. Authorization is by permission (action) plus context (facility, service, care relationship), not by role names checked in controllers. Technical administration never implies clinical or financial authority.
2. Every read, search, export and change of patient data emits an audit event with actor, action, patient, outcome and purpose. The audit store is append-only and tamper-evident, kept at least 2 years (Norma técnica del expediente clínico, Art. 55-56).
3. Logs never contain clinical content, credentials, tokens or payment data. Test and demo environments use synthetic or de-identified data only (Norma Art. 50).
4. Data minimization: screens and APIs return the minimum attributes the user's task needs.

## 5. Evidence and verification

1. Specs follow `specs/README.md`: numbered EARS requirements, scenarios, plan, ordered tasks with observable "Done when".
2. Every requirement that cites law or research references the source and its version. Requirements that depend on CLIMESA facts not yet confirmed are marked `PENDING-INS<nn>` (institutional evidence register, research package P01) and implemented as configurable policy with a safe default, never as silent assumptions.
3. Behavior changes are developed test-first where a deterministic test is possible. Domain and persistence tests run against a real PostgreSQL instance (containers), not an in-memory substitute.
4. Report only checks that were run, with the exact command and observed result.
5. Technical artifacts are in English; domain terms with legal meaning in El Salvador keep their Spanish name (DUI, NUI, partida de nacimiento, DTE, expediente).
