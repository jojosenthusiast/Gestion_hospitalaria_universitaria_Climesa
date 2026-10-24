# R02. Migración desde papel y sistemas previos

**Versión:** 1 (2026-10-13). **Alimenta:** spec 004 (migración), y usa comandos de 001 (identidad), 003 (documentos) y 005 (retención).

## 1. Conclusión

V1-05, V2-07, V3-06 y los criterios AC-P01-007 a 012 ya tienen el esqueleto correcto: inventario, mapa con pérdida semántica explícita, identidad con emisor, cadena de escaneo con hash, ensayos con conciliación, corte con autoridad de escritura y un rollback que no pierde lo nuevo. Lo que faltaba es evidencia de cómo fallan las migraciones reales, parámetros técnicos de escaneo y la lectura legal de qué pasa con el papel. Con eso, la estrategia queda así:

1. **No se digitaliza el archivo completo de golpe.** Se migra primero la identidad (todos), luego datos clínicos críticos de pacientes activos por abstracción, y el resto se escanea por demanda o por oleadas.
2. **El papel no se destruye por estar escaneado.** La Norma 1616 fija conservación por expediente sin importar el soporte (Art. 13, 34); la eliminación sigue el reloj de retención con acta, igual que antes.
3. **Toda carga es reproducible y conciliada.** Cada registro de origen termina en destino o en rechazo justificado (AC-P01-008).

## 2. Qué se conserva de V1-V9 y P01

| Origen | Contenido | Veredicto |
|---|---|---|
| V1-05 M01-M07 | Inventario, mapa y calidad, identidad, papel, ensayos, corte, estabilización | Se conserva como estructura de la spec 004 |
| V1-05 M04 | Cadena recepción → identificación → preparación → escaneo → OCR auxiliar → control → revisión → indexación → publicación → custodia | Se conserva; se agregan parámetros (sección 5) |
| V1-05 | "OCR no convierte una dosis manuscrita en prescripción válida" | Se conserva; respaldado por CHCF y Schreiber 2020 |
| V2-07 pasos 1-11 | Orden de migración y conciliación de saldos | Se conserva; saldos financieros pasan a spec 006 |
| V3-06 "Conversión del modelo actual" | Mapear tablas de Aldara | **Se descarta:** Aldara nunca operó con datos reales; no hay nada que migrar desde ahí. La fuente real es lo que CLIMESA use hoy (INS11) |
| P01 AC-P01-007 a 012 | Identificador ambiguo, rechazo sin pérdida silenciosa, saldos, historia firmada, coexistencia, rollback | Se conservan y se trazan a la spec 004 |
| V1-05 | "No inventar 99.99%" y RPO/RTO acordados | Se conserva (spec 005/operación) |

## 3. Qué se descarta o corrige

| Afirmación | Corrección |
|---|---|
| Migrar "datos de Aldara" (V3-06 pasos 2-7) | Descartado: el prototipo no tiene datos productivos |
| Asumir que existe un sistema legado exportable | No consta. El proveedor anterior "hizo un trabajo mal hecho" según el contacto; puede haber datos parciales, archivos sueltos o nada. La spec 004 debe soportar tres orígenes: papel, hojas de cálculo y base de datos de un sistema previo |
| Destruir papel tras escaneo "cuando los usuarios confíen" (práctica de AHIMA) | No aplicable en El Salvador sin base legal: la Norma no autoriza eliminar antes del plazo de retención |

## 4. Marco legal aplicable a la migración

| Norma | Regla | Consecuencia |
|---|---|---|
| Norma 1616 Art. 13 | Expediente permanente en papel o electrónico, con autenticidad, integridad y conservación | El escaneo debe preservar integridad verificable (hash) |
| Art. 14 | Si se crea en papel y luego se digita, el número debe coincidir en ambos soportes | El número de papel queda como identificador `legacy_paper_mrn` y aparece en el expediente electrónico |
| Art. 12 | Inventario para evitar duplicados | El inventario del archivo es requisito previo a la carga |
| Art. 22 | Archivo con áreas separadas para activos, pasivos y fallecidos | La clasificación física guía el orden de la carga |
| Art. 24, 29-31 | Préstamo por escrito, devolución en 48 h, solo personal de archivo mueve expedientes | Durante el escaneo el expediente está "en préstamo a digitalización" con registro |
| Art. 34-35 | 5 años activo + 5 pasivo; fallecidos 5 o 10 | Expedientes vencidos se eliminan con acta en vez de digitalizarse |
| Art. 42 | Discrepancias papel/electrónico las resuelve el comité o equipo | Caso de discrepancia con autoridad, no "gana el más reciente" |
| Art. 50 | No usar datos reales en pruebas | Ensayos de migración en entorno controlado separado del de desarrollo |
| Art. 66 | Destrucción o borrado seguro con acta | Eliminación de copias de trabajo de la migración con acta |
| LDDPPSS Art. 42 g, 44 f | Alterar hojas es grave; no foliar es leve | Escaneo conserva orden y folios; nunca se corrige el original |

