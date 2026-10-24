# Auditoría del Mapa del Trabajo Contable, versión 1

Fecha: 2026-10-13. Alcance: preguntas, diagrama, calendario, matriz de obligaciones, procesos y división del trabajo de `mapa-contable.html` v1. Resultado: se reconstruye como v2.

## Hallazgos

| # | Dónde | Problema | Gravedad | Corrección en v2 |
|---|---|---|---|---|
| 1 | Cuestionario | No mide tiempo por tarea salvo compras (d2). Sin línea base no se puede priorizar ni demostrar ahorro. | Alta | Matriz de horas por tarea para un cliente típico (bloque H). |
| 2 | Cuestionario | No hay inventario de cartera: tipo, volumen de DTE, empleados, inventario por cliente. Es el dato que más define el diseño. | Alta | Tabla de cartera con alias (a1), sin nombres reales. |
| 3 | Cuestionario | El bloque CLIMESA tenía 4 preguntas abiertas. Faltaban honorarios por cuenta de terceros, documento que se emite, IVA de servicios, glosas, depósitos, consignación, centros de costo, reportes a gerencia. | Alta | Bloque N con 13 preguntas, cerradas donde se puede. |
| 4 | Cuestionario | Las opciones cerradas obligaban a escoger aunque no aplicara, y no dejaban matizar. | Media | "No sé o no aplica" automático y comentario opcional en cada pregunta cerrada. |
| 5 | Cuestionario | No se preguntaba cómo lleva hoy los vencimientos, quién tiene las claves de Hacienda, cómo avisa al cliente el monto, dónde archiva, modificatorias, fiscalizaciones. | Alta | Preguntas b6, b7, b8, e5, m4 y supuestos s3 a s5. |
| 6 | Cuestionario | El "modo guiado a modo experto" que se pidió no tenía preguntas ni sección. | Media | Sección 6 de niveles y preguntas o6 a o8. |
| 7 | Cuestionario | 54 preguntas sin camino corto: alto riesgo de abandono. | Alta | Filtro "solo esenciales" y bloque inicial de supuestos de una sola respuesta. |
| 8 | Cuestionario | Las preguntas no estaban ligadas a los flujos: no se veía qué parte del diseño cambia cada respuesta. | Media | Cada proceso enlaza sus preguntas; cada pregunta conserva su "para qué sirve". |
| 9 | Diagrama | Partía de DTE en JSON, cuando el caso real es papel. Faltaban digitación, recordatorio de faltantes, aprobación del cliente, mandamiento NPE y pago. | Alta | Diagrama v2 con 13 pasos, incluye papel, cliente que aprueba y paga. |
| 10 | Diagrama | La validación "libro = F-07 = mayor" era una etiqueta, no una lista de controles. | Media | Tabla de 10 validaciones cruzadas con causa típica. |
| 11 | Flujos | Solo existía el ciclo mensual. Faltaban el ciclo anual y el circuito del hospital. | Alta | Línea anual y circuito hospitalario con estado real en el sistema. |
| 12 | Calendario | Faltaban pensiones (Planilla Única) cada mes y el F-950. Aguinaldo sin marcar como pendiente en todas sus fechas. | Media | Agregados; aguinaldo marcado pendiente. |
| 13 | Matriz | Faltaban sujeto excluido (DTE 14 y retención de 10%) y los libros legales del Código de Comercio. F-463 se presentaba como obligación de toda contadora, cuando aplica a quien autoriza libros. F-987 sin advertir que el umbral de obligados no está verificado. | Media | Filas agregadas y notas de alcance. |
| 14 | Procesos | Faltaban requerimientos de Hacienda, credenciales y firmas, y correcciones o modificatorias. | Media | C19 a C21. |
| 15 | Página | Contadores escritos a mano en el encabezado. | Baja | Se calculan de los datos. |

## Lo que la v2 todavía no resuelve

- Plazos sin confirmar en texto oficial: anotación de libros de IVA, pago de ISSS, INSAFORP, depreciación fiscal, aguinaldo 2026, umbral del F-987.
- No hay versión hablada o en persona: las respuestas abiertas largas por escrito suelen ser pobres. Conviene una llamada de 30 minutos sobre las respuestas de los bloques N y H.
