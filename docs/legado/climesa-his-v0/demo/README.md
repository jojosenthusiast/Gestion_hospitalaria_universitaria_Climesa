# Demostración funcional (primer corte)

**Fecha:** 2026-10-13. **Specs implementadas en parte:** 000 (plataforma), 001 (identidad), 002 (episodio, emergencia, camas, alta), 004 (capa 1: índice del archivo).

Esto no es un prototipo de pantallas: las reglas corren contra PostgreSQL y las principales tienen prueba (tabla de trazabilidad abajo). Tampoco es el sistema completo: abajo está lo que falta, sin adornos.

## Cómo correrla

Requisitos: .NET SDK 10, PostgreSQL 16 o superior.

```bash
psql -U postgres -f ops/db-setup.sql                 # roles, base y extensiones (una vez)
dotnet restore Climesa.slnx
dotnet run --project src/Climesa.Web                 # aplica migraciones y datos de demostración en Development
```

Abrir `http://localhost:5007`. Usuarios y contraseña de demostración en la pantalla de ingreso.

Pruebas:

```bash
psql -U postgres -c "create database climesa_test owner climesa_owner"
psql -U postgres -d climesa_test -c "create extension btree_gist; create extension pg_trgm; create extension pgcrypto;"
dotnet run --project tests/Climesa.Tests             # 37 pruebas contra PostgreSQL real
python3 tests/e2e/walkthrough.py capturas            # recorrido por la interfaz con Playwright (base recién reiniciada)
```

## Recorrido sugerido (10 minutos)

1. `archivo1`: Migración → cargar `docs/demo/indice_archivo_muestra.csv`. El lote cuadra (11 leídas = 6 creadas + 0 encontradas + 3 rechazadas + 2 pendientes), conserva ñ y tildes, abre un caso de posible duplicado (Hernández Vásquez / Hernandes Basquez) y manda a revisión un número de expediente en papel repetido con otro nombre. Cargar el mismo archivo otra vez no hace nada.
2. `admision1`: Pacientes → buscar "hernandes basquez jose". Aparece "Hernández Vásquez" con el motivo. Intentar registrar sin buscar falla. Registrar un paciente nuevo; intentar otro con el mismo DUI falla con el número del expediente que ya lo tiene.
3. `triage1`: Emergencia → registrar llegada de un desconocido (identidad provisional NN-2026-…), hacer triaje.
4. `medico1`: primer contacto, ingresar a una cama, firmar alta. Si deja un pendiente sin responsable, no firma. Si elige alta voluntaria sin formulario ni testigos, no firma.
5. `medico2` (inscripción vencida): intentar firmar un alta. Se rechaza en el momento del acto.
6. `triage1`: salida física. La cama queda "pendiente de limpieza".
7. `limpieza1` registra la limpieza; `jefe1` la firma. Si falta un punto de la lista, no libera la cama; si la firma quien limpió, tampoco.
8. `auditor1`: Auditoría → ver accesos (incluidos los denegados) y verificar la cadena.

## Verificación ejecutada

| Verificación | Comando | Resultado observado (2026-10-13) |
|---|---|---|
| Compilación con advertencias como errores | `dotnet build Climesa.slnx` | Correcta, 0 advertencias |
| Pruebas de requisitos | `dotnet run --project tests/Climesa.Tests` | 37/37 aprobadas en 2.4 s |
| Recorrido por la interfaz | `python3 tests/e2e/walkthrough.py` | 29/29 comprobaciones; capturas en `docs/demo/capturas/` |

## Trazabilidad requisito → prueba

