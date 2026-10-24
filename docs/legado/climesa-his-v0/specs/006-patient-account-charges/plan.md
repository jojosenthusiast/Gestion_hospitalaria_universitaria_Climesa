# Patient account, charges, deposits and payments implementation plan

**Related spec:** [`spec.md`](./spec.md)
**Status:** Draft
**Last updated:** 2026-10-13

## Goal and scope

Implement module `Billing`: catalog, tariffs, accounts, charges, bed-days, estimates, statements, deposits, payments, applications, cashier sessions, responsibility split, exception queues and reconciliation.

## Architecture and boundaries

- **Components:** `Climesa.Modules.Billing.{Domain, Application, Infrastructure, Contracts}`; UI `/caja`, `/cuentas`, `/tarifas`.
- **Aggregates:** `Account` (charges, adjustments, payer list, split state), `Payment` (amount, means, applications), `Deposit`, `CashierSession`, `Estimate`, `PriceRule`.
- **Inputs:** events from Care (`PatientAdmitted`, `PatientTransferred`, `MedicalDischargeSigned`, `MedicalDischargeRevoked`, `PhysicalExitRecorded`, `EncounterCreated`) and later clinical modules (`ServicePerformed`, `MedicationDispensed`, `SupplyConsumed`) through the inbox with dedupe by event id and origin id.
- **Money:** `decimal(18,2)` for amounts, `decimal(18,4)` for unit prices; `Money` value object; rounding half-up per line; totals as sums of rounded lines.
- **Bed-day engine:** given segments and the stay rule version, computes billable day units between admission and discharge signature; recomputes on segment or milestone changes by reversing and re-creating only affected bed-day charges.
- **Concurrency for applications:** `SELECT ... FOR UPDATE` on the deposit or payment row plus a check constraint `applied_total <= amount`, so the database rejects over-application.
- **Alternatives:** generic rules engine for pricing vs explicit precedence code: explicit precedence with data-driven rules, because precedence must be explainable on screen (FR-002).

## Contracts

| Operation | Permission |
|---|---|
| Catalog and `PriceRule` CRUD-by-version | `billing.catalog.manage`, `billing.tariff.approve` (≠ editor) |
| `CreateManualCharge`, `ReverseCharge`, `AdjustCharge` | `billing.charge.manual`, `billing.charge.correct` |
| `CreateEstimate`, `DeliverEstimate` | `billing.estimate` |
| `ReceiveDeposit`, `ReceivePayment`, `ApplyPayment`, `ReverseApplication`, `RequestRefund`, `ApproveRefund` | `billing.cashier.*`, `billing.refund.approve` |
| `OpenCashierSession`, `CloseCashierSession` | `billing.cashier.session` |
| `AddPayer`, `CloseForBilling`, `RecomputeSplit` | `billing.account.manage` |
| Exception queue actions | `billing.exceptions.*` |
| `GetItemizedStatement(accountId)` | `billing.statement.view` (and patient copy via spec 005) |

Events: `ChargeCreated`, `ChargeReversed`, `ChargeAdjusted`, `AccountClosedForBilling {lines, split}`, `PaymentReceived`, `PaymentApplied`, `ApplicationReversed`, `DepositReceived`, `DepositRefunded`, `CashierSessionClosed`.

## Data and migrations

Schema `billing`: `catalog_items` (+ versions), `price_rules` (scope: general, plan, contract; item; price; valid range; approved_by), `max_retail_prices` (product, price, valid range, source), `tax_policies`, `accounts`, `account_payers` (order, plan, coverage ref, authorizations), `charges` (origin_type, origin_id, unique (origin_type, origin_id) where effective; quantity, unit, unit_price, rule_id, rule_version, tax_class, tax_rate, amount, status), `charge_adjustments`, `bed_day_runs`, `estimates` (+ versions, lines, deliveries), `deposits`, `payments`, `applications` (+ reversal link), `cashier_sessions`, `session_movements`, `refunds`, `split_lines`, `exceptions`.

## Security and privacy

- Cashier roles see account totals and items, not clinical notes.
- Refund and tariff approval segregated (different users, MFA).
- No card numbers stored; only authorization codes and last four digits if printed on voucher.

## Failure and recovery

- Duplicate origin event: unique index on effective origin; handler returns existing charge.
- Out-of-order events (discharge before last transfer): bed-day engine works from segments at computation time; late segment change triggers recomputation with reversal of affected days.
- Split recomputation after coverage change: previous split versions kept; new version supersedes.

## Verification

| Check | Command or procedure | Expected evidence |
|---|---|---|
| One charge per origin | `dotnet test --filter OneChargePerOrigin` | Second event returns same charge |
| Price snapshot | `--filter TariffChangeDoesNotAlterCharge` | Old price kept |
| Tariff conflict | `--filter EqualPrecedenceConflict` | Exception, no charge |
| Bed-days to discharge | `--filter BedDaysStopAtDischargeSignature` | No stay after signature; revocation resumes |
| Max price | `--filter MedicinePriceAboveMaximumHeld` | Exception |
| Concurrent applications | `--filter ConcurrentDepositApplication` | One fails; total never exceeds |
| Idempotency conflict | `--filter PaymentIdempotencyConflict` | Conflict, no effect |
| Reversal | `--filter ReverseApplicationRestoresBalances` | Balances restored; no new receipt |
| Split | `--filter CoverageSplit80_20` | Lines split; rejected line provisional |
| No blocking hooks | Architecture test `BillingDoesNotReferenceCareCommands` | Billing has no dependency able to block Care commands |
| Cashier close | `--filter CashierSessionDifference` | Difference requires explanation |
| Late payment | `--filter PaymentAfterEpisodeClosure` | Episode unchanged |

## Risks and decisions

- **Risk:** missing-charge rules flood staff with false positives (70-75% in HFMA case). Mitigation: rules start disabled, enabled one by one with precision measured (FR-024).
- **Risk:** stay rule disagreement with current practice. Mitigation: policy versioned; brecha measured with A9 of the questionnaire.

## Plan review

- [ ] Architecture, contracts, data, migration, security, and failure handling are addressed.
- [ ] Verification is scoped, exact, and tied to requirements.
- [ ] No unresolved decision is silently treated as approved.
