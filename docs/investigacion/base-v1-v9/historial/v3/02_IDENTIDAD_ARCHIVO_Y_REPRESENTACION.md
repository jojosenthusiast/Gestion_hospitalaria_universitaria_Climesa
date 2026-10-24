# Contratos operativos de identidad y archivo
Estado: propuesta para validar por admisión/archivo, dirección clínica, privacidad y TI. Referencias específicas en 07.
HL7 Patient separa ID del recurso de identificadores humanos [S301]. IHE PMIR aporta propagación de cambios/fusiones, pero deja políticas de identidad y manejo de referencias a reglas del dominio [S304]. No se declara conformidad con estos perfiles.

## Datos mínimos candidatos
| Objeto | Datos | Restricción propuesta |
|---|---|---|
| Identidad paciente | ID interno, estado de verificación, creación, fuente | Estable; no reutilizar un ID retirado |
| Identificador | tipo, sistema/emisor, valor original/normalizado, vigencia, verificación | Unicidad según dominio; cambios dejan historia |
| Demografía | nombres/alias, nacimiento exacto/parcial/estimado/desconocido, contactos, idioma | No imputar certeza; conservar fuente por dato |
| Vinculación | madre/hijo, representante, contacto emergencia, titular, pagador | Tipo/ámbito/vigencia/evidencia; un vínculo no concede todos los derechos |
| Caso de corrección | solicitante, prueba, valores antes/después, motivo, aprobación | Versionado y auditoría; no retroeditar contenido firmado |
| Caso de duplicado | IDs candidatos, evidencias, diferencias, reviewer, decisión | No confundir duplicado con dos personas en un expediente |
| Exportación | ámbito, formato, receptor, canal, instante, hash, autorización | Acceso mínimo y constancia; no URL pública permanente |

No confundir sexo administrativo, parámetros clínicos necesarios y otras variables; definición y uso deben acordarse con el equipo clínico, sin derivar reglas de tratamiento de una cadena libre.

## ID01 — Buscar antes de registrar
Disparador: admisión/cita/orden de paciente sin identidad local resuelta.
1. Buscar identificadores exactos con emisor; después combinaciones de nombres y datos adicionales.
2. Mostrar candidatos autorizados y motivos de coincidencia, con el mínimo dato para distinguirlos.
3. Confirmar identidad con política institucional. Cama/sala no son identificadores personales; Joint Commission ofrece referencia técnica sobre identificación [S305], no obligación local automática.
4. Si la evidencia no basta, mantener provisional; no elegir por “parecido” ni inventar documento.
5. Registrar decisión, fuente y contexto. Nueva creación concurrente debe tratar conflicto explícitamente.

Errores: identificador ya asignado, homónimos, transliteración, apellidos compuestos, datos de familiar usados como propios, teléfono compartido, nombre de casada/alias.
Automatización: normalización de búsqueda y sugerencia de candidatos. Pendiente local: campos de verificación admitidos y quién resuelve conflicto.
Aceptación AC301–305: identidad provisional sin datos falsos; búsquedas no generan fusiones; conflicto concurrente deja revisión; número de habitación no basta.

## ID02 — Desconocido que luego se identifica
Crear código temporal no reutilizable y alias visible, con estado provisional. Abrir atención y permitir evidencias asistenciales bajo ese ID.
Al identificar: revisar si ya existe paciente, evidencias y contradicciones. Si no existe, verificar la misma identidad; si existe, iniciar ID04.
Conservar etiquetas y referencias anteriores como trazabilidad. Reimprimir identificación operativa cuando corresponda y notificar consumidores; no cambiar silenciosamente paciente de muestra ya tomada.
Separar resolución de identidad de corrección de documento fiscal o pagador. Atención debe continuar con protocolo aprobado si no se resuelve inmediatamente.
Aceptación: órdenes/muestras/cargos antes y después se rastrean; pendientes externos son visibles; no perder identidad temporal en auditoría.

