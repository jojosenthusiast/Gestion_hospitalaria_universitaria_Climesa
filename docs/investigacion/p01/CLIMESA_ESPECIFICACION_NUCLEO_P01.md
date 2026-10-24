# CLIMESA — Especificación del núcleo P01

Versión 0.1, 12/10/2026. Estado: propuesta para revisión institucional. Este paquete inicia la fase de especificación después del cierre de la base investigativa. No atribuye procesos observados a CLIMESA, no selecciona proveedores y no autoriza despliegue. Las reglas propuestas se distinguen de las normas y contratos pendientes de verificación.

## 1. Objetivo y límites

Establecer un contrato funcional común para identificar a una persona, abrir y seguir su episodio, registrar una prestación, originar un cargo y reconciliar su cobro. El circuito debe conservar la autoría clínica y la evidencia económica incluso ante correcciones, reintentos, cambios de identidad y caídas de interfaces.

El núcleo especificado podrá ser usado por varios servicios. Su primer despliegue requiere elegir un servicio efectivamente autorizado, con responsables, casos reales y riesgos evaluados. No se adopta laboratorio, medicación, emergencia o cirugía como piloto por defecto. Este documento tampoco sustituye las especificaciones especializadas de esos dominios.

## 2. Ficha institucional: evidencia que falta

Los campos siguientes permanecen PENDIENTES. Una respuesta necesita documento/versionado o validación institucional, además de un responsable designado.

| ID | Dato o decisión | Evidencia esperada | Uso en especificación |
|---|---|---|---|
| INS01 | Razón social, sedes, clase y habilitación | Permisos vigentes y alcance por sede/junta | Delimitar servicios y entidades legales. |
| INS02 | Cartera y población atendida | Catálogo firmado, modalidades y horarios | Elegir servicio piloto y límites clínicos. |
| INS03 | Servicio propio, externo interno o referido | Contratos, permisos y responsable por modalidad | Definir custodia, interfaces y conciliación. |
| INS04 | Organigrama y atribuciones | Funciones y autoridades aprobadas | Aprobar comandos y segregación. |
| INS05 | Identificadores y registro de pacientes | Formatos, procedimiento de duplicados/corrección | Aprobar identidad provisional y verificación. |
| INS06 | Inicio, traslado, alta y salida del episodio | Procedimientos y formatos con versión | Separar hitos clínicos, físicos y económicos. |
| INS07 | Catálogo de prestaciones y tarifas | Códigos, vigencia, contratos y excepciones | Calcular cargos reproducibles. |
| INS08 | Pagadores y coberturas | Convenios, autorizaciones y reglas de reclamación | Delimitar responsabilidad y cuentas. |
| INS09 | Caja, bancos y conciliación | Medios, turnos, cortes, depósitos y reversos | Aprobar cobros y liquidaciones. |
| INS10 | Régimen fiscal y contable | Emisor, versiones DTE, plan de cuentas y periodos | Mapear comprobantes y asientos. |
| INS11 | Aplicaciones, equipos e interfaces actuales | Inventario, contratos, exportación y conformidad | Identificar fuente de verdad y coexistencia. |
| INS12 | Continuidad y custodia | Procedimientos de caída, respaldo, restauración y archivo | Definir recuperación verificable. |

Recoger documentos y muestras desidentificadas; no hacen falta credenciales, expedientes identificables ni diagnósticos de trabajadores. Registrar para cada evidencia: ID, título, versión, fecha efectiva, emisor, ámbito, ubicación controlada, revisor, resultado y pendientes. Una ausencia documental no se convierte automáticamente en incumplimiento institucional.

## 3. Modelo de dominio propuesto

Los nombres son conceptos funcionales, no una migración SQL aprobada. Identificadores internos estables; números visibles y claves externas son atributos o referencias separados. Las restricciones de identidad se aplicarán después de confirmar emisor y dominio del identificador.

