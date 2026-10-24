# R14. Cuenta del paciente, cargos y costos

**Versión:** 1 (2026-10-13). **Alimenta:** spec 006 (cuenta y cargos); prepara 007 (DTE), 008 (contabilidad) y 009 (reclamos).

## 1. Conclusión

V3-04 y V4-05 son la parte más madura de tu investigación: cargo con origen único, snapshot de tarifa, precedencia de reglas, distribución por pagador, tres conciliaciones distintas, decimal y no float, y eventos entre dominios con hito de cargo definido por política. Se conservan casi completos. Lo que faltaba era la ley salvadoreña que fija varias de esas "políticas pendientes" y la evidencia de cuánto dinero se pierde en la práctica:

- **Cuándo deja de correr la estancia:** a la firma del alta (LDDPPSS Art. 29).
- **Qué debe saber el paciente antes y después:** costo estimado (Art. 13) y detalle de costos al alta (Art. 14); justificación cuando los costos cambian (Art. 29).
- **Qué no se puede hacer por deuda:** negar o deficientar atención (Art. 42 b, e).
- **Impuestos:** IVA 13% sobre servicios de un hospital privado con fines de lucro y sobre medicamentos; sin exención general (Ley IVA Art. 45-46, 54).
- **Precio tope en medicamentos:** precio máximo de venta al público regulado por la SRS.
- **Fuga de ingresos:** hasta 1% de los cargos netos se pierde por fallas de captura (HFMA), y 70-75% de las alertas de cargo faltante pueden ser falsos positivos si las reglas no se calibran.

## 2. Qué se conserva de V1-V9

| Origen | Contenido | Veredicto |
|---|---|---|
| V3-04 motor tarifario | Cargo con servicio, cantidad, unidad, prestación, atención, profesional, entidad, pagador, contrato y snapshot; precedencia convenio → paquete → tarifa general → revisión; empate = excepción | Se conserva |
| V3-04 comandos | CaptureCharge, ValidateCharge, AllocateLiability, PrepareInvoice, RecordReceipt, ApplyReceipt, ReverseApplication, Refund, PostJournal, ClosePeriod, ReopenPeriod | Se conserva como contrato de 006/007/008 |
| V3-04 estados | Cargo, pago, documento fiscal, reclamación, asiento con estados propios | Se conserva |
| V3-04 invariantes | Recibo = aplicado + devuelto + no aplicado; deuda = reconocimiento ± ajustes − aplicaciones; decimal; no transferir glosa al paciente | Se conserva |
| V3-04 concurrencia | Bloqueo ordenado recibo/deuda; unicidad de origen de cargo y de asiento; no transacción abierta durante firma remota | Se conserva |
| V3-04 tres conciliaciones | Aplicación, bancaria, sistema/contable | Se conserva |
| V4-05 eventos | OrdenMedicamentoFirmada no es prestación; dispensación o administración como hito de cargo según política; devolución, desperdicio, consignación, medicamento propio | Se conserva |
| V3 CT01 | Cuenta con pagadores y responsables separados; autorización ≠ cobro garantizado | Se conserva |
| V3-04 "No fijar tasa de IVA... sin artículo" | Cautela correcta | **Se cierra:** Ley IVA Art. 54 (13%) y Art. 45-46 leídos |

## 3. Qué se descarta o corrige

| Afirmación | Corrección |
|---|---|
| V3-04: "La estrategia SQL Server se verifica con el aislamiento elegido" | Stack es PostgreSQL (ADR-0001); misma exigencia con `SERIALIZABLE` o bloqueos explícitos `SELECT ... FOR UPDATE` en orden determinista |
| V7 HOS05: corte de estancia "a documentar" | Fijado por LDDPPSS Art. 29 para el cobro al paciente |
| Aldara: factura de una línea con IVA tecleado | Descartado: el IVA se calcula por línea según clasificación fiscal aprobada |

## 4. Marco legal verificado

