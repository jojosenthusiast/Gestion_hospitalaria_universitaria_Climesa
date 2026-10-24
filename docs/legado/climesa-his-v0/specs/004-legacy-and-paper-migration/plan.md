# Legacy and paper migration implementation plan

**Related spec:** [`spec.md`](./spec.md)
**Status:** Draft
**Last updated:** 2026-10-13

## Goal and scope

Implement module `Migration`: archive inventory and loans, batch framework, identity load with matching, scanning work orders and QC, abstraction, write-authority registry, cutover checklist and rollback support.

## Architecture and boundaries

- **Components:** `Climesa.Modules.Migration.{Domain, Application, Infrastructure, Contracts}`; UI `/migracion` (inventory, loans, scanning stations, QC, abstraction, batches); CLI `climesa-migrate` for file-based batches.
- **Uses only public contracts:** spec 001 commands (`RegisterPerson`, `AddIdentifier`, `OpenDuplicateCase`), spec 003 (`AttachBinary`, `CreateDraft` of type scanned or abstraction, `SignDocument`), spec 002 queries (upcoming encounters for prioritization). It never writes other schemas directly; this keeps every migrated record under the same rules as live data.
- **Matching:** Splink (Python, open source) run offline on exported candidate pairs is the reference implementation for probabilistic matching; the module stores its explained output (pair, weights per field, match probability) and opens cases above threshold. A .NET-native scorer is an alternative if Python is not allowed on the server (decision in T-005).
- **Scanning stations:** scanner software produces files into a watched inbox folder per station; the module ingests, reads image metadata (resolution, color) with ImageMagick/libvips, converts to PDF/A-2b, and links to the work order by a barcode separator sheet printed per expediente.
- **Alternatives:** document capture products (Kofax, ABBYY) vs simple inbox + metadata check: simple inbox first; evaluate commercial capture only if pilot throughput is the bottleneck.

## Contracts

| Operation | Permission |
|---|---|
| `RegisterArchiveUnit`, `UpdateArchiveUnit` | `migration.inventory` |
| `OpenLoan`, `CloseLoan` | `migration.loan` |
| `StartBatch`, `RecordBatchItem`, `CompleteBatch` | `migration.batch.run` |
| `ResolveRejection`, `ResolveMappingConflict` | `migration.batch.resolve` |
| `CreateWorkOrder`, work order transitions, `PassQc`/`FailQc` | `migration.scan.*` (QC user ≠ capture user) |
| `RecordAbstraction`, `ConfirmAbstractedItem` | `migration.abstract` (clinical role), `clinical.confirm_abstracted` |
| `SetWriteAuthority`, `SignCutoverChecklist` | `migration.cutover` (service owner, MFA) |

Events: `BatchCompleted`, `ExpedientePublished`, `AbstractedItemConfirmed`, `WriteAuthorityChanged`.

## Data and migrations

Schema `migration`: `archive_units`, `loans`, `batches`, `batch_items` (source ref, outcome, target ref, rule failed), `legacy_mappings` (source system, legacy value, person, certainty, decider), `mapping_conflicts`, `transform_versions` (code hash, mapping files hash), `work_orders`, `captures` (file hash, dpi, color, pages, operator, device), `qc_reviews`, `abstractions`, `abstracted_items` (status unconfirmed/confirmed/corrected/discarded), `write_authority` (object type, service, source, valid range; exclusion constraint so windows do not overlap), `cutover_checklists`, `rollback_rehearsals`.

## Security and privacy

- Scanning stations authenticate as station accounts plus operator login; files in inbox folders encrypted at rest on the server volume and removed after ingestion.
- Batches on real data only in the production environment or an approved environment with equal controls (Norma Art. 50: no real data in tests).
- Matching export for Splink contains only the fields needed, runs on the same server, outputs no names in logs.

## Failure and recovery

- Batch crash: items processed are recorded individually; restart resumes from last item; completion check (FR-004) guards integrity.
- Ingestion of a corrupt image: capture rejected with reason, work order stays `scanned` with failure note.
- Wrong barcode sheet (pages attached to wrong expediente): QC failure reason `wrong_patient`, publication blocked; if detected after publication, spec 003 entered-in-error and republish.

## Verification

| Check | Command or procedure | Expected evidence |
|---|---|---|
| Batch arithmetic | `dotnet test --filter BatchCompletionArithmetic` | Unbalanced batch cannot complete |
| Idempotent rerun | `--filter BatchRerunNoEffects` | Zero new rows on second run |
| Characters | `--filter SpanishCharactersRoundTrip` | ñ, accents, apostrophes identical |
| Mapping conflicts | `--filter LegacyNumberOnTwoPersons` | Conflict queue, no merge |
| DPI gate | `--filter CaptureBelowMinimumRejected` | 300 dpi handwriting rejected |
| QC segregation | `--filter QcUserDiffersFromCapture` | Same user rejected |
| Publication read-only | `--filter PublishedScanReadOnly` | Spec 003 rejects modification |
| Abstraction confirmation | `--filter AbstractedItemsNeedConfirmation` | Unconfirmed flag until decision |
| Write authority windows | `--filter WriteAuthorityNoOverlap` | Overlapping window rejected |
| Pilot | Manual: 100 synthetic or consented sample expedientes through the full chain | Throughput per stage, QC failure rate, storage per expediente recorded |

## Risks and decisions

- **Risk:** archive staff time is the real bottleneck. Mitigation: measure in pilot before committing scope; scan on demand first.
- **Risk:** storage underestimated for 600 dpi color. Mitigation: compute from pilot average MB per expediente × inventory count before buying disks.
- **Risk:** Splink requires Python on the server. Mitigation: decision in T-005.

## Plan review

- [ ] Architecture, contracts, data, migration, security, and failure handling are addressed.
- [ ] Verification is scoped, exact, and tied to requirements.
- [ ] No unresolved decision is silently treated as approved.
