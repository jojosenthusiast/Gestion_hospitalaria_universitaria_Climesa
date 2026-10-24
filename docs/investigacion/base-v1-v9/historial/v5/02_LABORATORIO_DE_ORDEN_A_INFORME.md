# Contratos de laboratorio
Propuesta a revisar por jefatura/validadores/laboratoristas, enfermería/tomadores, clínicos y calidad. Referencias L501–L508.

## Datos y relaciones
| Objeto | Significado y claves | Relaciones/condiciones |
|---|---|---|
| Orden | Solicitud clínicamente autorizada; ID/versión/emisor, paciente/atención, prescriptor | Puede contener grupo de solicitudes; prioridad y pregunta clínica |
| Solicitud al laboratorio | Servicio aceptado con identificador del receptor | Conserva IDs del solicitante y ejecutor; rechazo/derivación |
| Prueba/panel | Catálogo, material, método/unidad, oferta habilitada | Panel tiene composición versionada; no lista estática que cambia historial |
| Muestra | Material biológico específico, ID/emisor, paciente, toma y contenedor | Una muestra puede servir varias pruebas; prueba puede requerir varias muestras |
| Alícuota | Derivada de una muestra, ID/etiqueta propia, volumen/ubicación | Genealogía; no duplicado de identidad del tubo padre |
| Ejecución | Corrida/método/equipo/operador/reactivo/QC | Repetición técnica distinta de nueva orden facturable |
| Resultado | Valor numérico/cualitativo/estructura, unidad, método, estado, fuente | No equivale a informe ni acto clínico |
| Informe | Conjunto de resultados e interpretación, versión/firmante | Referencias orden/muestra/resultado; preliminar/final/corregido |

FHIR ServiceRequest, Specimen y DiagnosticReport aportan distinciones de intercambio. El esquema local no se copia automáticamente. LOINC distingue contexto de la observación; no basta elegir un código por nombre común.

## LAB01 — Ordenar y aceptar
Orden con pregunta clínica, pruebas, paciente/atención, prioridad, solicitante habilitado, datos/preparación necesarios y destino.
Comprobar catálogo/servicio habilitado, requisitos, material/tiempo y necesidad de autorización cuando aplique.
Orden externa: fuente/evidencia/emisor y aceptación local; no “firmarla” atribuyendo al médico local sin autoridad.
Laboratorio acepta, pide aclaración, deriva o rechaza con motivo y dueño. Plan/cancelación pueden cambiar mientras ejecución ya iniciada requiere resolución.
Automatización: colas y requisitos faltantes; no rechazo autónomo de urgencia ni elección de pruebas de tratamiento.
Aceptación: doble envío no duplica solicitud; modificación conserva versión; falta de muestra no se marca resultado normal.

## LAB02 — Preparar, identificar, tomar y etiquetar
Identificar paciente bajo política aprobada; registrar solicitud, tomador, tiempo efectivo/captura, tipo de material, sitio cuando relevante, recipiente y condiciones de preparación.
Etiqueta en punto de toma, ID no reutilizable, vínculo a paciente/orden y datos mínimos. Reimpresión con motivo/control; no representar una muestra nueva con etiqueta antigua.
Paciente desconocido usa identidad temporal reconciliable de v3; nunca asignar por cama.
Muestras del paciente tomadas fuera del hospital conservan origen/información faltante; calidad/identidad no se presumen.
Política de volumen, recipiente, preparación, estabilidad y temperatura por prueba/material aprobada, no umbral genérico.
Aceptación: dos pacientes similares no intercambian tubo; solicitud y muestra tienen IDs diferentes; toma tardía no registra falsamente hora de recepción.

