# Migración, seguridad y operación
Propuestas fundamentadas en S27, S31–S33, S38, S42–S44, S48–S49 y fuentes locales S55–S60. Falta inventario y validación institucional. No se ejecutó migración.

## Migrar desde papel y sistemas antiguos
No todo dato tiene el mismo valor, calidad o urgencia. Clasificar como: maestros; datos clínicos activos; episodios abiertos; obligaciones económicas; histórico estructurado; documentos; archivo en solo lectura. Propuesta inicial: importar maestros y datos activos validados, asegurar consulta del histórico y digitalizar progresivamente lo restante. El alcance concreto depende de conservación legal y necesidad clínica.

### M01 — Inventario y permisos
Identificar sistemas, propietarios, formatos, claves, volúmenes, contratos, exportación, calidad, dependencias, adjuntos e interfaces. Obtener extractos autorizados y muestras desidentificadas. Registrar versión/fecha/fuente; verificar si el proveedor permite exportación y cómo entrega cambios desde el primer extracto. Evitar acceso improvisado a producción.

### M02 — Mapa y calidad
Definir diccionario origen-destino con tipo, nulabilidad, unidad, código, transformación, pérdida semántica y responsable. Medir duplicados, fechas imposibles, huérfanos, unidades ambiguas, pacientes sin identificación, sumas y estados inconsistentes. No convertir desconocido en “no” ni llenar fechas inventadas.

### M03 — Identidad
Preservar identificador legado y emisor; crear equivalencias con índice maestro. Coincidencia exacta solo cuando sus criterios sean confiables. Coincidencias probabilísticas entran a revisión; no fusionar automáticamente por nombre/fecha. La fusión preserva trazabilidad y permite corregir la decisión. Preparar flujo para desconocidos y recién nacidos sin documento nacional.

### M04 — Documentos en papel
Cadena propuesta: recepción/inventario → identificación → preparación → escaneo → OCR auxiliar → control de legibilidad/completitud → revisión → indexación → publicación → custodia/devolución del original.
Guardar identificador documental, paciente/episodio confirmado, tipo, fecha del documento, fecha de captura, operador, origen, páginas, hash y estado de calidad. Detectar páginas faltantes, rotación, mezcla de pacientes y escaneo duplicado. OCR no convierte automáticamente una dosis manuscrita en prescripción válida. Transcripción de alergias, medicamentos activos u otros datos de alto riesgo requiere revisión por personal competente. No destruir papel por haberlo escaneado sin política y fundamento aplicables.

### M05 — Ensayos
ETL en zona de preparación segregada; reglas deterministas y lotes repetibles. Comparar conteos por entidad/periodo, documentos y hashes, relaciones, estados clínicos abiertos, stock por lote/ubicación y balances financieros. Revisar muestra estratificada por riesgo, servicio, antigüedad y legibilidad; no solo registros fáciles. Los umbrales los aprueban responsables, y todos los rechazados tienen destino y propietario.

### M06 — Corte y coexistencia
Elegir oleada por circuito/servicio. Establecer autoridad de cada dato y ventana: dónde se escribe y dónde solo se consulta. Capturar delta desde el extracto validado; limitar escritura durante corte si es viable. Reconciliar y obtener aceptación clínica, archivo, finanzas y TI. Tener soporte presencial de usuarios clave, contingencia y monitoreo.

Rollback no es simplemente restaurar backup: si hubo atención nueva, debe preservarse y reconciliarse. Diseñar retorno operativo, exportación de acciones posteriores al corte, conflictos y tiempos máximos de decisión. El legado sigue accesible de forma protegida hasta cumplir las condiciones aprobadas de retirada.

### M07 — Estabilización
Vigilar incidentes, pérdida de seguimiento, errores de identidad, tareas pendientes, cargos ausentes y doble captura. Comparar indicadores con línea base. Retirar coexistencia cuando haya aceptación y continuidad demostrada, no por haber pasado una fecha.