| Requisito | Prueba |
|---|---|
| 000 FR-011, FR-012 idempotencia | `PlatformTests.IdempotencySameKeySameResult`, `IdempotencyKeyReuseWithDifferentContentFails` |
| 000 FR-014 a FR-016 outbox e inbox | `PlatformTests.OutboxDeliversExactlyOncePerConsumer` (incluye reentrega tras caída) |
| 000 FR-018 denegados auditados | `PlatformTests.DeniedAttemptIsAudited` |
| 000 FR-019 auditoría solo inserción | `PlatformTests.ApplicationRoleCannotRewriteAudit` |
| 000 FR-020 cadena de hash | `PlatformTests.AuditChainDetectsTampering` (altera un registro como superusuario) |
| 000 FR-023 políticas por fecha | `PlatformTests.PolicyByDateAndMissing` |
| 000 FR-025 hora local | `DomainTests.LocalDateInElSalvador` |
| 000 límites de módulo | `ArchitectureTests.*` |
| 001 FR-001 buscar antes de crear | `IdentityTests.RegistrationRequiresSearch` |
| 001 FR-002, FR-003 motivos y fonética | `IdentityTests.SearchExplainsWhyCandidatesMatch`, `DomainTests.SpanishPhoneticKeys` |
| 001 FR-009 DUI | `DomainTests.DuiCheckDigit` |
| 001 FR-010 concurrencia de DUI | `IdentityTests.ConcurrentRegistrationOfSameDuiYieldsOneIdentity` |
| 001 FR-014 a FR-016 provisional | `IdentityTests.ProvisionalIdentityHasNoInventedData`, `DomainTests.EstimatedBirthIsNeverExact` |
| 001 FR-021, FR-040 gemelos | `IdentityTests.TwinsGetOwnIdentitiesLinkedToMother` |
| 001 FR-023, FR-025 historial y concurrencia | `IdentityTests.HistoryIsAppendOnlyAndStaleUpdatesFail` |
| 001 FR-027 nunca fusionar solo | `IdentityTests.SimilarRegistrationOpensCaseAndNeverMerges` |
| 001 FR-038 auditoría sin nombres | `IdentityTests.SearchAuditStoresHashNotNames` |
| 001 FR-043 dígito del expediente | `DomainTests.MrnCheckCharacter` |
| 002 FR-001, FR-002 emergencia sin barreras | `CareTests.EmergencyArrivalNeedsNothingEconomic` |
| 002 FR-004, FR-005 triaje | `CareTests.ReceptionCannotTriage`, `BoardFlagsOverdueReassessment` |
| 002 FR-006 reintento | `CareTests.RetriedArrivalReturnsSameEncounter` |
| 002 FR-009 a FR-012 alta | `CareTests.DischargeExitAndCleaningLifecycle`, `DischargeTypesRequireTheirEvidence`, `RevocationKeepsOriginalDischargeInHistory` |
| 002 FR-017 cama exclusiva | `CareTests.DatabaseRejectsOverlappingOccupancy` |
| 002 FR-018, FR-019 limpieza | `CareTests.DischargeExitAndCleaningLifecycle` |
| 002 FR-027 pendientes con dueño | `CareTests.PendingItemsNeedOwnerBeforeDischarge` |
| R17 inscripción vigente en el acto | `CareTests.ExpiredLicenseCannotSignDischarge` |
| 004 FR-003 a FR-009 lote | `MigrationTests.*` |

## Lo que no está (y está especificado)

- Fusión supervisada, reversión y manifiesto (001 FR-026 a FR-034): solo se abren casos.
- Traslados internos, reservas, ausencias, traslados externos (002 FR-020 a FR-025).
- Documentos clínicos y firma (003), retención y solicitudes (005), cuenta y cargos (006), DTE (007).
- Escaneo, control de calidad y abstracción clínica (004 FR-012 a FR-020).
- Doble factor, bloqueo de sesión por estación, estación de contingencia de solo lectura.
- Copias de respaldo y prueba de restauración (000 FR-027).

## Desviaciones de este entorno

- NuGet no era accesible: Npgsql 10.0.3 y Scriban se compilaron desde su código fuente; el proyecto usa nuget.org normalmente. Ver ADR-0002 sobre acceso a datos sin EF Core.
- Sin xUnit: las pruebas usan un ejecutor mínimo propio (`tests/Climesa.Tests/Harness.cs`) con la misma disciplina (una prueba por requisito, código de salida distinto de cero si falla).
- PostgreSQL 16 en lugar de 17+.
- El protocolo de triaje, las camas y los usuarios son datos de demostración, no hechos de CLIMESA (PENDING-INS01, INS04).
