# Research package

`CLIMESA_ESPECIFICACION_NUCLEO_P01.zip` contains, unmodified:

- `CLIMESA_ESPECIFICACION_NUCLEO_P01.md`: core specification proposal 0.1 (identity, episode, service, charge, payment, reconciliation), institutional evidence register INS01-INS12, and backlog P01-01 to P01-09.
- `criterios_refinamiento_T309_T310.csv`: AC-P01-001 to AC-P01-012 (claims and migration).
- `antecedentes/CLIMESA_CIERRE_FASE_BASE.zip`: closure of the research phase with V1-V9 history, 316 candidate acceptance criteria, 104 candidate tasks and the consolidated source catalog.

Companion living document (legal framework, reference systems, standards, flows): the "Base investigativa: Sistema Hospitalario" doc.

## Corrections recorded after the package

| Date | Item | Correction | Source |
|---|---|---|---|
| 2026-10-12 | Data protection officer (delegado) | Decreto Legislativo 659 (DO 173, 18-sep-2026) derogated LPDP Art. 15 and 17; Art. 16 and 18 keep the duty to receive and process ARCO-POL requests; Art. 20 (20 business days) and Art. 25 (72 h breach notice) remain. | Consolidated LPDP text, jurisprudencia.gob.sv `10660E.PDF` |
| 2026-10-12 | Norma técnica del expediente clínico | Acuerdo Ejecutivo 698 (9-feb-2026, DO 19-mar-2026) reformed Art. 41 (access, copy, export) and Art. 42 (rectification with automatic electronic record of time, user and detail). | V2 `02_MARCO_LEGAL_EL_SALVADOR.md` |
| 2026-10-12 | .NET 8 support | Ends 2026-11-10. | devblogs.microsoft.com/dotnet/dotnet-8-9-end-of-support/ |
| 2026-10-13 | Medicines regulator | Dirección Nacional de Medicamentos dissolved; Superintendencia de Regulación Sanitaria (Decreto 891, in force 2024-08-07) succeeds it; references to DNM read as SRS (Art. 37, 39). | srs.gob.sv, Ley SRS consolidated June 2025 |
| 2026-10-13 | Private establishment authorization | Código de Salud Art. 14, 17, 24 reformed (DO 8-oct-2025, in force 15-oct-2025): CSSP authorizes private hospitals without prior favorable report from the juntas de vigilancia; URES registration still required. | diario.elmundo.sv, 16-oct-2025 |
| 2026-10-13 | VAT on private health | Ley IVA Art. 46 a exempts health services only from public or qualified public-utility institutions; Art. 45 j exempts only antiretrovirals bought by public bodies; no general medicine exemption. | transparencia.mh.gob.sv DC5828 |
| 2026-10-13 | Consumer invoice receptor | Código Tributario reform approved 17-sep-2024 (Art. 114, 119-G, 239, 239-A): natural persons buying under US$25,000 cannot be required to give name or ID on a consumer invoice unless they need it to deduct; penalty 30% of the amount, minimum 2 monthly minimum wages. | revistaeyn.com, 28-sep-2024 |
| 2026-10-13 | Hospital stay billing | LDDPPSS Art. 29: private hospital costs run from admission until the physician signs the discharge. | LDDPPSS, CSSP |
| 2026-10-13 | CEYE norm | Lineamientos técnicos de la CEYE del SNIS, Acuerdo 1584 (16-jul-2026) published and read; V6 listed it as not retrieved. Biological indicator frequency is inconsistent inside the text (per load in Table 5, weekly minimum in Annex 11); system default is per load. | asp.salud.gob.sv, AE-1584-16072026 |
| 2026-10-13 | Referral guidelines scope | Lineamientos RRI, Acuerdo 1653 (30-may-2024) bind only MINSAL and FOSALUD staff; used as reference model, not as CLIMESA obligation. | transparencia.gob.sv MINSAL 590122 |
| 2026-10-13 | Clinical laboratory norm | Acuerdo 1855 (2023) applies to SNIS labs; Art. 81 excludes private labs from mandatory external quality assessment; no national critical value list; results kept 5 years (Art. 75), samples 24 h (Art. 76), emergency/OR/ICU results within 2 h (Art. 69). | jurisprudencia.gob.sv FBDBC.PDF |
| 2026-10-13 | Hospital triage | No MINSAL triage norm with levels and times binding private hospitals was found; Acuerdo 2456-BIS (2025) is first level. Triage protocol is a CLIMESA choice, versioned. | Search 2026-10-13 |
| 2026-10-13 | Complaints office | Reglamento LDDPPSS Art. 9: hospitals must have a complaints office; priorities: urgent health service immediately or within 24 h, patient-rights violations 3-5 days, other 15 days max. Not resolving a complaint is a minor infraction (LDDPPSS Art. 44 d). | Reglamento LDDPPSS (vLex) |
| 2026-10-13 | Specialist certification | Ley de Especialidades de Profesiones Médicas (Apr 2024): CONADEM is the only body certifying medical specialties; annual credential and public registry (press, Jul 2025). Credential model stores junta license and CONADEM certification separately. | diario.elmundo.sv |
| 2026-10-13 | Cybersecurity law | Ley de Ciberseguridad y Seguridad de la Información (Decreto 143, 2024): health listed as essential service; Art. 6 obligations reach private critical infrastructure operators per ECIJA; official text not retrieved; no notification deadline confirmed. | ecija.com |

## Module dossiers

Per-module consolidation of V1-V9 plus new verified research: [`dossiers/`](./dossiers/README.md). Status per dossier in the dossiers index.
