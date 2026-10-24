# Backlog candidato y preparación de migración
No es un plan de desarrollo aprobado ni tiene estimaciones ficticias. Prioridades dependen de datos y responsables CLIMESA.

| ID | Trabajo | Base y dependencia | Aceptación operativa |
|---|---|---|---|
| R201 | Consolidar expediente y datos personales | V2-02/03; I00 | Artículo/versión/ámbito por regla; contradicciones resueltas y responsable |
| R202 | Inventario institucional de sistemas/equipos/servicios | I00 | Dueño, versión, interfaz, exportación, soporte y licencia confirmados |
| R203 | Identidad provisional y episodio | A13; I01 | Urgencia sin documento, recién nacido y fusión revisada sin perder referencias |
| R204 | Corrección/exportación de expediente | V2-02; R201/203 | Original conservado, versión/autor/instante/detalle, representación verificada |
| R205 | Cargo con origen único | A09; E01 | Reenvío no duplica; tarifa histórica se conserva; excepción visible |
| R206 | Tarifa/cobertura/pagadores | V2-07; E01/04 | Una prestación distribuida explica responsabilidad y conserva contrato |
| R207 | Anticipos y aplicaciones | E02 | Recibido=aplicado+devuelto+saldo; doble aplicación imposible |
| R208 | Mayor y reglas de devengo | A10/11; E10 | Asiento balanceado/origen único/periodo abierto; reverso sin borrar |
| R209 | Cobro concurrente/idempotente | A08; E03 | Dos pagos simultáneos no exceden deuda; reenvío tiene efecto único |
| R210 | Integración DTE | V2-06; R201/205/208 | Esquema vigente/pruebas MH; aceptación, rechazo, timeout y contingencia distinguidos |
| R211 | Reclamación/glosa/remesa | E04 | Remesa explicada por líneas; diferencia revisada sin deuda arbitraria a paciente |
| R212 | Caja/bancos | A12; E03/09 | Total completo, arqueo/revisión, depósitos/comisiones/contracargos reconciliados |
| R213 | Cotejo compras/CxP | E05 | Parcial/devolución/factura duplicada/excepción y pago aprobados |
| R214 | Stock/calidad/valoración | A05; E06 | Lote vencido bloqueado, conversión consistente, movimientos explican saldo |
| R215 | Honorarios/nómina | E07/08 | Contrato vigente/hito probado; no duplicación; conciliación y permisos |
| R216 | eMAR y órdenes | A01/04; I04 | Orden-dispensación-administración trazables con omisiones/retornos |
| R217 | Camas/traslados/limpieza | A06/07; I04 | Exclusión probada; historia y entrega; no habilitar antes de preparación |
| R218 | Resultados críticos/corregidos | V2-12; I05 | Versión previa conservada, acuse/escalamiento y vínculo orden/muestra |
| R219 | Permisos contextuales/credenciales | A03/15; I01/04 | Autor real o delegación explícita; baja revoca acceso; técnico no firma clínica |
| R220 | Integración durable/reconciliación | 05 | Caída/reenvío/orden inválido dejan cola con dueño; montos y estados reconciliados |
| R221 | Cierre contable | E10 | Submayores reconciliados, firmas/bloqueo y reapertura controlada |
| R222 | Migración verificable/continuidad | I09 | Conteos/saldos/referencias/documentos/pendientes; recuperación y aceptación firmadas |

## Migración desde legado y papel
1. Inventariar fuentes: aplicación, BD, archivos, carpetas, libros, expedientes, catálogos y saldos. Definir propietario y permiso de extracción.
2. Mapear dato original/destino/unidad/código; preservar identificador y fuente. Registrar desconocido en vez de rellenar con un valor falso.
3. Desidentificar los conjuntos de investigación; el dataset de migración real permanece en entorno controlado.
4. Separar documentos históricos de datos activos: no extraer diagnósticos/medicación a datos operativos con OCR sin revisión competente.
5. Priorización candidata: identidades/catálogos, pacientes activos, episodios abiertos, órdenes/medicación, stock válido, saldos/anticipos, documentos accesibles; histórico por oleadas.
6. Conciliar registros, importes, cantidades, unidades, vínculos y archivos. Totales de control por fuente/sede/periodo; discrepancias en cola revisable.
7. Para papel: escaneo legible, orden/identidad, procedencia, hash, revisión y reglas de custodia; no destruir original sin base aprobada.
8. Si papel y digital discrepan: procedimiento de resolución, no elegir automáticamente la última fecha. Referencia V2-02.
9. Cutover con ventana/punto de corte acordados, captura de deltas, responsables y rollback practicable. Nunca dos sistemas editables sin reglas de autoridad.
10. Validar restauración y acceso a documentos; continuidad manual con reconciliación posterior; comunicaciones y entrenamiento por turno.
11. Registrar aceptación por dueño de datos y proceso. Conciliar saldos iniciales con mayor/submayores/stock/anticipos; historial de procedencia.

## Piloto operacional
Elegir servicio acotado pero recorrido completo; no usar una pantalla demostrativa como evidencia. La base de pruebas puede tener datos sintéticos para fallos técnicos; esos datos no sustituyen observación y aprobación de procesos reales.
Antes de producción: seguridad/permisos, contratos, reglas legales, recuperación, soporte, formación y criterios de corte medidos.
RPO/RTO, disponibilidad y objetivos de respuesta se acuerdan con análisis de impacto y se prueban; no asignar números por intuición.