| Concepto | Datos mínimos propuestos | Relaciones e invariantes |
|---|---|---|
| Persona/paciente | ID, nombres, datos demográficos con certeza y procedencia | No inventar nacimiento/documento para completar un campo. |
| Identificador | Tipo, emisor, valor, estado de verificación y evidencia | El mismo valor con emisores diferentes no prueba igualdad de personas. |
| Caso de identidad | Candidatos, motivo, decisión, autoridad, referencias afectadas | Unir o deshacer requiere manifiesto de cambios y conciliación de consumidores. |
| Episodio | ID, paciente, sede, modalidad, apertura, hitos y estado | Conserva encuentros y actos; cierre económico no reemplaza alta clínica. |
| Encuentro/estancia | ID, episodio, servicio, ubicación y periodo | Traslado preserva intervalos y autoría; reglas de solapamiento por modalidad. |
| Orden | ID, episodio, indicación, autor, prioridad y versión | Orden y prestación son objetos distintos; una orden puede tener ejecuciones parciales. |
| Prestación | ID, orden si aplica, episodio, ejecutor, periodo y evidencia | Solo una evidencia aprobada puede habilitar un cargo según regla versionada. |
| Registro/resultado | ID, prestación, autor, validador, versión, estado y correcciones | Resultado firmado se corrige mediante nueva versión vinculada, sin sobrescribirlo. |
| Cuenta | ID, episodio, pagadores y responsabilidades | Saldo deriva de movimientos y aplicaciones, no de un campo editable sin origen. |
| Cargo | ID, origen, cantidad, precio, regla, contrato y vigencia | Unicidad por origen y concepto definido; ajustes referencian el movimiento original. |
| Documento fiscal | ID, versión oficial, referencias, contenido y estado externo | Confirmación interna y aceptación externa se registran por separado. |
| Pago/aplicación | ID, medio, referencia, monto, distribución y estado | Registrar pago no implica que esté aplicado, depositado o conciliado. |
| Reclamación/remesa | ID, pagador, líneas, envío, respuestas y liquidación | Diferenciar presentado, aceptado, pagado, rechazado y disputado. |
| Movimiento/asiento | Origen, periodo, cuentas, importes y reversos | Exportaciones y ajustes idempotentes; cierre de periodo protege modificaciones. |
| Evidencia de auditoría | Actor, autoridad, objeto, acción, versiones, tiempo y correlación | Acceso controlado; no duplicar contenido sensible innecesario en logs técnicos. |

No crear una única columna de estado para representar atención, facturación, salida y fiscalización. El estado compuesto se consulta a partir de objetos responsables de cada dimensión.

## 4. Estados y comandos

| Objeto | Estados propuestos | Transición y condición |
|---|---|---|
| Identidad | Provisional, verificada, en revisión, vinculada | La vinculación requiere decisión autorizada y referencias anteriores recuperables. |
| Episodio | Abierto, en cierre, cerrado administrativamente, anulado por error | Alta clínica y salida física son hitos separados; una anulación no borra actos realizados. |
| Orden | Borrador, emitida, aceptada, en ejecución, completada, cancelada | Cancelar exige motivo y efecto explícito en ejecuciones parciales y cargos. |
| Prestación | Pendiente, iniciada, realizada, validada, corregida, anulada por error | No confundir anulación administrativa con servicio no realizado. |
| Cargo | Propuesto, aprobado, facturado, ajustado | Ajuste conserva origen, motivo, aprobador y efecto financiero. |
| Pago | Registrado, confirmado, revertido | Aplicaciones y conciliación se modelan separadamente; reverso requiere referencia original. |
| Intercambio | Pendiente, enviado, acuse recibido, rechazado, estado incierto, conciliado | Timeout produce estado incierto; consultar/reconciliar antes de duplicar efectos. |

Los estados son propuesta de diseño. Las matrices especializadas pueden exigir estados adicionales; cada servicio debe aprobar sus transiciones y su correspondencia con sistemas externos.

Contrato mínimo de comando: ID del comando, actor y autoridad efectiva, objeto/versión esperada, sede, motivo cuando corresponda, evidencia y clave idempotente. Resultado: nuevo estado/versión, identificadores de efectos, correlación o conflicto explícito. La misma clave con contenido distinto debe producir conflicto y quedar auditable. La misma clave con contenido equivalente devuelve el resultado durable original. La retención de claves y las reglas de equivalencia se especificarán por interfaz.

