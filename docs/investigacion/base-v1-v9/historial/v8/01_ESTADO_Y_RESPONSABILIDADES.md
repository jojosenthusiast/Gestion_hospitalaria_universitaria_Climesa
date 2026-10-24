# Estado, brechas y decisiones
StaffProfile.cs guarda IdentityUserId, código de empleado, nombre, Role, contacto, especialidad opcional e IsActive. No demuestra contrato, registro profesional vigente, competencia, supervisión o privilegio por procedimiento.
HospitalAuthorizationOptions usa roles generales y permite Administrator en políticas clínicas. Program.cs registra Identity estándar; los archivos inspeccionados no demuestran evaluación dinámica de habilitación clínica ni revocación inmediata de sesiones por IsActive. No se probó explotación, sesión ni cambio de permisos; ver evidencia_codigo.json.

| Brecha | Requisito de diseño candidato |
|---|---|
| B801 perfil/rol general | Persona, relación contractual, identidad de acceso y habilitación clínica separadas. |
| B802 sin entidades especializadas buscadas | Turno, asistencia, cobertura/relevo, credencial, privilegio y evidencia de competencia. |
| B803 autorización general | Decisión por acto, ámbito/población/servicio, supervisión y vigencia. |
| B804 sin calidad/quejas específicos encontrados | Incidente, riesgo, acción, auditoría y reclamo con dueños/plazos. |
| B805 gestión documental no acreditada | Versiones, copia/rectificación, archivo, retención y custodia. |

D801–808: roles son acceso técnico, no título profesional; autorización externa y privilegio interno se verifican por separado; contratista/visitante/residente no equivale a empleado; agenda legal y cobertura clínica son dimensiones distintas; salud del trabajador se mantiene segregada de RRHH general; queja, incidente y expediente pueden vincularse sin mezclarse; archivo preserva fuente/version y decisión de disposición; responsabilidad continúa hasta relevo aceptado, incluso durante bloqueo de acceso.

Matriz de funciones a confirmar: RRHH relaciones y asistencia; jefatura cobertura/competencia; dirección/comité autorizado privilegios; TI cuentas/sesiones; SSO atención/confidencialidad y riesgos; calidad análisis/mejora; archivo custodia; responsable institucional de solicitudes de datos; asesoría interpretación/contencioso. No asignar owners nominales o número de empleados ficticios.
