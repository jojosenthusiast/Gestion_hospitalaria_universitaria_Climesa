# Integración, automatizaciones y conciliación
## Contratos de evento candidatos
| Evento | Datos mínimos | Consumidor y confirmación |
|---|---|---|
| Ingreso/traslado aceptado | ID paciente/emisor/episodio; ubicación/intervalo; receptor; ID evento/version. | Enfermería/farmacia/nutrición; aceptación clínica y cambios de órdenes. |
| Orden actualizada | Objeto/version/autor/vigencia; decisión y tareas afectadas. | Ejecutor acepta modificación; no retroceder por mensaje tardío. |
| Deterioro señalado | Hechos/tiempos/fuente/calidad; contexto/protocolo; responsable. | Cobertura entrega/acuse/valoración/acción y escalamiento. |
| Dieta modificada | Orden/version/identidad/ubicación; restricciones mínimas necesarias. | Cocina/proveedor retiene anterior y confirma nueva ruta. |
| Salida física | Episodio/ubicación/hora; alcance de tareas de apoyo. | Limpieza/activos inician trabajo; no disponibilidad automática. |
| Espacio/equipo liberado | Evidencia/autor/estado/version y bloqueos resueltos. | Coordinación capacidad confirma aptitud para reserva. |
| Residuo/textil recibido | Lote/contenedor/unidad/cantidad; receptor/tiempo/comprobante. | Custodia/contrato concilia discrepancias y etapas restantes. |

Autoridad se define por dominio: HIS identidad/episodios, farmacia administración/dispensación según v4, diagnóstico informes según v5, especializado crítico según equipos/protocolos, apoyo en sus registros sanitarios/técnicos y contabilidad en subledger. No implementar sincronización bidireccional sin resolver dueño de cada dato.

## Automatización autorizable y límite
| Automatización propuesta | Validación necesaria |
|---|---|
| Preparar lista de relevo | Profesional revisa vigencia/fuentes y receptor acepta. |
| Detectar tareas o resultados sin dueño | Cobertura confirma recepción/acción; alerta no cierra obligación. |
| Recordar ayuno/revisión nutricional | Profesional decide cambio; ninguna dieta reinicia sola. |
| Generar limpieza al salir | Responsable ejecuta y verifica; no liberar por temporizador. |
| Avisar mantenimiento/permiso próximos | Biomédica/asesoría verifica condiciones y autorización de uso. |
| Conciliar cantidades y cargos | Responsable resuelve diferencia; no borrar actos físicos. |
| Preparar censo/indicadores | Revisar fuente/denominador/datos faltantes antes de publicar. |

Reglas versionadas, contexto, destinatario real de turno, seguimiento, carga de avisos y efecto medido. No activar prescripción, adjudicación de culpa/IAAS o decisiones legales automáticas. IA que resume requiere revisión/firma humana y trazabilidad; no se eligió proveedor/modelo ni se habilitó automatización.

## Finanzas y contratos
Estancia: unidad/intervalo/prestación y contrato/pagador/version de tarifa; cortes y reglas de paquete aprobados. No cobrar traslado como nueva admisión por defecto. Orden nutricional no garantiza entrega cobrable; consumo/dieta/merma requieren base contractual.
Servicios de limpieza/ropa/residuos/mantenimiento: orden ejecutada, recepción conforme y factura según kg/ciclo/actividad/repuesto/tiempo pactados. Peso neto vs bruto/tara no intercambiables; moneda/impuestos y DTE se enlazan a v2–v3. Repetición por no conformidad no duplica pago automáticamente.
Activos: registro técnico y registro contable relacionados por ID, con costo/depreciación/baja según política contable vigente. Servicio prestado/consignado no necesariamente activo propio. Retiro técnico no borra factura ni baja contable automáticamente.
Centros de coste y analítica clínica pueden diferir; identificar bases de distribución, sin imputar toda merma o apoyo al paciente por defecto. Datos enviados a facturación mínimos y autorizados.

## Continuidad, privacidad y migración
Desconexión no detiene vigilancia clínica: modo manual autorizado, formularios/IDs únicos, responsables y reconciliación posterior. Garantizar turno con destinatarios operativos; alertas solo en red no reemplazan circuito de emergencia local.
Reintentos idempotentes, cola/outbox, reloj/fuente y orden causal; confirmación técnica distinta de recepción operativa. Pruebas con proveedor específico/versión y datos aprobados, sin declarar interfaces listas por elegir FHIR.
Restauración debe reconciliar salidas/traslados, dosis/ingesta, dispositivos, limpieza/liberación, residuos ya entregados y pagos posteriores al respaldo. Cama usada, paquete sanitario o trabajo físico no se revierten por restaurar BD.
Datos sensibles: cocina/limpieza/proveedores ven instrucciones necesarias; no diagnóstico completo. Representación, conservación/exportación y acceso extraordinario requieren políticas/asesoría, sin plazos universales inventados.
Migración conserva intervalos, fuente, componentes de escalas, planes/versiones y pendientes; PDFs históricos siguen documentos sin convertir OCR en actos confirmados. Corte con lista por responsable y conciliación de cantidades/documentos/accesos.
