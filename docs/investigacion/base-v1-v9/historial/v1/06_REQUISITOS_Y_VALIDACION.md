# Requisitos candidatos, aceptación e investigación siguiente

## Matriz de trazabilidad inicial
Estos requisitos son propuestas, no acuerdos ya aprobados por el hospital. P0 significa habilitador crítico antes de operar el circuito correspondiente; no implica implementar todos los servicios en la primera oleada.

| ID | Requisito candidato | Evidencia / motivación | Prueba de aceptación | Prioridad |
|---|---|---|---|---|
| R01 | Identidad provisional y múltiples emisores | A13; S27, S42 | Desconocido/recién nacido atendido sin documento inventado; reconciliación posterior | P0 |
| R02 | Fusión de identidad trazable y corregible | S27 | Fusión errónea corregida sin pérdida ni traslado silencioso de documentos | P0 |
| R03 | Autorización contextual y autoría auténtica | A03,A15; S31,S44 | Médico intenta firmar como otro o consultar paciente fuera de atribución | P0 |
| R04 | Cama/ingreso con exclusión concurrente | A06 | Dos usuarios compiten; solo una asignación válida se confirma | P0 |
| R05 | Camas con preparación y ubicación histórica | A07 | Alta no permite nueva ocupación hasta preparación autorizada | P0 |
| R06 | Observaciones repetidas, unidades y procedencia | A02; S36 | Serie temporal, dato anómalo confirmado y corrección conservan contexto | P0 |
| R07 | Prescripción, dispensación y administración enlazadas | A04; S30,S52 | Parcial, suspensión, rechazo, omisión y devolución mantienen historia | P0 |
| R08 | Lote no utilizable bloqueado | A05; S45 | Vencido, cuarentena y recall no se dispensan por simple stock positivo | P0 |
| R09 | Resultado crítico con confirmación y escalamiento | S42,S47 | Receptor no confirma; se escala y queda evidencia | P0 |
| R10 | Nota/informe firmado con corrección versionada | S32 | Corrección posterior preserva contenido previo y notifica donde procede | P0 |
| R11 | Cargo por episodio y fuente con tarifa versionada | A09; S19–S24 | Reintento no duplica cargo; cambio de tarifa no altera historia | P0 |
| R12 | Pago concurrente/idempotente y devolución autorizada | A08 | Dos pagos y un reintento no sobrepagan; devolución exige autorización | P0 |
| R13 | Totales financieros completos independientes de paginación | A12 | Más de 300 movimientos concilian con suma SQL completa | P0 |
| R14 | Submayores, mayor y cierre/reversión | A10,A11; S09,S24 | Pagos/anticipos/compras concilian; periodo cerrado no se edita silenciosamente | P0 |
| R15 | Compra multilínea y recepción parcial conciliable | Base; S01,S24 | Recepción incompleta/diferente deja CxP y stock correctos | P1 |
| R16 | Aseguradora, contrato, copago y glosa | S19–S24 | Rechazo parcial, apelación y pago se vinculan sin duplicar saldo | P1 |
| R17 | Auditoría de lectura/exportación/firma | A16; S31,S32 | Reconstruir quién accedió y por qué, con evidencia de integridad | P0 |
| R18 | Integraciones con idempotencia/reconciliación | S29,S30 | Duplicados, desorden, caída y recuperación no pierden hechos | P0 |
| R19 | Migración con procedencia y aceptación por riesgo | S49; M01–M07 | Reconstruir fuente de dato, lote y transformaciones; resolver rechazados | P0 |
| R20 | Contingencia y restauración ensayadas | S42,S43 | Recuperar datos/documentos y reconciliar acciones durante caída | P0 |
| R21 | Roles clínicos y técnicos revocables | A15; S44 | Usuario desactivado y sesiones existentes dejan de autorizarse según objetivo | P0 |
| R22 | Agenda concurrente de múltiples recursos | A14 | Reservas solapadas de profesional/sala/equipo se controlan | P1 |
| R23 | Fiscalidad local y DTE desacoplados de atención | S59,S60 | Servicio fiscal caído sigue política aprobada sin bloqueo clínico | P0 para circuito fiscal |
| R24 | Honorarios, costos e inventario conciliables | S24; F08–F11 | Liquidar profesional, costo de episodio y diferencias sin borrar eventos | P1 |
| R25 | Indicadores definidos y versionados | S26,S41 | Dos reportes reproducen mismo indicador, periodo y denominador | P1 |

## Escenarios adicionales a validar por servicio
Paciente homónimo; paciente VIP/dato restringido; menor con representante; persona fallecida; registro de emergencia sin fecha exacta de nacimiento; orden verbal y cofirma; cita marcada atendida sin consulta; resultado enviado al profesional ausente; suspensión de medicamento con tarea ya preparada; error de paciente en imagen; transfusión/implante con lote retirado; compra en consignación; discrepancia de factura proveedor; anticipo devuelto tras pago a aseguradora; glosa fuera de plazo contractual; hora clínica distinta de hora de transcripción; permisos cambiados a mitad de sesión; pérdida de interfaz en hora pico.