## ID03 — Recién nacido y múltiples nacimientos
Identidad del hijo propia desde el registro; madre es relación y no identificador reutilizado. Mantener nacimiento, orden de nacimiento según evidencia, identificadores provisionales y verificación.
Ante nombres temporales similares, advertencia y controles institucionales específicos. El cambio a nombre oficial conserva alias/versiones.
Representación y pagador se verifican por separado; no heredar automáticamente toda autorización del expediente materno.
GNU Health es referencia de separación persona/paciente y manejo neonatal [S307/S308]; no se replica su formato de documento de otro país.
Aceptación: gemelos nunca comparten ID; consultas del hijo no se guardan en expediente materno; cambios no mezclan muestras.

## ID04 — Duplicado: detectar, revisar, fusionar y reconciliar
Distinguir:
- Duplicado: una persona con varios registros.
- Overlay: datos de distintas personas mezclados en un registro.
- Similaridad: personas distintas con datos parecidos.
La última y el overlay no se resuelven por merge.

Estados: sospecha → investigación → aprobado/rechazado → preparado → aplicado localmente → reconciliando consumidores → completado/con incidencias. Puede detenerse antes de aplicar. Corrección posterior usa un caso nuevo.

Precondiciones: permiso especial, evidencia suficiente, versión vigente de ambas identidades, sin merge circular; inventario de referencias y consumidores.
Elegir sobreviviente según política y resolver dato a dato; no “gana el más nuevo” por defecto.
Mantener mapa de IDs originales, motivo, aprobador, manifest de registros afectados y referencias previas. OpenMRS documenta merge y auditorías de elementos movidos [S306]; su API consultada es SNAPSHOT, no garantía del producto instalado.
Aplicación local transaccional, publicación durable y reenvío idempotente. Cada consumidor debe confirmar o dejar incidencia con dueño.
Datos clínicos conflictivos, alergias/medicación/representación requieren revisión competente. Finanzas verifica saldos y pagadores; DTE permanece como documento emitido con reglas de corrección propias.
No anunciar completado mientras hay consumidores sin reconciliar.

### Fusión equivocada
Iniciar incidente y contener acceso/publicación insegura. Identificar documentos y eventos previos/posteriores al merge.
Restaurar asignaciones solo con manifest; registros creados después pueden necesitar atribución manual. Anotar incertidumbre sin asignar una nota al paciente incorrecto.
Notificar consumidores y gestionar correcciones clínicas/fiscales por sus propios procesos. Un unmerge no es un botón de undo universal.
Aceptación: merge repetido no duplica, una cadena converge sin ciclos, fallo parcial es visible, overlay entra a resolución diferente, reversión conserva historia y no redistribuye automáticamente notas ambiguas.

## ID05 — Representación, contacto y consentimiento
Verificar persona que actúa, paciente representado, fundamento, ámbito y vigencia. Contacto para emergencias no tiene por ese campo acceso a expediente.
Registrar autorización específica por operación: consentimiento, información, copia, pago y portal. Cambios/revocación afectan nuevas acciones y conservan historia.
Solicitudes de personas fallecidas siguen procedimiento legal consolidado, no reglas heredadas de paciente activo.
Aceptación: familiar/pagador sin representación no exporta; representación vencida no autoriza; excepción documenta fundamento.

## ID06 — Rectificar y exportar
Solicitud → verificar identidad/representación → delimitar contenido → revisión → decisión → ejecutar → comunicar → evidencia de entrega.
Separar actualización administrativa, corrección clínica por autor habilitado y resolución de discrepancia papel-digital. Referencia legal V2-02 del antecedente; Decreto 659 completo continúa pendiente.
Historial: actor autenticado, autoridad, instante, antes/después, motivo y documento soporte. Corrección clínica firmada mediante adenda/versionado conforme a política.
Exportación con minimización, formato legible y estructura acordada; incluir versiones/correcciones necesarias para interpretarla; canal seguro y constancia.
Aceptación: no basta un log “updated”; original conservado y alcance exportado comprobable.

## Datos y métricas
Porcentaje de identidades provisionales, duplicados confirmados, falsos merges, casos pendientes por edad, campos sin fuente y consumidores sin ACK.
Definir denominadores/cohortes; no afirmar tasa de CLIMESA sin datos. La evaluación del matching debe medir falsos positivos y falsos negativos por población y datos disponibles; umbrales se calibran, no se copian de un paper.