Evento de integración: ID único, tipo y versión de contrato, objeto/versionado, tiempo de ocurrencia y registro, origen, correlación y datos mínimos necesarios. La selección tecnológica de colas o almacenamiento no forma parte de esta aprobación. El envío debe permitir reconciliar efectos tras una caída; cada consumidor conserva deduplicación durable.

## 5. Circuito transversal y excepciones

| Paso | Acción y resultado | Excepción y resolución propuesta |
|---|---|---|
| C01 | Buscar/verificar persona; registrar identidad cuando proceda | Homónimo, falta de documento o conflicto: revisión/provisional conforme a política aprobada. |
| C02 | Abrir episodio con modalidad, sede y responsable | Reintento: devolver episodio creado; conflicto simultáneo: aplicar regla aprobada, sin duplicación silenciosa. |
| C03 | Emitir/aceptar orden o registrar prestación permitida sin orden | Servicio referido: registrar contraparte y responsabilidad, sin fingir ejecución interna. |
| C04 | Ejecutar y validar con autoría profesional | Parcial, rechazado, cancelado o corregido: preservar cantidades y evidencia; resolver seguimiento pendiente. |
| C05 | Originar cargo conforme a regla efectiva | Falta de precio/contrato: cola de excepción; no elegir tarifa arbitraria. Reintento: mismo cargo. |
| C06 | Distribuir responsabilidad y generar documentos aplicables | Cobertura pendiente o rechazo: responsabilidad provisional explícita y revisión autorizada. |
| C07 | Registrar pago y aplicaciones | Pago parcial, duplicado, excedente, devolución o referencia bancaria repetida: movimiento controlado y conciliación. |
| C08 | Conciliar prestación, cargo, documentos, pagos y contabilidad | Diferencia: caso abierto con responsable y causa; corrección/reverso trazable. |
| C09 | Resolver hitos de cierre y seguimiento | Resultado o cobro tardío: proceso posterior vinculado, sin reabrir/reescribir indiscriminadamente el episodio. |

La atención urgente y el alta no se bloquearán mediante una regla de deuda inventada. Cualquier restricción debe pasar revisión clínica/legal/institucional. Un saldo no es equivalente a autorización para restringir un acto asistencial.

## 6. Autoridad y controles

| Acción | Función candidata para revisión | Control propuesto |
|---|---|---|
| Identificar y abrir episodio | Admisión/archivo | Ámbito por sede, búsqueda previa y evidencia de identidad. |
| Resolver vinculación de identidades | Archivo y autoridad clínica/económica según impacto | Revisión de datos afectados; autorización específica. |
| Emitir/validar actos | Profesional competente y autorizado | Verificar atribución efectiva al momento del acto; administrador técnico no equivale a firmante. |
| Modificar tarifa/contrato | Gestión económica autorizada | Vigencia, aprobación y separación de quien cobra cuando proceda. |
| Registrar pago | Caja | Permisos, corte y trazabilidad del medio/referencia. |
| Aprobar reverso o ajuste | Autoridad económica designada | Motivo/evidencia; límites y doble control a definir localmente. |
| Cerrar periodo/exportar asientos | Contabilidad | Reconciliación previa, periodo protegido y reversos posteriores. |
| Configurar integración/accesos | TI con dueño funcional | Acceso mínimo, cambios registrados y validación del contrato. |

Estos son responsables funcionales candidatos, no asignaciones ni roles confirmados de CLIMESA. Los límites monetarios, dobles controles, permisos de emergencia y caducidad de sesiones quedan pendientes de aprobación.

## 7. Reconciliación y automatización

Crear cuatro conjuntos de excepciones: prestación sin cargo esperado; cargo sin origen válido; documento/pago sin correspondencia interna; exportación contable pendiente o divergente. Cada caso conserva objeto, versión de regla, importe/cantidad, causa, dueño, fecha de detección, acciones y cierre con evidencia.

