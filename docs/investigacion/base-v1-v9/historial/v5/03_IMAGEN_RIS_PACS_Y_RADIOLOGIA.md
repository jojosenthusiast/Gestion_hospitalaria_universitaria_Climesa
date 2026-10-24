# Imagen: orden, adquisición, informe y custodia
Propuesta por validar con radiología/técnicos/DPR responsable, ingeniería biomédica, clínicos y TI.
Modalidades/servicios de CLIMESA no confirmados. Radiografía/CT ionizantes y ultrasonido/MR no comparten todas las obligaciones de seguridad.

## Identificadores y modelo
Solicitud de estudio, procedimiento solicitado, paso programado/realizado, accession con emisor, ID paciente con dominio, Study/Series/SOPInstanceUID y versiones del informe.
Paciente/cita/orden/accession/StudyUID no son el mismo ID. Evitar colisiones entre instituciones/sedes; conservación de IDs externos y fuente.
Una orden puede generar varios pasos/series; informe puede cubrir procedimientos agrupados según política. No suponer una sola imagen por estudio.
PACS custodia instancias; RIS coordina agenda/ejecución/informe; visor presenta imágenes. HIS aporta contexto/identidad/órdenes/continuidad y cuenta.
Referencias L509–L514: índices IHE, DICOM y documentación Orthanc; no conformidad certificada.

## IMG01 — Aceptar, protocolizar y programar
Orden con indicación/contexto, región/procedimiento/lateralidad, prioridad, solicitante y atención.
Validación de pertinencia/protocolo por profesional competente; recursos, sala, equipo/estado, preparación, movilidad/aislamiento y permisos pertinentes.
Evaluaciones previas de contraste/sedación/MR según modalidad/protocolo. No codificar umbrales terapéuticos desde este dossier.
Agenda conflictiva por paciente/sala/equipo/equipo humano; paciente urgente tiene ruta aprobada y evidencia.
Cambio de procedimiento preserva orden original, autoridad/razón y efectos clínicos/económicos.
Aceptación: equipo inhabilitado no asignable; laterality discrepancy visible; falta de prep lleva a revisión, no falsea “realizado”.

## IMG02 — Llegada, verificación y adquisición
Verificación de identidad, orden, región/lado y condiciones de seguridad. Selección desde worklist cuando esté disponible reduce doble captura; no demuestra verificación humana realizada.
Registrar técnico/participantes, times, dispositivo, pasos, material/contraste administrado y eventos de exposición/dosis según sistema/modo.
Estudio iniciado/completado/abortado distinto de instancias recibidas y report final.
Emergencia sin agenda: identificador temporal y conciliación posterior supervisada; no fusionar por nombre.
MR no ionizante pero exige controles propios; intervención radiológica añade consentimientos/materiales y procedimientos específicos.
Aceptación: paciente/procedimiento equivocado entra a incidente/cuarentena de datos, no reasignación silenciosa.

## IMG03 — Transferir, almacenar y comprobar estudio
DICOM negocia SOP classes/transfer syntaxes/papeles SCU/SCP según conformance statements de cada equipo.
Registrar instancia/serie/estudio y transfer status. Mismo UID con contenido distinto es conflicto; no permitir overwrite de evidencia automáticamente.
Recepción parcial, serie incompleta, retransmisión, frames y compresión deben conservar integridad. No declarar “estudio completo” por la primera imagen.
Storage Commitment es compromiso definido por implementación; exige conformance de conservación/recuperación. No equivale a backup ni define automáticamente retención legal.
Manifest/custodia y pruebas de recuperación de pixels/metadatos/informe; no borrar copias de modalidad solo por ACK sin política y evidencia aceptadas.
Aceptación: acceso a thumbnail no basta; rechazos parciales quedan reconciliables; instancia repetida no duplica cobro.

## IMG04 — Interpretar y firmar
Cola de lectura por prioridad, expertise, cobertura y estado de imágenes; acceso a estudios previos pertinentes y orden.
Borrador/preliminar/final/adenda/corregido con autor/privilegio, tiempo y referencias. Dictado/ayuda IA no figura como autor habilitado ni firma sola.
Hallazgo crítico comunica por 04; lectura a distancia conserva profesional/organización, seguridad y responsabilidades.
Cambio clínicamente relevante del informe dispara reentrega/revisión a destinatarios de versión anterior; nunca sobrescribir PDF firmado y callar.
Aceptación: informe e imagen pueden completar en tiempos distintos; conclusión no se guarda solo en nota de consulta inconexa.

## IMG05 — Reconciliar, importar y exportar
Paciente identificado después del estudio: caso supervisado con mapa de identidad, órdenes, accession, UIDs y notificación a RIS/PACS/HIS; examinar datos embebidos.
Imagen de otra institución: origen, identidad/emisor, conformance, malware/integridad y relación clínica; no asumir que su PatientID local coincide.
Exportación autorizada con archivos/report/datos necesarios y registro; medio/canal seguro. Seudonimizar metadata no asegura quitar texto quemado en pixels o documentos encapsulados.
Uso diagnóstico de visor: requisitos de licencia, validación/modalidad, monitores y desempeño según normas/procedimientos; no certificar un visor por mostrar JPG.
Reconciliación equivocada necesita manifest/historia y resolución con afectados; no cambios masivos sin investigación.

## IMG06 — Calidad, repetición y economía
Repetición por error técnico documenta causa/dosis/materiales y acción; no crea cobro al paciente automáticamente.
Contraste/materiales/preparación vinculados a inventario/medicación de v4. Hito de cargo/paquete/honorario requiere política local.
QC/mantenimiento y autorización del equipo/personal se gestionan con evidencia y vencimientos; interoperabilidad DICOM no habilita un equipo clínicamente.
Seguimiento por cancelaciones/aborts/repeticiones, tiempo de informe/entrega, critical ACK, almacenamiento fallido y correcciones. Sin tasas inventadas.

