# Estado actual: análisis ejecutado en esta sesión
## Evidencia y límite
ZIP clm.zip: SHA-256 3148aa3e0d4ed3598815d6e16cb6e22990db2e4a73fa88f46317725a759ad6f8.
58 archivos C#, 11 controladores, un proyecto Web. El inventario code_inventory.json conserva hashes de los archivos C#.
Se leyeron AGENTS.md, constitution.md, servicios de finanzas/admisión, entidades financieras, configuración EF, políticas y fragmentos del circuito clínico/inventario.
Las reglas del repositorio mantienen documentación técnica en inglés; este dossier externo en español no altera el repositorio.

Se ejecutaron rg sobre índices, concurrencia, filtros, autorizaciones y enlaces de prescripción; búsqueda de proyectos y herramientas; sha256sum y generación de inventario. No hay codex ni dotnet en PATH. No se lanzó un agente CLI, build, restauración NuGet, conexión SQL Server ni migración. No se accedió a un sistema productivo.

## Hallazgos reconfirmados
| Evidencia | Comportamiento observado | Consecuencia por evaluar |
|---|---|---|
| FinanceService.cs, CreateInvoiceAsync | Una línea manual; TaxAmount viene del formulario; número basado en timestamp | No equivale a motor tarifario ni DTE fiscal; requiere catálogo, pagadores y origen de cargo |
| FinanceService.cs, RegisterPaymentAsync | Transacción reúne pago/caja/estado; saldo calculado sobre pagos leídos | Concurrencia e idempotencia pendientes de reproducción; transacción por sí sola no prueba exclusión |
| FinanceService.cs, RegisterPaymentAsync | No crea AccountingEntry en este método | Cobro y mayor no están integrados aquí; investigar mecanismos externos antes de declarar ausencia total |
| FinanceService.cs, CreateExpenseAsync | Fija cuentas 6100/1100 y reconoce gasto al pagarlo | No representa recepción, factura de proveedor, devengo, vencimiento y pago separado |
| FinanceService.cs, GetCashMovementsAsync | Take(300) antes de sumar en memoria | Totales corresponden a las filas recuperadas; no garantizan total del filtro |
| AdmissionService.cs, CreateAsync | Valida ocupación y cama antes de abrir transacción | Carrera posible; no se demostró doble ingreso en ejecución |
| AdmissionService.cs, DischargeAsync | Cama pasa directamente a Available | No hay preparación/limpieza en ese método |
| ApplicationDbContext.cs | RowVersion en ProductBatch; índices de cita sin exclusividad; sin índice filtrado de ocupación visto | Stock tiene un control útil; camas/citas requieren otro diseño y prueba |
| ClinicalRecordService.cs | DoctorId seleccionado se valida activo; userId registra autor de creación | Falta demostrar correspondencia o delegación entre usuario y profesional declarado |
| HospitalAuthorizationOptions.cs | ClinicalWork acepta Administrator/MedicalStaff; enfermería tiene otra política | Rol enfermería no prueba un módulo operativo ni acceso al circuito clínico |
| global.json y csproj | SDK 10.0.400; TargetFramework net8.0 | SDK y runtime objetivo son decisiones distintas |

## Consultas reproducibles de código
Desde la raíz extraída del proyecto:
```bash
rg --files -g '*.csproj' -g '*Tests*' -g '*test*'
rg -n 'HasIndex|IsUnique|IsRowVersion|HasQueryFilter' src/AldaraHospital.Web/Data/ApplicationDbContext.cs
rg -n 'BeginTransactionAsync|Take\(300\)|AccountCode|AccountingEntries|TaxAmount' src/AldaraHospital.Web/Services/FinanceService.cs
rg -n 'alreadyAdmitted|BeginTransactionAsync|BedAvailable' src/AldaraHospital.Web/Services/AdmissionService.cs
rg -n 'DoctorId|IdentityUserId|userId' src/AldaraHospital.Web/Services/ClinicalRecordService.cs
rg -n 'DispenseAsync|ChangeStockAsync|ExpirationDate|Prescription' src/AldaraHospital.Web/Services/InventoryService.cs
```
Estas consultas localizan evidencia; no sustituyen análisis semántico ni pruebas.

## Verificación futura sobre base real de prueba
El SQL adjunto ofrece diagnóstico agregado, sin nombres/documentos personales: doble ocupación, sobrepagos, stock negativo, asientos descuadrados y conjunto de caja. Primero revisar nombre/esquema/estado de migraciones y permisos. Usar una copia consistente; no NOLOCK: una lectura sucia puede fabricar hallazgos.

Pruebas requeridas después de disponer del runtime:
- Dos sesiones intentando la misma cama; comprobar una sola ocupación durable.
- Dos cobros sobre el mismo saldo; total aplicado no supera deuda.
- Retransmisión con misma clave de solicitud; un solo efecto económico.
- Dos dispensaciones contra el mismo RowVersion; conflicto resuelto sin stock negativo.
- Reserva simultánea de médico/sala; impedir solapamiento según política.
- Denegación contextual: otro servicio/paciente; autoría médica; usuario deshabilitado con sesión activa.
No se declara ninguna de estas pruebas aprobada.

