# Patient account, charges, deposits and payments specification

**Status:** Draft
**Owner:** Project lead; CLIMESA owners PENDING-INS07 (catalogs and tariffs), PENDING-INS08 (payers), PENDING-INS09 (cashier and banks), PENDING-INS10 (accountant)
**Last updated:** 2026-10-13 (rev. 1, research dossiers R14, R16)

## Problem and outcome

Revenue in a hospital is lost between the service performed and the charge recorded (up to 1% of net charges per HFMA), and trust is lost when the patient cannot see why the bill changed. Salvadoran law fixes several rules: costs must be estimated beforehand in private care (LDDPPSS Art. 13), stay runs until the physician signs the discharge (Art. 29), the discharge report includes itemized costs (Art. 14), care can never be denied or degraded for money (Art. 11, 42 b), medicines cannot be charged above the regulated maximum price (Ley de Medicamentos Art. 59, SRS), and services of a private for-profit hospital and medicines carry 13% IVA (Ley IVA Art. 46 a, 45 j, 54).

Outcome: each episode has an account; each charge has exactly one origin and a frozen price; prices come from versioned tariffs and contracts; responsibility is split by payer; deposits and payments are applied without over-application; corrections are reversals and adjustments, never edits; the patient gets an estimate before and an itemized statement at discharge; and every gap between service and charge lands in a queue with an owner.

## Scope

### In scope

- Service catalog with charge milestone, unit, fiscal classification and validity.
- Price lists and contract prices versioned; charge price snapshot.
- Account per episode or encounter; payers and responsibility order.
- Charge origination from events (performed service, dispensing, administration, bed-day), manual charges with reason.
- Bed-day generation from location segments up to `medical_discharge_signed`.
- Estimates (presupuestos) versioned, delivered and compared with actuals.
- Tax per line with classification approved by the accountant; rate as versioned policy.
- Maximum retail price check for medicines.
- Deposits, payments, applications, refunds, reversals; cash sessions per cashier and means of payment.
- Responsibility split at account close: insurer covered portion, coinsurance, deductible, not covered (R16).
- Exception queues: service without expected charge, charge without origin, missing or conflicting tariff, price above maximum.
- Itemized statement for the discharge report and for the patient on request.
- Events for spec 007 (fiscal documents) and spec 008 (accounting).

### Out of scope

