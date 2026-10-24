# Aldara: investigación inicial y marco para un hospital de producción
Fecha de corte: 12 de octubre de 2026. Contexto confirmado por el usuario: hospital privado en El Salvador, con aspiración de crecer a una red de gran escala.

## Resultado principal
La base es un prototipo aprovechable; no hay evidencia suficiente para aprobar producción ni para justificar una reescritura total. La prioridad propuesta es reconstruir las relaciones entre procesos y definir controles, antes de ampliar pantallas. La decisión tecnológica debe comparar evolución propia, adaptación de una plataforma existente y solución híbrida mediante pruebas de concepto equivalentes.

## Qué contiene este paquete
- `01_AUDITORIA_BASE.md`: hallazgos del código y límites de la revisión.
- `02_REFERENCIAS_COMENTADAS.md`: mapa de productos, estándares, procesos y literatura.
- `03_DOMINIOS_ROLES_FLUJOS.md`: cobertura hospitalaria y recorridos con excepciones.
- `04_ARQUITECTURA_Y_DECISIONES.md`: arquitectura candidata, estándares e implementación segura.
- `05_MIGRACION_SEGURIDAD_OPERACION.md`: transición desde papel/legado, seguridad y continuidad.
- `06_REQUISITOS_Y_VALIDACION.md`: requisitos candidatos, pruebas y plan de investigación siguiente.
- `sources.csv` y `sources.json`: catálogo con URLs, uso previsto y nivel de acceso.

## Alcance honesto
Esto es un dossier inicial amplio y trazable, no una revisión sistemática exhaustiva ni una certificación sanitaria, contable o legal. No es posible demostrar que se recolectaron todas las referencias existentes. Los manuales privados, contratos de aseguradoras y procedimientos del hospital todavía no están disponibles. Los enlaces se consultaron por búsquedas públicas y páginas oficiales; cuando solo se recuperó un resultado indexado o hubo un bloqueo, se señala en el catálogo. No se descargaron ni redistribuyeron manuales completos de terceros.

La revisión del ZIP es estática. Se inspeccionaron modelos, configuración EF, políticas, controladores y servicios relevantes. No hay SDK `dotnet` disponible en esta sesión; no se ejecutó build, aplicación, pruebas clínicas, pruebas de concurrencia ni conexión SQL Server. No se modificó la aplicación ni se aplicaron migraciones. Ausencia de una capacidad significa que no se encontró en el árbol inspeccionado, no que sea imposible fuera de él.

## Cómo interpretar las conclusiones
- **Observado**: se vio directamente en el código o contenido recuperado.
- **Riesgo inferido**: hay condiciones de código que podrían provocar una falla; falta reproducirla.
- **Propuesta**: diseño candidato del dossier, sujeto a validación con responsables.
- **Pendiente**: falta evidencia o una decisión local.

Cada fuente tiene un identificador Sxx. Una referencia respalda el contexto indicado, no necesariamente todos los detalles del diseño propuesto. Las especificaciones clínicas deben ser aprobadas por personal habilitado; las reglas fiscales y legales deben validarse sobre la versión vigente y el caso del hospital.

## Orden recomendado
Leer auditoría, flujos y arquitectura; después migración y requisitos. Usar el catálogo para profundizar por dominio. No elegir un sistema por el número de módulos anunciados: evaluar escenarios completos, exportación, funcionamiento ante fallas, soporte, licencia y costo total.