## Seguridad por riesgo y contexto
| Control candidato | Criterio de verificación |
|---|---|
| Autenticación individual y MFA según riesgo | Cuentas compartidas rechazadas; alta/baja y recuperación comprobadas |
| Acceso por rol + sede + relación asistencial + propósito | Usuario clínico no accede por cambiar PatientId; pruebas entre sedes/equipos |
| Privilegios clínicos independientes de TI | Administrar cuenta no permite firmar como médico |
| Acceso excepcional de emergencia | Motivo obligatorio, alcance temporal, auditoría y revisión posterior |
| Sesiones y revocación | Baja/revocación efectiva bajo plazo acordado; sesiones antiguas cubiertas |
| Cifrado, secretos y rotación | TLS, claves protegidas, backup cifrado y recuperación de claves ensayada |
| Auditoría dedicada | Lectura, edición, firma, impresión, exportación, fusión y privilegios con contexto |
| Integridad y versiones | Registro firmado no se sobrescribe; corrección mantiene historia y autor |
| Exportación mínima | Restricción por finalidad, marca de procedencia, destinatario y rastro |
| Segmentación técnica | Dispositivos, PACS, integraciones y administración separados y protegidos |
| Seguridad de aplicación | Requisitos ASVS seleccionados, pruebas autorizadas y corrección verificada |
| Gestión de vulnerabilidades | Inventario de dependencias, parcheo, responsables y prueba de actualización |
| Incidentes y privacidad | Detección, evaluación, contención y respuesta con registros y plazos locales |

AuditEvent y Provenance [S31–S32] orientan estructuras; no se asume que implementarlos vuelva inmutable la evidencia. Para auditoría evaluar almacenamiento separado, control de escritura/lectura, retención aprobada, sincronización temporal, alertas y procedimientos de acceso. Logs de depuración no deben contener expedientes completos, contraseñas ni tokens.

## Matriz local de cumplimiento pendiente
| Materia | Fuente localizada | Trabajo antes de producción |
|---|---|---|
| Expediente clínico | Norma MINSAL y reforma indicada [S55] | Leer texto completo, ámbito, conservación, autoría, firma, acceso y transferencia |
| Datos personales | Ley y reforma legislativa septiembre 2026 [S56–S58] | Consolidar versión promulgada, bases de tratamiento, derechos y encargados |
| Tributación/DTE | Manual y guía Hacienda [S59–S60] | Obtener versión vigente, ambientes, esquemas, firma, contingencia y eventos |
| Regulación del establecimiento y profesionales | Pendiente SRS/CSSP y asesoría local | Identificar habilitación y obligaciones por servicio |
| Seguros/contratos | No aportados | Tarifas, paquetes, autorizaciones, glosas, copagos y evidencia requerida |
| Alojamiento y proveedores | No definidos | Contratos, acceso técnico, transferencias, residencia y salida de proveedor |

La reforma reciente hace inadecuado fijar requisitos con una guía antigua. No se concluyó si alguna persona/cargo específico es legalmente obligatorio. Tampoco se fijaron porcentajes de impuestos o plazos legales sin texto vigente. HIPAA/GDPR pueden servir de referencia comparativa; su aplicabilidad no se presupone por construir un hospital.

## Continuidad y operación 24/7
Definir objetivos por servicio: disponibilidad, RTO (tiempo para recuperar) y RPO (pérdida temporal de datos tolerada). No inventar 99.99% como compromiso sin análisis de impacto/costo. Identificar dependencias de red, energía, autenticación, base, almacenamiento, integración y equipos.

Practicar recuperación desde backups y fallas de componentes. Mantener copia protegida frente a ransomware y procedimiento para reconstruir claves/configuración. Probar restauración de base, documentos, equivalencias de identidad y auditoría como conjunto consistente.

Cada servicio debe tener kit de contingencia con identificación temporal, órdenes/documentación, administración de medicamento, muestras y cobros según su necesidad. Definir cuándo se declara caída y quién decide recuperación. Probar pérdida de internet, red local, energía, servidor, interfaz LIS y Hacienda por separado.

Monitorear además de CPU: órdenes sin aceptación, críticos sin recepción, integración retrasada, mensajes rechazados, cargos sin factura, pagos sin conciliar, stock inconsistente y tareas de alta pendientes. Las alertas tienen propietario, plazo y procedimiento, para que el dashboard no sea un sustituto de la respuesta.

## Automatización por nivel
- Inicial: tareas, colas, recordatorios, validación de formatos, controles de duplicados y contabilización determinista revisable.
- Con revisión humana: matching de pacientes/documentos, propuestas de conciliación, OCR y sugerencias de codificación.
- Tras validación clínica: reglas de decisión, alertas medicamentosas, escalamiento y protocolos. Versionar fuente, población, regla y aprobación.
- IA, si se considera: evaluación separada, protección de datos, supervisión, medición de errores y trazabilidad. Nunca convertir texto incierto en evidencia clínica confirmada sin revisión.

No automatizar prácticas incorrectas del papel sin analizarlas primero. Una excepción frecuente puede revelar un proceso mal diseñado.
