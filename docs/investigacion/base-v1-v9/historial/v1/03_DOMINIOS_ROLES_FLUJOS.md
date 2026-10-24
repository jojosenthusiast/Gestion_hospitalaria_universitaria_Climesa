# Dominios, responsabilidades y flujos candidatos
Todo este documento es propuesta de alcance. Requiere observar el hospital real; no atribuye estos procesos a la base actual. Referencias de inspiración: S01, S09, S19–S25, S30, S39, S42, S45–S47.

## Cobertura por dominios
| Dominio | Capacidades por especificar | Dependencias y excepciones |
|---|---|---|
| Identidad y archivo | Índice maestro, identificadores múltiples, alias, duplicados, representantes, consentimientos, documentos | Desconocidos, menores, recién nacidos, extranjeros, homónimos, fallecimiento, fusión equivocada |
| Acceso y agenda | Citas, referencias, recursos, listas de espera, autorización, llegada y cola | Cancelación, ausencias, sobrecupo autorizado, urgencia, bloqueo de equipo/sala |
| Urgencias | Identidad provisional, triage, reevaluación, observación, transferencia y destino | Deterioro, paciente que se retira, múltiples víctimas, caída del sistema |
| ADT y camas | Admisión, traslado, alta, ubicación histórica, reserva, limpieza, aislamiento | Cama bloqueada, traslado externo, fallecimiento, alta revertida |
| Expediente y órdenes | Episodio, diagnósticos, problemas, alergias, notas versionadas, órdenes, resultados, interconsultas | Corrección después de firma, orden verbal, cofirma, revisión tardía |
| Enfermería | Valoración, plan, tareas, signos seriados, balances, entrega de turno, eMAR | Dosis omitida, rechazada, tardía, suspendida; escalamiento y delegación |
| Farmacia | Validación, dispensación parcial, sustitución autorizada, devoluciones, FEFO, preparación | Caducidad, cuarentena, recall, medicamento controlado, dosis urgente |
| Laboratorio | Orden, toma, muestra, transporte, recepción, análisis, calidad, validación e informe | Muestra rechazada, duplicada, crítica, resultado corregido, equipo caído |
| Imagen/RIS/PACS | Agenda, protocolo, examen, DICOM, informe, firma y entrega | Paciente equivocado, lateralidad, contraste, embarazo, estudio incompleto |
| Cirugía y anestesia | Lista quirúrgica, evaluación, consentimiento, recursos, seguridad, registro, recuperación | Cancelación, urgencia, implante, conteos discrepantes, reintervención |
| Sangre y transfusión | Donación/abastecimiento, compatibilidad, reserva, entrega, administración y reacción | Caducidad, trazabilidad donante-receptor, retiro, emergencia |
| Especialidades | UCI, obstetricia/neonatos, oncología, diálisis, salud mental, rehabilitación | Reglas y formularios propios con gobierno clínico |
| Suministros y compras | Solicitud, cotización, aprobación, orden, recepción parcial, factura y pago | Faltantes, diferencias, devolución, consignación, cuarentena, stock por ubicación |
| Finanzas hospitalarias | Catálogo, contratos, cuenta por episodio, cargos, paquetes, anticipos, aseguradoras | Copago, deducible, glosa, rechazo, corrección, devolución, responsable distinto al paciente |
| Contabilidad/tesorería | Submayores, mayor, CxC/CxP, bancos, cierres, activos, costos e impuestos | Devengo, ajustes, conciliación, diferencias, periodos cerrados, liquidación de honorarios |
| Personas | Credenciales, privilegios, turnos, cobertura, nómina o integración | Suplentes, profesionales externos, revocación inmediata |
| Servicios de apoyo | CEYE, limpieza, lavandería, alimentación, residuos, mantenimiento, transporte | Limpieza pendiente, dieta modificada, equipo no seguro, trazabilidad de esterilización |
| Calidad y dirección | Incidentes, infecciones, indicadores, auditoría, comités, investigación | Datos secundarios seudonimizados, definiciones versionadas y acceso por propósito |
| Paciente y red | Portal, acceso a documentos, representante, seguimiento y referencia externa | Restricciones de publicación, identidad remota y consentimiento |

## Roles: propuesta de separación de atribuciones
Un rol define capacidades; el contexto limita sobre quién y dónde pueden ejercerse. Varias personas pueden tener más de un rol, pero deben mantenerse incompatibilidades críticas y trazabilidad.

