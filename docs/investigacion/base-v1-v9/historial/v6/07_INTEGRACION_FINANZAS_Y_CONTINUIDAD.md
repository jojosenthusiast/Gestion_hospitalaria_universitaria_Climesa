# Integración, finanzas y operación
## Autoridad de datos
| Dominio | Registro candidato de autoridad | Evento de enlace |
|---|---|---|
| Identidad/episodio | HIS según v3 | Provisional resuelto; episodio abierto/cerrado. |
| Diagnóstico | LIS/RIS/PACS según v5 | Orden recibida; informe/version autorizado. |
| Anestesia | Registro anestésico validado | Administración/evento/relevo confirmado. |
| CEYE | Registro sanitario de reprocesamiento | Paquete liberado/retirado/usado. |
| Transfusión | Sistema especializado/servicio habilitado | Unidad liberada, entregada y destino final. |
| Finanzas | Subledger/contabilidad según v3–v4 | Prestación/consumo validado; reversión con causa. |

No elegir software especializado sin inventario real y capacidad de exportación/conformance. Interfaces reutilizan principios v5: identidad/emisor, ID de evento, correlación, versionado, cola, acuse técnico y aceptación de negocio distintos. Evento repetido no duplica administración, consumo o cargo; evento tardío no retrocede estado validado.

## FIN601 — Costeo y cobro
Separar honorarios, sala/tiempo, anestesia, insumos, implantes, estudios y transfusión según contrato/catálogo validado. Prestación efectivamente realizada y paquete tarifario deben reconciliarse; paquete evita cargos duplicados por componentes incluidos. Caso cancelado puede tener costos reales previos: aplicar contrato autorizado, no cobrar cirugía realizada inexistente.
Consignación: recepción, reserva, uso efectivo, factura proveedor y devolución separados. Instrumental reusable tiene ciclos y costos de operación, no venta por cada uso. Hemocomponentes, insumos y servicios transfusionales requieren clasificación jurídica/contable específica y revisión de restricciones de proveedor; no asumir sangre vendible por precio de catálogo.
Centro de coste y responsable de consumo no equivale a pagador. Caja recibe lo necesario para cobro, sin detalles clínicos innecesarios. Ajustes financieros no borran administración ni exposición sanitaria. Reconciliar cargos con v3 y lotes/movimientos con v4.

## CON601 — Concurrencia y fallos
Reservar recursos/unidades/paquetes exige prevención de doble asignación en almacenamiento persistente, no solo botón deshabilitado. Si escritura parcial deja cargo sin acto, actuar por reconciliación/compensación trazable; no revertir un procedimiento físico ocurrido porque falló facturación.
Durante caída: formularios numerados, identificadores únicos y responsable, lista local de prioridades/pendientes y verificación clínica/manual aprobada. Al recuperar, conciliar datos por dominio y fuente; no fusionar unidades ni pacientes por texto similar. Registro tardío conserva hora original/captura y autor de transcripción.
Restauración debe probar expediente, archivos, interfaces y obligaciones abiertas. Paquete usado o unidad transfundida no vuelve a disponible por restaurar copia anterior. Conciliar actos posteriores al punto de respaldo y avisos ya entregados. RPO/RTO y modo degradado requieren acuerdo con responsables y pruebas, no valores inventados.

## GOV601 — Privilegios y evidencias
Matriculación/competencia/supervisión son condiciones de firma clínica, diferentes de permiso de pantalla. Roles candidatos: triaje, urgencias, cirujano, anestesia por competencia, enfermería quirúrgica/recuperación, CEYE operador/liberador, servicio transfusional, biomédica, calidad y financiera. Revisar combinaciones reales y controles compensatorios.
Corrección conserva original, motivo y firma; permisos extraordinarios tienen motivo, alcance, revisión y vencimiento. Administración TI no firma acto clínico por ser Administrator.
Auditoría debe recuperar quién/hora/objeto/versión/motivo y accesos/exportaciones autorizadas. Retención por tipo documental y obligaciones legales aún por especificar, sin plazo uniforme supuesto.