Automatizaciones propuestas: detectar duplicados exactos bajo reglas aprobadas; generar cargos deterministas; reenviar mensajes idempotentes; detectar respuestas tardías; contrastar totales y líneas; recordar casos pendientes. No fusionar pacientes, resolver controversias, firmar resultados ni alterar responsabilidades económicas automáticamente por coincidencia aproximada.

Los indicadores deben medir pendientes, diferencias y tiempos con denominador definido; no se inventan metas de servicio. Monitorizar una cola no demuestra que sus casos se resolvieron correctamente.

## 8. T309 y T310: descomposición de aceptación

Se conservan T309 (reclamaciones/remesas) y T310 (migración/corte/rollback) como tareas originales. El CSV adjunto añade criterios propuestos AC-P01-001 a AC-P01-012. Su relación es de refinamiento, no sustitución ni cumplimiento. Referencia documental: V3/05_TASKS_Y_ACEPTACION.md; controles de migración V3/06 y V2, según archivos originales. La aplicabilidad normativa y contractual sigue pendiente.

Reclamaciones: vincular líneas a cargos y versiones contractuales; controlar reenvíos; distinguir respuestas y pagos parciales; gestionar rechazo/controversia; conciliar remesa contra banco y aplicaciones; preservar el circuito aunque un pago llegue tras el cierre.

Migración: inventario y correspondencia de identidades; manifiesto de transformaciones y rechazos; reconciliación de cantidades y saldos; preservación de historia; coexistencia y punto de corte; retorno con tratamiento de nuevas escrituras. Un rollback que restaura archivos pero pierde actos posteriores al corte no es aceptable.

## 9. Backlog y puntos de decisión

| ID | Entrega de esta fase | Dependencias | Salida verificable |
|---|---|---|---|
| P01-01 | Ficha INS01–12 respaldada | Documentos y autoridades locales | Cada dato tiene evidencia/estado y dueño. |
| P01-02 | Caso real ordinario y excepcional por circuito | P01-01, dueños | Pasos y documentos revisados; casos desidentificados. |
| P01-03 | Matriz de aplicabilidad del núcleo | Textos vigentes, asesoría, contratos | Reglas enlazadas a cláusula/versionado y pendientes visibles. |
| P01-04 | Diccionario y estados aprobados | P01-01/02/03 | Fuente de verdad, transiciones y correcciones definidos. |
| P01-05 | Contratos de intercambio y conciliación | Inventario técnico y P01-04 | Reintentos, conflicto y caída especificados por contraparte. |
| P01-06 | Autoridad y segregación | Organigrama, P01-04 | Matriz de acciones aprobada por responsables. |
| P01-07 | Refinamiento T309/T310 | Contratos, inventario y P01-04/05 | Criterios adjuntos revisados y evidencia definida. |
| P01-08 | Decisión técnica por componente | P01-03 a P01-07 y auditoría del código | Registro de alternativas, cobertura, transición y coste. |
| P01-09 | Selección del primer servicio piloto | Cartera confirmada y evaluación funcional | Alcance, exclusiones, riesgos, dueños y aceptación acordados. |

No se estiman horas ni fechas de implementación sin conocer equipo, infraestructura, sistemas y documentos. El siguiente paso operativo inmediato es completar P01-01/P01-02 y revisar P01-04 con sus dueños; el diseño lógico puede revisarse en paralelo, manteniendo pendientes explícitos.

## 10. Verificación de la entrega

Esta entrega es especificación documental. No modifica código, base de datos ni migraciones; no ejecuta pruebas técnicas, clínicas, contables o de Hacienda. Los criterios permanecen PROPUESTO/NO_EJECUTADO. Se verifican IDs únicos, vínculo a tareas originales, estructura de archivos e integridad del paquete. Se incorpora el expediente de cierre y su investigación para conservar trazabilidad.

No hay nueva consulta normativa en P01. Las fuentes y límites mantienen el corte del expediente V9 del 12/10/2026. Cualquier regla legal/fiscal implementable debe recuperar y revisar el texto/versionado correspondiente; el modelo lógico aquí presentado es una propuesta de ingeniería derivada de la investigación.