| Rol | Trabajo y acceso necesario | Límite propuesto |
|---|---|---|
| Recepción/admisión | Identidad, agenda, contacto y requisitos administrativos | No firma notas ni ve todo el contenido sensible por defecto |
| Médico tratante/especialista | Episodios asignados, notas, órdenes y resultados | No elige identidad de otro autor sin delegación registrada |
| Enfermería/coordinación | Pacientes bajo cuidado, tareas, observaciones, administración y turno | No modifica retrospectivamente órdenes médicas firmadas |
| Farmacéutico/técnico | Orden válida, alertas relevantes, validación y dispensación | Validación profesional y ejecución técnica se distinguen |
| Laboratorista/validador | Muestras, análisis, calidad, resultado y autorización | Separar captura, validación y corrección; acceso clínico mínimo |
| Radiólogo/técnico | Estudio, imagen e informe según función | Firma reservada a perfil habilitado |
| Cirujano/anestesiólogo/CEYE | Procedimiento, anestesia, materiales y esterilidad | Privilegios específicos; cadena de responsables |
| Caja | Cobro, anticipo, comprobante, turno y cierre | No cambia tarifa, borra pagos o aprueba su devolución |
| Facturación/seguros | Cargos, contratos, cuenta y reclamación | Correcciones y descuentos con autorización separada |
| Contador | Asientos, mayor, impuestos, CxC/CxP, costos y cierre | No necesita leer notas clínicas completas |
| Tesorería | Bancos, conciliación, programación y ejecución de pagos | Doble autorización según importe/política |
| Compras/almacén | Proveedores, orden y recepción | Solicitar, aprobar, recibir y pagar no recaen sin control en la misma persona |
| Auditor/calidad | Evidencia acotada al mandato y periodo | Lectura y exportación autorizadas; no edición operativa |
| Dirección | Indicadores y análisis | Agregación por defecto, detalle por necesidad documentada |
| TI/seguridad | Operación técnica y accesos | Administración técnica no confiere privilegio médico automático |
| Archivo/privacidad | Custodia, digitalización y solicitudes del titular | Corrección de identidad y acceso con procedimientos verificables |
| Paciente/representante | Información publicada y trámites propios | Identidad y representación verificadas; no acceso por conocer un ID |

## Contrato mínimo de cada flujo
Registrar disparador, actores, precondiciones, estados, datos, responsable actual, siguiente acción, plazo, evidencia, efectos en otros dominios, cancelación, compensación, excepción, contingencia y prueba. Un estado “completado” requiere significado operativo; no basta guardar un formulario.

## F01 — Consulta ambulatoria
1. Buscar identidad; revisar duplicados, crear identificador provisional si procede.
2. Elegir servicio, profesional y recursos compatibles; confirmar cobertura y autorización cuando aplique.
3. Confirmar llegada y episodio; enfermería realiza preparación según competencias.
4. Médico documenta y firma; solicita exámenes, medicamento o interconsulta.
5. Servicios receptores aceptan y ejecutan; resultados vuelven al episodio con responsable de revisión.
6. Generar cargos por prestaciones según reglas acordadas; distribuir a paciente/aseguradora.
7. Emitir documento correspondiente, cobrar o registrar CxC; entregar indicaciones y seguimiento.
Excepciones: ausencia, cancelación, autorización pendiente, resultado posterior al cierre de consulta. El cierre administrativo no debe ocultar tareas clínicas pendientes.

## F02 — Urgencias e ingreso
Atender con identificación provisional; triage y reevaluación según protocolo clínico aprobado; abrir episodio; registrar órdenes y ejecución; decidir alta, observación o ingreso. Reserva y ocupación de cama requieren control concurrente. La política de cobertura/pago debe permitir el manejo legal y asistencial de urgencias sin que un fallo del servicio fiscal bloquee la atención.

## F03 — Hospitalización, traslado y alta
Ingreso → asignación de equipo → plan de cuidado → ejecución diaria → traslado con entrega → evaluación de alta → conciliación de medicamentos/indicaciones → egreso → limpieza/liberación de cama.
Separar autorización médica de alta, egreso físico, cierre de cuenta y preparación de cama. Mantener ubicación temporal histórica. Considerar alta contra recomendación, traslado, fallecimiento y cancelación del alta; no representar todos con un nullable de fecha.

## F04 — Circuito del medicamento
Prescripción identificada/versionada → validación farmacéutica → preparación → dispensación con lote → entrega → administración documentada → seguimiento y conciliación.
La orden debe expresar fármaco, dosis/unidad, vía, pauta, periodo, motivo y prescriptor. Farmacia puede dispensar por partes; enfermería registra cada evento, incluidos no administrados con motivo. Escaneo confirma identidad y producto cuando esté implementado, pero debe haber contingencia y detección de atajos. Suspender una orden detiene las siguientes tareas y conserva historia; devolver producto genera movimiento y ajuste económico autorizado, no eliminación del evento.

## F05 — Laboratorio y resultados críticos
Orden → identificación paciente/muestra → toma → transporte → recepción/aceptación → análisis/calidad → validación → publicación → revisión clínica.
Muestra rechazada debe generar motivo y nueva tarea de toma. Resultado corregido conserva versión anterior y notifica a receptores afectados. Un crítico necesita responsable, canal, confirmación de recepción y escalamiento; “se envió una notificación” no demuestra recepción. La definición de crítico y sus tiempos corresponde al servicio clínico.