## 5. Parámetros técnicos de digitalización

No existe en El Salvador una norma técnica de digitalización de expedientes que se haya podido localizar. Se adopta como referencia el estándar de Arizona para registros con retención de 10 años o más, que coincide con el horizonte de la Norma 1616:

| Contenido | Resolución mínima | Modo |
|---|---|---|
| Texto limpio, alto contraste | 400 dpi | Bitonal, escala de grises si hace falta |
| Manuscrito, bajo contraste, fotos, poca legibilidad | 600 dpi | Grises 8 bits o color 24 bits |
| Color relevante (sellos, tintas de corrección, gráficas) | 300 a 600 dpi | Color 24 bits |

- Formato de conservación: PDF/A preferido; TIFF v6 sin compresión con pérdida. Fuente: [Arizona, Minimum Standards for Scanning Textual Documents 2025](https://records.arizona.edu/sites/default/files/2026-02/minimum-standards-for-digital-imaging-or-scanning-textual-documents-2025.pdf) (leída).
- Control de calidad: 100% de las imágenes durante la implementación inicial, luego muestreo por riesgo; errores críticos = paciente mezclado y página faltante. Fuente: [AHIMA, Document Management and Imaging Toolkit](https://www.ahima.org/media/4y1buocf/document-management-and-imaging-toolkit_axs.pdf) (leída).
- Indexación: paciente, episodio cuando se conozca, tipo documental de una taxonomía estándar, fecha del documento, fecha de captura, operador, lote, conteo de páginas físicas vs imágenes, hash SHA-256 del archivo.
- Preparación es el paso más lento (AHIMA); separadores con código de barras por expediente y por tipo documental.
- OCR solo como índice de búsqueda, marcado como no verificado; nunca como dato clínico.

Expedientes manuscritos de décadas pasadas probablemente caen en la fila de 600 dpi; el tamaño de almacenamiento debe estimarse con una muestra real de CLIMESA antes de comprometer hardware.

## 6. Evidencia sobre migraciones reales

| Fuente | Hallazgo | Implicación |
|---|---|---|
| [Schreiber y Garber, ACI Open 2020](https://thieme-connect.de/products/ejournals/html/10.1055/s-0040-1710007) | Casi no hay literatura empírica; dos casos opuestos: abstracción manual limitada (alergias, medicamentos, órdenes, antecedentes) con pérdida de órdenes activas que retrasó controles de INR, y conversión electrónica de más de 100 millones de registros con 5% manual, problemas de caracteres especiales, códigos de medicamento inespecíficos, unidades inconsistentes y duplicados. 38% de migraciones grandes exceden presupuesto o plazo | Cargar primero lo reciente; validación clínica y técnica separadas; probar caracteres (ñ, tildes) desde el primer ensayo; órdenes activas se verifican una por una |
| [CHCF, Chart Abstraction 2010](https://collections.nlm.nih.gov/master/borndig/101530131/ChartAbstractionEHRDeploymentTechniques.pdf) | Abstraer 30 a 50% de datos críticos antes de salir en vivo; lo hace alguien que conoce al paciente; pasantes sin experiencia generaron errores; tiempo protegido de 4 a 8 horas | Abstracción por personal clínico con tiempo asignado; validación en la siguiente consulta |
| [AHIMA Toolkit](https://www.ahima.org/media/4y1buocf/document-management-and-imaging-toolkit_axs.pdf) | Meta común de 24 h del alta al documento publicado, alcanzada tras unos 6 meses; productividad por etapa en imágenes por hora | Indicadores de la operación de digitalización |
| [Splink](https://www.gov.uk/government/publications/joined-up-data-in-government-the-future-of-data-linking-methods/splink-mojs-open-source-library-for-probabilistic-record-linkage-at-scale) | Fellegi-Sunter, explicación por par, escala de millones | Detección de duplicados en la carga masiva antes de crear identidades |
| [Fraser et al., 2018](https://ijpds.org/index.php/ijpds/article/view/764) | Apellidos hispanos concatenados rompen el enlace | Separar apellidos al digitar el índice del archivo |
| EDUS Costa Rica (doc base) | No migró la historia en papel y aun así logró cobertura nacional | La migración total no es condición para operar |

## 7. Estrategia propuesta por capas

| Capa | Qué | Método | Cuándo |
|---|---|---|---|
| 0. Inventario | Conteo de expedientes, rango de años, estado físico, clasificación activo/pasivo/fallecido, sistemas y archivos digitales existentes | Muestreo físico y entrevista | Antes de la charla con la Junta si el contacto lo permite |
| 1. Índice maestro | Todos los pacientes del archivo: nombres, fecha de nacimiento, documento, número de expediente en papel, dirección | Digitación del índice o importación de listados existentes; detección de duplicados con Splink; creación por comandos de spec 001 | Primera carga |
| 2. Datos críticos de activos | Alergias, problemas activos, medicamentos actuales, antecedentes relevantes, vacunas, última evolución | Abstracción estructurada por personal clínico, validada en la siguiente atención | Antes de salir en vivo por servicio |
| 3. Escaneo por demanda | Expediente completo del paciente con cita o ingreso | Cadena AHIMA con QC; documento de solo lectura con procedencia | Desde la salida en vivo |
| 4. Oleadas históricas | Activos sin cita, luego pasivos con valor clínico | Escaneo por lotes | Según capacidad |
| 5. Eliminación | Expedientes vencidos según Art. 34-35 | Acta, inventario, destrucción segura | Revisión anual |
| 6. Datos de sistemas previos | Lo que exista en base de datos o Excel | Extracción, mapa, transformación versionada, conciliación por conteos y hashes | Según INS11 |

## 8. Requisitos derivados para la spec 004

1. Lote de migración con origen, versión de transformación, conteos de entrada, salida y rechazo, hash del archivo fuente y responsable.
2. Rechazo con motivo y cola de resolución; cero pérdidas silenciosas (AC-P01-008).
3. Correspondencia identificador legado → identidad con certeza (exacta, revisada, provisional) y cola de conflictos (AC-P01-007).
4. Documento escaneado con hash, folios físicos vs imágenes, tipo, fecha, operador, lote, estado de QC; inmutable una vez publicado; corrección por nueva versión.
5. Abstracción estructurada marcada con fuente "abstraído de papel", autor, fecha de abstracción y validación clínica posterior.
6. Préstamo del expediente físico a digitalización con salida, retorno y vencimiento (Norma Art. 29).
7. Caso de discrepancia papel-digital con autoridad del comité (Art. 42).
8. Autoridad de escritura por objeto y ventana durante coexistencia (AC-P01-011): mientras un servicio no sale en vivo, el papel es la fuente; después, el sistema; nunca ambos editables.
9. Rollback que conserva actos nuevos y efectos externos (AC-P01-012).
10. Catálogo territorial versionado para direcciones históricas anteriores a la reestructuración municipal de 2024.
11. Indicadores: expedientes inventariados, digitalizados, con QC aprobado, rechazos abiertos, tiempo de digitalización por expediente, duplicados detectados.

## 9. Pendientes para CLIMESA (INS05, INS11, INS12)

1. Cuántos expedientes hay, desde qué año y en qué estado físico.
2. Si existe algún índice digital (Excel, sistema del proveedor anterior) y quién puede exportarlo.
3. Qué hizo mal el proveedor anterior y si dejó datos utilizables.
4. Espacio y personal de archivo disponibles para preparación y escaneo.
5. Si existen expedientes vencidos sin eliminar (reducen el volumen a digitalizar).
6. Comité de expediente para resolver discrepancias.

## 10. Búsquedas realizadas

EHR legacy data migration lessons learned; AHIMA scanning toolkit; scanning standards ISO 13028 / PDF/A / dpi; Splink; reestructuración municipal 2024.
