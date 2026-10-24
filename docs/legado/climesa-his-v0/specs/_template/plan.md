# [Feature name] implementation plan

**Related spec:** [`spec.md`](./spec.md)
**Status:** Draft
**Last updated:** [YYYY-MM-DD]

## Goal and scope

[Summarize the approved outcome, in-scope work, and material non-goals from the spec.]

## Architecture and boundaries

- **Components/layers:** [Components involved and responsibility of each]
- **Boundaries:** [Existing architecture or ownership constraints to preserve]
- **Flow:** [Concise request/event path across components]
- **Alternatives and decision:** [Material alternatives considered and rationale, or N/A]

## Contracts

- **User/API contracts:** [Routes, request/response shapes, validation, and compatibility]
- **Internal contracts:** [Service or event interfaces and ownership]
- **Authorization:** [Roles, policies, resource checks, and denial behavior]
- **Compatibility:** [Existing callers/data or N/A with reason]

## Data and migrations

- **Data changes:** [Entities, fields, constraints, indexes, retention, and privacy impact; or none]
- **Migration impact:** [Required migration and safe rollout/rollback considerations; or none]
- **Operational data steps:** [Backfill or deployment ordering; or none]

## Security and privacy

[Threats, sensitive data, least privilege, validation, audit/logging constraints, and mitigations.]

## Failure and recovery

[Expected validation, authorization, dependency, concurrency, and partial-failure behavior; transaction/retry/recovery strategy where applicable.]

## Verification

List the exact checks that will be run and what each proves. Include focused automated tests when applicable, relevant alternate/negative cases, and any manual checks. Do not report planned checks as completed evidence.

| Check | Command or procedure | Expected evidence |
|---|---|---|
| [Focused behavior] | [Exact command/procedure] | [Observable pass condition] |
| [Negative/alternate case] | [Exact command/procedure] | [Observable pass condition] |

## Risks and decisions

- **Risk:** [Impact and mitigation, or none identified]
- **Open decision:** [Decision owner and needed-by point, or none]

## Plan review

- [ ] Architecture, contracts, data, migration, security, and failure handling are addressed.
- [ ] Verification is scoped, exact, and tied to requirements.
- [ ] No unresolved decision is silently treated as approved.
