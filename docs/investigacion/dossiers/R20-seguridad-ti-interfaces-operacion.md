# R20. Seguridad TI, interfaces y operación

**Versión:** 1 (2026-10-13). **Alimenta:** spec 000 (plataforma), 005 (expediente y auditoría), integraciones LIS/RIS/PACS, operación on-premise.

## 1. Conclusión

V5-05 (INT01-INT05), V2-05 y V1-05 son correctos y se conservan: contrato por interfaz, ACK técnico distinto de aceptación clínica, código desconocido retenido, PACS nunca expuesto público, backups que se prueban restaurando. Esta revisión agrega tres cosas:

- **Ley de Ciberseguridad y Seguridad de la Información (Decreto 143, 2024).** Según el análisis de [ECIJA](https://www.ecija.com/actualidad-insights/nueva-ley-de-ciberseguridad-y-seguridad-de-la-informacion-de-el-salvador/), sus obligaciones (Art. 6: medidas de seguridad, sistema de gestión, continuidad, registros, notificación oportuna de incidentes, evaluación periódica de riesgos, capacitación) alcanzan a privados que operan infraestructura crítica, y **salud** está entre los servicios esenciales (Art. 4 d y g). Multas de 1 a 100 salarios mínimos (Art. 19-21). El texto oficial no se pudo abrir desde aquí (el sitio de la Asamblea bloquea la descarga automática). No hay plazo de notificación confirmado; **sí** está confirmado el de la LPDP: 72 h ante brecha de datos personales (Art. 25).
- **El caso de referencia es HSE Irlanda 2021** ([lecciones HHS](https://www.hhs.gov/sites/default/files/lessons-learned-hse-attack.pdf)): Conti cifró cerca del 80% del entorno, todo el país volvió a papel y la recuperación tomó cuatro meses. El antivirus detectó Cobalt Strike en seis servidores una semana antes y nadie actuó. No había plan de respuesta probado, ni monitoreo, ni dueño de la ciberseguridad. Dos hospitales que sí actuaron ante la detección evitaron el cifrado. Para un hospital de un solo sitio con TI pequeña, esto pesa más que cualquier checklist.
- **Para la aplicación, OWASP ASVS 5.0.0 (mayo 2025)** es el estándar de verificación; los requisitos se citan con versión (`v5.0.0-x.y.z`) porque los números cambian entre versiones ([README oficial](https://raw.githubusercontent.com/OWASP/ASVS/master/README.md)).

La decisión on-premise del ADR-0001 sigue en pie, pero con una consecuencia que hay que decirle a CLIMESA de frente: **on-premise significa que la seguridad operativa es de ellos**. El sistema puede traer controles, pero alguien tiene que mirar las alertas.

## 2. Qué se conserva de V1-V9

| Origen | Contenido | Veredicto |
|---|---|---|
| V5 tabla de autoridad | Un dueño por verdad (MPI, orden, analizador, imagen, cargos) | Se conserva; ya usado en R07 |
| V5 INT01 | Contrato por endpoint: versión, transporte, auth, campos, códigos, ACK y error; dedupe por origen e ID; eventos fuera de orden | Se conserva como plantilla de contrato de interfaz |
| V5 INT02 | Perfil por analizador con mensaje de prueba real; aceptar conexión con QC, errores y retransmisión, no con un ping | Se conserva |
| V5 INT03 | DICOM conformance statement; C-ECHO no prueba nada clínico; no sobrescribir instancias | Se conserva para R08 |
| V5 INT04 | Autorización por paciente, episodio, servicio y propósito; PACS detrás de proxy; AE title no es autenticación; acceso de proveedor temporal; seudonimización probada | Se conserva |
| V5 INT05 | Outbox/inbox, reconciliación, no inventar RPO/RTO, medir; contrato con salida del proveedor | Se conserva |
| V1-05 / V2-05 | Migración segura, ambientes separados, secretos fuera del código | Se conserva (ya en constitución) |

## 3. Qué se descarta o corrige

| Afirmación | Corrección |
|---|---|
| "Delegado de protección de datos obligatorio" | Derogado (Decreto 659, corregido antes); se mantiene un responsable operativo |
| ISO 27001 como requisito de arranque | No hay obligación encontrada. Se usa como marco de referencia; certificar es decisión de CLIMESA y cuesta |
| Cifrar "todo" a nivel de columna | Descartado como regla general: cifrado en disco y en tránsito, más cifrado de columna solo para secretos y pocos campos; lo demás lo protege la autorización y la auditoría |
| Offline con escritura en el cliente | Ya descartado en ADR-0001; se mantiene la estación de contingencia de solo lectura |

## 4. Marco legal

| Norma | Regla | Regla del sistema | Estado |
|---|---|---|---|
| LPDP Decreto 144 (reformada por Decreto 659) Art. 16, 18, 20 | Derechos ARCO-POL; respuesta en 20 días hábiles | Módulo de solicitudes (R21) | Leída |
| LPDP Art. 25 | Notificar brecha en 72 h | Procedimiento de incidente con reloj de 72 h desde la detección | Leída |
| Ley de Ciberseguridad, Decreto 143 (2024) Art. 4, 6, 19-21 | Salud como servicio esencial; gestión de riesgos, continuidad, notificación, capacitación; multas | Registro de riesgos, plan de continuidad, registro de incidentes y capacitación como evidencia exportable | Secundaria (ECIJA); texto oficial pendiente |
| LDDPPSS Art. 33 d, 42 g, 42 l | Custodia segura del expediente; alterar o divulgar es infracción grave | Auditoría append-only, sin borrado físico de documentos clínicos | Leída |
| Norma de expediente (Acuerdo 1616, reformado por 698) Art. 41-42 | Acceso, copia, exportación; rectificación con registro automático de hora, usuario y detalle | Ya en spec 001 y 005 | Leída (R01) |
| Ley de Firma Electrónica y prestadores acreditados | Firma electrónica certificada para documentos que la requieran | Firma simple autenticada para actos clínicos; certificada como integración opcional | Heredada (doc base) |
| Ley Especial contra Delitos Informáticos (2016) | Acceso indebido y manipulación como delito | Evidencia forense preservable (logs con hash) | Pendiente de lectura |

## 5. Referencias técnicas

| Fuente | Aporte | Uso | Estado |
|---|---|---|---|
| [OWASP ASVS 5.0.0](https://raw.githubusercontent.com/OWASP/ASVS/master/README.md) | Requisitos verificables de seguridad de aplicación | Lista de verificación por release; meta nivel 2 | Leída (README) |
| [HHS, lecciones del ataque a HSE](https://www.hhs.gov/sites/default/files/lessons-learned-hse-attack.pdf) | Fallas de detección, respuesta, gobierno y recuperación | Requisitos de monitoreo, plan de respuesta, inventario offline | Leída |
| [HHS 405(d) HICP](https://405d.hhs.gov/Documents/405d-hicp-highlight.pdf) | Prácticas de ciberseguridad por tamaño de organización | Marco de prácticas para hospital pequeño o mediano | Parcial (no lista abierta) |
| NIST CSF 2.0 (2024) | Funciones gobernar, identificar, proteger, detectar, responder, recuperar | Estructura del plan de seguridad | Heredada |
| IHE ATNA / BALP, FHIR AuditEvent | Registro de auditoría estándar | Ya en constitución | Heredada |
| CIS Controls v8.1 | Controles priorizados (IG1 para organizaciones pequeñas) | Línea base de infraestructura | Heredada |

## 6. Arquitectura de seguridad resultante (para spec 000)

1. **Red:** segmentos separados para servidores HIS, estaciones clínicas, equipos médicos y modalidades, invitados; servidor de base de datos sin acceso desde estaciones; PACS y LIS detrás del HIS o de un proxy.
2. **Identidad:** cuenta personal por usuario; MFA para administración, acceso remoto y permisos sensibles (ya en FR); sin cuentas compartidas en estaciones clínicas, con cambio rápido de usuario en lugar de sesiones compartidas.
3. **Acceso remoto de proveedor:** solo con ventana, aprobación y registro; nunca RDP expuesto a internet.
4. **Backups:** regla 3-2-1 con una copia inmutable o fuera de línea; copia cifrada a la nube (ADR-0001); **prueba de restauración trimestral** registrada como evidencia, con tiempo medido (de ahí sale el RTO real, no se inventa).
5. **Inventario offline:** lista de aplicaciones, servidores, credenciales de emergencia y contactos impresa y en sobre sellado; HSE se demoró por no tenerla.
6. **Monitoreo:** logs centralizados de autenticación, administración y endpoints; alertas con dueño y acuse. Si CLIMESA no tiene quién las mire, se contrata o el riesgo queda firmado por dirección.
7. **Plan de respuesta a incidentes** con roles, reloj de 72 h para LPDP, contacto con la autoridad de ciberseguridad y simulacro anual.
8. **Contingencia clínica:** formularios de papel controlados (V6 EMG06, R02) y estación de solo lectura con último corte del censo, alergias, medicación activa.
9. **Aplicación:** ASVS 5.0 nivel 2 como meta; dependencias escaneadas en CI; secretos en almacén, no en appsettings.
10. **Auditoría:** cadena de hash append-only ya diseñada; el administrador de base de datos no puede borrar sin dejar rastro verificable.

## 7. Requisitos derivados para specs

- Spec 000: agregar FR de prueba de restauración registrada, inventario exportable para contingencia, registro de incidentes de seguridad con reloj LPDP, y perfil ASVS por release.
- Spec 005: exportación de auditoría por paciente para responder solicitudes y controversias.
- Interfaces: plantilla de contrato INT01 obligatoria antes de conectar cualquier equipo.

## 8. Pendientes para CLIMESA

1. ¿Quién es TI hoy (persona, empresa externa)? ¿Hay alguien que pueda mirar alertas?
2. Inventario actual: servidores, red, Wi-Fi clínico, equipos conectados, internet de respaldo.
3. ¿Han tenido incidentes (ransomware, robo de equipo, fuga)?
4. ¿Hacen backups? ¿Han restaurado alguno alguna vez?
5. ¿Tienen UPS y generador que cubran el cuarto de servidores?

## Fuentes

- [ECIJA, Ley de Ciberseguridad de El Salvador](https://www.ecija.com/actualidad-insights/nueva-ley-de-ciberseguridad-y-seguridad-de-la-informacion-de-el-salvador/): leída (secundaria).
- [Decreto 143, Asamblea Legislativa](https://www.asamblea.gob.sv/sites/default/files/documents/decretos/D056D9A1-299D-4188-941A-9C3B5898D3F3.pdf): pendiente (descarga bloqueada).
- [HHS, Lessons learned from the HSE cyber attack](https://www.hhs.gov/sites/default/files/lessons-learned-hse-attack.pdf): leída.
- [OWASP ASVS README](https://raw.githubusercontent.com/OWASP/ASVS/master/README.md): leída.
- [HHS 405(d) HICP](https://405d.hhs.gov/Documents/405d-hicp-highlight.pdf): parcial.
- LDDPPSS, LPDP, norma de expediente: leídas en R01 y R03.