No todos están implementados. Deben convertirse en escenarios con datos sintéticos, resultados esperados y evidencia verificable antes de desarrollar el flujo.

## Investigación de campo indispensable
Solicitar al hospital, con autorización y datos protegidos: organigrama; catálogo de servicios; mapas actuales; formatos en blanco; sistemas e interfaces; políticas de firma/corrección; protocolos aprobados; catálogo de cuentas/centros de costo; contratos/tarifas de seguros; manejo de honorarios; cierres y conciliaciones; requisitos de archivo; políticas de incidentes; volumetría e infraestructura.

Entrevistar por trabajo real, no por pantallas deseadas: recepción, archivo, urgencias, médico, enfermería, farmacia, laboratorio, imagen, cirugía, banco de sangre, compras, caja, facturación, contador, tesorería, auditoría, dirección, TI y privacidad. Recorrer casos normales, fines de semana, turnos nocturnos, urgencias, faltantes, errores y caídas.

Preguntas centrales: ¿quién recibe la siguiente tarea?, ¿qué evidencia la completa?, ¿cómo se detecta que nadie la hizo?, ¿qué cambia si otro usuario trabaja simultáneamente?, ¿quién puede corregir?, ¿qué se hace sin sistema?, ¿qué saldo/stock queda?, ¿quién firma/acepta al final?

## Plan por entregables y puertas de aceptación
1. **Descubrimiento institucional**: mapa actual, problemas/volúmenes, responsables y matriz legal vigente. Puerta: representantes validan que el mapa refleja su trabajo.
2. **Catálogo de evidencia**: profundizar por dominio, fuentes específicas, versiones/licencias, contradicciones y vacíos. Puerta: cada requisito tiene fundamento o etiqueta de hipótesis.
3. **Flujos futuros y modelo**: estados, invariantes, excepciones, roles, datos y contratos. Puerta: revisión clínica, contable, archivo, seguridad y operaciones.
4. **Comparación técnica**: Aldara evolucionado frente a plataforma adaptable y opción híbrida. Puerta: mismos casos, resultados, exportación y costo total.
5. **Base verificable**: build reproducible, pruebas de dominio/integración y mecanismos críticos. Puerta: ninguna brecha de riesgo crítico abierta en el circuito piloto.
6. **Ensayos de migración/contingencia**: datos de prueba representativos y reconciliación. Puerta: aceptación y recuperación demostradas.
7. **Piloto acotado**: circuito completo con soporte, métricas y retorno preparado. Puerta: criterios acordados de seguridad, calidad y operación.
8. **Despliegue gradual**: nuevas unidades solo cuando sus dependencias y pruebas estén listas.

No se estimaron meses/personas/presupuesto porque faltan hospital, alcance, volúmenes y equipo. Producir estimación por escenarios tras discovery, incluyendo licencias, integración, capacitación, soporte, hardware, migración, pruebas y mantenimiento.

## Comparación mediante pruebas de concepto
Usar cinco casos mínimos: paciente desconocido a alta; medicamento parcialmente dispensado y luego suspendido; resultado crítico corregido; compra parcial hasta conciliación; episodio con seguro/cargos/anticipo/glosa hasta cierre contable. Añadir caída y reintento en cada uno.

Puntuar con evidencia: integridad y seguridad clínica 25%, cobertura de flujos 20%, migración/interoperabilidad 15%, operación/recuperación 15%, mantenibilidad 10%, costo total 10%, usabilidad por rol 5%. Pesos propuestos para discutir; un fallo crítico no se compensa con puntuación estética.

## Plantilla de requisito/especificación
Identificador; propósito; fuente/versiones; responsable; actores y atribuciones; precondiciones; datos; estados/transiciones; reglas/invariantes; camino normal; excepciones; efectos financieros/stock; integración; auditoría; contingencia; migración; criterio de aceptación; casos; riesgos; decisión y fecha.

## Seguimiento de evidencia
Añadir a sources: fecha, autoridad, idioma, versión, URL, acceso, dominio, aportación, limitación, licencia y siguiente acción. Mantener un registro de decisiones con alternativas y pruebas. Una fuente nueva puede cambiar un requisito, pero no debe borrar la justificación anterior.

## Verificación realmente realizada
Se listó y extrajo `clm.zip`; se enumeraron archivos con `rg --files`; se leyeron AGENTS/constitución/documentación y código relevante; se inspeccionaron concurrencia, autorización, modelado y finanzas; se consultaron fuentes públicas; `command -v dotnet` no devolvió ejecutable. Se validó estructura del paquete, conteo/identificadores/URLs del catálogo y consistencia de referencias Sxx. No se ejecutó aplicación, build, tests, SQL ni pentest. La auditoría dinámica sigue pendiente.
