# Circuitos transversales que deben quedar cerrados
La continuidad depende de responsabilidades y hechos físicos, además de estados informáticos. Propuesta para revisión institucional, no matrizRACI aprobada.

| Circuito | Cadena de registros/evidencia | Punto que impide declarar cierre |
|---|---|---|
| Identidad y diagnóstico | Identificador/emisor → episodio/orden → muestra/estudio → informe/version → revisión/acción. | Duplicado, receptor no confirmado o resultado postalta sin dueño. |
| Medicamento | Orden → validación → preparación/dispensación → administración real → devolución/descarte → consumo/cargo. | Prescripción usada como prueba de dosis o evento repetido cobrando dos veces. |
| Cirugía/CEYE | Caso y preparación → paquete/carga liberados → uso real → retorno/retiro ypacientes afectados. | Ciclo terminado sin liberación o retiro sin localizar paquetes usados. |
| Transfusión | Unidad/emisor/producto → reserva/compatibilidad → custodia/entrega → receptor/admin → destinofinal/investigación. | Despacho tomado por transfusión o devolución vuelve disponible sin evaluación. |
| Camas/alta | Aptitudclínica → altafirmada → salidafísica → limpieza/inspección → capacidad operativa. | Available del código confundido con aptitud física o corte decoste no revisado legalmente. |
| RRHH/privilegio | Relación/identidad → autorizaciónexterna → competencia/alcance → cuenta/sesión → acto/relevo. | Contrato/roladmitido como licencia o cese sin transferir pacientes/pendientes. |
| Revenue/seguros | Prestaciónverificada → cargo/tarifacontrato → reparto pagador → DTE/cobro/glosa → subledger/mayor/cierre. | Factura aceptada fiscalmente confundida con cobrabilidad, pago oactoclínico. |
| Derechos/documentos | Titular/representación → solicitud → evaluación/autoridad → copia/rectificación → entregaconfirmada/custodia. | Ruta normativa anterior o modificación clínica por permiso demográfico. |

## Autoridades por dato yestado
Identidad/episodio HIS; diagnóstico e informe autorizado LIS/RIS según propuesta v5; archivo imágenes PACS; orden/administración por circuito clínico validado; CEYE/servicio transfusional fuentes sanitarias; RRHH relación/asistencia, autoridad clínica privilegios; subledger/contabilidad fuenteeconómica; archivo/legal solicitud/custodia.
Confirmar sistemas concretos yresponsables. Si dato se replica, declarar fuente/version, reglas para mensaje tardío, conflicto yconfirmación. No autoridad por sistema que escribió último ni sincronización bidireccional sin reglas.

## Controles comunes
IDevento/objeto/emisor ycorrelación; tiempo del acto yde captura; versión/autor/evidencia; aceptación de receptor; motivo/excepción/pendiente; idempotencia/concurrencia; original/corrección; reconciliación durante caída/restauración. No revertir un acto físico ocurrido por falla de cargo ocola.
La automatización coordina tareas, detecta inconsistencias yprepara información con revisión. No inventa consentimiento, compatibilidad, aptitud, culpa, tratamiento ni vigencia de permisos. Métricas necesitan definición/denominador/fuentes/calidad.

## Capas de aprobación
Dueño operativo describe flujo/errores; clínico valida decisiones/competencias; asesoría revisa obligación/ámbito/reformas; contabilidad contrato/devengo/tarifa; TI seguridad/estados/interfaz; dirección recursos yresponsables. Cada aprobación tiene fecha/versión/evidencia ypuede ser condicionada. Ninguna está confirmada paraCLIMESA en esta entrega.
