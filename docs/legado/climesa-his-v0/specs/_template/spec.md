# [Feature name] specification

**Status:** Draft
**Owner:** [Role or team]
**Last updated:** [YYYY-MM-DD]

## Problem and outcome

[Who has the problem, what they need, and the observable outcome this feature should provide.]

## Scope

### In scope

- [User capability or outcome included]

### Out of scope

- [Explicitly excluded capability, workflow, or system]

## Functional requirements (EARS)

Assign stable, unique IDs. Write each requirement as a condition or trigger followed by the system response, using an EARS form such as “When [trigger], the system shall [response]” or “While [state], the system shall [response].” Requirements must be observable and verifiable.

- **FR-001:** When [trigger or condition], the system shall [observable response].
- **FR-002:** While [state or condition], the system shall [observable response].

## Scenarios and edge cases

For each important requirement, cover the successful path and relevant alternate or failure paths.

| Requirement | Given | When | Then |
|---|---|---|---|
| FR-001 | [Starting state] | [Action or event] | [Observable result] |
| FR-001 | [Boundary, invalid, or unavailable condition] | [Action or event] | [Safe and observable result] |

Include relevant authorization, validation, duplicate/retry, concurrency, empty-state, and unavailable-dependency cases; mark irrelevant cases N/A with a reason.

## Definition of done

- [ ] Every in-scope outcome is represented by one or more testable `FR-*` requirements.
- [ ] Scenarios cover normal behavior and material edge/failure cases.
- [ ] Out-of-scope items and unresolved decisions are explicit.
- [ ] Acceptance and verification are observable, with no claim of unrun checks.
- [ ] The approved requirements are traceable to tasks in `tasks.md`.