## F06 — Diagnóstico por imagen
Orden con pregunta clínica → agenda/protocolo → identificación y comprobaciones → adquisición → almacenamiento DICOM → interpretación → informe firmado → comunicación/revisión → cargo.
No confundir estudio almacenado con informe concluido. La reconciliación de identidad debe controlar también metadatos y referencias PACS. Identificar de forma explícita solicitudes canceladas, imágenes importadas e informes rectificados.

## F07 — Cirugía, esterilización e implantes
Solicitud → preoperatorio/consentimiento → recursos y compatibilidad → preparación → comprobaciones quirúrgicas → anestesia/procedimiento → consumos/implantes → recuperación → evolución.
Trazar lote/serie de implante y cadena de esterilización. Una cirugía cancelada libera recursos, revierte reservas de material y aplica política económica, preservando el motivo. La lista de seguridad sirve al equipo; no completar automáticamente campos que exigen comprobación humana.

## F08 — Compras hasta pago
Necesidad → solicitud → aprobación → cotizaciones/selección → orden → recepción parcial → inspección/cuarentena → aceptación → conciliación orden-recepción-factura → CxP → programación → pago → conciliación bancaria.
Diferencias en cantidad, costo o lote se resuelven antes de liberar producto/pago según umbral. Permitir múltiples líneas, ubicaciones, entregas y devoluciones. Stock clínico y valoración contable deben conciliarse sin fingir que son el mismo registro.

## F09 — Prestación hasta cobro
Prestación identificada → cargo único → tarifa y contrato vigentes → responsabilidad financiera → cuenta revisada → factura/documento fiscal → pago/anticipo aplicado → reclamación → respuesta → glosa/apelación → cobranza/ajuste → conciliación → contabilización.
No cobrar automáticamente todo lo ordenado: la regla puede depender de prestación, paquete, contrato o anticipo. Conservar la evidencia que justifica el cargo y cómo se distribuyó. El pago al hospital y la liquidación de honorarios al médico son procesos distintos.

## F10 — Jornada del contador
Inicio: revisar integraciones pendientes, partidas sin contabilizar y diferencias del día anterior. Revisar devengos, anticipos aplicados, cobros, compras y salidas de inventario. Validar mapeos de cuentas y centros de costo; aprobar ajustes bajo segregación. Conciliar cajas/bancos/CxC/CxP/submayores. Calcular obligaciones según reglas locales verificadas. Cerrar periodo con evidencia, bloquear edición y emitir estados.
Estados de asiento candidatos: borrador → validado → contabilizado → reversado. Corrección después de contabilizar mediante asiento de reversión/ajuste, no borrado. Reapertura excepcional con aprobación y rastro. Automatizar contabilización determinista y conciliación sugerida; el contador conserva revisión y responsabilidad.

## F11 — Caja y anticipos
Abrir turno/fondo → recibir pagos y anticipos → aplicar a obligaciones → registrar devoluciones autorizadas → cierre contado versus esperado → investigar diferencia → depósito → conciliación.
No tratar anticipo como ingreso devengado automáticamente. Registrar efectivo entregado/cambio cuando proceda, métodos no efectivo, referencia de transacción y duplicados. Una devolución requiere evidencia de destino y no debe permitir apropiación por quien la solicita.

## F12 — Referencia y continuidad externa
Solicitar referencia con resumen → aceptar por receptor → coordinar transporte/cita → transferir datos mínimos necesarios → confirmar atención → recibir respuesta y cerrar seguimiento. Si el receptor no usa interoperabilidad, manejar documento y confirmación humana trazables sin afirmar integración inexistente.

## F13 — Archivo y derechos del titular
Recibir solicitud → verificar identidad/representación → clasificar → evaluar límites y obligaciones de conservación → resolver → entregar por canal seguro → registrar evidencia. Rectificar datos inexactos no equivale a destruir historia clínica válida. La respuesta jurídica y los plazos dependen de norma vigente [S55–S58].

## F14 — Caída y reconciliación
Declarar incidente → activar kit de contingencia por servicio → identificar pacientes/órdenes temporalmente → registrar acciones en soportes controlados → recuperar sistema → transcribir con doble fecha y origen → detectar duplicados/conflictos → reconciliar farmacia/resultados/cobros → cerrar incidente.
La transcripción nunca debe aparecer como registro contemporáneo ni borrar incertidumbre de la fuente.

## F15 — Retiro de lote
Recibir alerta → localizar stock en todas las ubicaciones → bloquear nuevas salidas → localizar dispensaciones/administraciones afectadas → asignar seguimiento clínico → devolución/destrucción autorizada → conciliación y cierre con evidencia. La trazabilidad debe llegar a pacientes sin exponer su identidad a proveedores innecesariamente.
