# Política de privacidad de datos

Requisitos: REQ-PRV-01 a REQ-PRV-05 (documento del curso, sección 1.4 y entregable "Política de privacidad de datos"). Decisiones: D-009, D-014, D-031, D-032, D-040, D-056. Base legal: Ley para la Protección de Datos Personales (LPDP, Decreto 144 de 2024) Art. 4 g (datos de salud son sensibles), Art. 15-17 (delegado), Art. 20 (plazo de solicitudes), Art. 25 (brecha en 72 h); Norma Técnica del Expediente Clínico (Acuerdo 1616 de 2024, reforma 2026) Art. 41-43, 50, 55-57; Ley de Deberes y Derechos de los Pacientes Art. 20 (confidencialidad).

> Corte S1/S2: están implementados el filtrado de fichas y ocupantes, auditoría, cierre web a 15 min y cierre móvil al volver tras 5 min en segundo plano. Las solicitudes de vinculación, accesos excepcionales, avisos de brecha y datos clínicos completos pertenecen a entregas posteriores. Las referencias normativas son las del documento base; esta revisión comprueba controles técnicos.

## 1. Clases de información

| Clase | Quién la ve | Ejemplos |
|---|---|---|
| **Pública** | Cualquiera, sin sesión | Ocupación general por planta y tipo (números, no camas), médicos de turno (nombre, especialidad, área), avisos generales, números de fila llamados (sin nombres) |
| **Interna** | Personal con sesión según permiso | Estado de cada cama sin ocupante, estado de la ambulancia, turnos del personal, inventario, métricas agregadas |
| **Personal** | Paciente dueño, personal que lo atiende o lo registra, administración autorizada | Nombre, DUI, fecha de nacimiento, teléfono, dirección, cama asignada, citas |
| **Clínica (sensible)** | Paciente dueño (lo revisado), médico tratante, enfermería del área, laboratorio en lo que procesa, acceso excepcional aprobado | Consultas, diagnósticos, recetas, signos vitales, órdenes y resultados de laboratorio, reporte prehospital, notas de enfermería, alta |

"Administración autorizada" (texto del curso) se implementa así (D-031): Administrador y Jefe de Operaciones ven datos personales necesarios para operar (cama asignada, admisión) pero **nunca** lo clínico por su rol. Para ver algo clínico piden acceso excepcional con motivo y duración; lo aprueba el Delegado de protección de datos (nunca el mismo que lo pide); vence solo; todo queda auditado.

## 2. Campos del expediente del paciente

| Campo | Clase | Paciente | Recepción | Asistente | Enfermería | Médico tratante | Laboratorio | Paramédico | Jefe Op. | Admin | Público |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Número de expediente | Personal | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ (servicio) | ✔ | · | · |
| Nombres y apellidos | Personal | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ (servicio) | ✔ | · | · |
| DUI y otros documentos | Personal | ✔ | ✔ | · | · | ✔ | · | · | · | · | · |
| Fecha de nacimiento y edad | Personal | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ (rangos) | ✔ (servicio) | · | · | · |
| Sexo | Personal | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ (rangos) | ✔ (servicio) | ✔ (asignación) | · | · |
| Teléfono, correo, dirección | Personal | ✔ | ✔ | · | · | ✔ | · | ✔ (dirección del servicio) | · | · | · |
| Contacto de emergencia | Personal | ✔ | ✔ | · | ✔ (área) | ✔ | · | · | · | · | · |
| Habitación y cama asignada | Personal | ✔ | ✔ | · | ✔ (área) | ✔ | · | · | ✔ | · | Solo agregado |
| Citas y número de fila | Personal | ✔ | ✔ | ✔ (consultorio) | · | ✔ (propias) | · | · | · | · | Número sin nombre |
| Signos vitales | Clínica | ✔ (revisado) | · | ✔ (al tomarlos) | ✔ (área) | ✔ | · | ✔ (servicio) | · | · | · |
| Motivo, examen físico, plan | Clínica | ✔ (firmado) | · | · | ✔ (área) | ✔ | · | · | · | · | · |
| Diagnósticos | Clínica | ✔ (firmado) | · | · | ✔ (área) | ✔ | · | · | · | · | · |
| Recetas | Clínica | ✔ | · | · | ✔ (área) | ✔ | · | · | · | · | · |
| Estado de una orden de laboratorio | Clínica | ✔ (siempre) | · | · | ✔ (área) | ✔ | ✔ | · | · | · | · |
| Valores de resultados | Clínica | ✔ (tras revisión, D-040) | · | · | ✔ (área) | ✔ | ✔ | · | · | · | · |
| Reporte prehospital | Clínica | · | · | · | ✔ (emergencia) | ✔ (receptor) | · | ✔ | · | · | · |
| Notas de enfermería | Clínica | · | · | · | ✔ (área) | ✔ | · | · | · | · | · |
| Quién vio mi expediente | Personal | ✔ | · | · | · | · | · | · | · | · | · |

Delegado de protección de datos: ve metadatos de auditoría (quién, cuándo, qué tipo de dato, motivo), no el contenido clínico.

"(área)": solo mientras la persona tiene turno en curso en el área donde está el paciente. "(servicio)": solo durante el servicio de ambulancia y 24 h después para completar el reporte.

## 3. Reglas técnicas

1. La API filtra campos según permiso y contexto antes de responder; ningún cliente recibe un campo para luego ocultarlo en pantalla.
2. Los mensajes de tiempo real nunca llevan datos personales ni clínicos (ADR-0005).
3. Las notificaciones push dicen "Tienes un resultado revisado", nunca el resultado.
4. Toda lectura de datos personales o clínicos genera auditoría con motivo implícito (relación de atención) o explícito (acceso excepcional).
5. Las búsquedas de pacientes se auditan guardando un hash del texto buscado, no el texto.
6. Sesión del personal con cierre por inactividad (15 min en web; 5 min en móvil en segundo plano con datos clínicos en pantalla).
7. Los clientes no guardan datos clínicos en disco, salvo la cola cifrada del paramédico sin conexión, que se borra al enviarse.
8. Datos de prueba y demostración siempre ficticios.
9. Derechos del titular (LPDP Art. 16-25): el paciente puede ver su información y quién la consultó; las solicitudes de rectificación pasan por recepción con historial; el plazo de respuesta es 20 días hábiles (proceso fuera del alcance construido del curso, nivel F).
10. Brecha de seguridad: el procedimiento de aviso en 72 h queda documentado para producción (nivel F).
