# Auditoría estática de la base adjunta

## Identificación y evidencia
Archivo: `clm.zip`. SHA-256: `3148aa3e0d4ed3598815d6e16cb6e22990db2e4a73fa88f46317725a759ad6f8`.
Raíz: `Gestion Hospitalaria/`. Solución: `AldaraHospital.sln`. Se contaron 58 archivos C# y 11 controladores MVC; no se encontraron proyectos de pruebas. El ZIP contiene contexto de desarrollo y documentación histórica: los checks antiguos no se trataron como verificaciones actuales.

La aplicación apunta a `net8.0`, usa MVC/Razor, EF Core SQL Server, ASP.NET Core Identity, Bootstrap y Serilog. El README describe LocalDB para desarrollo y declara explícitamente un prototipo académico. Las reglas del repositorio requieren documentación técnica en inglés y no aplicar migraciones sin autorización; este dossier independiente en español no cambia esas reglas ni el repositorio.

## Elementos que conviene preservar o evaluar para reutilización
- Separación entre controladores, servicios, view models y persistencia.
- Identity y políticas explícitas por rol, antiforgery en acciones examinadas.
- Relaciones con borrado restrictivo y campos de creación/modificación en agregados.
- Stock por lote con `RowVersion`; captura de `DbUpdateConcurrencyException`.
- Transacción que agrupa pago, movimiento de caja y estado de factura.
- Transacción que agrupa gasto, movimiento y asiento contable.
- Consulta con cita asociada y comprobación de paciente/médico coincidentes.
- Validación de solapamiento de citas en el servicio.

Son mecanismos presentes, no pruebas de que los circuitos completos sean seguros.

## Hallazgos y brechas
| ID | Estado y evidencia local | Implicación | Acción candidata |
|---|---|---|---|
| A01 | Observado: `HospitalAuthorizationOptions.cs` excluye Nursing de ClinicalWork; no hay controlador de enfermería | El rol existe pero no resuelve su trabajo clínico | Especificar tareas, notas, observaciones y administración con permisos propios |
| A02 | Observado: `ClinicalEntities.cs` liga un VitalSign a Consultation y usa alergias como texto | No representa seguimiento de signos durante hospitalización ni alergias estructuradas | Observaciones repetibles, unidades, autor, momento, fuente y estado de verificación |
| A03 | Observado: `ClinicalRecordService.CreateConsultationAsync` acepta DoctorId elegido; valida que sea médico activo | No se observa aquí correspondencia entre autor autenticado y médico declarado | Autoría real; delegación autorizada y supervisión explícitas |
| A04 | Observado: `InventoryService.DispenseAsync` resta lote usando referencia libre; no enlaza detalle de prescripción | Orden, dispensación y administración no forman un circuito verificable | Enlaces estructurados y estados separados |
| A05 | Observado: `ChangeStockAsync` no comprueba caducidad o cuarentena del lote | El stock disponible numérico puede no ser utilizable | Bloquear lotes vencidos/retirados y definir excepciones aprobadas |
| A06 | Observado: `AdmissionService.CreateAsync` lee cama y consulta ingreso activo antes de la transacción | Riesgo inferido de doble ocupación o ingreso bajo simultaneidad | Restricciones y exclusión transaccional; reproducir con SQL Server real |
| A07 | Observado: DischargeAsync cambia cama directamente a Available | No se representa limpieza, aislamiento o mantenimiento entre pacientes | Estados de cama y tarea de preparación separada |
| A08 | Observado: RegisterPaymentAsync calcula saldo dentro de transacción, sin token visible en Invoice | Riesgo inferido de sobrepago si dos transacciones leen el mismo saldo | Exclusión/concurrencia, idempotencia y prueba de doble pago |
| A09 | Observado: CreateInvoiceAsync crea una línea manual; no enlaza episodio u orden | Falta trazabilidad del cargo clínico y tarifas/contratos | Cuenta por episodio, catálogo de servicios, precio versionado y fuente |
| A10 | Observado: RegisterPaymentAsync no crea asiento contable; CreateExpenseAsync sí crea dos líneas | La caja y el mayor no constituyen un ciclo contable integrado | Eventos económicos y reglas de contabilización conciliables |
| A11 | Observado: CreateExpenseAsync fija cuentas 6100 y 1100 en código | No hay plan de cuentas parametrizado, devengo o cierres en este flujo | Integrar ERP o definir submayor y contabilidad formal |
| A12 | Observado: GetCashMovementsAsync toma 300 filas y calcula totales sobre esa lista | Totales parciales pueden presentarse como totales del filtro | Agregar en SQL sobre todo el conjunto y paginar solo el detalle |
| A13 | Observado: Patient exige DocumentNumber y DateOfBirth; índice único solo sobre DocumentNumber | No modela bien desconocidos, recién nacidos, identificación provisional o varios emisores | Índice maestro de pacientes e identificadores tipados |
| A14 | Observado: AppointmentService consulta solapamiento y luego guarda; índice médico/fecha no es exclusivo | Riesgo inferido de doble reserva concurrente; no hay agenda de sala/equipo | Calendarios de recursos y garantía transaccional |
| A15 | Observado: Program.cs utiliza roles generales; Administrator accede a políticas clínicas y financieras | No hay segmentación contextual visible por sede, servicio o relación asistencial | Separar administración técnica, atribuciones clínicas y privilegios temporales |
| A16 | Observado: hay Serilog y AuditableEntity; no se encontró registro de lectura/exportación de expediente | Logs técnicos y campos auditables no equivalen a auditoría longitudinal | Auditoría dedicada, acceso restringido, retención y detección de alteraciones |
| A17 | Observado: no se encontraron módulos LIS/RIS, urgencias/triage, cirugía, banco de sangre, conciliación o reclamaciones | Gran distancia entre módulos CRUD y hospital completo | Definir dominios y decidir integración versus construcción |
| A18 | Observado: usa DateTime.Now/Today y UtcNow en distintos flujos | Riesgo de límites de fecha y reportes distintos según servidor | Convención UTC + zona del establecimiento + fecha clínica explícita |
| A19 | Observado: consultas de listas con límites 100/200/300 y otras sin paginación | Posible pérdida de visibilidad o consultas costosas a escala | Paginación, filtros, agregaciones y pruebas con volumen representativo |

## Lo que no está probado
No se reprodujeron carreras de camas/pagos/citas; no se afirma que hayan ocurrido. No se verificaron infraestructura, base real, cuentas activas, backups, certificados, conectividad, configuración externa ni controles institucionales. No se hizo pentest ni auditoría de todas las dependencias.

## Recomendación provisional
Mantener la base como referencia y banco de escenarios. Primero establecer pruebas sobre comportamiento actual y mapear el modelo hacia episodios, órdenes, tareas, cargos y auditoría. Reescribir solo lo que falle la comparación de capacidades o complique sistemáticamente el modelo. La falta de pruebas no es razón suficiente para elegir otro framework.

Microsoft sitúa el fin de soporte de .NET 8 en 2026-11-10 [S50]. Planificar una actualización a LTS vigente, comprobar paquetes y ejecutar regresión; seleccionar un SDK .NET 10 en global.json no cambia por sí solo el runtime objetivo `net8.0`.