- DTE generation and transmission: spec 007.
- Ledger postings: spec 008.
- Claims, remittances, disputes with insurers: spec 009.
- Physician fee settlements and withholding: spec 008/009 extension (R17 data).
- Activity-based costing: later spec (uses this spec's data).

## Functional requirements (EARS)

**Catalog and prices**

- **FR-001:** The system shall keep a service catalog with code, description, unit, included components, charge milestone (ordered, performed, dispensed, administered, daily), fiscal classification approved by the accountant, and validity period.
- **FR-002:** The system shall keep price lists and contract-specific prices as versioned rules with validity, and shall resolve the price for a charge by a documented precedence (contract price, then plan price list, then general price list); if two rules of equal precedence apply, it shall create a tariff-conflict exception and not choose arbitrarily (AC321).
- **FR-003:** When a charge is created, the system shall store a snapshot of unit price, rule id and version, tax classification and rate; later tariff changes shall not alter existing charges (AC320).

**Accounts and charges**

- **FR-004:** When an encounter or episode starts, the system shall open an account linked to it with the patient as default responsible party; payers added later shall have an order of responsibility and coverage reference.
- **FR-005:** When an origin event arrives (service performed, medication dispensed or administered, supply consumed, bed-day), the system shall create at most one effective charge per origin id, so repeated events do not duplicate charges (AC319; P01 C05).
- **FR-006:** The system shall allow manual charges only with permission, catalog item, reason and author, marked as manual for review.
- **FR-007:** The system shall never edit a charge's amount or quantity after creation; corrections shall be a reversal of the charge plus a new charge, or an adjustment line linked to it, each with reason and author.
- **FR-008:** The system shall generate bed-day charges from location occupancy segments according to the configured stay rule, ending at the instant of `medical_discharge_signed` from spec 002, and shall not generate stay charges for time between discharge signature and physical exit (LDDPPSS Art. 29).
- **FR-009:** When a medical discharge is revoked (spec 002 FR-012), the system shall resume stay charges from the revocation instant.
- **FR-010:** When a medicine charge is created, the system shall compare its unit price with the maximum retail price in force for that product on that date and, if higher, hold the charge in a price exception instead of posting it (Ley de Medicamentos Art. 59; SRS).
- **FR-011:** The system shall compute tax per line from the snapshot classification and rate; rate and classifications are versioned policies approved by the accountant (Ley IVA Art. 54).

**Estimates and statements**

- **FR-012:** When a scheduled episode or procedure is planned, the system shall allow creating a versioned estimate with lines, assumptions and validity, and record its delivery to the patient with acknowledgement (LDDPPSS Art. 13).
- **FR-013:** When an account is reviewed, the system shall show estimate versus actual by line, and changes in price or scope shall carry a justification visible to the patient on request (LDDPPSS Art. 29).
- **FR-014:** When the medical discharge is signed, the system shall produce an itemized statement (charges, adjustments, payments, deposits, balance by payer) referenced by the discharge report of spec 003 (LDDPPSS Art. 14).

**Deposits, payments, applications**

- **FR-015:** The system shall record deposits as liabilities linked to the account until applied, with receipt number, means of payment and cashier session.
- **FR-016:** When payments or deposits are applied, the system shall prevent the sum of applications from exceeding the available amount even under concurrent applications (AC323, AC324).
- **FR-017:** When a payment command is retried with the same idempotency key and same content, the system shall return the original result; with the same key and different amount, it shall reject with an idempotency conflict and no effect (AC325).
- **FR-018:** When an application is reversed, the system shall restore balances and links without creating a new bank receipt (AC326).
- **FR-019:** The system shall manage cashier sessions with opening float, movements by means of payment (cash, card, transfer, check), closing count, and difference recorded with explanation; card payments shall store authorization reference, not card numbers.
- **FR-020:** When a refund is requested for an unapplied deposit or overpayment, the system shall require approval by a role different from the requester before payout.

**Responsibility split**

- **FR-021:** When an account is closed for billing, the system shall split each line by payer using the coverage rules of the plan (covered percentage, coinsurance, deductible, exclusions, line-level authorizations), and shall show the patient portion separately from the insurer portion (R16 section 4).
- **FR-022:** If coverage is pending or rejected for a line, then the system shall keep that line's responsibility provisional with an owner, and shall not move it to the patient automatically (AC322; P01 C06).

**No economic blocking**

- **FR-023:** The system shall not expose any rule, setting or integration hook by which balance, deposit or coverage status can block opening an encounter, recording care, discharging or recording exit; collection actions are tasks for the account owner (LDDPPSS Art. 11, 42 b).

**Exceptions and reconciliation**

- **FR-024:** The system shall maintain exception queues with owner and reason for: performed service without expected charge (by configurable rules per service type), charge without valid origin, missing tariff, tariff conflict, price above maximum, and coverage pending; it shall record when an exception is closed as false positive so rule precision can be measured (HFMA).
- **FR-025:** The system shall reconcile per account: performed services vs charges, charges vs fiscal documents (spec 007), payments vs applications, and expose differences as cases (P01 C08).

**Events and audit**

- **FR-026:** The system shall publish events for charge created, reversed, adjusted; account closed for billing; payment received, applied, reversed; deposit received, applied, refunded; cashier session closed.
- **FR-027:** When a payment arrives after episode closure, the system shall apply it to the account without reopening or modifying the episode (AC-P01-006).
- **FR-028:** Every money-affecting command shall be audited with actor, amounts and reason, and use decimal arithmetic with currency USD and two-decimal rounding by documented rule (half-up at line level).

## Scenarios and edge cases

| Requirement | Given | When | Then |
|---|---|---|---|
| FR-002 | Two contract prices for the same item, same dates | Charge | Tariff conflict exception, no charge posted |
| FR-003 | Tariff raised after charge | Account viewed | Old charge keeps old price |
| FR-005 | Dispensing event received twice | Process | One charge |
| FR-007 | Wrong quantity charged | Correct | Reversal + new charge, both visible |
| FR-008 | Admitted Mon 22:00, discharge signed Wed 10:40, exit Wed 18:00 | Bed-days | Computed until Wed 10:40 per stay rule |
| FR-010 | Medicine price above SRS maximum | Charge | Held in price exception |
| FR-012 | Scheduled cholecystectomy | Estimate v1 delivered, v2 after anesthesiology change | Both versions, deliveries recorded |
| FR-016 | Two cashiers apply the same $100 deposit at once | Commit | One succeeds; other gets insufficient-available error |
| FR-017 | Same key, $50 then $60 | Second request | `idempotency_conflict`, no effect |
| FR-019 | Session closes $5 short | Close | Difference recorded with explanation required |
| FR-021 | Insurer covers 80% hospital, honorarios 100% | Split | Lines split accordingly; patient sees 20% coinsurance |
| FR-022 | Insurer rejects a line | Split | Line provisional with owner; patient not charged automatically |
| FR-023 | Admin tries to configure "block discharge if balance > 0" | Configuration | No such option exists |
| FR-024 | Lab test performed without charge | Nightly rule | Exception with owner; if closed as false positive, counted |
| FR-027 | Payment 30 days after exit | Apply | Account updated; episode untouched |

## Definition of done

- [ ] Every in-scope outcome is represented by one or more testable `FR-*` requirements.
- [ ] Scenarios cover normal behavior and material edge/failure cases.
- [ ] Out-of-scope items and unresolved decisions are explicit.
- [ ] Acceptance and verification are observable, with no claim of unrun checks.
- [ ] The approved requirements are traceable to tasks in `tasks.md`.

## Research traceability

| Research item | Requirement(s) |
|---|---|
| AC319 to AC326 | FR-005, FR-003, FR-002, FR-022, FR-016, FR-017, FR-018 |
| AC-P01-006 late payment | FR-027 |
| P01 C05 to C08 | FR-005, FR-021, FR-022, FR-015 to FR-019, FR-025 |
| LDDPPSS Art. 11, 13, 14, 29, 42 b | FR-008, FR-012 to FR-014, FR-023 |
| Ley IVA Art. 45 j, 46 a, 54 | FR-011 |
| Ley de Medicamentos Art. 59, SRS | FR-010 |
| HFMA charge integrity | FR-024 |
| R16 section 4 insurance model | FR-021, FR-022 |

## Open decisions

| Item | Default until decided | Owner |
|---|---|---|
| Stay rule (calendar day, 24-hour periods, minimum fraction) up to discharge signature | Calendar night counted at 00:00 occupancy; configurable | PENDING-INS07 |
| Tariff, packages and contracts | Loaded from CLIMESA tariff; none assumed | PENDING-INS07, INS08 |
| Deposit policy at admission (never blocking) | Optional, suggested amount configurable | PENDING-INS09 |
| Fiscal classification per catalog item | All taxable at 13% until accountant approves exceptions | PENDING-INS10 |
| Whether physician fees are billed by the hospital | Both models supported; per physician setting | PENDING-INS10 |
| Maximum retail price source | Manual load from SRS list per product until an official file is available | PENDING-INS07 |