| Norma | Regla | Regla del sistema |
|---|---|---|
| LDDPPSS Art. 13 | En atención privada, informar costos estimados | Presupuesto estimado por episodio programado, versionado, entregado y firmado de recibido |
| LDDPPSS Art. 29 | El paciente paga lo convenido; puede pedir justificación cuando los costos se modifican; estancia desde ingreso hasta firma del alta | Cargos de estancia hasta `alta_medica_firmada`; cambios de tarifa o presupuesto generan justificación visible |
| LDDPPSS Art. 14 | Informe de alta con detalle de costos y facturación en servicios privados | Estado de cuenta detallado como parte del egreso |
| LDDPPSS Art. 11, 42 b, 42 e | No discriminar por condición económica; negar o deficientar atención por ello es grave | Saldo nunca bloquea un acto asistencial, alta o salida |
| Ley IVA Art. 46 a | Exentos solo servicios de salud de instituciones públicas o de utilidad pública calificadas por la DGII | Hospital privado con lucro: servicios gravados. Clasificación por línea aprobada por contador |
| Ley IVA Art. 45 j | Exentos solo antirretrovirales adquiridos por MINSAL, ISSS y prestadores públicos | Medicamentos gravados con 13% |
| Ley IVA Art. 54 | Tasa 13% | Tasa como política versionada |
| Ley IVA Art. 66 | Proporcionalidad del crédito fiscal si hay operaciones exentas y gravadas | Solo relevante si CLIMESA tuviera operaciones exentas |
| CT Art. 156 | Retención 10% de renta a servicios sin relación laboral | Liquidación de honorarios médicos externos con retención |
| Ley SRS Art. 4 (precios), Ley de Medicamentos Art. 59 | Precio máximo de venta al público fijado y verificado | Cargo de medicamento ≤ precio máximo vigente del producto; excepción bloqueada para revisión |

