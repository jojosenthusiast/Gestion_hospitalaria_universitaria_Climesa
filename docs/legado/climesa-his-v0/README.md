# CLIMESA HIS

Hospital information system for Hospital CLIMESA (Santa Ana, El Salvador). Spec-driven: nothing is implemented without a spec. The current demo implements Draft specs so CLIMESA can validate them on something that runs; specs become Approved only after that review.

- Principles: [`docs/constitution.md`](docs/constitution.md)
- Decisions: [`docs/decisions/`](docs/decisions/)
- Research package, module dossiers and corrections: [`docs/research/`](docs/research/)
- Specs and roadmap: [`specs/README.md`](specs/README.md)
- Working demo (specs 000, 001, 002, part of 004), how to run it and what is missing: [`docs/demo/`](docs/demo/README.md)
- Material for the first conversation with CLIMESA (proposal and questionnaire): [`docs/climesa/`](docs/climesa/)

Stack (ADR-0001, ADR-0002): C# .NET 10 LTS, ASP.NET Core Razor Pages, Npgsql with explicit SQL per module schema, PostgreSQL, on-premise.

```
src/Climesa.Platform      audit chain, idempotency, outbox/inbox, policies, security, migrator
src/Modules/Identity      spec 001
src/Modules/Care          spec 002
src/Modules/Migration     spec 004 (archive index)
src/Climesa.Web           Razor Pages UI in Spanish, composition root
tests/Climesa.Tests       requirement tests against PostgreSQL
tests/e2e                 Playwright walkthrough
```