## LAB03 — Transportar, recibir, rechazar o recollectar
Transferencias registran custodio, hora, origen/destino, condiciones y paquete/contenedor. Recepción confirma físicamente y compara etiqueta/orden.
Inadecuada/no identificable/derramada/insuficiente: motivo, pruebas afectadas, custodia/disposición y aviso a responsable. No corregir etiqueta “por suposición”.
Material irrepetible o urgencia: excepción clínico-laboratorial autorizada con limitación visible según protocolo, no liberar una muestra insegura por rol TI.
Recolección crea muestra nueva con relación a la anterior; no borra rechazo ni reinicia métricas para ocultar demora.
Alícuotas y préstamo/derivación tienen dueño/localización y aceptación. Pendiente externo no queda “completado”.
Aceptación: rechazo parcial puede afectar solo pruebas correspondientes; muestra sin volumen suficiente no produce valores fabricados.

## LAB04 — Preparar corrida, analizar y controlar calidad
Equipo/método habilitados, mantenimiento/calibración, reactivos/lotes/expiración, materiales de control y usuario competente.
Separar QC de muestra paciente; resultado de control no entra a expediente. Reglas/umbrales y frecuencia de QC validados por laboratorio.
Mapeo de código del analizador a prueba local con unidad/material/método/contexto. Código desconocido se retiene; no asignar al primer nombre similar.
Resultado recibido con indicadores de equipo, valores/comparadores, tiempo, corrida y payload original. Dilución/repetición tienen motivo y vínculo.
QC fuera de control bloquea liberación afectada y abre revisión competente; no aplicar una “corrección numérica” automática. Resultados ya liberados pueden requerir reevaluación/corrección y comunicación.
Automatización/autoverificación solo con reglas versionadas, validación inicial y seguimiento; no activarla por defecto porque producto lo ofrezca.

## LAB05 — Validar y autorizar informe
Distinguir validación técnica/analítica de autorización e interpretación profesional. Privilegio por servicio/prueba.
Valores bajo detección o fuera de medición conservan comparador y límite; no usar cero o máximo como si fuese medición exacta. “No realizado”/indeterminado no es negativo.
Rango de referencia y límite crítico se versionan por método/material/población/contexto; fuera de rango no es crítico automáticamente.
Informe preliminar/final/parcial, con pruebas pendientes y fuente; cada resultado conserva autor/método/unidad. Valores corregidos generan versión y motivo.
Confirmación/registro de crítico con flujo 04; necesidad de aviso provisional según protocolo no equivale a liberar informe final no validado.
Aceptación: firmante real y fecha; publicación respeta permiso y estado; composición del panel histórica íntegra.

## LAB06 — Microbiología, derivaciones y punto de atención
Microbiología: preliminar, identificación, susceptibilidad y final pueden llegar en momentos distintos; organismo/muestra/método y interpretaciones versionadas, sin perder cambios.
Reglas reflex/add-on: autorización, disponibilidad/estabilidad de muestra, catálogo/regla, responsable y política de cargo. No crear pruebas/cobros ilimitados automáticamente.
Derivación externa: envío/aceptación, laboratorio ejecutor, informe fuente, estados parciales y responsabilidad local de seguimiento.
POCT: paciente/operador habilitado/dispositivo/QC, momento real y fuente; lectura manual/transcrita identificada.
Patología anatómica/citología requieren piezas/bloques/laminillas, sitios y genealogía propios; confirmar alcance institucional y profundizar después.
Aceptación: dato externo no se presenta como validado por analizador local; observación cualitativa no se convierte a número arbitrario.

## LAB07 — Almacenar/disponer y medir
Custodia de muestra y conservación/disposición según normativa, protocolo y tipo; no fijar plazos inventados ni mantener todo eternamente.
Evento de disposición no elimina orden/resultados/documentos sujetos a custodia.
TAT separar orden→toma→recepción→análisis→validación→comunicación/revisión; registrar esperas/causas y prioridad. Un solo promedio es insuficiente.
Rechazo por cohorte/prueba/material/servicio, errores de identidad, QC, corregidos y pendientes postalta; denominadores/versiones explícitos.