Fuentes: [LDDPPSS](https://local.cssp.gob.sv/wp-content/uploads/2019/06/LDDPPSS.pdf), [Ley IVA](https://transparencia.mh.gob.sv/downloads/pdf/DC5828.pdf), [Ley SRS](https://www.srs.gob.sv/wp-content/uploads/2025/06/LEY-DE-SUPERINTENDENCIA-DE-REGULACION-SANITARIA-ACTUALIZADA-JUNIO-2025.pdf), [resolución DNM 2013, Art. 59](https://transparencia.gob.sv/institutions/dnm/documents/117835/download) (todas leídas en lo citado).

Pendiente: si el precio máximo aplica al medicamento administrado dentro de un servicio hospitalario facturado como paquete. La Defensoría inspeccionó botiquines de hospitales privados por precios máximos ([informe 2016-2017](https://www.defensoria.gob.sv/wp-content/uploads/2017/10/informe.pdf)), lo que indica que sí aplica al menos a la venta; confirmar con asesoría.

## 5. Referencias técnicas

| Fuente | Aporte | Uso |
|---|---|---|
| [HFMA, charge integrity (2017, act. 2025)](https://www.hfma.org/revenue-cycle/charge-capture/55358/) | Hasta 1% de cargos netos perdidos por fallas de captura; caso Novant: más de 1,200 errores de cargo faltante por semana, 70-75% falsos positivos, $7.5 M recuperados en 15 meses tras calibrar reglas | Cola de "prestación sin cargo esperado" con reglas calibradas y desactivables; medir falsos positivos desde el inicio |
| HL7 FHIR ChargeItemDefinition, ChargeItem, Account (V3 S309) | Reglas de precio y cuentas | Semántica, no esquema |
| Kaplan y Porter, HBR 2011 (TDABC) | Costo por minuto de recurso × tiempo de uso | Costeo separado del precio; usa tiempos que el sistema ya registra |
| ERPNext Payment Reconciliation (V3 S310) | Pago, aplicación y banco separados | Heredada |
| [MAPFRE El Salvador, preautorización](https://www.mapfre.com.sv/media/formulariounicodepreautorizacion.pdf) y [guía de reclamos](https://mapfre.com.sv/media/Guia-de-reclamos-gastos-medicos.pdf) | Formularios de preautorización hospitalaria y quirúrgica; reembolso requiere formulario firmado por el médico, facturas y recetas | Autorización por servicio congelada al prestar (detalle en R16) |

## 6. Modelo resultante para la spec 006

| Objeto | Regla |
|---|---|
| Presupuesto (estimate) | Versionado por episodio programado; entrega firmada; diferencia con lo facturado explicable por línea (Art. 13, 29) |
| Cuenta | Una por episodio por defecto; agrupación distinta solo por contrato; pagadores con orden de responsabilidad |
| Catálogo de prestaciones | Código, descripción, unidad, componentes incluidos, hito de cargo, clasificación fiscal, vigencia |
| Tarifa | Versionada por lista de precios y convenio; snapshot en el cargo |
| Cargo | Origen único (prestación, dispensación, administración, día-cama), cantidad, unidad, precio, impuesto por línea, estado; ajuste ligado, nunca edición |
| Día-cama | Generado por regla desde el segmento de ubicación hasta `alta_medica_firmada` |
| Depósito/anticipo | Recibo aplicado a la cuenta al cierre; saldo devuelto con aprobación separada |
| Distribución | Por pagador: cobertura, deducible, coaseguro, no cubierto; glosa no pasa al paciente sin decisión |
| Excepciones | Prestación sin cargo, cargo sin origen, tarifa ausente o en conflicto, precio de medicamento sobre el máximo |

## 7. Requisitos derivados

1. Hito de cargo configurable por tipo de prestación (orden, ejecución, dispensación, administración), con versión y aprobador.
2. Día-cama calculado desde segmentos de ubicación hasta la firma del alta.
3. Presupuesto estimado versionado y comparación con cargos reales.
4. Impuesto calculado por línea con clasificación aprobada; tasa como política versionada.
5. Validación de precio máximo de medicamentos vigente al momento del cargo.
6. Ningún cálculo económico produce un bloqueo asistencial; deuda se gestiona en cobranza, no en admisión ni alta.
7. Colas de conciliación con dueño y motivo, y medición de falsos positivos de reglas de cargo faltante.
8. Estado de cuenta detallado para el informe de alta.
9. Costeo por actividad separado del precio, alimentado por tiempos de quirófano, estancia y consulta.

## 8. Pendientes para CLIMESA (INS07, INS08, INS10)

1. Tarifario actual, paquetes (parto, cesárea, cirugías) y cómo se actualizan.
2. Convenios con aseguradoras y empresas: precios pactados, autorizaciones, plazos de pago.
3. Si piden depósito al ingreso y cuánto.
4. Si los honorarios médicos se facturan por el hospital o directo por el médico.
5. Naturaleza fiscal de CLIMESA (confirmar que no es de utilidad pública calificada) y quién emite DTE hoy.
6. Cómo descuentan medicamentos del botiquín y con qué precio los cargan.

## 9. Fuentes nuevas

[HFMA charge capture](https://www.hfma.org/revenue-cycle/charge-capture/55358/) (leída); [Ley IVA](https://transparencia.mh.gob.sv/downloads/pdf/DC5828.pdf) (leída Art. 45, 46, 54, 66); [LDDPPSS](https://local.cssp.gob.sv/wp-content/uploads/2019/06/LDDPPSS.pdf) (leída Art. 11, 13, 14, 29, 42); [Ley SRS](https://www.srs.gob.sv/wp-content/uploads/2025/06/LEY-DE-SUPERINTENDENCIA-DE-REGULACION-SANITARIA-ACTUALIZADA-JUNIO-2025.pdf) (leída); [Defensoría 2016-2017](https://www.defensoria.gob.sv/wp-content/uploads/2017/10/informe.pdf) (leída; cifras internas inconsistentes, no citar porcentajes).
