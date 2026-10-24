# ADR-0001: Rebuild the domain core on .NET 10 and PostgreSQL

**Status:** Proposed (2026-10-12)
**Deciders:** Project lead; to be ratified with CLIMESA once owners exist (P01-08).

## Context

The Aldara prototype (ASP.NET Core MVC, .NET 8, SQL Server) was built as a course project without prior research. The research package (V1-V9 and P01) recommends deciding continue/refactor/rebuild per domain with evidence, and warns against a rewrite "by intuition".

The evidence for the core domain already exists in that same research (V3 `01_HALLAZGOS_Y_DECISIONES.md`, findings B301-B309) and in the static review of this repository:

- B301: `Patient` requires document number, birth date and gender, so unknown patients need fabricated data.
- B303: one unique `DocumentNumber` without type or issuer cannot represent Salvadoran identifiers.
- B304: demographic updates overwrite values without history, contrary to Norma técnica del expediente clínico Art. 42 (reformed by Acuerdo 698 of 2026).
- B307/B308: no episode or account entity; invoices hang from the patient, so payers and responsibilities cannot be separated.
- `AuditableEntity` keeps only last writer; no access log exists.
- Accounting entries exist only for expenses; payments, invoices and purchases post nothing.
- .NET 8 reaches end of support on 2026-11-10.

Every one of these is in the data model, the layer every other module depends on. Adapting it in place means migrating each table through an intermediate shape while keeping the prototype's screens alive, with no production data to protect (the prototype was never deployed).

## Decision

1. Rebuild the domain core (identity, episode, documents, account, audit) in a new repository with the constitution in `docs/constitution.md`.
2. Keep Aldara as reference material: its validations (no overlapping appointments, no dispensing above stock, transactional payment registration), role list and screens inform the new specs. No code is copied without passing the new specs' tests.
3. Stack: C# .NET 10 LTS, ASP.NET Core, EF Core with Npgsql, PostgreSQL. Server-rendered UI (Razor) with targeted interactivity; a PWA only for the read-only contingency station.
4. Specialized domains (laboratory LIS, imaging PACS) are integrated, not built, subject to per-domain evaluation (P01-08).

## Alternatives considered

| Option | Why not chosen |
|---|---|
| Evolve Aldara in place | The defects are in the shared model; no deployed data justifies a compatibility path; .NET 8 and SQL Server LocalDB would be migrated anyway. |
| Adopt OpenMRS / Bahmni (Java) | Strong clinical model, weak finance, no Salvadoran fiscal localization; a two-person team would be customizing a foreign codebase. Remains the benchmark for clinical concepts and merge semantics. |
| Build on Frappe / ERPNext Healthcare (Python) | Finance, stock and payroll included, but shallow clinical model, no DTE, niche framework lock-in. Remains a candidate if CLIMESA's first need is purely ERP. |
| Medplum (TypeScript, FHIR-native) | No finance or inventory; FHIR as operational store complicates accounting. |

## Consequences

- Every module starts from specs; the first visible demo is identity plus paper-record migration (specs 001 and 004).
- PostgreSQL removes per-core licensing and the 10 GB per-database limit of SQL Server Express.
- This ADR does not select vendors for LIS, PACS, DTE certificates or hosting.
- If CLIMESA's institutional facts (P01 register INS01-INS12) contradict an assumption here, this ADR is revisited, not silently worked around.
